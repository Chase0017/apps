# Apex Telemetry

A GT3 pit board on the iDrive 7 center screen, in the same look as **Apex Cluster**: black, white boxes with a white
header strip, Barlow Condensed numbers. One still page, nothing to scroll or page through.

## The page

- **Tyres (middle):** the car from above with each tyre's pressure in big numbers, its temperature, and how far it
  is from the car's own target pressure (the placard values the TPMS reports). The header shows the targets.
  - Temperature colours (air inside the tyre, as the TPMS measures it): blue under **Tyre cold below**, green,
    amber within 15 °C (27 °F) of **Tyre hot from**, red from it. The wheels on the car glow in the same colours.
  - Pressure against target: green within 1 psi, amber within 3 psi, red beyond. A car that sends no targets
    gets UNEVEN when a tyre is more than 2 psi off the other side of its axle.
- **Engine (left):** coolant, oil temperature (blue with WARMING UP under 70 °C / 158 °F), oil pressure, intake air
  (with how far it is above outside), AFR (with lambda), ignition timing.
- **Car (right):** boost with its peak, gearbox oil temperature, outside temperature (ICE POSSIBLE at 3 °C / 37 °F and
  below), fuel, range, and g-force with the peak lateral and longitudinal. Tap the g-force box to reset the peaks.

## Data

Read only, nothing is written to the car.
- Tyres from the TPMS (polled every 5 s: the car doesn't announce them), in the car's own display units.
- Coolant, oil, speed, rpm and g-force from the car's signals; outside temperature, fuel and range from the
  instrument cluster's signals; boost from the sport display.
- Oil pressure, AFR, intake, timing and boost (when the sport display has none) from the engine unit, and gearbox
  oil from the gearbox unit when the car's data set has none, over the kit's read-only diagnostic link. These are the
  identifiers Apex Cluster reads (and M Vitals for timing and the gearbox), asked only while the page is open.
- While a value has no reading, its box shows `--`; oil pressure says what the engine unit answered.

## Settings

Units (US / metric), Tyre hot from, Tyre cold below, Demo data, Colour theme. All under **All settings**.

## Working on it

`tools/telemetry-preview/`: serve the repo root and open `/tools/telemetry-preview/` to see the page as
`draw.js` draws it, with a street, cold start, hot track and no-data scene, in US or metric units.

Third-party parts are listed in `NOTICE`.
