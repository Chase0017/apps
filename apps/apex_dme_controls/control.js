'use strict';
/**
 * control.js - Apex DME Controls' talk to the engine unit (DME, diagnostic address 0x12) over the head unit's own
 * diagnostic link (kit/diag.js). This is the only file that sends anything to the car, and a command leaves only on
 * a press on the page (or the "Valve at every start" setting, once per start).
 *
 * The commands are cauliflowermossgrape's Engine Config (idrive7-apps, apps/live_adjustments, MIT), where they were
 * validated on cars; see NOTICE:
 *
 *   Exhaust valve, stock or any DME (BMW's own job, Bosch MG1 / DME8 electric flap):
 *       open 2F 60FD 03 03E8 · close 2F 60FD 03 2328 · OEM 2F 60FD 00          (reply 6F 60FD ..)
 *   Exhaust valve, MHD:   2F 02 01 open · 02 close · 00 OEM                     (accepted on the echo 6F 02 nn)
 *   Exhaust valve, BM3:   bm3_protocol.js setFlap (2F 60FD with BM3's values)
 *   MG Flasher Live Control (Wireshark captures of MG Flasher's app on Chase's car, HSFZ over ENET), each press:
 *       22 5820 (MG Flasher's marker, read once) · 3E 00 · 2E 69 <id> <value> <check>, check = 0x69 + id + value
 *       The DME answers the write 7F 2E 69: MG Flasher's own "taken", not a refusal. Then it is read back:
 *       23 44 60107F64 1 (01: done) · 23 44 60107F14 2 (<id> 69: the last write) · 23 44 <state> (the new value).
 *         id  what             values                       state address (size)
 *         46  burble           0 off · 1..5                 60107F67 (1)
 *         47  Max Cooling      0 off · 1 on                 60107F98 (1)
 *         49  exhaust valve    0 OEM · 1 closed · 2 open    60107F6F (1)
 *         4A  valet mode       0 off · 1 on                 60107FC7 (1)
 *         4B  ethanol override 0 off · 1 on                 60107F8B (1)
 *         4C  ethanol content  0..100 %                     60107F26 (2, little endian, % x 200)
 *         4E  radiator flap    0 OEM · 1 closed · 2 open    B0007345 (1)
 *       The states are read again every 10 s, so the page shows what the DME holds (set from MG Flasher's app too).
 *   Engine map, MHD:      2F 01 <map - 1>, maps 1..4                           (echo; no read-back of the active map)
 *   Engine map, BM3:      the CustomROM's map slot in DME memory, ROM identified first, read back (bm3_protocol.js)
 *   Max Cooling, MHD:     2F 03 01 on · 00 off                                 (echo)
 *
 * The DME lets a tester's valve command go after about 20 s: with "Hold" on, Open / Closed is sent again every 15 s.
 * Closed is handed back to the car (OEM) while the engine is above the "Close: hand back above" speed, and resumed
 * 500 rpm below it; with no live engine speed for 5 s Closed is handed back too.
 *
 * Our own rules on top: a map is switched with the engine running (over 500 rpm), on the fly as well as stopped
 * (Chase, Nov 18 2026: "on the fly means on the fly"; until then maps and MG Flasher's ethanol needed the car stopped);
 * Max Cooling goes on only with the engine running (off is always allowed). There is no xDrive control in this app.
 * A held engine speed (no signal for 5 s, kit car.js) counts as none, so that check fails safe. (Demo data, which the kit only shows with a demo setting this app no longer has, sends nothing.)
 *
 * Plain Node 8 (no Promise.finally).
 */
const { Diag, NRC, hex, replyTo } = require('./kit/diag');
const { Bm3Protocol } = require('./bm3_protocol');
const bm3Profiles = require('./bm3_profiles');

