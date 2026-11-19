"""Derive Analog's broader, lightly slanted lettering from the shipped Barlow atlases.

Run after bake_fonts.py when the source fonts change. Uses only Python's standard
library; bilinear coverage resampling preserves the baked glyphs' antialiasing.
"""
import base64
import json
import math
from pathlib import Path

FONTS = Path(__file__).resolve().parents[1] / 'apps/cluster_themes/hud/fonts'
SPECS = [
    ('a_speed', 'n_speed', 1.12, .85, .10),
    ('a_gear', 'r_gear', 1.50, 1.18, .10),
    ('a_value', 'm_val', 1.0, 50/54, 0),
    ('a_label', 'r_label', 1.30, 28/24, 0),
    ('a_status', 'unit', 1.25, 38/34, 0),
    ('a_num', 'r_num', 1.20, 1.20, .12),
]

def bake(name, source, sx, sy, skew):
    src = json.loads((FONTS / (source + '.json')).read_text(encoding='utf-8'))
    alpha = base64.b64decode(src['alpha'])
    height = math.ceil(src['cellHeight'] * sy)
    glyphs, cells = {}, []
    for ch, g in src['glyphs'].items():
        if not g['w']:
            glyphs[ch] = dict(g, advance=round(g['advance'] * sx))
            continue
        width = math.ceil(g['w'] * sx + skew * height)
        cell = bytearray(width * height)
        def sample(x, y):
            if x < 0 or y < 0 or x >= g['w'] or y >= g['h']:
                return 0
            return alpha[(g['y'] + y) * src['width'] + g['x'] + x]
        for y in range(height):
            v = (y + .5) / sy - .5
            iy, fy = math.floor(v), v - math.floor(v)
            for x in range(width):
                u = (x + .5 - skew * (height - y - .5)) / sx - .5
                ix, fx = math.floor(u), u - math.floor(u)
                top = sample(ix, iy) * (1-fx) + sample(ix+1, iy) * fx
                bottom = sample(ix, iy+1) * (1-fx) + sample(ix+1, iy+1) * fx
                cell[y*width+x] = round(top*(1-fy) + bottom*fy)
        cells.append((ch, g, width, cell))
    x = y = 0
    for ch, g, width, cell in cells:
        if x + width > 1024:
            x, y = 0, y + height
        glyphs[ch] = dict(x=x, y=y, w=width, h=height, ox=round(g['ox']*sx), advance=round(g['advance']*sx))
        x += width
    atlas = bytearray(1024 * (y + height))
    for ch, _, width, cell in cells:
        g = glyphs[ch]
        for row in range(height):
            start = (g['y']+row)*1024+g['x']
            atlas[start:start+width] = cell[row*width:(row+1)*width]
    out = dict(source=src['source'], derivedFrom=source, transform=[sx,sy,skew], size=round(src['size']*sy),
               cellHeight=height, baseline=round(src['baseline']*sy), glyphs=glyphs,
               width=1024, height=y+height, alpha=base64.b64encode(atlas).decode())
    (FONTS/(name+'.json')).write_text(json.dumps(out, separators=(',',':'), ensure_ascii=False), encoding='utf-8')
    print(name, 'cell', height, 'glyphs', len(glyphs))

if __name__ == '__main__':
    for spec in SPECS:
        bake(*spec)
