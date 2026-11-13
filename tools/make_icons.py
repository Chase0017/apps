"""Apex Cluster / Apex HUD icons: a chevron (the apex) built from shift lights, green at the base to blue at the tip.

    python tools/make_icons.py <repo root> <out dir>   then copy cluster.png / hud.png / telemetry.png to each app's icon.png (needs Pillow)
"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
S = 4; N = 140 * S
REPO = sys.argv[1]; OUT = sys.argv[2]
FONT = os.path.join(REPO, 'tools', 'fonts-src', 'BarlowCondensed-Bold.ttf')
LED = [(46, 204, 113), (46, 204, 113), (241, 196, 15), (231, 76, 60), (231, 76, 60), (52, 120, 255)]

def glow(img, layer, r):
    g = layer.filter(ImageFilter.GaussianBlur(r)); img.alpha_composite(g); img.alpha_composite(layer)

def chevron(img, cx, top, span, rise, rad):
    """Six lights a side rising to a seventh at the tip."""
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    pts = []
    for i in range(6):
        t = i / 6
        for sgn in (-1, 1):
            pts.append((cx + sgn * span * (1 - t), top + rise * (1 - t), LED[i]))
    pts.append((cx, top, (52, 120, 255)))
    for x, y, c in pts:
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=c + (255,))
        d.ellipse([x - rad * .45, y - rad * .55, x + rad * .15, y - rad * .05], fill=(255, 255, 255, 90))
    glow(img, lay, rad * .9)

def slab(d, box, r, fill, edge):
    d.rounded_rectangle(box, r, fill=edge)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S], r - 3 * S, fill=fill)

def cluster():
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    # the cluster face: dark slab with an ice-white rim
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([10 * S, 16 * S, 130 * S, 132 * S], 26 * S, fill=(0, 0, 0, 150))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5 * S)))
    slab(d, [8 * S, 10 * S, 132 * S, 128 * S], 26 * S, (16, 19, 24, 255), (233, 242, 255, 255))
    chevron(img, 70 * S, 30 * S, 48 * S, 36 * S, 5.2 * S)
    d = ImageDraw.Draw(img)
    # the gear, under the apex
    f = ImageFont.truetype(FONT, 58 * S)
    d.text((70 * S, 92 * S), '3', font=f, fill=(245, 248, 255, 255), anchor='mm')
    # rev bar along the bottom: lit green to red, then dark
    x0, x1, y = 22 * S, 118 * S, 112 * S
    segs = 16
    for i in range(segs):
        a = x0 + (x1 - x0) * i / segs; b = a + (x1 - x0) / segs - 1.6 * S
        c = (46, 204, 113) if i < 8 else (241, 196, 15) if i < 11 else (231, 76, 60) if i < 13 else (52, 58, 70)
        d.rectangle([a, y, b, y + 6 * S], fill=c + (255,))
    return img.resize((140, 140), Image.LANCZOS)

def hud():
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    # the windshield: a tinted pane, wider at the bottom, with an ice-white frame
    pane = [(20 * S, 14 * S), (120 * S, 14 * S), (134 * S, 112 * S), (6 * S, 112 * S)]
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x, y + 5 * S) for x, y in pane], fill=(0, 0, 0, 140))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5 * S)))
    d.polygon(pane, fill=(233, 242, 255, 255))
    inner = [(24 * S, 18 * S), (116 * S, 18 * S), (129 * S, 108 * S), (11 * S, 108 * S)]
    grad = Image.new('RGBA', img.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(grad)
    for y in range(18 * S, 108 * S):
        t = (y - 18 * S) / (90 * S)
        gd.line([(0, y), (N, y)], fill=(int(22 + 18 * t), int(34 + 20 * t), int(52 + 26 * t), 255))
    mask = Image.new('L', img.size, 0); ImageDraw.Draw(mask).polygon(inner, fill=255)
    img.paste(grad, (0, 0), mask)
    # a glass glint
    gl = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).polygon([(30 * S, 18 * S), (52 * S, 18 * S), (26 * S, 108 * S), (12 * S, 108 * S)], fill=(255, 255, 255, 22))
    img.paste(Image.alpha_composite(img, gl), (0, 0), mask)
    chevron(img, 70 * S, 34 * S, 42 * S, 30 * S, 4.6 * S)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 46 * S)
    d.text((70 * S, 86 * S), '3', font=f, fill=(245, 248, 255, 255), anchor='mm')
    # the dash it floats over, and the projector beam
    beam = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(beam).polygon([(56 * S, 132 * S), (84 * S, 132 * S), (98 * S, 104 * S), (42 * S, 104 * S)], fill=(52, 120, 255, 70))
    img.alpha_composite(beam.filter(ImageFilter.GaussianBlur(2 * S)))
    d.rounded_rectangle([30 * S, 124 * S, 110 * S, 134 * S], 5 * S, fill=(16, 19, 24, 255), outline=(233, 242, 255, 255), width=2 * S)
    return img.resize((140, 140), Image.LANCZOS)

def telemetry():
    """Apex Telemetry: the car from above, its four tyres lit by temperature, on the cluster's dark slab."""
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([10 * S, 16 * S, 130 * S, 132 * S], 26 * S, fill=(0, 0, 0, 150))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5 * S)))
    slab(d, [8 * S, 10 * S, 132 * S, 128 * S], 26 * S, (16, 19, 24, 255), (233, 242, 255, 255))
    # body
    d.rounded_rectangle([52 * S, 24 * S, 88 * S, 114 * S], 15 * S, fill=(58, 64, 74, 255))
    d.rounded_rectangle([54 * S, 26 * S, 86 * S, 112 * S], 13 * S, fill=(28, 32, 39, 255))
    d.rounded_rectangle([58 * S, 44 * S, 82 * S, 56 * S], 4 * S, fill=(52, 66, 86, 255))
    d.rounded_rectangle([59 * S, 90 * S, 81 * S, 98 * S], 3 * S, fill=(52, 66, 86, 255))
    # tyres, glowing in their temperature colours
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    for (x, y), c in zip([(38, 30), (90, 30), (38, 82), (90, 82)], [LED[0], LED[0], LED[2], LED[3]]):
        ld.rounded_rectangle([x * S, y * S, (x + 12) * S, (y + 26) * S], 4 * S, fill=c + (255,))
    glow(img, lay, 3 * S)
    d = ImageDraw.Draw(img)
    # pressure ticks beside each tyre
    for x, y in [(18, 36), (106, 36), (18, 88), (106, 88)]:
        for i in range(3):
            d.rounded_rectangle([x * S, (y + i * 6) * S, (x + 16) * S, (y + i * 6 + 3) * S], 1 * S, fill=(233, 242, 255, 255 if i == 0 else 110))
    return img.resize((140, 140), Image.LANCZOS)


cluster().save(os.path.join(OUT, 'cluster.png')); hud().save(os.path.join(OUT, 'hud.png')); telemetry().save(os.path.join(OUT, 'telemetry.png'))
# a side-by-side on dark and light, to look at
sheet = Image.new('RGBA', (900, 170), (20, 20, 20, 255))
ImageDraw.Draw(sheet).rectangle([450, 0, 900, 170], fill=(235, 238, 242, 255))
for i, n in enumerate(['cluster', 'hud', 'telemetry', 'cluster', 'hud', 'telemetry']):
    sheet.alpha_composite(Image.open(os.path.join(OUT, n + '.png')), (10 + i * 150, 15))
sheet.save(os.path.join(OUT, 'sheet.png'))
