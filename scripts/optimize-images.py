#!/usr/bin/env python3
"""Optimize checked-in images, keeping question-media paths and dimensions intact.
Run from a clean checkout: python scripts/optimize-images.py --apply
Pillow is required. Default mode is a dry run.
"""
from pathlib import Path
from io import BytesIO
from collections import Counter
import argparse, json, re, subprocess, sys
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
args = argparse.ArgumentParser()
args.add_argument("--apply", action="store_true")
opt = args.parse_args()
tracked = [ROOT / p for p in subprocess.check_output(["git","ls-files","-z"], cwd=ROOT).decode().split("\0") if p]
roots = ("public/", "src/assets/", "decks/")
images = [p for p in tracked if p.is_file() and p.relative_to(ROOT).as_posix().startswith(roots) and p.suffix.lower() in (".png",".jpg",".jpeg",".webp")]
before = sum(p.stat().st_size for p in images)
text_ext = {".ts",".tsx",".js",".jsx",".mjs",".cjs",".json",".css",".scss",".html",".md",".csv",".txt",".svg"}
texts = {}
for p in tracked:
    if p.is_file() and p.suffix.lower() in text_ext and p.stat().st_size < 12_000_000 and not p.relative_to(ROOT).as_posix().startswith(("scripts/optimize-images", ".github/")):
        try: texts[p] = p.read_text(encoding="utf-8")
        except (UnicodeError,OSError): pass
stats = Counter()
renames = {}
total_saved = 0
names = Counter(p.name for p in images)

def encode(im, fmt, **options):
    buf = BytesIO()
    im.save(buf, format=fmt, **options)
    return buf.getvalue()

for p in images:
    rel = p.relative_to(ROOT).as_posix()
    original = p.read_bytes()
    if len(original) < 45_000 or p.suffix.lower() == ".webp":
        continue
    try:
        with Image.open(BytesIO(original)) as src:
            if getattr(src,"n_frames",1) != 1:
                continue
            # Respect EXIF orientation for artwork conversion; preserve other image geometry.
            source = src.copy()
            artwork = rel.startswith(("public/assets/aistudio/", "src/assets/images/"))
            alpha = "A" in source.getbands() or "transparency" in src.info
            if alpha: source = source.convert("RGBA")
            else: source = source.convert("RGB")
            options = {}
            if src.info.get("icc_profile"): options["icc_profile"] = src.info["icc_profile"]
            fmt = src.format
            # Keep source filenames for question, map, logo, and remote deck assets.
            # WebP conversion is restricted to large artwork with unique, explicit local references.
            target = p
            data = original
            may_convert = artwork and names[p.name] == 1 and len(original) >= 180_000
            # Remote references cannot be redirected by our Express/Vite compatibility layer.
            pattern = re.compile(re.escape(p.name) + r"(?![A-Za-z0-9_.-])")
            referenced = [(f,t) for f,t in texts.items() if pattern.search(t)] if may_convert else []
            has_remote_ref = any(any("http" in line and p.name in line for line in t.splitlines()) for _,t in referenced)
            if may_convert and referenced and not has_remote_ref and not p.with_name(p.name+".webp").exists():
                normalized = ImageOps.exif_transpose(src)
                normalized = normalized.convert("RGBA" if alpha else "RGB")
                # Keep the full pixel dimensions and alpha. Artwork is not a memory-question image.
                candidate = encode(normalized,"WEBP",quality=88,method=6,alpha_quality=100,exact=True,**options)
                if len(candidate) < len(original)*0.83:
                    target = p.with_name(p.name+".webp")
                    data = candidate
            if target == p:
                # PNG is lossless; for JPEG use a single high-quality re-encode only.
                if fmt == "PNG":
                    png_source = src.copy()
                    png_options = dict(options)
                    if "transparency" in src.info and "A" not in png_source.getbands():
                        png_options["transparency"] = src.info["transparency"]
                    candidate = encode(png_source,"PNG",optimize=True,compress_level=9,**png_options)
                    if len(candidate) < len(data)*0.98: data = candidate
                elif fmt == "JPEG" and len(original) >= 100_000:
                    jpeg_options = dict(options)
                    if src.info.get("exif"): jpeg_options["exif"] = src.info["exif"]
                    candidate = encode(source,"JPEG",quality=88,optimize=True,progressive=True,subsampling=0,**jpeg_options)
                    if len(candidate) < len(data)*0.85: data = candidate
            if data == original:
                continue
            with Image.open(BytesIO(data)) as check:
                check.load()
                if target == p and check.size != src.size: raise ValueError("dimension changed")
                if target != p and check.size != ImageOps.exif_transpose(src).size: raise ValueError("dimension changed")
                if alpha and "A" not in check.getbands() and "transparency" not in check.info: raise ValueError("alpha lost")
                if target == p and fmt == "PNG":
                    if check.convert("RGBA").tobytes() != src.convert("RGBA").tobytes(): raise ValueError("PNG pixels changed")
            if target != p:
                for f,t in referenced: texts[f] = pattern.sub(target.name,t)
                renames[rel] = target.relative_to(ROOT).as_posix()
                stats["webp"] += 1
            else: stats["same_format"] += 1
            total_saved += len(original)-len(data)
            if opt.apply:
                target.write_bytes(data)
                if target != p: p.unlink()
    except Exception as e:
        print("SKIP",rel,str(e),file=sys.stderr)
if opt.apply:
    for p,t in texts.items():
        if p.is_file() and p.read_text(encoding="utf-8") != t: p.write_text(t,encoding="utf-8")
report = {"mode":"applied" if opt.apply else "dry-run","imageBytesBefore":before,"imageBytesAfter":before-total_saved,"bytesSaved":total_saved,"webpConverted":stats["webp"],"sameFormatOptimized":stats["same_format"],"renamed":renames}
print(json.dumps(report,ensure_ascii=False,indent=2))
if opt.apply: (ROOT/"docs/image-optimization-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
