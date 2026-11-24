# Image optimization
Run `python scripts/optimize-images.py` to preview savings or `python scripts/optimize-images.py --apply` to apply them in a clean checkout (Pillow 11.3.0).

The script converts large artwork with explicit local references into WebP, rewrites those references, and preserves legacy URLs on the application server. Question PNGs are optimized losslessly; JPEGs are re-encoded only when size savings are substantial. No resizing of question images. The workflow commits the actual optimized files only after the build and image-bank tests succeed. The report is written to docs/image-optimization-report.json. Git history and dependency sizes are not included in the image savings.
