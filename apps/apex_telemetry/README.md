# Apex Telemetry

A GT3 pit board on the iDrive 7 center screen, in the same look as **Apex Cluster**: black, white boxes with a white
header strip, Barlow Condensed numbers. One still page, nothing to scroll or page through.

## The page

Nothing Apex Cluster already shows (coolant, oil, oil pressure, AFR, intake and timing are on the dash). Colours:
**yellow** = warning, **red** = near critical, blue = cold.

- **Boost control (left):** actual boost, the engine's target and the deviation between them, all intake
  manifold pressure (after the throttle, so no spike when it shuts), a bar with the target
  marked, the peak, and a word for it: ON TARGET, UNDERBOOST, OVERBOOST or OFF BOOST (target under 0.2 bar / 3 psi).
  White while fine; the deviation, the bar and the word turn **red** when boost stays 3 psi (0.21 bar) off target
  for 0.75 s (shorter is the turbo spooling up, not a fault).
- **Fuel (left, under it):** fuel rail (high pressure) and low pressure fuel. With the engine running: rail yellow
  under 25 bar (363 psi), red under 15 bar (218 psi); low pressure yellow under 4 bar (58 psi), red under 3 bar (44 psi).
- **Tyres (middle):** the car from above, each tyre's pressure, its temperature and the difference to the car's own
  target pressure (the header shows the targets).
  - No colour while a tyre is fine: only what needs a look lights up.
  - Pressure against target: **blue** 3 psi under (low), **yellow** 3 psi over, **red** 5 psi over. A car that sends no
    targets gets UNEVEN when the two sides of an axle differ by 3 psi.
  - Temperature (the air inside the tyre, as the TPMS measures it): **yellow** from **Tyre warm from** (130 °F),
    **red** from **Tyre hot from** (150 °F), nothing for cold. The stripe beside the tyre and the wheel on the car light
    up in the same colour.
- **Right:** gearbox oil (blue WARMING UP under 40 °C / 104 °F, yellow from 110 °C / 230 °F, red from 125 °C / 257 °F),
  outside (blue with ICE POSSIBLE at 3 °C / 37 °F and below), range (yellow under 50 mi / 80 km, red under 25 mi / 40 km).
- **Intercooler (right):** the B58 has no sensor in the intercooler's water circuit, so it is judged by its air: the
  charge air before the throttle (ahead of the water-to-air intercooler in the plenum) and after it, the drop across it,
  and heat soak, how far the air after it is above outside. After: blue under 10 °C, yellow from 50 °C (122 °F), red
  from 60 °C (140 °F); heat soak yellow from 20 °C (36 °F) over outside, red from 30 °C (54 °F) with LET IT COOL.
- **G-force (right):** lateral and longitudinal with their peaks. Tap the box to reset the peaks.
- Engine load against its target sits on the boost panel's bottom line.

## Data

Read only, nothing is written to the car.
- Tyres from the TPMS (polled every 5 s: the car doesn't announce them), in the car's own display units.
- Boost target and actual, fuel rail and low pressure fuel, requested and actual load, the charge air before and
  after the intercooler from the engine unit, gearbox
  oil from the gearbox unit when the car's data set has none, over the kit's read-only diagnostic link: the
  identifiers cauliflowermossgrape's M Vitals reads, asked only while the page is open. Boost falls back to the sport
  display while the engine unit gives none (then there is no target).
- Outside temperature and range from the instrument cluster's signals, rpm and g-force from the car's signals.

## Settings

The bar's **Setup** button opens the settings page in place of the board (Setup again, or its Pit board tab, goes back):

- **Readouts:** the five small boxes (Trans, Outside, Range, Fuel rail, Low fuel by default) can each show another value:
  gearbox oil, outside, coolant, oil temperature, intake, range, fuel level, fuel rail, low fuel, oil pressure, AFR,
  timing, load, boost, rpm, speed or lateral g. Oil pressure, AFR and timing are only asked of the engine while a box
  shows them.
- **Units:** US / Metric / Custom, then speed and distance, temperature and pressure each.
- **Tyres:** temperature warm (yellow) and hot (red) from; pressure low (blue) under, high (yellow / red) over target.
- **Data:** every engine value, the identifiers it is asked as, what the car answers and how old the reading is.
- **System:** box colour (the board's boxes and this page), demo data.

Everything is also in BMW's list under **All settings**.

## Working on it

`tools/telemetry-preview/`: serve the repo root and open `/tools/telemetry-preview/` to see the board as
`draw.js` draws it, with a street, pull, cold start, hot track and no-data scene, in any units.
`tools/settings-preview/`: the settings pages of all three apps, the real code, clickable.

Third-party parts are listed in `NOTICE`.