const DME = 0x12;
const TUNERS = ['off', 'mhd', 'bm3', 'mgf'];
// MG Flasher (mgf): its own page (draw.js) with every Live Control function, each read back from the DME. Map
// switching stays on its Custom Code Menu (the cruise control buttons): Live Control has no map write.
const FEATURES = {
    off: { map: false, cooling: false },
    mhd: { map: true, cooling: true },
    bm3: { map: true, cooling: false },
    mgf: { map: false, cooling: true },
};
const NAMES = { off: 'Off', mhd: 'MHD', bm3: 'BM3', mgf: 'MG Flasher' };
const MIN_RPM = 500;            // the engine counts as running above this
const STOP_KMH = 5;             // "stopped" in the view (nothing waits for it since 0.6.0)
const HOLD_MS = 15000;          // Open / Closed sent again this often (the DME lets go after ~20 s)
const NO_RPM_MS = 5000;         // no live engine speed this long: Closed is handed back
const MG1 = { open: [0x60, 0xFD, 0x03, 0x03, 0xE8], closed: [0x60, 0xFD, 0x03, 0x23, 0x28], oem: [0x60, 0xFD, 0x00] };
const MHD = { MAP: 0x01, FLAP: 0x02, COOLING: 0x03, flap: { oem: 0x00, open: 0x01, closed: 0x02 } };
// MG Flasher Live Control: WriteDataByIdentifier 0x69<id>, the value, then a check byte 0x69 + id + value (as captured)
const MGF = {
    TAKEN: 0x69, DONE: 0x60107F64, LAST: 0x60107F14, MARK: [0x58, 0x20], READ_MS: 10000,
    KEYS: {
        burble: { id: 0x46, addr: 0x60107F67, size: 1, max: 5, name: 'Burble' },
        cooling: { id: 0x47, addr: 0x60107F98, size: 1, max: 1, name: 'Max Cooling' },
        valve: { id: 0x49, addr: 0x60107F6F, size: 1, max: 2, name: 'Exhaust valve' },
        valet: { id: 0x4A, addr: 0x60107FC7, size: 1, max: 1, name: 'Valet mode' },
        ethanol: { id: 0x4B, addr: 0x60107F8B, size: 1, max: 1, name: 'Ethanol override' },
        ethPct: { id: 0x4C, addr: 0x60107F26, size: 2, max: 100, scale: 200, name: 'Ethanol content' },
        radFlap: { id: 0x4E, addr: 0xB0007345, size: 1, max: 2, name: 'Radiator flap' },
    },
    flap: { oem: 0, closed: 1, open: 2 },
};
const FLAP_NAME = ['oem', 'closed', 'open'];
const mgfWrite = (id, value) => [0x69, id, value, (0x69 + id + value) & 0xFF];
const mgfFlap = (mode) => mgfWrite(MGF.KEYS.valve.id, MGF.flap[mode]);
const mgfBlank = () => ({ found: null, burble: null, cooling: null, valve: null, valet: null, ethanol: null, ethPct: null, radFlap: null, at: 0, pending: null, want: null, note: null, warn: false });

const bytes = (a) => a.map((b) => hex(b)).join(' ');

class Control {
    /** car: kit Car (rpm, speed, demo). */
    constructor(ctx, car) {
        this.ctx = ctx; this.car = car; this.log = ctx.log;
        this.diag = null; this.bm3 = null; this.bm3Rom = null;
        this.available = false;
        this._queue = Promise.resolve(); this._ops = 0;
        this.valve = { want: 'oem', sent: null, paused: false, at: 0, note: null, warn: false };
        this.map = { active: null, pending: null, confirmed: false, note: null, warn: false };
        this.cooling = { on: null, note: null, warn: false };
        this.rpmAt = 0; this._started = false;
        this.mgf = mgfBlank();      // MG Flasher Live Control: what the DME reads back
    }

    get tuner() { const v = this.ctx.settings.get('tuner'); return TUNERS.indexOf(v) >= 0 ? v : 'off'; }
    features() { return FEATURES[this.tuner]; }
    get demo() { return !!this.car.data().demo; }
    get busy() { return this._ops > 0; }
    // a held (stale) engine speed or road speed counts as none: the safety checks need live ones
    fresh(k) { const d = this.car.data(), v = d[k]; return !d.demo && typeof v === 'number' && isFinite(v) && !(this.car.stale && this.car.stale(k)) ? v : null; }
    rpm() { return this.fresh('rpm'); }
    kmh() { return this.fresh('speed'); }
    running() { const r = this.rpm(); return r !== null && r > MIN_RPM; }
    stopped() { const s = this.kmh(); return s !== null && s < STOP_KMH; }

