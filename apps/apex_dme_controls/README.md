# Apex DME Controls

One page on the centre screen, in the Apex GT3 look: switch the engine map, set the exhaust valve and turn on Max
Cooling. No xDrive control, on purpose. Design: `design/dme-controls-v1/`.

| Box | What it does | Needs |
|---|---|---|
| Engine map | Maps 1 to 4, with your names on them. A confirm sheet first (setting). | MHD or BM3, engine running (moving or stopped) |
| Exhaust valve | OEM (the car decides), OPEN, CLOSED | Nothing: BMW's own job works on a stock DME too |
| Max cooling | ON / OFF, with coolant, oil and engine speed under it | MHD, engine running (over 500 rpm) to turn it on |

Opening the app sends nothing (with BM3 picked it reads the ROM and the active map). A command leaves only on a press,
and the "Valve at every start" setting once per start. No made-up data: a value the car hasn't sent shows as a dash; one it stops sending (no answer for 5 s) stays on screen, dimmed with a small amber dot after it, until the car answers again. A held engine or road speed counts as none,
so the map switch and Max Cooling wait for live ones.

## Commands

All to the DME (diagnostic address 0x12) over the head unit's own diagnostic link, as cauliflowermossgrape's Engine
Config (idrive7-apps, `apps/live_adjustments`, MIT) sends them; see `NOTICE`.

| What | Stock / any DME | MHD | BM3 | MG Flasher |
|---|---|---|---|---|
| Valve open | `2F 60FD 03 03E8` | `2F 02 01` | `2F 60FD 03 14FE` | `2E 6949 02 B4` |
| Valve closed | `2F 60FD 03 2328` | `2F 02 02` | `2F 60FD 03 2328` | `2E 6949 01 B3` |
| Valve OEM | `2F 60FD 00` | `2F 02 00` | `2F 60FD 00` | `2E 6949 00 B2` |
| Map n | | `2F 01 <n-1>` (accepted on the echo, no read-back) | ROM identified, map slot written to DME memory and read back | on the wheel |
| Max Cooling | | `2F 03 01` on, `2F 03 00` off | | `2E 6947 01 B1` on, `2E 6947 00 B0` off |
| Burble, radiator flap, ethanol, valet | | | | `2E 6946` / `694E` / `694B` + `694C` / `694A`, see below |

The DME lets a tester's valve command go after about 20 s: with **Hold** on, Open / Closed is sent again every 15 s.
**Closed: back to OEM above** (default 4,000 rpm) hands the valve back to the car while the engine is above it and
closes it again 500 rpm below; with no live engine speed for 5 s Closed is handed back too.

MHD and BM3 can't be told apart from the head unit (MHD's marker sits at a ROM-dependent address), so **Tuning
software** is picked in Settings. An MHD press counts only when the DME echoes it; an untuned DME refuses it and the
page says so. BM3 needs its ROM in `bm3_profiles.js`; an unknown ROM is refused and nothing is written.

**MG Flasher:** pick it in Settings and the page becomes MG Flasher's own: **Exhaust** (valve, burble 0 to 5),
**Cooling** (Max Cooling, radiator flap, temperatures) and **Fuel and car** (ethanol override and content, valet mode).
Every command was taken from Wireshark captures of MG Flasher's app on a car (HSFZ over ENET) and is sent the same
way: `3E 00`, then `2E 69 <id> <value> <check>` with the check byte `0x69 + id + value`. The DME answers `7F 2E 69`,
which is MG Flasher's own "taken", not a refusal. The app then reads back from DME memory, as MG Flasher does:
`60107F64` (done), `60107F14` (the last write) and the function's own state, which is what each button lights.
The states are read again every 10 s, so a change made in MG Flasher's app shows here too. Ethanol changes what the
tune fuels for, so it asks first. Burble buttons follow MG Flasher's slots: OEM, Custom (set when flashed), 20 %, 40 %, 70 %, Off. Map switching stays on MG Flasher's Custom Code Menu
(the cruise control buttons on the steering wheel).

## Settings (the header's Settings tab)

Tuning (Off / MHD / BM3 / MG Flasher, confirm map switch), Maps (a name per map), Units (US / Metric, temperature and speed each), Valve
& cooling (valve at every start, hold, close limit), System (box colour, about, BMW's plain list).
