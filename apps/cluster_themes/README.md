# Cluster Themes

Redraws the whole iDrive 7 instrument cluster (1920x720) with your own themes, picked on the center screen: open **Cluster Themes** from the apps menu and choose the theme there. It draws through `cluster-render` from [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps) on its `panel` target, which sits over BMW's own gauges, using the repo's shared drawing engine (`shared/`, the same one HUD Widgets uses).

**Status: first car test.** Version 0.1.0 has one theme, GT3, built to answer two questions only the car can answer (below). More themes come after that.

## Themes

- **GT3:** a race dash.
  - **Top:** 18 round shift lights (green, yellow, red, then 3 blue) that fill over the last 2000 rpm before the shift point, and a segmented rev bar with a 0 to 7 scale under it.
  - **Left:** speed, rpm, and the last shift (rpm and grade, coloured by the grade).
  - **Middle:** the gear, with water and oil temperatures.
  - **Right:** boost (yellow header), the shift point, and the clock.
  - **At the shift point:** every light, the bar, the rpm, the shift point and the gear go red.

The shift point, cold-engine guard and shift grades are the same as HUD Widgets' Redline layout (`shared/shift_score.js`): shift point = redline minus "Shift point before redline", lowered while the oil is under 80°C.

## Settings

Theme, leave room for the map, units, 12- or 24-hour clock, redline, shift point before redline, cold-engine rev guard, show boost, and demo data. Saved in the app's `data/settings.json`.

**Leave room for the map:** cuts a see-through window out of the black so the map window under it can show, and moves the gear into the left column and the temperatures into the right one. Where the map window sits on the real cluster is a guess (`hole` in `hud/layouts/gt3.json`: 416,180, 1088x480).

## What the first car test answers

1. **Do BMW's warning lights still show?** The GT3 theme is solid black, so it covers everything under it. If the cluster draws the warning lights (engine, tyre pressure, seat belt, and so on) on top of our layer, fine. If they disappear under it, every theme has to leave their places clear. That's a safety question, so check it before driving with the app: start the car with a seat belt off and look for the warning.
2. **Does the map show through the window?** Turn on "Leave room for the map" with CarPlay or Android Auto showing a map on the cluster. If the map shows in the cut-out, the Map themes can be built around it. If it shows in a different place, push a copy of `gt3.json` with a corrected `hole` (see below).

Also unverified: whether cluster-render blends effect layers as straight or premultiplied alpha (watch the edges of the round lights and the boxes), and the exact place of everything on the real glass.

## Layout files

`hud/layouts/<name>.json` (`schemaVersion: 2`, with a `"theme"` of its own). Widget types and tokens are in the header of `shared/hud.js`. The cluster adds:

- `fill`: a solid colour, with an optional see-through `hole` cut while a setting (`holeWhen`) is on;
- `box`: a framed readout box with a header strip;
- `lights` with `round` and a blue `tail`;
- `toggle: "!setting"` shows a widget only while that setting is off.

To try an edited layout on the car without reinstalling, from the repo root:

```sh
APP=cluster_themes ./scripts/deploy.sh root@<car-ip-or-hostname> gt3.json
```

## Test on the Mac

```sh
node bench/server.js cluster_themes     # then open http://localhost:8078
```

The page shows the cluster at 1920x720. Tick "stock cluster backdrop" to see what's under the layers (a rough stand-in for BMW's gauges and the map window).
