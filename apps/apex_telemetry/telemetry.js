'use strict';
/**
 * telemetry.js - Apex Telemetry's live values, in SI units (bar, deg C, km, g), read only:
 *
 *   tyres      TPMS pressure, temperature and the car's target pressure per corner (polled: the car never
 *              notifies them), in the car's display units until the units signal says which
 *   engine     from the engine unit over the kit's read-only diagnostic link (app.json config.dme, the identifiers
 *              M Vitals reads): boost setpoint and actual (read back to back, so the deviation is of one moment),
 *              fuel rail and low pressure fuel, requested and actual air charge (load); boost falls back to the
 *              sport display; the charge air before the throttle and after the intercooler (read together, for
 *              its drop and heat soak). Nothing else the Apex Cluster dash already shows (coolant, oil, AFR ...).
 *   gearbox    transmission oil temperature from the basic data set, else the gearbox unit (config.dme.egs)
 *   car        outside temperature, range, rpm, g-force (with peaks)
 *
 * Scalings and identifiers: cauliflowermossgrape's M Vitals / Live Data (MIT) and Apex Cluster (shared/hud.js).
 * snapshot() gives one object for draw.js. The engine unit is only asked while the page shows (wanted()).
 */
const Car = require('./kit/car');

const isNum = (x) => typeof x === 'number' && isFinite(x);
const CORNERS = ['FL', 'FR', 'RL', 'RR'];
const PRESS_UNITS = { 1: 'BAR', 2: 'KPA', 3: 'PSI' }, TEMP_UNITS = { 1: 'C', 2: 'F' };
const PRESS_TO_BAR = { BAR: 1, KPA: 0.01, PSI: 1 / 14.5038 };
const unitName = (map, v) => map[v] || (Object.values(map).indexOf(v) >= 0 ? v : null);
const FRESH = { dme: 6000, fes: 1500 };
// the DME values read in turn while the page shows: [names in config.dme (read back to back), ms between reads]
const DME_READS = [[['boostTarget', 'boostActual'], 250], [['hpfp'], 1000], [['lpfp'], 2000], [['loadTarget', 'loadActual'], 1500], [['chargeBefore', 'intake'], 2000], [['egs'], 5000]];
const ABS_KPA = { boostTarget: 1, boostActual: 1 };     // absolute kPa: shown as bar over the outside air

class Telemetry {
    constructor(ctx) {
        this.ctx = ctx; this.log = ctx.log;
        this.cfg = (ctx.spec && ctx.spec.config) || {};
        this.units = { press: null, temp: null, psiSeen: false };
        this.tyres = { p: {}, t: {}, target: {}, at: 0 };
        this.v = {};                // name -> { v, at } for the values not in car.data()
        this.peak = { gLat: 0, gLong: 0, boost: 0 };
        this.wantAt = 0;            // last time the page was drawn: the engine unit is asked only while it shows
        const self = this;
        const put = (k, v) => { if (isNum(v)) this.v[k] = { v, at: Date.now() }; };
        this.car = new Car(ctx, ['rpm', 'speed', 'accel', 'temps', 'gear'], {
            'de.bmw.infotainment.vehicle.TPMS': {
                $pollMs: 5000,
                statusTyrePressure: (v) => { CORNERS.forEach((k) => { self.tyres.p[k] = self._bar(v && v['actualValuePressureTyre' + k + 'H']); }); self.tyres.at = Date.now(); },
                statusTyreTemperature: (v) => CORNERS.forEach((k) => { self.tyres.t[k] = self._degC(v && v['actualValueTemperatureTyre' + k + 'H']); }),
                statusTargetTyrePressure: (v) => CORNERS.forEach((k) => { self.tyres.target[k] = self._bar(v && v['targetPressureTyre' + k + 'H']); }),
            },
            'de.bmw.infotainment.vehicle.Vehicle': {
                statusNewCurrentUnitsStatusExt: (v) => {
                    const press = unitName(PRESS_UNITS, v && v.unitOfMeasurementAirPressure), temp = unitName(TEMP_UNITS, v && v.unitOfMeasurementTemperature);
                    if (press === self.units.press && temp === self.units.temp) return;
                    self.units.press = press; self.units.temp = temp;
                    self.log.info('car units: pressure ' + (press || '?') + ', temperature ' + (temp || '?'));
                },
            },
            // outside temperature: raw * 0.5 - 40 deg C, 255 = none
            'de.bmw.infrastructure.EnvironmentalInformation': {
                ExteriorTemperature: (v) => { const t = v && v.temperatureExterior; if (isNum(t) && t !== 255) put('ambient', t * 0.5 - 40); },
            },
            // fuel (litres, 255 = none) and range (km, 4095 = none)
            'de.bmw.infotainment.KombiIF': {
                statusRangeTankStatus: (v) => {
                    const f = v && v.fluidLevelFuelTank, r = v && v.range;
                    if (isNum(f) && f >= 0 && f < 255) put('fuelL', f);
                    if (isNum(r) && r >= 0 && r < 4095) put('rangeKm', r);
                },
            },
            // boost from the sport display: bar, 0.01 per bit, 255 = none
            'de.bmw.infotainment.drivingexcitement.FES': {
                statusSwitchDriveDynamicSport2: (v) => { const raw = v && v.displayBoostPressure; if (isNum(raw) && raw !== 255) put('boostFes', raw * 0.01); },
            },
            // gearbox oil: deg C + 48, 255 = none; some cars never fill it (then the gearbox unit is asked)
            'de.bmw.infrastructure.analytics.BasicDataSet': {
                basicDataSet: (v) => { const raw = v && v.valueTemperatureTransmissionOil; if (isNum(raw) && raw !== 255 && raw !== 0) put('gearboxBds', raw - 48); },
            },
        });
        this.car.onSample((d) => {
            if (d.demo) return;
            if (isNum(d.gLat)) this.peak.gLat = Math.max(this.peak.gLat, Math.abs(d.gLat));
            if (isNum(d.gLong)) this.peak.gLong = Math.max(this.peak.gLong, Math.abs(d.gLong));
        });
        this._startDme();
    }

