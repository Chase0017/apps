# Apex Telemetry

A GT3 pit board on the iDrive 7 center screen, in the same look as **Apex Cluster**: black, white boxes with a white
header strip, Barlow Condensed numbers. One still page, nothing to scroll or page through.

## The page

Nothing Apex Cluster already shows (coolant, oil, oil pressure, AFR, intake and timing are on the dash). Colours:
**yellow** = warning, **red** = near critical, blue = cold.

- **Boost control (left):** actual boost, the engine's target and the deviation between them, a bar with the target
  marked, the peak, and a word for it: ON TARGET, UNDERBOOST, OVERBOOST or OFF BOOST (target under 0.2 bar / 3 psi).
  Deviation yellow from 2.2 psi (0.15 bar) off target, red from 4.4 psi (0.3 bar).
- **Fuel (left, under it):** fuel rail (high pressure) and low pressure fuel. With the engine running: rail yellow
  under 25 bar (363 psi), red under 15 bar (218 psi); low pressure yellow under 4 bar (58 psi), red under 3 bar (44 psi).
- **Tyres (middle):** the car from above, each tyre's pressure, its temperature and the difference to the car's own
  target pressure (the header shows the targets).
  - Pressure: yellow 1.5 psi under target, red 3 psi under. Over target is normal once tyres are warm: yellow
    only from 6 psi over, red from 9 psi. A car that sends no targets gets UNEVEN when the two sides of an axle differ.
  - Temperature (the air inside the tyre, as the TPMS measures it): blue under **Tyre cold below**, green, yellow
    within 15 °C (27 °F) of **Tyre hot from**, red from it. The wheels on the car glow in the same colours.
- **Right:** gearbox oil (yellow from 110 °C / 230 °F, red from 125 °C / 257 °F), outside (yellow ICE POSSIBLE at
  3 °C / 37 °F and below), range (yellow under 50 mi / 80 km, red under 25 mi / 40 km), engine load against its
  target, and g-force: lateral and longitudinal with their peaks. Tap the g-force box to reset the peaks.

## Data

Read only, nothing is written to the car.
- Tyres from the TPMS (polled every 5 s: the car doesn't announce them), in the car's own display units.
- Boost target and actual, fuel rail and low pressure fuel, requested and actual load from the engine unit, gearbox
  oil from the gearbox unit when the car's data set has none, over the kit's read-only diagnostic link: the
  identifiers cauliflowermossgrape's M Vitals reads, asked only while the page is open. Boost falls back to the sport
  display while the engine unit gives none (then there is no target).
- Outside temperature and range from the instrument cluster's signals, rpm and g-force from the car's signals.

## Settings

Units (US / metric), Tyre hot from, Tyre cold below, Demo data, Colour theme. All under **All settings**.

## Working on it

`tools/telemetry-preview/`: serve the repo root and open `/tools/telemetry-preview/` to see the page as
`draw.js` draws it, with a street, cold start, hot track and no-data scene, in US or metric units.

Third-party parts are listed in `NOTICE`.
