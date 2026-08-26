#!/usr/bin/env python3
# Renders the 🚪 emoji into the extension icons (16/48/128) using the system
# Apple Color Emoji font, so the toolbar icon is the actual door emoji.
# Run: python3 scripts/generate-icons.py   (needs Pillow: pip install pillow)
import os
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Apple Color Emoji.ttc"
DOOR = "\U0001F6AA"
OUT = os.path.join(os.path.dirname(__file__), "..", "icons")

font = ImageFont.truetype(FONT, 160)  # Apple emoji strike size
base = 180
img = Image.new("RGBA", (base, base), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
try:
    d.text((base / 2, base / 2), DOOR, font=font, embedded_color=True, anchor="mm")
except TypeError:  # older Pillow without anchor support
    bb = d.textbbox((0, 0), DOOR, font=font, embedded_color=True)
    d.text(((base - (bb[2] - bb[0])) / 2 - bb[0], (base - (bb[3] - bb[1])) / 2 - bb[1]),
           DOOR, font=font, embedded_color=True)

# tight-crop to the glyph, then pad to a centered square before downscaling
g = img.crop(img.getbbox())
side = max(g.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(g, ((side - g.size[0]) // 2, (side - g.size[1]) // 2), g)

os.makedirs(OUT, exist_ok=True)
for s in (16, 48, 128):
    sq.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"icon{s}.png"))
    print(f"wrote icon{s}.png")
