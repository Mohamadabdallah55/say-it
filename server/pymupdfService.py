#!/usr/bin/env python3
"""
PyMuPDF (fitz) bridge for Yemken Hay:
- probe: checks whether PyMuPDF is installed
- inspect: extracts page text, structured tables, scanned-page detections, rendered page images, and non-decorative embedded images
- crop: crops an exact normalized [ymin, xmin, ymax, xmax] (0..1000) region from a PDF page
"""

import base64
import hashlib
import json
import sys
from collections import Counter


def load_fitz():
    try:
        import fitz  # PyMuPDF
        return fitz, None
    except Exception as exc:
        return None, str(exc)


def format_table_rows(table):
    try:
        rows = table.extract()
    except Exception:
        return ""
    if not rows:
        return ""
    lines = []
    for row in rows:
        cells = [
            " ".join(str(cell).split()) if cell is not None else ""
            for cell in row
        ]
        if any(cells):
            lines.append(" | ".join(cells))
    if len(lines) < 2:
        return ""
    return "[جدول]\n" + "\n".join(lines)


def render_page_data_url(page, dpi=150, clip=None):
    pix = page.get_pixmap(dpi=dpi, clip=clip, alpha=False)
    try:
        raw_bytes = pix.tobytes("jpeg", jpg_quality=82)
        mime = "image/jpeg"
    except Exception:
        raw_bytes = pix.tobytes("png")
        mime = "image/png"
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}", pix.width, pix.height


def handle_probe():
    fitz, err = load_fitz()
    if fitz is None:
        print(json.dumps({"available": False, "error": err or "PyMuPDF (fitz) is not installed"}, ensure_ascii=False))
        return 0
    print(json.dumps({
        "available": True,
        "version": getattr(fitz, "__doc__", "") or getattr(fitz, "VersionBind", "unknown"),
        "pymupdfVersion": getattr(fitz, "pymupdf_version", None) or getattr(fitz, "VersionBind", "installed"),
    }, ensure_ascii=False))
    return 0


def handle_inspect(pdf_path, max_render_pages=14, max_embedded_images=16):
    fitz, err = load_fitz()
    if fitz is None:
        print(json.dumps({"available": False, "error": err}, ensure_ascii=False))
        return 2

    doc = fitz.open(pdf_path)
    try:
        total_pages = doc.page_count
        pages = []
        raw_embedded = []
        xref_counter = Counter()
        img_hash_counter = Counter()

        for idx in range(total_pages):
            page = doc.load_page(idx)
            page_num = idx + 1
            raw_text = page.get_text("text") or ""
            clean_text = " ".join(raw_text.split()).strip()

            tables_blocks = []
            if hasattr(page, "find_tables"):
                try:
                    found = page.find_tables()
                    for tbl in getattr(found, "tables", []) or []:
                        formatted = format_table_rows(tbl)
                        if formatted:
                            tables_blocks.append(formatted)
                except Exception:
                    pass

            combined_text = clean_text
            if tables_blocks:
                combined_text = (clean_text + "\n" + "\n".join(tables_blocks)).strip()

            page_images = page.get_images(full=True) or []
            drawings_count = 0
            try:
                drawings_count = len(page.get_drawings() or [])
            except Exception:
                drawings_count = 0

            alnum_count = sum(1 for ch in clean_text if ch.isalnum())
            is_scanned = alnum_count < 45 and (len(page_images) > 0 or drawings_count > 0 or total_pages <= 20)
            has_visuals = len(page_images) > 0 or drawings_count >= 10 or len(tables_blocks) > 0

            pages.append({
                "num": page_num,
                "text": combined_text,
                "charCount": len(clean_text),
                "alnumCount": alnum_count,
                "hasTables": len(tables_blocks) > 0,
                "tableCount": len(tables_blocks),
                "imageCount": len(page_images),
                "drawingsCount": drawings_count,
                "isScanned": bool(is_scanned),
                "hasVisuals": bool(has_visuals),
            })

            page_rect = page.rect
            pw = max(1.0, float(page_rect.width))
            ph = max(1.0, float(page_rect.height))

            for img_info in page_images:
                xref = img_info[0]
                xref_counter[xref] += 1
                try:
                    rects = page.get_image_rects(xref) or []
                except Exception:
                    rects = []
                if not rects:
                    continue
                rect = rects[0]
                norm_ymin = max(0, min(1000, int(round((rect.y0 / ph) * 1000))))
                norm_xmin = max(0, min(1000, int(round((rect.x0 / pw) * 1000))))
                norm_ymax = max(0, min(1000, int(round((rect.y1 / ph) * 1000))))
                norm_xmax = max(0, min(1000, int(round((rect.x1 / pw) * 1000))))
                if (norm_ymax - norm_ymin) < 90 or (norm_xmax - norm_xmin) < 90:
                    continue
                # Skip tiny corner logos / banners unless it's a scanned full page
                area_ratio = ((norm_ymax - norm_ymin) * (norm_xmax - norm_xmin)) / 1000000.0
                if area_ratio < 0.025:
                    continue

                try:
                    extracted = doc.extract_image(xref)
                except Exception:
                    extracted = None
                if not extracted or not extracted.get("image"):
                    continue
                w = int(extracted.get("width") or 0)
                h = int(extracted.get("height") or 0)
                if w < 85 or h < 85:
                    continue
                img_bytes = extracted["image"]
                img_digest = hashlib.sha256(img_bytes).hexdigest()[:16]
                img_hash_counter[img_digest] += 1
                raw_embedded.append({
                    "pageNumber": page_num,
                    "xref": xref,
                    "digest": img_digest,
                    "ext": str(extracted.get("ext") or "png").lower(),
                    "width": w,
                    "height": h,
                    "boundingBox": [norm_ymin, norm_xmin, norm_ymax, norm_xmax],
                    "areaRatio": area_ratio,
                    "bytes": img_bytes,
                })

        # Filter out repeated header/footer logos across >= 3 pages (>35% of doc)
        repeat_threshold = max(3, int(total_pages * 0.35)) if total_pages >= 4 else 999
        embedded_images = []
        for idx_item, item in enumerate(raw_embedded):
            if xref_counter[item["xref"]] >= repeat_threshold or img_hash_counter[item["digest"]] >= repeat_threshold:
                continue
            # If a single image covers >85% of a scanned page, treat it as a scanned page render rather than a sub-diagram crop
            if item["areaRatio"] > 0.86 and pages[item["pageNumber"] - 1]["isScanned"]:
                continue
            ext = item["ext"] if item["ext"] in ("png", "jpeg", "jpg", "webp") else "png"
            mime = "image/jpeg" if ext in ("jpeg", "jpg") else f"image/{ext}"
            b64 = base64.b64encode(item["bytes"]).decode("ascii")
            embedded_images.append({
                "id": f"pymupdf_img_p{item['pageNumber']}_{idx_item + 1}",
                "pageNumber": item["pageNumber"],
                "boundingBox": item["boundingBox"],
                "width": item["width"],
                "height": item["height"],
                "imageBase64": f"data:{mime};base64,{b64}",
            })
            if len(embedded_images) >= max_embedded_images:
                break

        # Render scanned pages first, then evenly spaced pages with visuals/tables for local vision analysis
        scanned_nums = [p["num"] for p in pages if p["isScanned"]]
        visual_nums = [p["num"] for p in pages if p["hasVisuals"] and not p["isScanned"]]
        pages_to_render = []
        seen_render = set()
        for num in scanned_nums + visual_nums:
            if num not in seen_render and len(pages_to_render) < max_render_pages:
                seen_render.add(num)
                pages_to_render.append(num)

        rendered_pages = []
        for num in sorted(pages_to_render):
            page = doc.load_page(num - 1)
            data_url, rw, rh = render_page_data_url(page, dpi=150)
            rendered_pages.append({
                "pageNumber": num,
                "isScanned": pages[num - 1]["isScanned"],
                "width": rw,
                "height": rh,
                "imageBase64": data_url,
            })

        print(json.dumps({
            "available": True,
            "totalPages": total_pages,
            "pages": pages,
            "scannedPageNumbers": scanned_nums,
            "embeddedImages": embedded_images,
            "renderedPages": rendered_pages,
        }, ensure_ascii=False))
        return 0
    finally:
        doc.close()