    /** A TPMS pressure raw (0.1 x the car's unit, 65532 and up = none) in bar; before the units signal, the unit whose
     *  plausible tyre pressures it falls in (bar 0.5-6, psi 7-60, kPa 60-600; psi also means F). */
    _bar(raw) {
        if (!isNum(raw) || raw < 0 || raw >= 65532) return null;
        const v = raw / 10, k = PRESS_TO_BAR[this.units.press];
        if (k) return v * k;
        if (v >= 0.5 && v <= 6) return v;
        if (v >= 7 && v < 60) { this.units.psiSeen = true; return v / 14.5038; }
        if (v >= 60 && v <= 600) return v / 100;
        return null;
    }
    /** A TPMS temperature raw (the car's degrees + 40, 65535 = none) in C (the car sends F when set to F). */
    _degC(raw) {
        if (!isNum(raw) || raw < 0 || raw >= 65535) return null;
        const v = raw - 40, f = this.units.temp ? this.units.temp === 'F' : this.units.psiSeen;
        const c = f ? (v - 32) * 5 / 9 : v;
        return c >= -40 && c <= 150 ? c : null;
    }

    /** The page is showing: ask the engine unit for its values (for the next few seconds). */
    wanted() { this.wantAt = Date.now(); }

    _startDme() {
        const dme = this.cfg.dme || {};
        let rd;
        try {
            // the kit's read-only link: anything but a read (22 / OBD 01) is refused before it leaves the head unit
            const { ReadOnlyDiag } = require('./kit/readonly-diag');
            const { DidReader } = require('./kit/dids');
            const link = new ReadOnlyDiag(this.ctx.signals, this.log, { silentAfter: Infinity });
            Promise.resolve().then(() => link.init()).catch((e) => this.log.info('engine unit link not available: ' + (e && e.message || e)));
            rd = new DidReader(link, { ecu: dme.ecu || 18 });
        } catch (e) { this.log.info('engine unit off: ' + (e && e.message || e)); return; }
        this.reader = rd;
        // a candidate that gets no reply costs its whole timeout: keep that short, so one missing value can't stall the rest
        const lists = {};
        Object.keys(dme).forEach((k) => { if (Array.isArray(dme[k])) lists[k] = dme[k].map((c) => Object.assign({ timeoutMs: 1200 }, c)); });
        const groups = DME_READS.filter(([ks]) => ks.every((k) => lists[k] && lists[k].length));
        const st = {};          // first name of a group -> { asked, miss } (miss: reads in a row that got nothing)
        let busy = false, baro = 101.3, baroAt = 0;
        this.dmeTimer = setInterval(() => {
            const now = Date.now();
            if (busy || now - this.wantAt > 3000 || this.car.data().demo) return;
            // the most overdue group goes next (overdue = time since its last read / its interval). Taking simply the
            // first one due starved everything after boost on the car (Nov 13 2026): one boost read took longer than
            // boost's own interval. A group that got nothing 3 times in a row is asked every 15 s only; the gearbox unit
            // only while the car's data set has no gearbox temperature.
            let due = null, most = 1;
            groups.forEach((gr) => {
                const k0 = gr[0][0], g = st[k0] || (st[k0] = { asked: 0, miss: 0 });
                if (k0 === 'egs' && this._fresh('gearboxBds', 30000)) return;
                const r = (now - g.asked) / (g.miss >= 3 ? Math.max(gr[1], 15000) : gr[1]);
                if (r >= most) { most = r; due = gr; }
            });
            if (!due) return;
            const ks = due[0], g = st[ks[0]];
            g.asked = now;
            busy = true;
            (async () => {
                if (ks[0] === 'boostTarget' && now - baroAt > 60000 && Array.isArray(dme.baro)) {
                    baroAt = now;
                    const b = await rd.value('baro', dme.baro);
                    if (isNum(b)) baro = b;
                }
                let got = 0;
                for (const k of ks) {
                    const v = await rd.value(k, lists[k]);
                    if (!isNum(v)) continue;
                    got++;
                    const at = Date.now();
                    if (ABS_KPA[k]) this.v[k] = { v: (v - baro) / 100, at };                         // absolute kPa -> bar boost
                    else if (k === 'egs') this.v.gearboxEgs = { v, at };
                    else this.v[k] = { v, at };
                }
                if (got) g.miss = 0;
                else if (++g.miss === 3) this.log.info('engine unit: no ' + ks.join(' / ') + ' (' + ks.map((k) => this.why(k)).join('; ') + '), asked every 15 s');
            })().catch((e) => this.log.info('engine unit: ' + (e && e.message || e))).then(() => { busy = false; });
        }, 100);
    }

