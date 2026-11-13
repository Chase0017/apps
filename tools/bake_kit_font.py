#!/usr/bin/env python3
"""Bake a glyph atlas family for the kit's software canvas (kit/runtime/fonts/<family>.json, read by
kit/runtime/fonts.js): the format of the kit's own Ubuntu families, one entry per pixel size.

    python tools/bake_kit_font.py            (needs Pillow)

Each size: { size, ascent, descent, atlasW, atlasH, glyphs: { codepoint: [gx, gy, gw, gh, ox, oy, advance] },
alpha: zlib(base64) one coverage byte per atlas pixel }. ox / oy place the glyph's box from the pen on the
baseline (oy negative = above it). Digits share one advance (tabular) so a changing number doesn't shift.

Families baked here (chase0017-apps fork):
  race  Barlow Condensed Bold (SIL OFL 1.1, tools/fonts-src): Apex Telemetry's GT3 numbers and headers.
"""
import base64, json, os, zlib
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'fonts-src')
OUT = os.path.join(HERE, '..', 'kit', 'runtime', 'fonts')
CHARS = ''.join(chr(c) for c in range(32, 127)) + '°·±–'
FAMILIES = {
    'race': ('BarlowCondensed-Bold.ttf', [18, 24, 32, 44, 64, 96]),
}
ATLAS_W = 1024


def bake_size(path, size):
    font = ImageFont.truetype(path, size)
    ascent, descent = font.getmetrics()
    digit_adv = max(font.getlength(d) for d in '0123456789')
    cells = []
    for ch in CHARS:
        x0, y0, x1, y1 = font.getbbox(ch, anchor='ls')
        adv = digit_adv if ch.isdigit() else font.getlength(ch)
        ox = x0 + ((digit_adv - font.getlength(ch)) / 2 if ch.isdigit() else 0)
        w, h = max(0, x1 - x0), max(0, y1 - y0)
        img = None
        if w and h:
            img = Image.new('L', (w + 2, h + 2), 0)
            ImageDraw.Draw(img).text((1 - x0, 1 - y0), ch, font=font, fill=255, anchor='ls')
            w, h = w + 2, h + 2
            ox -= 1; y0 -= 1
        cells.append((ch, img, w, h, round(ox, 2), y0, round(adv, 2)))
    # shelf packing
    x = y = row_h = 0
    places = []
    for ch, img, w, h, ox, oy, adv in cells:
        if x + w > ATLAS_W:
            x, y, row_h = 0, y + row_h + 1, 0
        places.append((x, y))
        x += w + 1
        row_h = max(row_h, h)
    atlas_h = y + row_h + 1
    atlas = Image.new('L', (ATLAS_W, atlas_h), 0)
    glyphs = {}
    for (ch, img, w, h, ox, oy, adv), (gx, gy) in zip(cells, places):
        if img is not None:
            atlas.paste(img, (gx, gy))
        glyphs[str(ord(ch))] = [gx, gy, w, h, ox, oy, adv]
    alpha = base64.b64encode(zlib.compress(atlas.tobytes(), 9)).decode('ascii')
    return {'size': size, 'ascent': ascent, 'descent': descent, 'atlasW': ATLAS_W, 'atlasH': atlas_h,
            'glyphs': glyphs, 'alpha': alpha}


def main():
    for fam, (file, sizes) in FAMILIES.items():
        path = os.path.join(SRC, file)
        j = {'family': fam, 'source': file, 'cacheKey': fam + '-1', 'sizes': [bake_size(path, s) for s in sizes]}
        out = os.path.join(OUT, fam + '.json')
        with open(out, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(j, f, separators=(',', ':'))
        print('%s: %d sizes, %.0f kB' % (fam, len(sizes), os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
