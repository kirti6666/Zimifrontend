"""Check authored resolution/frame timing/alpha, using tiny local fixtures."""
import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

spec = importlib.util.spec_from_file_location("gift_builder", Path(__file__).with_name("build-gift-sticker.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class GiftBuilderTest(unittest.TestCase):
    def test_native_dimensions_all_frames_exact_timing_and_alpha(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            source = folder / "source.zip"
            frames = [("frame10.png", (20, 20, 220, 192)), ("frame2.png", (20, 220, 20, 128)), ("frame1.png", (220, 20, 20, 64))]
            with zipfile.ZipFile(source, "w") as archive:
                for name, color in frames:
                    data = io.BytesIO()
                    Image.new("RGBA", (32, 48), color).save(data, format="PNG")
                    archive.writestr(name, data.getvalue())
            previous = builder.STICKERS
            builder.STICKERS = folder / "output"
            try:
                args = SimpleNamespace(source=source, name="sample", cover_frame=1, cover_box=None, cover_size=384,
                                       cover_only=False, frame_step=1, max_edge=None, fps=30, quality=88, alpha_quality=100)
                result = builder.build(args)
                self.assertEqual((result["width"], result["height"], result["encodedFrames"], result["durationMs"]), (32, 48, 3, 100))
                with Image.open(result["file"]) as animation:
                    duration = 0
                    for index, expected_alpha in enumerate((64, 128, 192)):
                        animation.seek(index)
                        animation.load()
                        self.assertEqual(animation.convert("RGBA").getpixel((16, 24))[3], expected_alpha)
                        duration += animation.info["duration"]
                    self.assertEqual(duration, 100)
                with Image.open(result["cover"]) as cover:
                    self.assertEqual(cover.size, (32, 32), "A cover never invents resolution by upscaling")
                    self.assertEqual(cover.n_frames, 1)
                self.assertFalse(list(builder.STICKERS.glob("*.building.webp")))
                args.frame_step, args.max_edge = 2, 24
                reduced = builder.build(args)
                self.assertEqual((reduced["width"], reduced["height"], reduced["durationMs"]), (16, 24, 100))
            finally:
                builder.STICKERS = previous


if __name__ == "__main__":
    unittest.main()