    _fresh(k, ms) { const x = this.v[k]; return x && Date.now() - x.at < ms ? x.v : null; }

    /** What the engine unit answered for config.dme[name], per candidate ('F423 NRC 31, OBD 23 NO REPLY'), for a box
     *  that has no value; '' while it has one or before it was asked. */
    why(name) {
        const rd = this.reader, list = (this.cfg.dme || {})[name];
        if (!rd || !Array.isArray(list)) return '';
        const out = [];
        for (const c of list) {
            const r = rd.raws[rd.key(c)];
            if (!r) continue;
            if (r.ok) return '';
            out.push(rd.constructor.label(c) + ' ' + String(r.why || '?').replace(/^NRC (\w+).*/, 'NRC $1').toUpperCase());
        }
        return out.length ? out.join(', ') : 'ASKING';
    }

    resetPeaks() { this.peak = { gLat: 0, gLong: 0, boost: 0 }; }

    /** Everything the page shows, SI units, null = no value. */
    snapshot() {
        const d = this.car.data(), demo = !!d.demo, f = (k, ms) => this._fresh(k, ms || FRESH.dme);
        const tyre = (kind, k) => { const v = this.tyres[kind][k]; return isNum(v) ? v : null; };
        let s;
        if (demo) {
            const t = Date.now() / 1000, w = (a, p) => a * Math.sin(t / p);
            const tgt = Math.max(0, d.rpm > 2200 ? Math.min(1.25, (d.rpm - 2200) / 3000 * 1.25) : 0);
            s = {
                tyres: {
                    FL: { p: 2.42 + w(0.02, 7), t: 38 + w(2, 9), target: 2.4 }, FR: { p: 2.44, t: 41 + w(2, 11), target: 2.4 },
                    RL: { p: 2.58, t: 44 + w(2, 8), target: 2.6 }, RR: { p: 2.39, t: 47 + w(3, 10), target: 2.6 },
                },
                boostTarget: tgt, boost: Math.max(0, tgt + w(0.08, 1.3)), hpfp: 60 + tgt * 220, lpfp: 5.2 + w(0.2, 5),
                loadTarget: 30 + tgt * 100, loadActual: 28 + tgt * 100, gearbox: 86, ambient: 22, rangeKm: 512,
                chargeBefore: 38 + tgt * 70, intake: 33 + tgt * 12,
            };
        } else {
            const bt = f('boostTarget', 3000), ba = f('boostActual', 3000), fes = f('boostFes', FRESH.fes);
            s = {
                tyres: {},
                boostTarget: bt, boost: ba !== null ? ba : fes,
                hpfp: f('hpfp'), lpfp: f('lpfp'), loadTarget: f('loadTarget'), loadActual: f('loadActual'),
                chargeBefore: f('chargeBefore'), intake: f('intake'),
                gearbox: f('gearboxBds', 60000) !== null ? f('gearboxBds', 60000) : f('gearboxEgs', 20000),
                ambient: f('ambient', 600000), rangeKm: f('rangeKm', 600000),
            };
            CORNERS.forEach((k) => { s.tyres[k] = { p: tyre('p', k), t: tyre('t', k), target: tyre('target', k) }; });
        }
        if (isNum(s.boost) && !demo) this.peak.boost = Math.max(this.peak.boost, s.boost);
        s.speed = isNum(d.speed) ? d.speed : null; s.rpm = isNum(d.rpm) ? d.rpm : null;
        s.gLat = isNum(d.gLat) ? d.gLat : null; s.gLong = isNum(d.gLong) ? d.gLong : null;
        s.peak = demo ? { gLat: 0.94, gLong: 0.81, boost: 1.21 } : Object.assign({}, this.peak);
        s.tyresAt = this.tyres.at; s.demo = demo;
        return s;
    }
}

Telemetry.CORNERS = CORNERS;
module.exports = Telemetry;
