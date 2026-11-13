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
 *   Engine map, MHD:      2F 01 <map - 1>, maps 1..4                           (echo; no read-back of the active map)
 *   Engine map, BM3:      the CustomROM's map slot in DME memory, ROM identified first, read back (bm3_protocol.js)
 *   Max Cooling, MHD:     2F 03 01 on · 00 off                                 (echo)
 *
 * The DME lets a tester's valve command go after about 20 s: with "Hold" on, Open / Closed is sent again every 15 s.
 * Closed is handed back to the car (OEM) while the engine is above the "Close: hand back above" speed, and resumed
 * 500 rpm below it; with no live engine speed for 5 s Closed is handed back too.
 *
 * Our own safety rules on top: a map is switched only with the car stopped (live speed under 5 km/h) and the engine
 * running (over 500 rpm); Max Cooling goes on only with the engine running (off is always allowed). There is no
 * xDrive control in this app. A held engine or road speed (no signal for 5 s, kit car.js) counts as none, so those
 * checks fail safe. (Demo data, which the kit only shows with a demo setting this app no longer has, sends nothing.)
 *
 * Plain Node 8 (no Promise.finally).
 */
const { Diag, NRC, hex, replyTo } = require('./kit/diag');
const { Bm3Protocol } = require('./bm3_protocol');
const bm3Profiles = require('./bm3_profiles');

const DME = 0x12;
const TUNERS = ['off', 'mhd', 'bm3', 'mgf'];
// MG Flasher (mgf): its Live Control commands (the MG Flasher app over ENET) aren't published, so this app doesn't
// guess them: the valve goes through BMW's own job (as with Off), map and Max Cooling stay on its Custom Code Menu
// (the cruise control buttons). A capture of MG Flasher's own commands would let them in, as a1-mapping's did for MHD.
const FEATURES = {
    off: { map: false, cooling: false },
    mhd: { map: true, cooling: true },
    bm3: { map: true, cooling: false },
    mgf: { map: false, cooling: false },
};
const NAMES = { off: 'Off', mhd: 'MHD', bm3: 'BM3', mgf: 'MG Flasher' };
const MIN_RPM = 500;            // the engine counts as running above this
const STOP_KMH = 5;             // a map is switched only below this
const HOLD_MS = 15000;          // Open / Closed sent again this often (the DME lets go after ~20 s)
const NO_RPM_MS = 5000;         // no live engine speed this long: Closed is handed back
const MG1 = { open: [0x60, 0xFD, 0x03, 0x03, 0xE8], closed: [0x60, 0xFD, 0x03, 0x23, 0x28], oem: [0x60, 0xFD, 0x00] };
const MHD = { MAP: 0x01, FLAP: 0x02, COOLING: 0x03, flap: { oem: 0x00, open: 0x01, closed: 0x02 } };

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
        const v = this.ctx.settings.get('valveStart');
        if (v === 'open' || v === 'closed') this.setValve(v);
    }

    /** Live data took over from demo data: what was pressed in the demo was never sent, so start from the car's own state. */
    _liveNow() {
        this.valve = { want: 'oem', sent: null, paused: false, at: 0, note: null, warn: false };
        this.map = { active: null, pending: null, confirmed: false, note: null, warn: false };
        this.cooling = { on: null, note: null, warn: false };
        if (this.available) this._atStart();
        this.kick();
    }

    /** The tune setting changed: forget what was known about the DME's tune. */
    tunerChanged() {
        this.bm3Rom = null; this.map = { active: null, pending: null, confirmed: false, note: null, warn: false };
        this.cooling = { on: null, note: null, warn: false };
        if (this.tuner === 'bm3' && this.available && !this.demo) this._serial(() => this._bm3Identify().then(() => this._bm3ReadMap()).catch((e) => this._mapNote(String(e.message || e), true)));
    }

    /** One DME conversation at a time (BM3's memory replies carry no address). */
    _serial(fn) {
        this._ops++;
        const p = this._queue.then(fn).then((v) => { this._ops--; this.kick(); return v; }, (e) => { this._ops--; this.kick(); throw e; });
        this._queue = p.catch(() => {});
        return p;
    }
    kick() { if (this.onChange) this.onChange(); }

    async _send(sid, data, timeoutMs) {
        if (!this.diag || !this.available) throw new Error('No diagnostic link yet');
        this.log.info('UDS -> DME ' + hex(sid) + ' ' + bytes(data));
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
        return this._serial(async () => {
            try {
                if (t === 'mhd') await this._mhd(MHD.FLAP, MHD.flap[mode]);
                else if (t === 'bm3') await this.bm3.setFlap(mode === 'closed' ? 'close' : mode === 'oem' ? 'auto' : 'open');
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
        const v = this.valve;
        if (v.want === 'closed') {
            const lim = this._closeLimited();
            if (lim && !v.paused) { v.paused = true; this._valveCmd('oem', true); return; }
            if (!lim && v.paused) { v.paused = false; this._valveCmd('closed', true); return; }
        }
        if (this.ctx.settings.get('hold') !== 'off' && (v.want === 'open' || (v.want === 'closed' && !v.paused))
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
        if (held('rpm') || held('speed')) return 'No live ' + (held('rpm') ? 'engine' : 'road') + ' speed from the car: maps wait for it';
        if (!this.running()) return 'Start the engine to switch maps';
        if (!this.stopped()) return 'Stop the car to switch maps';
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
            return this.tuner === 'bm3' ? 'BM3 has no Max Cooling' : this.tuner === 'mgf' ? 'MG Flasher: Max Cooling from its Custom Code Menu on the wheel'
                : 'Max Cooling needs MHD (Settings, Tuning)';
        }
        if (this.demo) return null;
        if (!this.available) return 'Waiting for the diagnostic link';
        return null;
    }
    setCooling(on) {
        if (this.busy || this.coolBlock()) return;
        if (on && !this.demo && !this.running()) { this.cooling.note = 'Start the engine first: Max Cooling needs it running'; this.cooling.warn = true; this.kick(); return; }
        if (this.demo) { this.cooling.on = on; this.cooling.note = 'Demo data: nothing sent'; this.cooling.warn = false; this.kick(); return; }
        return this._serial(async () => {
            try {
                await this._mhd(MHD.COOLING, on ? 1 : 0);
                this.cooling.on = on; this.cooling.note = 'Max Cooling ' + (on ? 'on' : 'off') + ', accepted by the DME'; this.cooling.warn = false;
            } catch (e) {
                this.cooling.note = String(e && e.message || e); this.cooling.warn = true;
                this.log.warn('cooling ' + on + ': ' + this.cooling.note);
            }
        });
    }

    view() {
        return {
            tuner: this.tuner, features: this.features(), demo: this.demo, link: this.available, busy: this.busy, bm3Rom: this.bm3Rom,
            live: !!(this.car.carPresent && this.car.carPresent()),
            rpm: this.rpm(), kmh: this.kmh(), running: this.running(), stopped: this.stopped(),
            valve: Object.assign({}, this.valve), map: Object.assign({}, this.map), cooling: Object.assign({}, this.cooling),
            mapBlock: this.mapBlock(), coolBlock: this.coolBlock(),
        };
    }
}

module.exports = { Control, TUNERS, FEATURES, NAMES, MIN_RPM, STOP_KMH, MG1, MHD };
