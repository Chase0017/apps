# Changes

Newest first. Dates are when the build was pushed.

## Nov 7 2026

- **Cluster Themes 0.9.0:** a page of its own on the center screen instead of BMW's settings list: the themes with pictures, the readout boxes (pick any car sensor for each GT3 box), a model badge, the Waze map, alerts and settings. "Show Waze map inside the theme" replaces "Leave room for the map": Waze on Cluster draws its map inside GT3 or Sport, above BMW's own map view, so BMW's speed and gauges no longer show twice. Warnings flash a readout red over an oil, coolant or boost limit, a button tests the shift lights, and the colours dim after sunset.
- **HUD Widgets 0.6.0:** the same kind of page: layouts with pictures, the readouts, the HUD's position and size on the glass, colours, alerts and settings. Brighter, solid colours that read better on the glass, warnings, and the shift-light test.
- **Cluster Themes 0.8.4:** the M theme fills the panel: taller blades and cards that reach from the top of the screen to the bottom, bigger side groups, and black cards with a grey rim so BMW's black gear box no longer shows as a hole. New Map calibration theme for measuring the map cut-out on a photo.

## Nov 6 2026

- **Cluster Themes 0.8.2:** installs from the Store again. 0.8.1 (and 0.8.0) asked to read the car's M Drive gearbox display, which the car only sends as updates, so the head unit's app manager refused to install the app. It now only listens for those updates; the S or M next to the gear works as before.
- **Cluster Themes 0.8.1:** the M theme traced 1:1 off the M8 photo instead of restyled from it: the cards' curved top edge and big rounded corners, the blades' exact curve, width and ticks, the fuel and oil dials as the M8's thin glass brackets cut from the photo's own circles (a hatched chrome bezel, glass lit from the bottom up to the level, a red streak at the level and at the reserve or hot end), every number and label in a squared bold face like BMW's (Orbitron, open licence; S no longer reads as 8), and every readout at the photo's position and size. The only departures are forced by the X3: the setup rows are split round BMW's black box (two above it, two below), the badge is the M stripes alone, and the rev scale ends at 7.
- **Cluster Themes 0.8.0:** the M theme reworked from the car photos: near-black cards stretched to the panel's full height, round fuel and oil dials in the lower corners, taller rev blades, the gear with its shifter programme (D, S or M), the setup rows for all five drive modes (Individual shows as INDIVIDUAL: the car does not report what each part is set to), and the tyre block reading the car's own units (it showed 32 psi as 464 psi). The layer budget per theme is 24 after the car drew all sixteen probe layers of the calibration grid.
- **Cluster Themes 0.7.5:** the Sport and M rev scales end at 7000 rpm, like the M40i's own cluster (they read to 8 before). The red marks always cover at least the last 500 rpm, with the yellow ones in the 700 rpm before them.
- **Cluster Themes 0.7.4:** the M theme rebuilt against the M8 photo. Bowed glass rev blades with a red marker at the rpm, charcoal cards, white gear and speed, and the tyre pressure and temperature block (from the car's tyre monitor) in place of the G-meter.

## Nov 5 2026

- **Cluster Themes 0.7.3, HUD Widgets 0.5.3:** the calibration grids carry a line of text drawn by a shader from a glyph atlas, a test for a lighter way to draw readouts.
- **Cluster Themes 0.7.2, HUD Widgets 0.5.2:** the drawing engine can use several connections to cluster-render (8 layers each), counts the pixel memory a layout costs, and sends only the pixels of text that changed.
- **Cluster Themes 0.7.1, HUD Widgets 0.5.1:** the shift lights come on from 3000 rpm, so they are not dark when revving parked.
- **Cluster Themes 0.7.0:** the Dials theme is removed after the car test.
- **Cluster Themes 0.6.0, HUD Widgets 0.5.0:** fixes from the second car test. Every theme fits in the car's limit of 8 layers, backdrops are pure black (dark tints show on the panel), and nothing sits under the hood line or BMW's black gear box. The HUD layouts are fitted to the visible window measured from the grid photo.
- **Cluster Themes 0.5.1:** the M and Sport themes match BMW's own clusters.
- **Cluster Themes 0.5.0:** a Dials theme (removed again in 0.7.0), Sport restyled, 200 mph speed scale.

## Nov 4 2026

- **Cluster Themes 0.4.0:** Sport theme, after BMW's Live Cockpit view.
- **Cluster Themes 0.3.0:** M theme.
- **Cluster Themes 0.2.0, HUD Widgets 0.4.0:** fixes from the first car test. Shapes drew upside down, boost did not show (now read from the engine computer as a backup), and the rpm wobbled at idle. Both apps get an Off option and drive mode switching; the calibration grids are added.
- **Cluster Themes 0.1.0:** first release, with the GT3 race dash.
- **HUD Widgets 0.3.0:** Daily, Sport and Redline layouts.
