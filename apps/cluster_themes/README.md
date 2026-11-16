# Apex Cluster

Redraws the whole instrument cluster of a 2022+ BMW X3 (iDrive 7, the LCI cluster with the driver attention camera)
as **Apex**, a GT3-style race dash. Built on bimmer-lab's Cluster Themes (MIT), with its sibling **Apex HUD** on the
windshield; this fork keeps one theme and fits it
to the LCI cluster.

Layouts: **Apex** (below), **Apex Map** (Apex with BMW's own map showing through a window in the middle) **Stock+**
(BMW's own cluster with shift lights, fuel % and temperatures added) and **Analog** (a big central tachometer).
Apex, Apex Map and Analog leave a small window over BMW's gear letter at the bottom right: covering it makes BMW draw
a black box over its gear slot.

## Apex

- **Shift lights:** two banks of six either side of the driver camera, ramping up towards it, filling from the
  outside in (green, yellow, red, blue). At the shift point every light, the whole rev bar, the gear and the rpm flash
  red together (the rev bar's lit part only, so the rpm still shows). Settings (Shift & alerts): **Placement** Camera (either side of the driver attention camera) / No camera
  (across the middle); **Type** Row (round lights) / Bar (slanted lights on a dark trapezoid, leaning out at the bottom, one piece in the middle, yellow until both ends
  meet at the shift point, then the colour pattern's red) / Off; **Colours** GT3, F1 (green, red, blue), all
  red or all blue; **First light** 2,000 to 6,000 rpm (default 3,000).
- **Held values:** a value the car stops sending stays on screen, dimmed, with a small amber dot after it (in the
  corner just above the digits where the box has no room) until the car answers again.
- **Rev bar** across the top with its scale, under the camera and BMW's turn arrows.
- **Left:** speed, rpm, fuel. **Right:** boost, coolant, oil temperature. Mirrored about the middle, 16 px between
  every box.
- **Beside the gear:** intake air and oil pressure on the left, ignition timing (degrees before TDC, OBD PID 0x0E as
  M Vitals reads it) and AFR on the right, above and below the solid black box BMW draws there.
- **Middle:** the gear number (BMW shows D / S / M itself, bottom right), drive mode and traction control
  (ON / DTC / OFF).
- **Colours:** the gear and rpm turn red while the engine is off; coolant turns yellow above 113 °C (235 °F) and flashes
  red above 120 °C (248 °F), oil and boost flash red over their limits (Alerts tab).
- Every readout box can show another sensor (Readouts tab).
- Units: **Units (all)** for US or metric, or each on its own on the Settings tab: speed and distance, temperature,
  pressure (psi with °C works).

Everything clears what BMW draws over the cluster on this car: the camera pod, the turn arrows, the brake / tyre / ABS /
traction lights down the left edge, the steering and PARK lights top right, the belt light and the gear letter at the
bottom. `shared/visible.js` holds those areas and warns about any widget under one.


## Apex Map

- BMW's own map through a window in the middle, drawn by BMW with no lag, from just under the driver camera down to
  the rev bar (x 740-1210, y 136-575). The window shows whatever BMW's cluster draws there.
- Left: speed, drive mode, fuel; the four tyres (pressure and temperature) and traction beside them, over BMW's
  digital speed. Right: a big gear over BMW's own gear display; boost, coolant, oil.
- The rev bar runs along the bottom, between the side columns. Shift lights and settings as Apex.

## Stock+

- BMW's own cluster left as it is, with a few additions on top (no background).
- Big shift lights in two rows under BMW's turn arrows, clear until they light. Same Shift & alerts settings as Apex
  (Row, Bar or Off; the same spot with or without the camera).
- Four round gauges in the top inside of BMW's dials, level with its model badge: fuel %, coolant, oil (degrees, blue until warm) and boost.
  Each can show another sensor and has its own on / off switch (Readouts tab).
- The gear (no box) beside BMW's gear slot, under its drive mode name (BMW blanks its own while a theme is up).
- Placed from photos of the stock cluster; BMW moves things in other drive modes.

## Analog

- A big round tachometer in the middle (Porsche / Ferrari style): 0 to 8 x1000 rpm, red from the redline, the ring
  red at the shift point. Gear above the hub, speed in figures below it.
- Four arc gauges either side: fuel % and boost left, coolant and oil right. Each follows its readout slot, so any of
  them can show another sensor (Readouts tab).
- Shift lights and settings as Apex.

## Data

Read only, nothing is written to the car. Oil pressure, AFR (lambda x 14.7), intake air, ignition timing and boost come from the engine
unit (DME8FF_R identifiers, as cauliflowermossgrape's Live Data reads them, with standard OBD as the fallback);
traction control from the car's stability control signal. While a readout has no value, the status row on the app's
page says what each identifier answered.

## Starting with the car

`app.json` sets `autostart`, so the head unit starts the app by itself and the dash comes up without opening it (needs a
Store that honours it).

## Working on it

- `tools/layout-preview/`: serve the repo root and open `/tools/layout-preview/?layout=apex` for a browser preview
  with the app's real shaders and fonts, an rpm slider and the visibility check.
- The center-screen page is GT3 like the dash (shared/gt3ui.js): tabs Layouts, Readouts, Units, Shift & alerts,
  Badge & clock, System. **Box colour** (System tab) colours the page and the dash's boxes.
- `tools/settings-preview/`: the page as the car draws it, clickable, in a browser.

Third-party parts are listed in `NOTICE`.
