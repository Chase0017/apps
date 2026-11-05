# HUD Widgets

Custom widgets on the iDrive 7 HUD (windshield head-up display): speed, gear, a shift bar, boost, oil and coolant temperatures, and a clock. It ships three layouts (Daily, Sport, and Redline, a G20-style rev bar with shift lights and shift scoring) and three themes (Classic, M and Night), plus Auto, which switches to Night at sunset. You set it up on the center screen: open **HUD Widgets** from the apps menu and pick the layout, theme, units and widgets there.

It draws on the HUD through the repo's shared drawing engine (`shared/`, also used by Cluster Themes) and `cluster-render` from [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps), the service that owns the HUD/cluster GPU compositor on modded iDrive 7/8 units. The client is `shared/cluster_render_client.js` (MPL-2.0, unmodified). Live car data, the build and the center-screen page come from the repo's `kit/` (see the [top README](../../README.md)).

## Prerequisite

`cluster-render` must be installed on the unit. It's a separate tool from the `robertnisipeanu/idrive-apps` Store source. `mgu-repo.json` doesn't list it under `requires`, because it isn't confirmed that the Store can resolve a requirement from another source. Without it the app still runs: its status row on the center screen reads "HUD off: cluster-render is not installed or not running", and it keeps retrying until cluster-render shows up.

## The center-screen page

The page is generated from `app.json` (`screens` and `settings`) by the kit's build. It has:

- a status row showing what the HUD is doing, or why it's off;
- the settings: layout, theme, daytime theme for Auto, units (mph/°F/psi or km/h/°C/bar), 12- or 24-hour clock, redline, shift point before redline, cold-engine rev guard, show or hide clock, oil, coolant and boost, and demo data.

Each choice is saved in the app's `data/settings.json` and redraws the HUD at once. The HUD keeps running after you leave the page.

## Layouts

- **Daily:** speed is the hero, with gear, clock and oil.
- **Sport:** segmented shift bar, big gear, speed, boost gauge, oil and coolant.
- **Redline:** after cauliflowermossgrape's Redline app (MIT, ported in `shift_score.js` and `shaders.js`):
  - **Display:** a G20-style slanted rev bar (500-rpm segments, white needle, peak marker, red past the redline), 12 shift lights over the last 2000 rpm, rpm, a big gear, and speed, oil and coolant.
  - **Shift point:** redline minus the "Shift point before redline" setting (300 by default). At the shift point the lights, bar and gear go red and SHIFT shows.
  - **Cold-engine guard:** until the oil reaches 80°C, the shift point starts at 4500 and climbs with the oil temperature, shown in blue with a COLD · LIMIT tag.
  - **Shift scoring:** every upshift is graded on its peak rpm. EARLY means more than 250 under the shift point, LATE more than 200 over it, COLD REV the same while the guard is on, LIMITER within 60 rpm of the redline, and anything in between is SPOT ON. The grade tag is bright for 2.5 s after the shift.

**Layout files**

The built-in layouts are `hud/layouts/<name>.json` (`schemaVersion: 2`).

- **Widget types:** `text`, `scale`, `stripe`, `shiftbar`, `arc`, `revbar`, `lights` and `badge`.
- **Colours** are theme roles (`fg`, `dim`, `arc`).
- **`toggle`** ties a widget to a show/hide setting, and **`themes`** limits it to certain themes.

The tokens and the full reference are in the header of `shared/hud.js`, and `shared/layouts.js` rejects a bad file with a clear message (which also shows in the status row).

To try an edited layout on the car without reinstalling, run this from the repo root:

```sh
./scripts/deploy.sh root@<car-ip-or-hostname> my-layout.json
```

This copies it into the app's `data/layouts/` on the car. A file there overrides the built-in layout of the same name, and the running app reloads it by itself.

## Files

```
app.json                 signals, the center-screen page, settings, config (target "hud"),
                         and "shared": the engine files the build copies in from ../../shared/
main.js                  entry: starts the engine and feeds its status to the page
hud/                     packed into hud.pack by the build: fonts/ (baked Barlow), layouts/
NOTICE                   credits and licences
```

The engine, in the repo's `shared/` folder (shared with Cluster Themes):

```
hud.js                   the engine (widgets, tokens, layout reference in the header)
hud_text.js              text drawing from the baked fonts
hud_themes.js            the themes
layouts.js               loads, validates and watches layouts
shaders.js               GLSL for the shift bar, boost arc, rev bar, shift lights, fills and boxes
shift_score.js           Redline's shift point, cold guard and scoring
sun.js                   sunrise and sunset for the Auto theme
cluster_render_client.js cluster-render client (MPL-2.0)
```

## Look

- **Fonts:** Barlow (SIL OFL 1.1, licence in `NOTICE`), pre-baked into alpha atlases on the Mac by `tools/bake_fonts.py` at the repo root. The car never rasterizes fonts. Re-bake after changing sizes or characters.
- **Themes:** `shared/hud_themes.js`. Black is see-through on the HUD, so a theme only adds light.
- **Gauges:** GLSL shaders in `shared/shaders.js`, drawn on the car's GPU, with values sent as uniforms at up to 20 Hz.
- **Auto theme:** sunrise and sunset come from the date and `app.json` `config.location` (`sun.js`). No car signal is needed.

## Verified vs. assumed

- **Verified on the bench (Node 8.16.2, the kit's build and stub head unit):**
  - all three layouts in every theme, and Auto switching to Night after sunset;
  - Redline grading SPOT ON, EARLY, LATE, LIMITER and COLD REV (manual shifts and the demo drive), the cold guard's shift point climbing with oil temperature, and the shift-point state (all red, SHIFT);
  - metric/US units, toggles and the redline flash;
  - every setting sent as an HMI drop-down or checkbox press, saved and applied;
  - raw SOME/IP values decoded by the kit, boost included;
  - layout overrides hot-reloading, and bad layouts refused without a crash;
  - "cluster-render missing" shown in the status row;
  - zero cluster-render protocol errors.
- **Unverified until the first install:**
  - whether this car fills the FES boost field (`car_vitals` treats it as unreliable on some cars);
  - whether cluster-render blends effect layers as straight or premultiplied alpha;
  - whether the head unit's clock is in local time (`app.json` `config.utcOffsetMinutes` is the fallback);
  - how the M theme's blues read on the real glass in sun;
  - `scripts/deploy.sh`'s path to the app on the car.