    async start() {
        try {
            this.diag = await new Diag(this.ctx.signals, this.log).init();
            this.diag.quiet = true;
            this.available = !!this.diag.available;
            this.diag.on('available', (on) => { this.available = !!on; if (on) this._atStart(); else this.bm3Rom = null; });
            this.bm3 = new Bm3Protocol(this.diag, bm3Profiles, (this.ctx.spec && this.ctx.spec.config) || {});
        } catch (e) {
            this.log.warn('diagnostic link: ' + (e && e.message || e));
        }
        if (this.available) this._atStart();
        this.kick();
        this._timer = setInterval(() => this._tick(), 1000);
    }

    /** Once per start, with the link up: BM3's ROM and active map (reads), then the valve setting for every start. */
    _atStart() {
        if (this._started || this.demo) return;
        this._started = true;
        if (this.tuner === 'bm3') this._serial(() => this._bm3Identify().then(() => this._bm3ReadMap()).catch((e) => this._mapNote(String(e.message || e), true)));
        if (this.tuner === 'mgf') this._mgfStart();
        const v = this.ctx.settings.get('valveStart');
        if (v === 'open' || v === 'closed') this.setValve(v);
    }

    /** Live data took over from demo data: what was pressed in the demo was never sent, so start from the car's own state. */
    _liveNow() {
        this.valve = { want: 'oem', sent: null, paused: false, at: 0, note: null, warn: false };
        this.map = { active: null, pending: null, confirmed: false, note: null, warn: false };
        this.cooling = { on: null, note: null, warn: false };
        this.mgf = mgfBlank();
        if (this.available) this._atStart();
        this.kick();
    }

    /** The tune setting changed: forget what was known about the DME's tune. */
    tunerChanged() {
        this.bm3Rom = null; this.map = { active: null, pending: null, confirmed: false, note: null, warn: false };
        this.cooling = { on: null, note: null, warn: false };
        this.mgf = mgfBlank();
        if (this.tuner === 'bm3' && this.available && !this.demo) this._serial(() => this._bm3Identify().then(() => this._bm3ReadMap()).catch((e) => this._mapNote(String(e.message || e), true)));
        if (this.tuner === 'mgf' && this.available && !this.demo) this._mgfStart();
    }

    /** One DME conversation at a time (BM3's memory replies carry no address). */
    _serial(fn) {
        this._ops++;
        const p = this._queue.then(fn).then((v) => { this._ops--; this.kick(); return v; }, (e) => { this._ops--; this.kick(); throw e; });
        this._queue = p.catch(() => {});
        return p;
    }
    kick() { if (this.onChange) this.onChange(); }

    async _send(sid, data, timeoutMs, quiet) {
        if (!this.diag || !this.available) throw new Error('No diagnostic link yet');
        if (!quiet) this.log.info('UDS -> DME ' + hex(sid) + ' ' + bytes(data));
        const r = await this.diag.physical(DME, sid, data, timeoutMs || 3000, replyTo(sid, data));
        if (!r || !r.length) throw new Error('No answer from the DME');
        if (r[0] === 0x7F) { const e = new Error(NRC[r[2]] || 'NRC ' + hex(r[2])); e.nrc = r[2]; throw e; }
        return r;
    }
    /** MHD takes a request when the DME echoes it: 6F <fn> <value>. An untuned DME refuses it. */
    async _mhd(fn, value) {
        try {
            const r = await this._send(0x2F, [fn, value]);
            if (r[0] === 0x6F && r[1] === fn && r[2] === value) return;
            throw new Error('Unexpected answer from the DME');
        } catch (e) {
            if (e.nrc != null) throw new Error('Not available on this car (no MHD answer)');
            throw e;
        }
    }
    async _bm3Identify() {
        if (this.bm3Rom) return;
        const r = await this.bm3.identify();
        this.bm3Rom = r.rom;
        this.log.info('BM3 ROM ' + r.rom);
    }
    async _bm3ReadMap() {
        this.map.active = (await this.bm3.currentMap()) + 1;
        this.map.confirmed = true;
        this._mapNote('Map ' + this.map.active + ' read from the DME', false);
    }
    _mapNote(s, warn) { this.map.note = s; this.map.warn = !!warn; this.kick(); }

