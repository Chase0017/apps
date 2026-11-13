# Apex DME Controls

One page on the centre screen, in the Apex GT3 look: switch the engine map, set the exhaust valve and turn on Max
Cooling. No xDrive control, on purpose. Design: `design/dme-controls-v1/`.

| Box | What it does | Needs |
|---|---|---|
| Engine map | Maps 1 to 4, with your names on them. A confirm sheet first (setting). | MHD or BM3, car stopped (under 5 km/h), engine running |
| Exhaust valve | OEM (the car decides), OPEN, CLOSED | Nothing: BMW's own job works on a stock DME too |
| Max cooling | ON / OFF, with coolant, oil and engine speed under it | MHD, engine running (over 500 rpm) to turn it on |

Opening the app sends nothing (with BM3 picked it reads the ROM and the active map). A command leaves only on a press,
and the "Valve at every start" setting once per start. No made-up data: a value the car hasn't sent shows as a dash; one it stops sending (no answer for 5 s) stays on screen with a "!" after it until the car answers again. A held engine or road speed counts as none,
so the map switch and Max Cooling wait for live ones.

## Commands

All to the DME (diagnostic address 0x12) over the head unit's own diagnostic link, as cauliflowermossgrape's Engine
Config (idrive7-apps, `apps/live_adjustments`, MIT) sends them; see `NOTICE`.

| What | Stock / any DME | MHD | BM3 |
|---|---|---|---|
| Valve open | `2F 60FD 03 03E8` | `2F 02 01` | `2F 60FD 03 14FE` |
| Valve closed | `2F 60FD 03 2328` | `2F 02 02` | `2F 60FD 03 2328` |
| Valve OEM | `2F 60FD 00` | `2F 02 00` | `2F 60FD 00` |
| Map n | | `2F 01 <n-1>` (accepted on the echo, no read-back) | ROM identified, map slot written to DME memory and read back |
| Max Cooling | | `2F 03 01` on, `2F 03 00` off | |

The DME lets a tester's valve command go after about 20 s: with **Hold** on, Open / Closed is sent again every 15 s.
**Closed: back to OEM above** (default 4,000 rpm) hands the valve back to the car while the engine is above it and
closes it again 500 rpm below; with no live engine speed for 5 s Closed is handed back too.

MHD and BM3 can't be told apart from the head unit (MHD's marker sits at a ROM-dependent address), so **Tuning
software** is picked in Settings. An MHD press counts only when the DME echoes it; an untuned DME refuses it and the
page says so. BM3 needs its ROM in `bm3_profiles.js`; an unknown ROM is refused and nothing is written.

## Settings (the header's Settings tab)

Tuning (software, confirm map switch), Maps (a name per map), Units (US / Metric, temperature and speed each), Valve
& cooling (valve at every start, hold, close limit), System (box colour, about, BMW's plain list).
