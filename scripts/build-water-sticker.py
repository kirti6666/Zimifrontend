import io
import sys
import zipfile
from pathlib import Path

from PIL import Image


source = Path(sys.argv[1])
target = Path(sys.argv[2])

with zipfile.ZipFile(source) as archive:
    names = sorted(name for name in archive.namelist() if name.lower().endswith(".webp"))
    frames = []
    for name in names[::2]:
        with Image.open(io.BytesIO(archive.read(name))) as frame:
            frame = frame.convert("RGBA")
            # The source carries faint alpha over the full canvas, which reads
            # as a rectangular matte on dark video. Remove only that haze.
            alpha = frame.getchannel("A").point(lambda value: 0 if value < 28 else value)
            frame.putalpha(alpha)
            frame.thumbnail((270, 480), Image.Resampling.LANCZOS)
            frames.append(frame.copy())

target.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(
    target,
    save_all=True,
    append_images=frames[1:],
    duration=67,
    loop=0,
    lossless=False,
    quality=72,
    method=4,
)
print(f"built {target} ({len(frames)} frames, {target.stat().st_size} bytes)")