    /* ---------------- exhaust valve ---------------- */
    /** mode: 'oem' | 'open' | 'closed' */
    setValve(mode) {
        if (!MG1[mode]) return;
        this.valve.want = mode; this.valve.paused = false; this.valve.note = null; this.valve.warn = false;
        if (this.demo) { this.valve.sent = mode; this.valve.note = 'Demo data: nothing sent'; this.kick(); return; }
        if (mode === 'closed' && this._closeLimited()) { this.valve.paused = true; return this._valveCmd('oem', true); }
        return this._valveCmd(mode);
    }
    _valveCmd(mode, auto) {
        const t = this.tuner;
        if (t === 'mgf') { this.mgf.pending = 'valve'; this.mgf.want = MGF.flap[mode]; }
        return this._serial(async () => {
            try {
                if (t === 'mhd') await this._mhd(MHD.FLAP, MHD.flap[mode]);
                else if (t === 'bm3') await this.bm3.setFlap(mode === 'closed' ? 'close' : mode === 'oem' ? 'auto' : 'open');
                else if (t === 'mgf') await this._mgfSet('valve', MGF.flap[mode]);
                else {
                    try { await this._send(0x2F, MG1[mode]); } catch (e) { if (e.nrc != null) throw new Error('This DME refused the valve (' + e.message + ')'); throw e; }
                }
                this.valve.sent = mode; this.valve.at = Date.now();
                if (!auto || this.valve.warn) { this.valve.note = auto ? null : 'Accepted by the DME'; this.valve.warn = false; }
            } catch (e) {
                this.valve.sent = null;
                this.valve.note = String(e && e.message || e); this.valve.warn = true;
                this.log.warn('valve ' + mode + ': ' + this.valve.note);
            }
            if (t === 'mgf') { this.mgf.pending = null; this.mgf.want = null; this._mgfNote(this.valve.warn ? this.valve.note : 'Exhaust valve set, read back from the DME', this.valve.warn); }
        });
    }