def handle_crop(pdf_path, page_num, box_str):
    fitz, err = load_fitz()
    if fitz is None:
        print(json.dumps({"available": False, "error": err}, ensure_ascii=False))
        return 2

    parts = [float(x.strip()) for x in box_str.split(",")]
    if len(parts) != 4:
        print(json.dumps({"available": True, "error": "Invalid bounding box"}, ensure_ascii=False))
        return 1
    ymin, xmin, ymax, xmax = [max(0.0, min(1000.0, v)) for v in parts]
    doc = fitz.open(pdf_path)
    try:
        if page_num < 1 or page_num > doc.page_count:
            print(json.dumps({"available": True, "error": "Page out of bounds"}, ensure_ascii=False))
            return 1
        page = doc.load_page(page_num - 1)
        rect = page.rect
        clip = fitz.Rect(
            rect.x0 + (xmin / 1000.0) * rect.width,
            rect.y0 + (ymin / 1000.0) * rect.height,
            rect.x0 + (xmax / 1000.0) * rect.width,
            rect.y0 + (ymax / 1000.0) * rect.height,
        )
        data_url, w, h = render_page_data_url(page, dpi=180, clip=clip)
        print(json.dumps({
            "available": True,
            "imageBase64": data_url,
            "width": w,
            "height": h,
        }, ensure_ascii=False))
        return 0
    finally:
        doc.close()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command (probe | inspect | crop)"}))
        return 1
    cmd = sys.argv[1]
    if cmd == "probe":
        return handle_probe()
    if cmd == "inspect" and len(sys.argv) >= 3:
        max_render = int(sys.argv[3]) if len(sys.argv) >= 4 else 14
        max_imgs = int(sys.argv[4]) if len(sys.argv) >= 5 else 16
        return handle_inspect(sys.argv[2], max_render_pages=max_render, max_embedded_images=max_imgs)
    if cmd == "crop" and len(sys.argv) >= 5:
        return handle_crop(sys.argv[2], int(sys.argv[3]), sys.argv[4])
    print(json.dumps({"error": f"Unknown or incomplete command: {cmd}"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
