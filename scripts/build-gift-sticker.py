"""Builds an animated gift sticker and its still cover for web/stickers/.

    python scripts/build-gift-sticker.py SOURCE NAME [--cover-frame N] [--cover-box X,Y,W,H] [--cover-only]

SOURCE is a zip or folder of numbered .webp frames, or an animated .webp.
Writes web/stickers/NAME.webp (every second frame, 15 fps) and
web/stickers/NAME-cover.webp (one frame cropped to a square). --cover-box
takes fractions of the frame; without it the cover frames the solid artwork.
--cover-only keeps an existing animation and writes just the cover.
Needs Pillow (pip install pillow).
"""
import argparse
import io
import zipfile
from pathlib import Path

from PIL import Image, ImageSequence

STICKERS = Path(__file__).resolve().parent.parent / "web" / "stickers"


def frames(source):
    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as archive:
            names = sorted(n for n in archive.namelist() if n.lower().endswith(".webp"))
            return [Image.open(io.BytesIO(archive.read(n))).convert("RGBA") for n in names]
    if source.is_dir():
        return [Image.open(p).convert("RGBA") for p in sorted(source.glob("*.webp"))]
    with Image.open(source) as animation:
        return [frame.convert("RGBA") for frame in ImageSequence.Iterator(animation)]


def clean(frame):
    # Rendered sources carry faint alpha over the full canvas, which reads as a
    # rectangular matte on dark video. Remove only that haze.
    frame.putalpha(frame.getchannel("A").point(lambda value: 0 if value < 28 else value))
    return frame


def cover(frame, box):
    # A still has no motion to carry stray sparkle glow, so keep only the solid art.
    frame = frame.copy()
    frame.putalpha(frame.getchannel("A").point(lambda value: 0 if value < 96 else value))
    width, height = frame.size
    if box:
        x, y, w, h = (float(v) for v in box.split(","))
        left, top, right, bottom = x * width, y * height, (x + w) * width, (y + h) * height
    else:
        left, top, right, bottom = frame.getchannel("A").point(lambda v: 255 if v >= 128 else 0).getbbox()
    side = max(right - left, bottom - top) * 1.08
    cx, cy = (left + right) / 2, (top + bottom) / 2
    square = frame.crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2)))
    return square.resize((192, 192), Image.Resampling.LANCZOS)


parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("name")
parser.add_argument("--cover-frame", type=int, default=0)
parser.add_argument("--cover-box")
parser.add_argument("--cover-only", action="store_true")
args = parser.parse_args()

source = [clean(frame) for frame in frames(args.source)]
STICKERS.mkdir(parents=True, exist_ok=True)
still = STICKERS / f"{args.name}-cover.webp"
cover(source[args.cover_frame], args.cover_box).save(still, quality=80, alpha_quality=80, method=6)
print(f"built {still} ({still.stat().st_size} bytes)")

if not args.cover_only:
    animated = []
    for frame in source[::2]:
        frame.thumbnail((216, 384), Image.Resampling.LANCZOS)
        animated.append(frame)
    target = STICKERS / f"{args.name}.webp"
    animated[0].save(
        target,
        save_all=True,
        append_images=animated[1:],
        duration=67,
        loop=0,
        lossless=False,
        quality=50,
        alpha_quality=30,
        method=4,
    )
    print(f"built {target} ({len(animated)} frames, {target.stat().st_size} bytes)")