    /* ---------------- MG Flasher Live Control ---------------- */
    /** ReadMemoryByAddress as MG Flasher sends it: 23 44 <address, 4 bytes> <size, 4 bytes>. */
    async _mem(addr, size, quiet) {
        const r = await this._send(0x23, [0x44, (addr >>> 24) & 255, (addr >>> 16) & 255, (addr >>> 8) & 255, addr & 255, 0, 0, 0, size], 3000, quiet);
        if (r[0] !== 0x63 || r.length < 1 + size) throw new Error('Unexpected memory answer from the DME');
        return r.slice(1, 1 + size);
    }
    _mgfValue(k, b) { const n = k.size === 2 ? b[0] | (b[1] << 8) : b[0]; return k.scale ? Math.round(n / k.scale) : n; }
    _mgfNote(s, warn) { this.mgf.note = s; this.mgf.warn = !!warn; this.kick(); }
    /** Once per start (and on picking MG Flasher): its marker, then every state. */
    _mgfStart() {
        this._serial(async () => {
            try {
                try { const r = await this._send(0x22, MGF.MARK); this.mgf.found = r[0] === 0x62; } catch (e) { if (e.nrc == null) throw e; this.mgf.found = false; }
                if (!this.mgf.found) { this._mgfNote('MG Flasher Live Control not found on this DME', true); return; }
                await this._mgfReadAll(false);
                this._mgfNote('Read from the DME', false);
            } catch (e) { this._mgfNote(String(e && e.message || e), true); }
        });
    }
    /** Every state, read from the DME's memory (quiet: the 10 s refresh doesn't log). */
    async _mgfReadAll(quiet) {
        for (const key of Object.keys(MGF.KEYS)) {
            const k = MGF.KEYS[key];
            this.mgf[key] = this._mgfValue(k, await this._mem(k.addr, k.size, quiet));
        }
        this.mgf.at = Date.now();
        this._mgfSync();
    }
    /** The valve and Max Cooling boxes follow what the DME holds (MG Flasher's app may have set them). */
    _mgfSync() {
        const f = FLAP_NAME[this.mgf.valve];
        if (f && !this.valve.paused && this.mgf.pending !== 'valve') { this.valve.want = f; this.valve.sent = f; }
        if (this.mgf.cooling !== null) this.cooling.on = this.mgf.cooling === 1;
    }
    /** One Live Control write, as MG Flasher does it, and read back. Returns the value the DME now holds. */
    async _mgfSet(key, value) {
        const k = MGF.KEYS[key];
        if (!(value >= 0 && value <= k.max)) throw new Error(k.name + ': ' + value + ' is out of range');
        try { await this._send(0x3E, [0x00], 1500, true); } catch (e) { /* tester present: MG Flasher sends it first, nothing hangs on it */ }
        try {
            const r = await this._send(0x2E, mgfWrite(k.id, value));
            if (r[0] !== 0x6E) throw new Error('Unexpected answer from the DME');
        } catch (e) {
            if (e.nrc !== MGF.TAKEN) throw e.nrc != null ? new Error('MG Flasher refused ' + k.name.toLowerCase() + ' (' + e.message + ', NRC ' + hex(e.nrc) + ')') : e;
        }
        const done = await this._mem(MGF.DONE, 1), last = await this._mem(MGF.LAST, 2);
        if (done[0] !== 1 || last[0] !== k.id || last[1] !== 0x69) throw new Error('MG Flasher did not confirm ' + k.name.toLowerCase());
        const got = this._mgfValue(k, await this._mem(k.addr, k.size));
        this.mgf[key] = got; this.mgf.found = true;
        if (got !== value) throw new Error(k.name + ': the DME reads back ' + got + ', not ' + value);
        return got;
    }
    /** Why MG Flasher's controls can't be used now, or null. Everything works on the move. */
    mgfBlock(key) {
        if (this.tuner !== 'mgf') return 'Pick MG Flasher in Settings, Tuning';
        if (this.demo) return null;
        if (!this.available) return 'Waiting for the diagnostic link';
        if (this.mgf.found === false) return 'MG Flasher Live Control not found on this DME';
        return null;
    }
    /** burble 0..5, valet 0/1, ethanol 0/1, ethPct 0..100, radFlap 0 OEM / 1 closed / 2 open (valve and Max Cooling: setValve, setCooling). */
    setMgf(key, value) {
        const k = MGF.KEYS[key];
        if (!k || this.mgf.pending || this.mgfBlock(key)) return;      // queued behind the 10 s read, one press at a time
        if (this.demo) { this.mgf[key] = value; this._mgfNote('Demo data: nothing sent', false); return; }
        this.mgf.pending = key; this.mgf.want = value; this._mgfNote('Sending ' + k.name.toLowerCase() + '…', false);
        return this._serial(async () => {
            try {
                await this._mgfSet(key, value);
                this._mgfNote(k.name + ' set, read back from the DME', false);
            } catch (e) {
                this._mgfNote(String(e && e.message || e), true);
                this.log.warn(key + ' ' + value + ': ' + this.mgf.note);
            }
            this.mgf.pending = null; this.mgf.want = null;
        });
    }
    _closeLimit() { const v = Number(this.ctx.settings.get('closeLimit')); return isFinite(v) && v > 0 ? v : null; }
    /** Closed should be handed back now: the engine above the limit, or no live engine speed for 5 s. */
    _closeLimited() {
        const lim = this._closeLimit();
        if (!lim) return false;
        const r = this.rpm();
        if (r === null) return Date.now() - this.rpmAt > NO_RPM_MS;
        return this.valve.paused ? r > lim - 500 : r > lim;
    }

    _tick() {
        if (this.rpm() !== null) this.rpmAt = Date.now();
        const demo = this.demo;
        if (this._wasDemo && !demo) this._liveNow();
        this._wasDemo = demo;
        if (demo || !this.available || this.busy) return;
        const mg = this.tuner === 'mgf';
        if (mg && this.mgf.found && Date.now() - this.mgf.at > MGF.READ_MS) {
            this.mgf.at = Date.now();
            this._serial(() => this._mgfReadAll(true).catch((e) => this.log.warn('MG Flasher read: ' + (e && e.message || e))));
            return;
        }
        const v = this.valve;
        if (v.want === 'closed') {
            const lim = this._closeLimited();
            if (lim && !v.paused) { v.paused = true; this._valveCmd('oem', true); return; }
            if (!lim && v.paused) { v.paused = false; this._valveCmd('closed', true); return; }
        }
        // MG Flasher keeps what it is told (its state reads back), so it needs no hold
        if (!mg && this.ctx.settings.get('hold') !== 'off' && (v.want === 'open' || (v.want === 'closed' && !v.paused))
            && v.sent === v.want && Date.now() - v.at > HOLD_MS) this._valveCmd(v.want, true);
    }

