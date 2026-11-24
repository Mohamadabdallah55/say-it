#!/usr/bin/env python3
"""Second pass: WebP for AI Studio artwork and World Cup player photographs.
Keep legacy routes and never change remote URLs, quiz text, or non-target images.
"""
from pathlib import Path
from collections import Counter
from io import BytesIO
import argparse, json, re, subprocess, sys
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true")
args = ap.parse_args()
tracked = [ROOT / p for p in subprocess.check_output(["git","ls-files","-z"],cwd=ROOT).decode().split("\0") if p]
images = [p for p in tracked if p.is_file() and p.suffix.lower() in (".png",".jpg",".jpeg",".webp")]
before = sum(p.stat().st_size for p in images)
names = Counter(p.name for p in images)
scope = ("public/assets/aistudio/", "public/assets/world_cup_2026/players/")
exts = {".ts",".tsx",".js",".jsx",".mjs",".cjs",".json",".css",".scss",".html",".md",".csv",".txt",".svg"}
texts = {}
for p in tracked:
    rel = p.relative_to(ROOT).as_posix()
    if p.is_file() and p.suffix.lower() in exts and p.stat().st_size < 12_000_000 and not rel.startswith(("scripts/optimize-images", ".github/", "docs/image-optimization-report")):
        try: texts[p] = p.read_text(encoding="utf-8")
        except (UnicodeError, OSError): pass
# Do not alter assets used through extension-constrained imports or glob discovery.
glob_texts = [t for t in texts.values() if "import.meta.glob" in t or "require.context" in t]
unsafe_glob = any(re.search(r"aistudio|world_cup_2026|public/assets|/assets/\*\*", t, re.I) for t in glob_texts)
renamed = {}
saved = 0
groups = Counter()
for p in images:
    rel = p.relative_to(ROOT).as_posix()
    if not rel.startswith(scope) or p.suffix.lower() == ".webp" or names[p.name] != 1 or p.stat().st_size < 65_000 or unsafe_glob:
        continue
    target = p.with_name(p.name + ".webp")
    if target.exists(): continue
    pattern = re.compile(re.escape(p.name) + r"(?![A-Za-z0-9_.-])")
    refs = [(f,t) for f,t in texts.items() if pattern.search(t)]
    # The prior pass treated entire JSON lines with external URLs as remote references.
    # Only inspect actual URL tokens here; retain assets that really are referenced remotely.
    url_pattern = re.compile(r'https?://[^\s"\'<>\\]+', re.I)
    if any(any(pattern.search(u) for u in url_pattern.findall(t)) for _,t in refs): continue
    # Avoid changing historical source manifests, except the active local World Cup manifest.
    if rel.startswith(scope[1]) and not refs: continue
    try:
        raw = p.read_bytes()
        with Image.open(BytesIO(raw)) as src:
            if getattr(src, "n_frames", 1) != 1: continue
            normalized = ImageOps.exif_transpose(src)
            alpha = "A" in normalized.getbands() or "transparency" in src.info
            im = normalized.convert("RGBA" if alpha else "RGB")
            buf = BytesIO()
            kwargs = {"quality":88,"method":6,"alpha_quality":100,"exact":True}
            if src.info.get("icc_profile"): kwargs["icc_profile"] = src.info["icc_profile"]
            im.save(buf,format="WEBP",**kwargs)
            data = buf.getvalue()
            if len(data) >= len(raw)*0.82: continue
            with Image.open(BytesIO(data)) as check:
                check.load()
                if check.size != im.size: raise ValueError("dimensions changed")
                if alpha and check.convert("RGBA").getchannel("A").tobytes() != im.getchannel("A").tobytes(): raise ValueError("alpha changed")
            # All matches are local filenames, with uniqueness and remote-URL checks above.
            for f,t in refs: texts[f] = pattern.sub(target.name,t)
            renamed[rel] = target.relative_to(ROOT).as_posix()
            saved += len(raw)-len(data)
            groups["aistudio" if rel.startswith(scope[0]) else "world_cup_players"] += 1
            if args.apply:
                target.write_bytes(data)
                p.unlink()
    except Exception as exc:
        print("SKIP",rel,str(exc),file=sys.stderr)
if args.apply:
    for p,t in texts.items():
        if p.is_file() and p.read_text(encoding="utf-8") != t: p.write_text(t,encoding="utf-8")
report = {"mode":"applied" if args.apply else "dry-run","imageBytesBefore":before,"imageBytesAfter":before-saved,"bytesSaved":saved,"webpConverted":len(renamed),"groups":dict(groups),"renamed":renamed}
print(json.dumps(report,ensure_ascii=False,indent=2))
if args.apply:
    (ROOT/"docs/image-optimization-stage2-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
