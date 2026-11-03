"""Build authored gift animation and static cover without implicit quality loss.

python scripts/build-gift-sticker.py SOURCE NAME [--cover-frame N]

SOURCE is a numbered WebP/PNG frame ZIP/folder or animated WebP. Defaults retain
native dimensions, every authored frame, 30 fps, color quality 88 and lossless
alpha. Optional --max-edge and --frame-step reductions must be explicit.
Original archives stay outside the repository (for example Gifts/Golden_Rose.zip
or a user-supplied Downloads/Heart.zip); the generated assets are portable.
Requires Pillow with animated WebP support.
"""
import argparse
import io
import json
import re
import zipfile
from pathlib import Path

from PIL import Image, ImageSequence

STICKERS = Path(__file__).resolve().parent.parent / "web" / "stickers"


def natural(name):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", str(name))]


def frames(source):
    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as archive:
            names = sorted((n for n in archive.namelist() if n.lower().endswith((".webp", ".png")) and not n.startswith("__MACOSX/")), key=natural)
            return [Image.open(io.BytesIO(archive.read(n))).convert("RGBA") for n in names]
    if source.is_dir():
        return [Image.open(p).convert("RGBA") for p in sorted((p for p in source.iterdir() if p.suffix.lower() in (".webp", ".png")), key=natural)]
    with Image.open(source) as animation:
        return [frame.convert("RGBA") for frame in ImageSequence.Iterator(animation)]


def cover(frame, box=None, size=384):
    still = frame.copy()
    # Frame a useful still icon without changing the authored animation's alpha.
    still.putalpha(still.getchannel("A").point(lambda value: 0 if value < 96 else value))
    width, height = still.size
    if box:
        x, y, w, h = (float(v) for v in box.split(","))
        left, top, right, bottom = x * width, y * height, (x + w) * width, (y + h) * height
    else:
        bounds = still.getchannel("A").point(lambda v: 255 if v >= 128 else 0).getbbox()
        left, top, right, bottom = bounds or (0, 0, width, height)
    side = max(right - left, bottom - top) * 1.08
    cx, cy = (left + right) / 2, (top + bottom) / 2
    square = still.crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2)))
    target = max(1, min(size, width, height, square.width))
    return square.resize((target, target), Image.Resampling.LANCZOS)


def build(args):
    source = frames(args.source)
    if not source:
        raise ValueError("No authored WebP/PNG frames found")
    if len({frame.size for frame in source}) != 1:
        raise ValueError("All authored frames must have identical dimensions")
    if not 0 <= args.cover_frame < len(source):
        raise ValueError("Cover frame is outside the authored animation")
    cutoff = getattr(args, "alpha_cutoff", 0)
    if cutoff:
        for frame in source:
            frame.putalpha(frame.getchannel("A").point(lambda value: 0 if value < cutoff else value))
    STICKERS.mkdir(parents=True, exist_ok=True)
    still = STICKERS / f"{args.name}-cover.webp"
    cover(source[args.cover_frame], args.cover_box, args.cover_size).save(still, lossless=True, exact=True, method=6)
    if args.cover_only:
        return {"cover": str(still), "coverBytes": still.stat().st_size}
    animated = source[::args.frame_step]
    if args.max_edge:
        for frame in animated:
            frame.thumbnail((args.max_edge, args.max_edge), Image.Resampling.LANCZOS)
    durations = [round(min((index + 1) * args.frame_step, len(source)) * 1000 / args.fps)
                 - round(index * args.frame_step * 1000 / args.fps) for index in range(len(animated))]
    target = STICKERS / f"{args.name}.webp"
    pending = target.with_suffix(".building.webp")
    animated[0].save(pending, save_all=True, append_images=animated[1:], duration=durations,
                     loop=0, lossless=False, quality=args.quality, alpha_quality=args.alpha_quality,
                     method=4, minimize_size=True, allow_mixed=True, background=(0, 0, 0, 0))
    if pending.stat().st_size > 64 * 1024 * 1024:
        pending.unlink()
        raise ValueError("Generated animation exceeds the 64 MiB playback cache limit")
    pending.replace(target)
    with Image.open(target) as result:
        return {"file": str(target), "width": result.width, "height": result.height,
                "sourceFrames": len(source), "encodedFrames": result.n_frames,
                "fps": args.fps / args.frame_step, "durationMs": sum(durations),
                "colorQuality": args.quality, "alphaQuality": args.alpha_quality, "alphaCutoff": cutoff,
                "bytes": target.stat().st_size, "cover": str(still), "coverBytes": still.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("name")
    parser.add_argument("--cover-frame", type=int, default=0)
    parser.add_argument("--cover-box")
    parser.add_argument("--cover-size", type=int, default=384)
    parser.add_argument("--cover-only", action="store_true")
    parser.add_argument("--fps", type=int, default=30, choices=range(1, 61))
    parser.add_argument("--frame-step", type=int, default=1, choices=range(1, 9))
    parser.add_argument("--max-edge", type=int)
    parser.add_argument("--quality", type=int, default=88, choices=range(1, 101))
    parser.add_argument("--alpha-quality", type=int, default=100, choices=range(1, 101))
    parser.add_argument("--alpha-cutoff", type=int, default=0, choices=range(0, 65), help="Optional established haze cleanup; 0 preserves every authored alpha value")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.name):
        parser.error("Name must be a lowercase asset slug")
    if args.cover_size < 1 or args.max_edge is not None and args.max_edge < 1:
        parser.error("Requested image bounds must be positive")
    print(json.dumps(build(args)))


if __name__ == "__main__":
    main()