    /* ---------------- engine map ---------------- */
    /** Why a map can't be switched now, or null. */
    mapBlock() {
        if (this.tuner === 'mgf') return 'MG Flasher: switch maps on the steering wheel (its Custom Code Menu on the cruise control buttons)';
        if (!this.features().map) return 'Pick MHD or BM3 in Settings, Tuning';
        if (this.demo) return null;
        if (!this.available) return 'Waiting for the diagnostic link';
        const held = (k) => !!(this.car.stale && this.car.stale(k));
        if (held('rpm')) return 'No live engine speed from the car: maps wait for it';
        if (!this.running()) return 'Start the engine to switch maps';
        return null;
    }
    setMap(n) {
        if (!(n >= 1 && n <= 4) || this.busy || this.mapBlock()) return;
        this.map.pending = n; this.map.note = 'Sending map ' + n + '…'; this.map.warn = false; this.kick();
        if (this.demo) {
            return new Promise((res) => setTimeout(() => { Object.assign(this.map, { active: n, pending: null, confirmed: false, note: 'Demo data: nothing sent', warn: false }); this.kick(); res(); }, 1200));
        }
        const t = this.tuner;
        return this._serial(async () => {
            try {
                if (t === 'bm3') {
                    await this._bm3Identify();
                    this.map.active = (await this.bm3.setMap(n - 1)) + 1;
                    this.map.confirmed = true;
                    this.map.note = 'Map ' + this.map.active + ' confirmed by the DME';
                } else {
                    await this._mhd(MHD.MAP, n - 1);
                    this.map.active = n; this.map.confirmed = false;
                    this.map.note = 'Map ' + n + ' accepted by the DME';
                }
                this.map.warn = false;
            } catch (e) {
                this.map.note = String(e && e.message || e); this.map.warn = true;
                this.log.warn('map ' + n + ': ' + this.map.note);
            }
            this.map.pending = null;
        });
    }

    /* ---------------- Max Cooling ---------------- */
    coolBlock() {
        if (!this.features().cooling) {
            return this.tuner === 'bm3' ? 'BM3 has no Max Cooling' : 'Max Cooling needs MHD or MG Flasher (Settings, Tuning)';
        }
        if (this.demo) return null;
        if (!this.available) return 'Waiting for the diagnostic link';
        return null;
    }
    setCooling(on) {
        const mg = this.tuner === 'mgf';
        if ((mg ? this.mgf.pending : this.busy) || this.coolBlock()) return;
        if (on && !this.demo && !this.running()) { this.cooling.note = 'Start the engine first: Max Cooling needs it running'; this.cooling.warn = true; this.kick(); return; }
        if (this.demo) { this.cooling.on = on; this.cooling.note = 'Demo data: nothing sent'; this.cooling.warn = false; this.kick(); return; }
        if (mg) { this.mgf.pending = 'cooling'; this.mgf.want = on ? 1 : 0; }
        return this._serial(async () => {
            try {
                if (mg) await this._mgfSet('cooling', on ? 1 : 0);
                else await this._mhd(MHD.COOLING, on ? 1 : 0);
                this.cooling.on = on; this.cooling.note = 'Max Cooling ' + (on ? 'on' : 'off') + ', accepted by the DME'; this.cooling.warn = false;
            } catch (e) {
                this.cooling.note = String(e && e.message || e); this.cooling.warn = true;
                this.log.warn('cooling ' + on + ': ' + this.cooling.note);
            }
            if (mg) { this.mgf.pending = null; this.mgf.want = null; this._mgfNote(this.cooling.note, this.cooling.warn); }
        });
    }

    view() {
        return {
            tuner: this.tuner, features: this.features(), demo: this.demo, link: this.available, busy: this.busy, bm3Rom: this.bm3Rom,
            live: !!(this.car.carPresent && this.car.carPresent()),
            rpm: this.rpm(), kmh: this.kmh(), running: this.running(), stopped: this.stopped(),
            valve: Object.assign({}, this.valve), map: Object.assign({}, this.map), cooling: Object.assign({}, this.cooling),
            mapBlock: this.mapBlock(), coolBlock: this.coolBlock(),
            mgf: Object.assign({}, this.mgf), mgfBlock: this.mgfBlock(), ethBlock: this.mgfBlock('ethanol'),
        };
    }
}

module.exports = { Control, TUNERS, FEATURES, NAMES, MIN_RPM, STOP_KMH, MG1, MHD, MGF, mgfWrite, mgfFlap };
