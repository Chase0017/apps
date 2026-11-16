# Apex Cluster

Redraws the whole instrument cluster of a 2022+ BMW X3 (iDrive 7, the LCI cluster with the driver attention camera)
as **Apex**, a GT3-style race dash. Built on bimmer-lab's Cluster Themes (MIT), with its sibling **Apex HUD** on the
windshield; this fork keeps one theme and fits it
to the LCI cluster.

Layouts: **Apex** (below), **Apex Map** (Apex with BMW's own map showing through a window in the middle) and **Stock+**
(BMW's own cluster with shift lights, fuel % and temperatures added).

## Apex

- **Shift lights:** two banks of six either side of the driver camera, ramping up towards it, filling from the
  outside in (green, yellow, red, blue). At the shift point every light, the whole rev bar, the gear and the rpm flash
  red together. Settings (Shift & alerts): **Placement** Camera (either side of the driver attention camera) / No camera
  (across the middle); **Type** Row (round lights) / Bar (slanted lights on a dark trapezoid, yellow until both ends
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

- Apex's shift lights, rev bar and side columns (speed, rpm, fuel; boost, coolant, oil), with the middle cut
  see-through (x 338-1582, y 245-580) so BMW's own map shows there, drawn by BMW with no lag.
- Drive mode, gear and traction in a row under the map. No intake, oil pressure, timing or AFR boxes.
- BMW's digital speed and its P / gear box show through the window too. The window shows whatever BMW's cluster draws
  in the middle, so set BMW's cluster to show the map there.


## Stock+

- BMW's own cluster left as it is, with a few additions on top (no background).
- Shift lights in a strip under the driver camera, between BMW's turn arrows (or Apex's No camera row or bar). Same
  Shift & alerts settings as Apex.
- Four small boxes in the lower inside of BMW's dials: fuel %, coolant, oil (degrees, blue until warm) and boost.
  Any of them can show another sensor (Readouts tab).
- Placed from a photo of the stock cluster in SPORT+; BMW moves things in other drive modes.

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
