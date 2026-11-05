# bimmer-lab apps

Apps for modded iDrive 7 head units, installed through the MGU Store. Every app lives in its own folder under `apps/`, and the Store builds them on the car.

## Install

On the car, open the Store and go to **Settings → Add source**, enter **`bimmer-lab/apps`**, then install the apps you want. The Store runs `kit/tools/build.py` on the unit (the `apps` entry in `mgu-repo.json`) with no network, using an oap-sdk it makes from a BMW app already on the car. No BMW code is in this repo.

## Apps

| App | What it does |
| --- | --- |
| [HUD Widgets](apps/idrive_hud_widgets/README.md) | Custom widgets on the windshield HUD: Daily, Sport and Redline (rev bar, shift lights, shift scoring) layouts, Classic, M and Night themes, set up from the center screen. Needs `cluster-render`. |

## Built on

- [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)' MGU App Kit (MIT, copied into `kit/`, licence in `kit/LICENSE`). It provides the build, the center-screen pages, saved settings and live car data over SOME/IP.
- `cluster-render` from [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps), for apps that draw on the HUD or cluster.

Each app's `NOTICE` lists its own credits and licences.

## Repo layout

```
apps/<id>/        one folder per app: app.json, main.js (entry), the app's .js files, NOTICE, README
                  subfolders are packed into <folder>.pack by the build
kit/              cauliflowermossgrape's kit: runtime/ ships inside each app, tools/ builds it
bench/            Mac test bench for the HUD (fake cluster-render + the kit's stub head unit)
tools/            Mac-only helpers (bake_fonts.py re-bakes the HUD fonts, needs Pillow)
scripts/          deploy.sh pushes HUD layouts to the car over SSH
mgu-repo.json     tells the Store how to build the apps
```

## Adding an app

1. Make `apps/<id>/` with an `app.json` (id, title, version, signals, screens, settings) and a `main.js` that calls `mgu.run`.
2. Build it by hand to check: `python3 kit/tools/build.py <id>`. It needs an `oap-sdk/` folder; the bench creates a stub one, which is gitignored and never shipped. The output goes to `dist/`.
3. The Store picks it up from `apps/*` on the next refresh.

## Test on the Mac

Run `node bench/server.js`, then open http://localhost:8078. It builds the HUD app with the kit and runs the build in the kit's stub head unit on Node 8.16.2 (the car's version), against a fake cluster-render. The page shows the HUD with the app's real pixels and shaders, the center-screen status and settings, and signal sliders. See `bench/README.md`.

## Licence

MIT, see `LICENSE`. The kit in `kit/` is MIT (`kit/LICENSE`), and third-party pieces inside an app are listed in its `NOTICE`.
