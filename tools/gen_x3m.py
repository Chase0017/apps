#!/usr/bin/env python3
"""Write apps/cluster_themes/hud/layouts/x3m.json: the pre-LCI F97 X3 M's own M cluster, fitted to a 2022+ X3's panel.

    python tools/gen_x3m.py

Two big round dials (speed 0..200 mph or 0..320 km/h, revs 0..8000 with the red band from the redline), red needles,
chrome rings; the gear, the drive setup (engine / chassis / steering) and a trip strip between them; small fuel and
oil temperature arcs hugging the dials' outer lower edges. Fitted round this car (shared/visible.js): the driver
camera and BMW's turn arrows at the top centre, its brake / ABS / traction lights down the left edge, the steering and
PARK lights top right, the belt light and gear letter at the bottom. BMW's solid black box (x 1406-1597, y 342-419)
lands on the rev dial's hub on purpose: the hub is dark, so the box reads as its cap (the dial says overBlackBox).
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'apps', 'cluster_themes', 'hud', 'layouts', 'x3m.json')

R = 285                     # dial radius (layer 570 x 570)
BEZEL = 6
SPD = (420, 380)            # speedometer centre
REV = (1920 - SPD[0], SPD[1])   # rev counter centre, the mirror (its hub under BMW's black box)
RING_W = 14
NUM_R = 212                 # where the scale numbers sit (just inside the ticks)
START, SWEEP = 225, 270     # degrees clockwise from 12 o'clock (the dial shader's defaults)
ARC_R = R + 30              # the small fuel / oil arcs, just outside the chrome ring
ARC_W = 9

W = []
def add(**k): W.append(k)
def at(c, r, deg):
    a = math.radians(deg)
    return c[0] + r * math.sin(a), c[1] - r * math.cos(a)
def text(id, cx, cy, w, h, txt, font, **k):
    add(id=id, type='text', z=5, x=round(cx - w / 2), y=round(cy - h / 2), w=w, h=h, text=txt, font=font, **k)

add(id='bg', type='fill', **{'class': 'content'}, z=0, x=0, y=0, w=1920, h=720, color='bg')

# the dials: one speedometer per unit system (only the one in use is built), one rev counter
dial = dict(type='mdial', z=1, ring='chrome', ring2='chrome2', needle='needle', face='face', face2='face2', tip='fg',
            cap='capRing', capR=34, inner=0.6, ringW=BEZEL, **{'class': 'content'})
for units, mx, ticks, minor in (('us', 200, 10, 4), ('metric', 320, 8, 4)):
    add(id='speedo_' + units, x=SPD[0] - R, y=SPD[1] - R, w=2 * R, h=2 * R, measure='speed', maxUs=200, ticksUs=10,
        maxMetric=320, ticksMetric=8, minor=minor, toggle='units=' + units, **dial)
add(id='tacho', x=REV[0] - R, y=REV[1] - R, w=2 * R, h=2 * R, measure='rpm', max=8000, minor=4, overBlackBox=True, **dial)

# the small arcs: fuel up the speedometer's lower left (empty at the bottom), oil temperature up the rev counter's
# lower right (160 F at the bottom, 340 F at the top), as on the F97
arcbox = lambda c: dict(x=round(c[0] - ARC_R - ARC_W / 2 - 1), y=round(c[1] - ARC_R - ARC_W / 2 - 1),
                        w=round(2 * (ARC_R + ARC_W / 2 + 1)), h=round(2 * (ARC_R + ARC_W / 2 + 1)))
add(id='fuel_arc', type='arc', z=2, **{'class': 'content'}, **arcbox(SPD), signal='fuel', min=0, max=1, start=200,
    sweep=50, width=ARC_W, color='dim', conn=1)
add(id='oil_arc', type='arc', z=2, **{'class': 'content'}, **arcbox(REV), signal='oil', min=71, max=171, start=160,
    sweep=-50, width=ARC_W, color='dim', conn=1)

# scale numbers (conn 1: their own connection, as the Roadster's)
for units, mx, step in (('us', 200, 20), ('metric', 320, 40)):
    n = mx // step
    for i in range(n + 1):
        x, y = at(SPD, NUM_R, START + SWEEP * i / n)
        text('spd_%s_%d' % (units, i), x, y, 80, 38, str(i * step), 'x_num', color='fg', align='center',
             toggle='units=' + units, conn=1)
for k in range(1, 9):
    x, y = at(REV, NUM_R, START + SWEEP * k / 8)
    text('rpm%d' % k, x, y, 44, 38, str(k), 'x_num', color='fg', align='center', conn=1)

# inside the speedometer: the unit and the speed in figures, upper middle
text('spd_unit', SPD[0], SPD[1] - 158, 100, 31, '{{u:speedLc}}', 'x_lbl', color='dim', align='center')
text('spd_dig', SPD[0], SPD[1] - 112, 160, 51, '{{speed}}', 'x_spd', color='fg', align='center')
# inside the rev counter: its unit, the X3 M badge right of the hub (clear of the black box), READY lower left
text('rpm_unit', REV[0], REV[1] - 158, 160, 31, '1/min x 1000', 'x_lbl', color='dim', align='center')
add(id='badge_x3', type='text', z=5, x=REV[0] + 108, y=REV[1] - 18, w=56, h=36, text='X3', font='x_logo', color='fg')
add(id='badge_stripe', type='stripe', z=5, x=REV[0] + 166, y=REV[1] - 9, w=30, h=18)
add(id='badge_m', type='text', z=5, x=REV[0] + 199, y=REV[1] - 18, w=40, h=36, text='M', font='x_logo', color='fg')
text('ready', REV[0] - 80, REV[1] + 100, 110, 31, '{{ready}}', 'x_lbl', color='fg', align='center')

# between the dials: the drive setup at the top (clear of the camera and the turn arrows), the gear, the trip strip
for i, (part, icon) in enumerate((('engine', 'gauge'), ('chassis', 'shock'), ('steering', 'wheel'))):
    cx = 840 + 120 * i
    text('setup_' + part, cx, 166, 118, 31, '{{setupT:%s}}' % part, 'x_lbl', color='fg', align='center')
    add(id='setup_icon_' + part, type='icon', z=5, icon=icon, x=cx - 15, y=188, w=30, h=30, color='dim')
text('gear', 960, 380, 220, 90, '{{gearnum}}', 'x_gear', color='fg', align='center', hotWhen='now')
add(id='strip_band', type='box', z=1, **{'class': 'content'}, x=712, y=590, w=496, h=46, fill='strip', line='stripLine',
    border=1.5, radius=12, head=0)
text('strip_time', 800, 612, 130, 31, '{{time}} {{ampm}}', 'x_lbl', color='fg', align='center')
text('strip_range', 960, 612, 170, 31, 'RANGE {{range}} {{u:distLc}}', 'x_lbl', color='fg', align='center')
text('strip_temp', 1110, 612, 110, 31, '{{ambient}}{{u:temp}}', 'x_lbl', color='fg', align='center')

# the small gauges' marks, outside the arcs
def mark(id, c, deg, s, w=60):
    x, y = at(c, ARC_R + 28, deg)
    text(id, x, y, w, 31, s, 'x_lbl', color='fg', align='center', conn=1)
mark('fuel_0', SPD, 200, '0'); mark('fuel_h', SPD, 225, '1/2'); mark('fuel_1', SPD, 250, '1')
mark('oil_lo', REV, 160, '160', 64); mark('oil_mid', REV, 135, '250', 64); mark('oil_hi', REV, 110, '340', 64)

layout = {
    'schemaVersion': 2,
    'name': 'X3 M',
    'theme': 'x3m',
    '_about': ("After the pre-LCI F97 X3 M's own M cluster (photo, Nov 12 2026), written by tools/gen_x3m.py (edit that "
               "and run it): two round dials with chrome rings and red needles (speed 0..200 mph / 0..320 km/h, revs "
               "0..8000 with the red band from the redline), the drive setup, the gear and a time / range / outside strip "
               "between them, fuel and oil temperature arcs outside the dials' lower edges. Fitted round a 2022+ X3: the "
               "driver camera, BMW's turn arrows, warning lights, belt light and gear letter; BMW's black box lands on the "
               "rev dial's hub on purpose (overBlackBox). Widget reference: shared/hud.js header."),
    'widgets': W,
}
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(layout, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', os.path.relpath(OUT), len(W), 'widgets')
