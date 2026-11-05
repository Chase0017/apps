'use strict';
/**
 * The drawing engine, shared by every bimmer-lab app that draws through cluster-render
 * (robertnisipeanu/idrive-apps, native/cluster-render): it connects, builds one layer per widget
 * of the active layout in the active theme, and keeps live widgets updated from the kit's car.js.
 * Started by an app's main.js with the kit's ctx (settings, signals, log, spec, dataDir).
 * It lives in the repo's shared/ folder; app.json "shared" ships it with each app.
 *
 * Which display: app.json config.target, "hud" (800x480, the windshield HUD; the default) or
 * "panel" (1920x720, the whole instrument cluster, drawn over BMW's own gauges).
 * config.statusName names it on the status row ("HUD", "Cluster").
 * Which layout: with the "byMode" setting on and the car's drive mode known (FES
 * statusFESVehicleDynamicSwitchHMI), the "inComfort" / "inSport" / "inEco" setting; otherwise "hudLayout".
 * The layout name "off" draws nothing, so BMW's own HUD or cluster shows (and the other app can have the
 * shared scene: cluster-render never shows the HUD and the cluster panel at once).
 * The colour theme is the layout's own "theme" when it has one (the cluster themes), else the "hudTheme"
 * setting (auto = Night after sunset).
 *
 * Effect shaders: cluster-render's v_uv has (0,0) at the TOP-left (PROTOCOL.md; confirmed on the car,
 * Nov 4 2026, when a box's header strip drew at the bottom). The bench draws the same way.
 *
 * Widget types (hud/layouts/*.json, or <data>/layouts/ overrides, see layouts.js):
 *   text      image layer; template tokens below, a font from hud/fonts, colour role
 *   scale     image layer; the shift bar's rpm numbers (0 .. bar max / 1000), evenly spread
 *   stripe    image layer; the M tricolour stripe
 *   shiftbar  effect layer; shaders.js shiftbar, lit by rpm, zones from the redline
 *   arc       effect layer; shaders.js arc, lit by a signal between min and max
 *   revbar    effect layer; shaders.js revbar, the G20-style slanted rev bar (Redline layout):
 *             "barH" bar height, "top" room for the marks above it, "slant" px, "over" rpm past the
 *             redline's thousand the scale runs to (1000: a 7000 redline gives 0..8)
 *   lights    effect layer; shaders.js lights, shift lights over the last 2000 rpm before the shift point
 *   badge     image layer; a rounded tag with text: "tone" verdict (the last shift's grade colour) or cold
 *   fill      effect layer; a solid colour (role "color", default "bg") over the whole widget, with an
 *             optional see-through "hole": [x, y, w, h] in target px, cut only while the bool setting
 *             "holeWhen" is on (the cluster's map window). Opaque fill hides BMW's gauges under it.
 *   box       effect layer; a framed box: "fill" and "line" roles, "border" px, "radius" px, and a
 *             header strip "head" px tall in role "headColor" (its label is a text widget on top)
 *   mdash     effect layer; the M theme's whole backdrop (shaders.js mdash): "card" and "panel" [x, y, w, h],
 *             "line" [x0, y, x1, cap], "gmeter" [cx, cy, r] with "maxG", "gaugeL" / "gaugeR" { cx, cy, r,
 *             signal, min, max }, "mark" [x, y, scale]. Positions in target px.
 *   mtach     effect layer; the M rev bar: "side" left|right, "max" rpm, and in target px for the LEFT bar
 *             "y0" (0 rpm), "y8" (max), "ym" (the bend), "xm" (outer edge x at the bend; the right bar gives
 *             its own, mirrored), "kTop" / "kBot" (x per y px above / below the bend), "round", "wBot" / "wTop" / "wBend"
 *   sdash     effect layer; the whole Sport theme (shaders.js sdash): "geo" [yTop, yBend, yBottom, xBend] and
 *             "k" [above, below, round] for the left bracket's outer line (the right one is mirrored), "band"
 *             width, "inner" (the inner line's distance from the outer one), "scale" [y of 0, y of the top mark],
 *             "ticks" [speed, rpm], "rpmMax" (speed follows SPEED_SCALE), "fuelSeg" / "oilSeg" [fullX, fullY,
 *             emptyX, emptyY], "strip" [left end x, y, h, slant], "topEnd" x, "fade" [x0, x1] (the dark panels
 *             fade out); the map window is cut while "holeWhen" is on ("hole" [x, y, w, h]), else a lane view
 *   ddash     effect layer; the whole Dials theme (shaders.js ddash): "tach" [cx, cy, radius, band], "max" rpm,
 *             four side gauges "gauges" [{ signal, min, max }] drawn per the "styleFrom" choice setting
 *             (round | bar | digital): "dials" [[cx, cy, r] x4] (round dials, digital tiles), "bars"
 *             [[x0, y, x1, h] x4]; "low" [coolant, fuel] thin bars [x0, y, x1, h]; "head" [line y, x margin]
 *   segbar    effect layer; "max" segments, the first round(signal) lit (e.g. "setupLevel:engine"), "slant" px
 *   icon      image layer; a line icon from icons.js ("icon": gauge, shock, wheel, cog, stack, therm, oilcan, fuel)
 *   arc also takes "start" and "sweep" in degrees (clockwise from 12 o'clock; negative = anticlockwise)
 *   grid      calibration: effect layer of lines every "step" px (brighter every "major" steps)
 *   gridlabels  calibration: image layer, "x/y" at every "step" px (only the labels are uploaded)
 * Any widget: "toggle": "<bool setting>" hides it when that setting is off, "!<setting>" when it is on,
 * "<choice setting>=<value>" shows it only while that choice is picked (also with "!");
 * "themes": [...] shows it only in those themes. Text "color2": a second role, the colour at the bottom
 * of the box (a top-to-bottom gradient, the chrome look). Text: "hotWhen": "now" turns it the shift red
 * at the shift point; "coldWhen": "cold" turns it blue while the cold guard lowers the shift point.
 * scale: "over" as revbar; "redFrom": true draws the numbers from the redline on in red.
 * lights: "count" (12), "tail" (0): the last "tail" lights are blue (the GT3 look); "round": true for dots;
 * "off" the alpha of an unlit light (0.14).
 * Text "colorBy": "verdict" colours it by the last shift's grade. Text "near": ["speed" | "rpm", i] turns it
 * "nearColor" (fg) while scale label i is the one nearest the value (BMW lights up the label by the needle).
 *
 * rpm is smoothed (a 120 ms filter, and the readout moves in 50 rpm steps only when it changes by 40 or
 * more), so idle wobble doesn't show, as on BMW's own tach. Shift scoring uses the raw rpm.
 * Boost: FES displayBoostPressure while it's valid, else (app.json config.dme) the engine unit over
 * read-only UDS, absolute pressure minus outside air pressure, as cauliflowermossgrape's car_vitals does.
 *
 * Text tokens: {{speed}} {{u:speed}} {{oil}} {{coolant}} {{boost}} {{u:boost}} {{rpm}}
 * {{gear}} (P / R / N, D3, or just 3 when the selector position is unknown), {{gearnum}} (3, or P / R / N)
 * {{spd:<i>}} (speed scale label i of SPEED_SCALE: 0..200 mph, 0..320 km/h) {{range}} {{u:distLc}} (mi, km) {{ambient}} (outside, signed: +75) {{u:speedLc}} (mph, km/h) {{ampmLc}} (am, pm) {{torque}} {{u:torque}} (lb-ft, Nm) {{torquePct}} {{powerPct}} (% of config.engine's peak) {{boostHi}} {{boostMid}}
 * (gauge labels for 1.4 / 0.7 bar in the display unit) {{stage}} (P R N D) {{gearInD}} (gear number while in D) {{mode}} (COMFORT, SPORT, SPORT PLUS, ECO PRO)
 * {{temp:<deg C>}} (that temperature in the display unit, °F rounded to 10, for gauge labels) {{setup:engine|chassis|steering|gearbox}} (what that part is set to in the drive mode now)
 * {{time}} {{ampm}} {{u:temp}} (°F / °C) {{gLat}} {{gLong}} (g, 2 decimals) {{signal:<car.data() key>}} (raw, 1 decimal).
 * Redline (shift_score.js): {{rpm10}} (rpm to 10) {{shiftAt}} {{lastShift}} {{lastGears}} (4 > 5)
 * {{verdict}} {{shiftPrompt}} (SHIFT at the shift point) {{coldNote}} (only while the oil is cold).
 * Units follow the "units" setting: us = mph, °F, psi; metric = km/h, °C, bar.
 *
 * Boost is a PUSH signal, not a diagnostic poll: tracing cauliflowermossgrape's
 * car_vitals showed its boost reading is de.bmw.infotainment.drivingexcitement.FES /
 * statusSwitchDriveDynamicSport2.displayBoostPressure, factor 0.01, offset 0,
 * invalid 255. car_vitals itself treats that field as unreliable on some cars, so
 * whether this X3 fills it is checked on the first drive. Reported here in bar.
 *
 * Never throws out of a timer or event: the kit turns an uncaught exception into an
 * app exit, and on the car a second unexpected exit uninstalls the app.
 */
const fs = require('fs');
const { ClusterRender, DEFAULT_PATH } = require('./cluster_render_client.js');
const Layouts = require('./layouts');
const { THEMES, M_STRIPE, LIGHTS, VERDICT, color } = require('./hud_themes');
const ShiftScore = require('./shift_score');
const sun = require('./sun');
const textRaster = require('./hud_text');
const { paintIcon } = require('./icons');
const shaders = require('./shaders');
const Car = require('./kit/car');

const BOOST_SCALE = { factor: 0.01, offset: 0, invalid: 255 }; // see header comment
const TICK_MS = 50;              // 20 Hz: shift bar and gauges
const TEXT_MS = 200;             // text re-draws at most 5 times a second (what BMW's own readouts do)
const DEFAULT_LOCATION = { lat: 35.2271, lon: -80.8431 }; // Charlotte, NC: for the Auto theme's sunset
const TARGET_SIZES = { hud: [800, 480], panel: [1920, 720] };
const MODE_KEY = { comfort: 'inComfort', sport: 'inSport', eco: 'inEco' };
const MODE_NAME = { comfort: 'Comfort', sport: 'Sport', eco: 'Eco Pro' };
const FRESH_MS = 3000;
// BMW's speed scale: even steps to 120 mph (180 km/h), then wider ones to 200 mph (320 km/h)
const SPEED_SCALE = { us: [0, 20, 40, 60, 80, 100, 120, 160, 200], metric: [0, 30, 60, 90, 120, 150, 180, 250, 320] };
/** speed (display unit) -> 0..1 along a scale of evenly spaced labels */
function scaleFrac(v, marks) {
    if (!(v > 0)) return 0;
    for (let i = 1; i < marks.length; i++) if (v <= marks[i]) return (i - 1 + (v - marks[i - 1]) / (marks[i] - marks[i - 1])) / (marks.length - 1);
    return 1;
}           // a boost reading older than this is not used

/**
 * The drive mode from FES statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience: names or wire
 * numbers (cauliflowermossgrape's live_data signals.js, MIT): 1 Sport, 2 Sport+, 3 Sport individual,
 * 4 Comfort, 5 Comfort+, 6 Comfort individual, 7 Eco Pro, 8 Eco Pro+, 9 Eco Pro individual, 10 Adaptive.
 */
/** Sport+ / Comfort+ / Eco Pro+ (wire 2, 5, 8, or a name with PLUS or EXPERT in it). */
function drivePlusOf(raw) {
    const v = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
    if (typeof v === 'number') return v === 2 || v === 5 || v === 8;
    return typeof v === 'string' && /PLUS|EXPERT/i.test(v);
}

/** The M theme's setup rows: what each part is set to in a drive mode (they follow the mode buttons). */
const SETUP = {
    eco:       { engine: 'EFFICIENT', chassis: 'COMFORT', steering: 'COMFORT', gearbox: 'EFFICIENT' },
    comfort:   { engine: 'COMFORT', chassis: 'COMFORT', steering: 'COMFORT', gearbox: 'COMFORT' },
    sport:     { engine: 'SPORT', chassis: 'SPORT', steering: 'SPORT', gearbox: 'SPORT' },
    sportplus: { engine: 'SPORT PLUS', chassis: 'SPORT', steering: 'SPORT', gearbox: 'SPORT PLUS' },
};
const SETUP_LEVEL = { EFFICIENT: 1, COMFORT: 1, SPORT: 2, 'SPORT PLUS': 3 };

function driveModeOf(raw) {
    let v = raw;
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) v = Number(v.trim());
    if (typeof v === 'number') {
        if (v >= 1 && v <= 3) return 'sport';
        if (v >= 7 && v <= 9) return 'eco';
        if ((v >= 4 && v <= 6) || v === 10) return 'comfort';
        return null;
    }
    if (typeof v !== 'string') return null;
    const u = v.trim().toUpperCase();
    if (u.indexOf('SPORT') === 0) return 'sport';
    if (u.indexOf('ECO') === 0) return 'eco';
    if (u.indexOf('COMFORT') === 0 || u.indexOf('ADAPTIVE') === 0) return 'comfort';
    return null;
}

function rgb(c) { return [c[0] / 255, c[1] / 255, c[2] / 255]; }
function rgba(c) { return [c[0] / 255, c[1] / 255, c[2] / 255, (c[3] === undefined ? 255 : c[3]) / 255]; }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

class HudApp {
    constructor(ctx) {
        this.ctx = ctx;
        this.log = ctx.log;
        this.config = (ctx.spec && ctx.spec.config) || {};
        this.location = this.config.location || DEFAULT_LOCATION;
        // HUD_CLUSTER_SOCKET: the Mac bench's fake cluster-render; never set on the car
        this.socketPath = process.env.HUD_CLUSTER_SOCKET || this.config.socketPath || DEFAULT_PATH;
        this.client = new ClusterRender(ctx.spec.id, this.socketPath);
        this.target = TARGET_SIZES[this.config.target] ? this.config.target : 'hud';
        this.size = TARGET_SIZES[this.target];
        this.label = this.config.statusName || 'HUD';
        this.layoutTheme = null;         // the active layout's own theme, if it has one
        this.layouts = new Layouts(ctx.dataDir, this.log, this.size);
        this.widgets = new Map();        // widget.id -> { w, ref, last, lastPaint }
        this.boostFes = null; this.boostFesAt = 0;    // bar, from the sport display signal
        this.boostDme = null; this.boostDmeAt = 0;    // bar, from the engine unit (fallback)
        this.needsBoost = false;         // a shown widget uses boost (the engine unit is only asked then)
        this.driveMode = null;           // 'comfort' | 'sport' | 'eco', once the car has said
        this.drivePlus = false;          // Sport+ (or Comfort+ / Eco Pro+)
        this.fuelL = null; this.rangeKm = null; this.ambient = null;   // KombiIF tank / range, outside temperature
        this.activeName = null;          // the layout shown now ('off' = nothing)
        this.layerStates = new Map();    // ref -> { state, reason } from cluster-render
        this.targetState = null;         // { state, holder, reason } of our target
        this.rpmF = null; this.rpmShown = null; this.lastTickT = 0;
        this.themeName = null;
        this.flash = false;
        this.problem = null;             // why nothing shows (a bad layout), for the status line
        this.statusListeners = [];
        this.lastStatus = null;

        this._setupVehicleData();
        this._wireClientEvents();
        this.layouts.onChange(() => this._rebuild());
        ctx.settings.onChange((key) => { if (key !== 'demo') this._rebuild(); else this._status(); });
    }

    /** A setting's value, or its default when the saved value isn't one the schema allows. */
    setting(key) {
        const s = this.ctx.settings.item(key);
        const v = this.ctx.settings.get(key);
        if (!s) return v;
        const ok = s.type === 'bool' ? typeof v === 'boolean'
            : s.type === 'choice' ? (s.options || []).some((o) => o[0] === v)
                : s.type === 'number' ? isNum(v) && (!s.steps || s.steps.indexOf(v) >= 0) : true;
        return ok ? v : s.default;
    }

    _setupVehicleData() {
        const extra = {
            // fuel and range (cauliflowermossgrape's live_data, MIT): litres (255 = none) and km (4095 = none)
            'de.bmw.infotainment.KombiIF': {
                statusRangeTankStatus: (v) => {
                    const f = v && v.fluidLevelFuelTank, r = v && v.range;
                    this.fuelL = isNum(f) && f >= 0 && f < 255 ? f : null;
                    this.rangeKm = isNum(r) && r >= 0 && r < 4095 ? r : null;
                },
            },
            // outside temperature: raw * 0.5 - 40 deg C, 255 = none (car_vitals, MIT)
            'de.bmw.infrastructure.EnvironmentalInformation': {
                ExteriorTemperature: (v) => {
                    const t = v && v.temperatureExterior;
                    this.ambient = isNum(t) && t !== 255 ? t * 0.5 - 40 : null;
                },
            },
            'de.bmw.infotainment.drivingexcitement.FES': {
                statusSwitchDriveDynamicSport2: (v) => {
                    const raw = v && v.displayBoostPressure;
                    if (typeof raw !== 'number' || raw === BOOST_SCALE.invalid) return;
                    this.boostFes = raw * BOOST_SCALE.factor + BOOST_SCALE.offset;
                    this.boostFesAt = Date.now();
                },
                // the HMI's sport display: power and torque in % of the car's maximum (car_vitals, MIT); 255 = none
                statusVehicleDynamicEngine: (v) => {
                    const p = v && v.displaySportEnginePower, t = v && v.displaySportEngineTorque;
                    this.sportPower = isNum(p) && p >= 0 && p <= 150 ? p : null;
                    this.sportTorque = isNum(t) && t >= 0 && t <= 150 ? t : null;
                    this.sportAt = Date.now();
                },
                statusFESVehicleDynamicSwitchHMI: (v) => {
                    const m = driveModeOf(v && v.actualValueModeDrivingExperience);
                    if (m) this.drivePlus = drivePlusOf(v.actualValueModeDrivingExperience);
                    if (!m || m === this.driveMode) return;
                    this.log.info('drive mode ' + MODE_NAME[m] + ' (' + (v && v.actualValueModeDrivingExperience) + ')');
                    this.driveMode = m;
                    if (this._layoutName() !== this.activeName) this._rebuild(); else this._status();
                },
            },
        };
        this.car = new Car(this.ctx, ['rpm', 'speed', 'temps', 'accel', 'gear', 'torque'], extra);
        this.car.setRedline(this.setting('redline'));
        this.score = new ShiftScore(this.car, () => ({
            redline: this.setting('redline'), shiftBefore: this.setting('shiftBefore'), coldGuard: this.setting('coldGuard'),
        }), this.log);
    }

    _wireClientEvents() {
        this.client.on('ready', () => { this.log.info('cluster-render ready (backend=' + this.client.backend + ')'); this._rebuild(); });
        this.client.on('disconnected', () => { this.log.warn('cluster-render disconnected, client will retry'); this._status(); });
        this.client.on('layer', (ref, state, reason) => {
            const old = this.layerStates.get(ref);
            this.layerStates.set(ref, { state, reason });
            if (state === 'error' || ((state === 'waiting' || state === 'stalled') && (!old || old.state !== state))) {
                const w = this._widgetOf(ref);
                this.log.warn('layer ' + ref + (w ? ' (' + w + ')' : '') + ' ' + state + (reason ? ': ' + reason : ''));
            }
            this._statusSoon();
        });
        this.client.on('target', (name, state, holder, reason) => {
            if (name !== this.target) return;
            this.targetState = { state, holder, reason };
            this.log.info('target ' + name + ' ' + state + (holder ? ' (holder ' + holder + ')' : '') + (reason ? ': ' + reason : ''));
            this._statusSoon();
        });
        this.client.on('refused', (op, ref, reason) => {
            const w = this._widgetOf(ref);
            this.log.warn('refused ' + op + ' on ' + ref + (w ? ' (' + w + ')' : '') + ': ' + reason);
            if (!this.refused) this.refused = (w || op) + ': ' + reason;   // the first one, until the next rebuild
            this._statusSoon();
        });
        this.client.on('budget', (capKb, maxKb, reason) => this.log.info('budget ' + capKb + '/' + maxKb + ' kb/s (' + reason + ')'));
    }

    start() {
        this.log.info('connecting to cluster-render at ' + this.socketPath);
        this.client.connect();
        this.tickTimer = setInterval(() => this._guard('tick', () => this._tick()), TICK_MS);
        // Auto theme: check for sunrise / sunset once a minute; the status line too
        this.themeTimer = setInterval(() => this._guard('theme check', () => {
            if (this._themeName() !== this.themeName) this._rebuild();
            this._status();
        }), 60000);
        this.statusTimer = setInterval(() => this._guard('status', () => this._status()), 5000);
        this._status();
        this._startDme();
    }

    /** Boost from the engine unit when the sport display's value isn't there (config.dme, read-only UDS). */
    _startDme() {
        const dme = this.config.dme;
        if (!dme || !Array.isArray(dme.boost) || !dme.boost.length) return;
        let rd = null, busy = false, baro = 101.3, baroAt = 0;
        try {
            const { Diag } = require('./kit/diag');
            const { DidReader } = require('./kit/dids');
            const link = new Diag(this.ctx.signals, this.log);
            link.quiet = true;
            Promise.resolve().then(() => link.init()).catch((e) => this.log.info('engine unit link not available: ' + (e && e.message || e)));
            rd = new DidReader(link, { ecu: dme.ecu || 18 });
        } catch (e) { this.log.info('engine unit boost off: ' + (e && e.message || e)); return; }
        this.dmeTimer = setInterval(() => this._guard('engine unit boost', () => {
            const now = Date.now();
            if (busy || !this.needsBoost || this.car.data().demo || now - this.boostFesAt < FRESH_MS) return;
            busy = true;
            (async () => {
                if (now - baroAt > 60000 && Array.isArray(dme.baro)) {
                    baroAt = now;
                    const b = await rd.value('baro', dme.baro);
                    if (isNum(b)) baro = b;
                }
                const m = await rd.value('boost', dme.boost);
                if (isNum(m)) { this.boostDme = (m - baro) / 100; this.boostDmeAt = Date.now(); }
            })().catch((e) => this.log.info('engine unit boost: ' + (e && e.message || e))).then(() => { busy = false; });
        }), 400);
    }

    stop() {
        clearInterval(this.tickTimer);
        clearInterval(this.themeTimer);
        clearInterval(this.statusTimer);
        clearInterval(this.dmeTimer);
        this.client.close();
    }

    _guard(what, fn) {
        try { fn(); } catch (e) { this.log.error('hud ' + what + ': ' + (e && e.stack || e)); }
    }

    /* ---------------- status line (the center screen's first row) ---------------- */

    /** fn(text) whenever the status line changes. */
    onStatus(fn) { this.statusListeners.push(fn); if (this.lastStatus) fn(this.lastStatus); }

    /** The layout name to show now: per drive mode when that's on and known, else the plain setting. */
    _layoutName() {
        if (this.setting('byMode') === true && this.driveMode && MODE_KEY[this.driveMode]) {
            const v = this.setting(MODE_KEY[this.driveMode]);
            if (v) return v;
        }
        return this.setting('hudLayout');
    }

    _layoutLabel(name) {
        const lay = this.ctx.settings.item('hudLayout');
        const o = lay && (lay.options || []).find((x) => x[0] === name);
        return o ? o[1] : name;
    }

    _widgetOf(ref) {
        let id = null;
        this.widgets.forEach((x) => { if (x.ref === ref) id = x.w.id; });
        return id;
    }

    _statusSoon() {
        if (this._statusT) return;
        this._statusT = setTimeout(() => { this._statusT = null; this._guard('status', () => this._status()); }, 500);
    }

    /** ", 12 of 14 drawn, 2 waiting: <reason>" while some layers aren't shown; "" when all are. */
    _drawnNote() {
        const ts = this.targetState;
        if (ts && (ts.state === 'waiting' || ts.state === 'parked') && ts.holder) {
            return ts.holder === 'foreign' ? ', waiting: another app has this display' : ', waiting: BMW is using this display';
        }
        const refused = this.refused ? ', refused ' + this.refused : '';
        const refs = []; this.widgets.forEach((x) => refs.push(x.ref));
        if (!refs.length) return refused;
        let shown = 0, why = null, whyN = 0;
        refs.forEach((r) => {
            const st = this.layerStates.get(r);
            if (st && st.state === 'shown') shown++;
            else if (st) { whyN++; if (!why) why = st.state + (st.reason ? ': ' + st.reason : ''); }
        });
        if (shown === refs.length || (!why && !shown)) return refused;
        return ', ' + shown + ' of ' + refs.length + ' drawn' + (why ? ' (' + whyN + ' ' + why + ')' : '') + refused;
    }

    statusText() {
        if (!this.client.ready) {
            let there = false;
            try { there = fs.existsSync(this.socketPath); } catch (e) { /* treat as missing */ }
            return there ? this.label + ': connecting to cluster-render' : this.label + ' off: cluster-render is not installed or not running';
        }
        if (this.problem) return this.label + ': ' + this.problem;
        const byMode = this.setting('byMode') === true;
        const mode = byMode ? (this.driveMode ? ' (' + MODE_NAME[this.driveMode] + ')' : ' (drive mode not seen yet)') : '';
        const what = this.target === 'panel' ? 'cluster' : 'HUD';
        if (this.activeName === 'off') return this.label + ' off' + mode + ": BMW's own " + what + ' shows';
        const name = this._layoutLabel(this.activeName);
        const d = this.car.data();
        const demo = d.demo ? ', demo data' : '';
        const drawn = this._drawnNote();
        if (this.layoutTheme) return this.label + ' on' + mode + ': ' + name + ' theme' + demo + drawn;
        const theme = THEMES[this.themeName] ? THEMES[this.themeName].name : this.themeName;
        const auto = this.setting('hudTheme') === 'auto' ? ' (Auto)' : '';
        return this.label + ' on' + mode + ': ' + name + ' layout, ' + theme + ' theme' + auto + demo + drawn;
    }

    _status() {
        const s = this.statusText();
        if (s === this.lastStatus) return;
        this.lastStatus = s;
        this.statusListeners.forEach((fn) => { try { fn(s); } catch (e) { this.log.warn('status listener: ' + e); } });
    }

/* ---------------- theme, units, values ---------------- */

    _themeName() {
        if (this.layoutTheme) return this.layoutTheme;
        const t = this.setting('hudTheme');
        if (t !== 'auto') return t;
        return sun.isNight(Date.now(), this.location.lat, this.location.lon) ? 'night' : this.setting('dayTheme');
    }

    _barMax(w) { return Math.ceil(this.setting('redline') / 1000) * 1000 + ((w && w.over) || 0); }

    /** The shift point now ({ rpm, cold }) and whether the rpm is at or past it. */
    _shift() {
        const d = this.car.data();
        const sp = this.score.shiftPoint(d.oil);
        const rpm = isNum(this.rpmF) ? this.rpmF : d.rpm;
        sp.now = isNum(rpm) && rpm >= sp.rpm;
        sp.oilCold = isNum(d.oil) && d.oil < 80;
        return sp;
    }

    /** Boost in bar: the sport display's value while fresh, else the engine unit's, else null. */
    _boost() {
        const now = Date.now();
        if (isNum(this.boostFes) && now - this.boostFesAt < FRESH_MS) return this.boostFes;
        if (isNum(this.boostDme) && now - this.boostDmeAt < FRESH_MS) return this.boostDme;
        return null;
    }

    _raw(name) {
        if (name === 'boost') return this._boost();
        if (name === 'rpm' && isNum(this.rpmF)) return this.rpmF;
        if (name === 'fuel' || name === 'range' || name === 'ambient') {
            // the kit's demo drive has none of these: made-up but steady values while it runs
            const demo = this.car.data().demo;
            if (name === 'fuel') return isNum(this.fuelL) ? Math.min(1, this.fuelL / (this.config.tankLitres || 65)) : demo ? 0.62 : null;
            if (name === 'range') return isNum(this.rangeKm) ? this.rangeKm : demo ? 368 : null;
            return isNum(this.ambient) ? this.ambient : demo ? 24 : null;
        }
        if (name === 'torquePct' || name === 'powerPct') {
            // the car's own sport display % while it sends one, else from the crank torque and app.json
            // config.engine's peaks (an M40i makes 500 Nm, 285 kW)
            if (Date.now() - (this.sportAt || 0) < FRESH_MS) {
                const v = name === 'powerPct' ? this.sportPower : this.sportTorque;
                if (isNum(v)) return v;
            }
            const e = this.config.engine || {}, d = this.car.data();
            if (!isNum(d.torque)) return null;
            if (name === 'torquePct') return Math.max(0, d.torque) / (e.torqueNm || 500) * 100;
            return isNum(d.rpm) ? Math.max(0, d.torque) * d.rpm / 9549 / (e.powerKw || 285) * 100 : null;
        }
        if (name.indexOf('setupLevel:') === 0) { const s = this._setup(); return s ? SETUP_LEVEL[s[name.slice(11)]] || 0 : 0; }
        const d = this.car.data();
        return Object.prototype.hasOwnProperty.call(d, name) ? d[name] : null;
    }

    /** The scale label nearest the value now: 'speed' (SPEED_SCALE index) or 'rpm' (thousands); null without data. */
    _nearMark(kind) {
        if (kind === 'rpm') { const r = this._raw('rpm'); return isNum(r) ? Math.round(r / 1000) : null; }
        const v = this._raw('speed');
        if (!isNum(v)) return null;
        const us = this.setting('units') === 'us';
        return Math.round(scaleFrac(us ? v * 0.621371 : v, SPEED_SCALE[us ? 'us' : 'metric']) * 8);
    }

    /** The setup rows for the drive mode now, or null before the car has said. */
    _setup() {
        if (!this.driveMode) return null;
        return SETUP[this.driveMode === 'sport' && this.drivePlus ? 'sportplus' : this.driveMode];
    }

    /** {{token}} -> display text. */
    _token(tok) {
        const us = this.setting('units') === 'us';
        const fix = (v, n) => (isNum(v) ? v.toFixed(n) : '--');
        switch (tok) {
            case 'speed': { const v = this._raw('speed'); return fix(isNum(v) ? (us ? v * 0.621371 : v) : v, 0); }
            case 'u:speed': return us ? 'MPH' : 'KM/H';
            case 'oil': case 'coolant': { const v = this._raw(tok); return fix(isNum(v) ? (us ? v * 9 / 5 + 32 : v) : v, 0); }
            case 'boost': { const v = this._raw('boost'); return us ? fix(isNum(v) ? v * 14.5038 : v, 1) : fix(v, 2); }
            case 'u:boost': return us ? 'PSI' : 'BAR';
            case 'u:temp': return us ? '°F' : '°C';
            case 'u:speedLc': return us ? 'mph' : 'km/h';
            case 'u:distLc': return us ? 'mi' : 'km';
            case 'range': { const v = this._raw('range'); return fix(isNum(v) ? (us ? v * 0.621371 : v) : v, 0); }
            case 'ambient': {
                const v = this._raw('ambient');
                if (!isNum(v)) return '--';
                const n = Math.round(us ? v * 9 / 5 + 32 : v);
                return (n > 0 ? '+' : '') + n;
            }
            case 'u:torque': return us ? 'lb-ft' : 'Nm';
            case 'torque': { const v = this._raw('torque'); return fix(isNum(v) ? (us ? v * 0.737562 : v) : v, 0); }
            case 'torquePct': case 'powerPct': { const v = this._raw(tok); return isNum(v) ? String(Math.min(100, Math.round(v))) : '--'; }
            case 'boostHi': return us ? '20' : '1.4';
            case 'boostMid': return us ? '10' : '0.7';
            case 'ampmLc': return this._token('ampm').toLowerCase();
            case 'gLat': case 'gLong': { const v = this._raw(tok); return isNum(v) ? Math.abs(v).toFixed(2) : '--'; }
            case 'rpm': case 'rpm10': return isNum(this.rpmShown) ? String(this.rpmShown) : (tok === 'rpm' ? '--' : '----');
            case 'shiftAt': return String(this._shift().rpm);
            case 'lastShift': return this.score.last ? String(this.score.last.rpm) : '--';
            case 'lastGears': { const l = this.score.last; return l && l.from !== '?' ? l.from + ' > ' + l.to : ''; }
            case 'verdict': return this.score.last ? this.score.last.verdict : '';
            case 'shiftPrompt': return this._shift().now ? 'SHIFT' : '';
            case 'coldNote': {
                const sp = this._shift();
                if (!sp.oilCold) return '';
                return sp.cold ? 'COLD · LIMIT ' + sp.rpm : 'OIL COLD · GO EASY';
            }
            case 'gearnum': {
                const d = this.car.data();
                if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
                return isNum(d.gear) && d.gear > 0 ? String(d.gear) : (d.gear === 0 ? 'N' : '-');
            }
            case 'stage': {          // the selector letter alone: P R N D
                const d = this.car.data();
                return d.stage || (isNum(d.gear) && d.gear > 0 ? 'D' : '-');
            }
            case 'gearInD': {        // the gear number while driving, else nothing (the M "2D")
                const d = this.car.data();
                return (d.stage === 'D' || (!d.stage && isNum(d.gear))) && isNum(d.gear) && d.gear > 0 ? String(d.gear) : '';
            }
            case 'mode': {
                if (!this.driveMode) return '';
                return this.driveMode === 'sport' ? (this.drivePlus ? 'SPORT PLUS' : 'SPORT') : this.driveMode === 'eco' ? 'ECO PRO' : 'COMFORT';
            }
            case 'gear': {
                const d = this.car.data();
                if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
                const g = isNum(d.gear) && d.gear > 0 ? String(d.gear) : '';
                return d.stage === 'D' ? 'D' + g : g;
            }
            case 'time': case 'ampm': {
                const now = this._now();
                const h = now.getHours(), m = now.getMinutes();
                if (tok === 'ampm') return this.setting('clock') === '12h' ? (h < 12 ? 'AM' : 'PM') : '';
                if (this.setting('clock') === '24h') return pad2(h) + ':' + pad2(m);
                return ((h % 12) || 12) + ':' + pad2(m);
            }
            default:
                if (tok.indexOf('spd:') === 0) { const v = SPEED_SCALE[us ? 'us' : 'metric'][Number(tok.slice(4))]; return v === undefined ? '' : String(v); }   // speed scale labels
                if (tok.indexOf('temp:') === 0) { const c = Number(tok.slice(5)); return isNum(c) ? String(us ? Math.round((c * 9 / 5 + 32) / 10) * 10 : Math.round(c)) : '--'; }   // gauge labels: °F to the 10
                if (tok.indexOf('setup:') === 0) { const s = this._setup(); return s ? s[tok.slice(6)] || '' : '--'; }
                if (tok.indexOf('signal:') === 0) { const v = this._raw(tok.slice(7)); return isNum(v) ? (Math.round(v * 10) / 10).toString() : '--'; }
                return '{{' + tok + '}}';
        }
    }

    /** Local time. config.utcOffsetMinutes overrides the unit's own time zone if that turns out wrong on the car. */
    _now() {
        const off = this.config.utcOffsetMinutes;
        if (!isNum(off)) return new Date();
        const d = new Date(Date.now() + off * 60000);
        return { getHours: () => d.getUTCHours(), getMinutes: () => d.getUTCMinutes() };
    }

    _resolve(template) { return String(template).replace(/\{\{([a-zA-Z0-9:]+)\}\}/g, (_, t) => this._token(t)); }

    /* ---------------- layers ---------------- */

    _rebuild() {
        this._guard('rebuild', () => this._rebuildInner());
        this._status();
    }

    _rebuildInner() {
        if (!this.client.ready) return; // the 'ready' handler calls us again
        this.widgets.forEach((x) => this.client.drop(x.ref));
        this.widgets.clear();
        this.layerStates.clear();
        this.refused = null;
        this.car.setRedline(this.setting('redline'));
        const name = this._layoutName();
        this.activeName = name;
        if (name === 'off') {
            this.problem = null; this.layoutTheme = null; this.needsBoost = false;
            this.log.info('off: nothing drawn, BMW\'s own ' + (this.target === 'panel' ? 'cluster' : 'HUD') + ' shows');
            return;
        }
        let layout;
        try { layout = this.layouts.load(name); } catch (e) {
            this.problem = e.message;
            this.log.warn('layout "' + name + '" unusable (' + e.message + '); showing nothing');
            return;
        }
        this.problem = null;
        this.layoutTheme = layout.theme && THEMES[layout.theme] ? layout.theme : null;
        this.themeName = this._themeName();
        this.theme = THEMES[this.themeName] || THEMES.classic;
        this.log.info('layout "' + layout.name + '", theme ' + this.theme.name + (this.layoutTheme ? '' : ' (' + this.setting('hudTheme') + ')'));
        const shown = layout.widgets.filter((w) => !(w.toggle && !this._toggleOn(w.toggle)) && !(w.themes && w.themes.indexOf(this.themeName) < 0));
        this.needsBoost = /boost/.test(JSON.stringify(shown));
        shown.forEach((w) => this._guard('widget ' + w.id, () => this._create(w)));
    }

    /** "key" is on while that bool setting is on; "!key" while it is off. */
    _toggleOn(t) {
        const not = t.charAt(0) === '!';
        const k = not ? t.slice(1) : t, eq = k.indexOf('=');
        const on = eq > 0 ? String(this.setting(k.slice(0, eq))) === k.slice(eq + 1) : this.setting(k) !== false;
        return not ? !on : on;
    }

    _create(w) {
        const base = { target: this.target, klass: w.class || 'content', z: w.z || 0, x: w.x, y: w.y, w: w.w, h: w.h };
        let ref;
        if (w.type === 'text' || w.type === 'scale' || w.type === 'stripe' || w.type === 'badge' || w.type === 'gridlabels' || w.type === 'icon') {
            ref = this.client.image(Object.assign({ iw: w.w, ih: w.h }, base));
        } else {
            ref = this.client.effect(Object.assign({ fs: shaders[w.type] }, base));
        }
        if (!ref) { this.log.warn('widget "' + w.id + '": layer refused'); return; }
        const x = { w, ref, last: null, lastPaint: 0 };
        this.widgets.set(w.id, x);
        const t = this.theme;
        if (w.type === 'gridlabels') this._paintGridLabels(x);
        else if (w.type === 'icon') this.client.pixels(ref, null, paintIcon(w.icon, w.w, w.h, color(t, w.color || 'fg')));
        else if (w.type === 'ddash') {
            const G = w.gauges, n = (i) => (Array.isArray(w.dials[i]) ? w.dials[i] : [0, 0, 0]);
            const b = (i) => (Array.isArray(w.bars[i]) ? w.bars[i] : [0, -99, 0, 1]);
            const style = { round: 0, bar: 1, digital: 2 }[this.setting(w.styleFrom || 'gaugeStyle')] || 0;
            const max = w.max || 8000;
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_tach', w.tach);
            this.client.uniform(ref, 'u_redFrom', [this.setting('redline') / max]);
            this.client.uniform(ref, 'u_ticks', [max / 1000]);
            this.client.uniform(ref, 'u_style', [style]);
            [0, 1, 2, 3].forEach((i) => { this.client.uniform(ref, 'u_d' + i, n(i)); this.client.uniform(ref, 'u_b' + i, b(i)); });
            this.client.uniform(ref, 'u_low0', (w.low && w.low[0]) || [0, -99, 0, 1]);
            this.client.uniform(ref, 'u_low1', (w.low && w.low[1]) || [0, -99, 0, 1]);
            this.client.uniform(ref, 'u_head', w.head || [-99, 0]);
            x.gauges = G;
        } else if (w.type === 'sdash') {
            const hole = w.hole && w.holeWhen && this.setting(w.holeWhen) === true ? w.hole : [0, 0, 0, 0];
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_geo', w.geo);
            this.client.uniform(ref, 'u_k', w.k);
            this.client.uniform(ref, 'u_w', [w.band]);
            this.client.uniform(ref, 'u_inner', [w.inner || w.band + 18]);
            this.client.uniform(ref, 'u_scale', w.scale || [w.geo[2], w.geo[0]]);
            this.client.uniform(ref, 'u_ticks', w.ticks);
            this.client.uniform(ref, 'u_redFrom', [this.setting('redline') / (w.rpmMax || 8000)]);
            this.client.uniform(ref, 'u_orange', [(this.setting('redline') - 700) / (w.rpmMax || 8000)]);
            this.client.uniform(ref, 'u_fade', w.fade || [600, 760]);
            this.client.uniform(ref, 'u_fuelSeg', w.fuelSeg);
            this.client.uniform(ref, 'u_oilSeg', w.oilSeg);
            this.client.uniform(ref, 'u_hole', hole);
            this.client.uniform(ref, 'u_strip', w.strip);
            this.client.uniform(ref, 'u_topEnd', [w.topEnd]);
            x.dist = 0; x.lastT = Date.now();
        } else if (w.type === 'mdash') {
            const g = w.gmeter || [0, 0, 0], L = w.gaugeL || {}, R = w.gaugeR || {};
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_card', w.card || [0, 0, 0, 0]);
            this.client.uniform(ref, 'u_panel', w.panel || [0, 0, 0, 0]);
            this.client.uniform(ref, 'u_line', w.line || [0, -99, 0, 1]);
            this.client.uniform(ref, 'u_gm', [g[0] - w.x, g[1] - w.y, g[2]]);
            this.client.uniform(ref, 'u_maxG', [w.maxG || 1.2]);
            this.client.uniform(ref, 'u_mark', w.mark || [0, 0, 0]);
            this.client.uniform(ref, 'u_red', rgb(t.hot));
            x.gauges = [['u_gaugeL', L], ['u_gaugeR', R]];
        } else if (w.type === 'mtach') {
            const max = w.max || 8000, red = this.setting('redline');
            const right = w.side === 'right';
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_side', [right ? 1 : -1]);
            this.client.uniform(ref, 'u_geoA', [w.y0 - w.y, w.y8 - w.y, w.ym - w.y, right ? w.x + w.w - w.xm : w.xm - w.x]);
            this.client.uniform(ref, 'u_geoB', [w.kTop, w.kBot, w.round || 40]);
            this.client.uniform(ref, 'u_wid', [w.wBot, w.wTop, w.wBend || 0]);
            this.client.uniform(ref, 'u_ticks', [max / 1000]);
            this.client.uniform(ref, 'u_orange', [(red - 700) / max]);
            this.client.uniform(ref, 'u_redFrom', [red / max]);
            this.client.uniform(ref, 'u_red', rgb(t.hot));
        }
        else if (w.type === 'grid') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_step', [w.step || 50]);
            this.client.uniform(ref, 'u_major', [w.major || 2]);
            this.client.uniform(ref, 'u_minor', rgba([255, 255, 255, 90]));
            this.client.uniform(ref, 'u_majorC', rgba([0, 255, 140, 255]));
        } else if (w.type === 'stripe') this._paintStripe(x);
        else if (w.type === 'scale') this._paintScale(x);
        else if (w.type === 'shiftbar') {
            const max = this._barMax(), red = this.setting('redline');
            const midAt = t.bar.midAt === 'shift' ? (red - 1500) / max : t.bar.midAt;
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_segs', [w.segments || 40]);
            this.client.uniform(ref, 'u_low', rgb(t.bar.low));
            this.client.uniform(ref, 'u_mid', rgb(t.bar.mid));
            this.client.uniform(ref, 'u_high', rgb(t.bar.high));
            this.client.uniform(ref, 'u_midAt', [midAt]);
            this.client.uniform(ref, 'u_highAt', [(red - 500) / max]);
            this.client.uniform(ref, 'u_track', rgba(t.track));
            this.client.uniform(ref, 'u_flash', [0]);
        } else if (w.type === 'arc') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_color', rgb(color(t, w.color || 'arc')));
            this.client.uniform(ref, 'u_track', rgba(t.track));
            this.client.uniform(ref, 'u_width', [w.width || 7]);
            this.client.uniform(ref, 'u_start', [(w.start === undefined ? 225 : w.start) * Math.PI / 180]);
            this.client.uniform(ref, 'u_sweep', [(w.sweep === undefined ? 270 : w.sweep) * Math.PI / 180]);
        } else if (w.type === 'segbar') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_segs', [w.max]);
            this.client.uniform(ref, 'u_on', rgba(color(t, w.color || 'hot')));
            this.client.uniform(ref, 'u_offC', rgba(color(t, 'track')));
            this.client.uniform(ref, 'u_slant', [w.slant || 0]);
        } else if (w.type === 'revbar') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_top', [w.top || 8]);
            this.client.uniform(ref, 'u_barH', [w.barH]);
            this.client.uniform(ref, 'u_slant', [w.slant || 12]);
            this.client.uniform(ref, 'u_max', [this._barMax(w)]);
            this.client.uniform(ref, 'u_red', [this.setting('redline')]);
            this.client.uniform(ref, 'u_from', rgb(t.rev.from));
            this.client.uniform(ref, 'u_to', rgb(t.rev.to));
            this.client.uniform(ref, 'u_hot', rgb(t.hot));
            this.client.uniform(ref, 'u_track', rgba(t.track));
            this.client.uniform(ref, 'u_tick', rgba(t.dim));
            this.client.uniform(ref, 'u_fg', rgba(t.fg));
        } else if (w.type === 'lights') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_n', [w.count || 12]);
            this.client.uniform(ref, 'u_tail', [w.tail || 0]);
            this.client.uniform(ref, 'u_round', [w.round ? 1 : 0]);
            this.client.uniform(ref, 'u_green', rgb(LIGHTS.green));
            this.client.uniform(ref, 'u_yellow', rgb(LIGHTS.yellow));
            this.client.uniform(ref, 'u_red', rgb(LIGHTS.red));
            this.client.uniform(ref, 'u_blue', rgb(LIGHTS.blue));
            this.client.uniform(ref, 'u_off', [w.off === undefined ? 0.14 : w.off]);
        } else if (w.type === 'fill') {
            const h = w.hole && w.holeWhen && this.setting(w.holeWhen) === true ? w.hole : null;
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_color', rgba(color(t, w.color || 'bg')));
            this.client.uniform(ref, 'u_hole', h ? [h[0] - w.x, h[1] - w.y, h[2], h[3]] : [0, 0, 0, 0]);
            this.client.uniform(ref, 'u_holeR', [w.holeRadius || 0]);
        } else if (w.type === 'box') {
            this.client.uniform(ref, 'u_size', [w.w, w.h]);
            this.client.uniform(ref, 'u_fill', rgba(color(t, w.fill || 'panel')));
            this.client.uniform(ref, 'u_line', rgba(color(t, w.line || 'line')));
            this.client.uniform(ref, 'u_head', rgba(color(t, w.headColor || 'head')));
            this.client.uniform(ref, 'u_headH', [w.head || 0]);
            this.client.uniform(ref, 'u_border', [w.border === undefined ? 2 : w.border]);
            this.client.uniform(ref, 'u_radius', [w.radius || 0]);
        }
        this._update(x, Date.now(), true);
    }

    _tick() {
        const now = Date.now();
        this._smoothRpm(now);
        if (!this.client.ready) return;
        // shift light: blink the whole bar at 8 Hz once the rpm reaches the redline
        const rpm = this._raw('rpm');
        const flashing = isNum(rpm) && rpm >= this.setting('redline') - 150;
        this.flash = flashing ? Math.floor(now / 62.5) % 2 === 0 : false;
        this.widgets.forEach((x) => this._guard('widget ' + x.w.id, () => this._update(x, now, false)));
    }

    /** BMW-like tach: a 120 ms filter, and a readout that moves in 50 rpm steps, only by 40 rpm or more. */
    _smoothRpm(now) {
        const raw = this.car.data().rpm;
        const dt = this.lastTickT ? Math.min(500, now - this.lastTickT) : 0;
        this.lastTickT = now;
        if (!isNum(raw)) { this.rpmF = null; this.rpmShown = null; return; }
        this.rpmF = isNum(this.rpmF) ? this.rpmF + (raw - this.rpmF) * (1 - Math.exp(-dt / 120)) : raw;
        if (!isNum(this.rpmShown) || Math.abs(this.rpmF - this.rpmShown) >= 40) this.rpmShown = Math.max(0, Math.round(this.rpmF / 50) * 50);
    }

    _update(x, now, force) {
        const w = x.w;
        if (w.type === 'text') {
            if (!force && now - x.lastPaint < (w.rate || TEXT_MS)) return;
            const s = this._resolve(w.text);
            let role = w.color || 'fg';
            if (w.colorBy === 'verdict' && this.score.last) role = VERDICT[this.score.last.verdict] || role;
            if (w.near && this._nearMark(w.near[0]) === w.near[1]) role = w.nearColor || 'fg';
            if (w.hotWhen || w.coldWhen) {
                const sp = this._shift();
                if (w.coldWhen && sp[w.coldWhen]) role = VERDICT.COLD;
                if (w.hotWhen && sp[w.hotWhen]) role = 'hot';
            }
            const key = s + '|' + role;
            if (!force && key === x.last) return;
            x.last = key; x.lastPaint = now;
            const buf = textRaster.drawText(w.w, w.h, s, {
                font: w.font, color: color(this.theme, role), align: w.align, spacing: w.spacing,
                color2: w.color2 && role !== 'hot' ? color(this.theme, w.color2) : null,
                glow: w.glow ? this.theme.glow : 0,
            });
            this.client.pixels(x.ref, null, buf);
        } else if (w.type === 'badge') {
            if (!force && now - x.lastPaint < TEXT_MS) return;
            const s = this._resolve(w.text);
            let tone = VERDICT.COLD, fresh = false;
            if (w.tone === 'verdict' && this.score.last) {
                tone = VERDICT[this.score.last.verdict] || this.theme.fg;
                fresh = now - this.score.last.at < 2500;
            }
            const key = s + '|' + tone + '|' + fresh;
            if (!force && key === x.last) return;
            x.last = key; x.lastPaint = now;
            this.client.pixels(x.ref, null, this._paintBadge(w, s, tone, fresh));
        } else if (w.type === 'shiftbar') {
            const rpm = this._raw('rpm');
            const segs = w.segments || 40;
            const v = isNum(rpm) ? Math.min(1, Math.max(0, rpm / this._barMax())) : 0;
            const q = Math.round(v * segs * 2) / (segs * 2);        // only resend on half-segment steps
            const key = q + (this.flash ? 'f' : '');
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_value', [q]);
            this.client.uniform(x.ref, 'u_flash', [this.flash ? 1 : 0]);
        } else if (w.type === 'arc') {
            const raw = this._raw(w.signal);
            const v = isNum(raw) ? Math.min(1, Math.max(0, (raw - w.min) / (w.max - w.min))) : 0;
            const q = Math.round(v * 200) / 200;
            if (!force && q === x.last) return;
            x.last = q;
            this.client.uniform(x.ref, 'u_value', [q]);
        } else if (w.type === 'sdash') {
            const us = this.setting('units') === 'us';
            const sp = this._raw('speed'), rpm = this._raw('rpm'), fuel = this._raw('fuel'), oil = this._raw('oil');
            const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 500) / 500;
            const vals = [
                q(isNum(sp) ? scaleFrac(us ? sp * 0.621371 : sp, SPEED_SCALE[us ? 'us' : 'metric']) : 0),
                q(isNum(rpm) ? rpm / (w.rpmMax || 8000) : 0),
                q(isNum(fuel) ? fuel : 0),
                q(isNum(oil) ? (oil - 50) / 100 : 0),
            ];
            // lane dashes move with the car: one dash cycle per 9 m
            const dt = Math.min(0.5, (now - x.lastT) / 1000); x.lastT = now;
            if (isNum(sp)) x.dist += sp / 3.6 * dt;
            const dash = this.setting(w.holeWhen) === true ? 0 : Math.round(((x.dist / 9) % 1) * 100) / 100;
            const key = vals.join('|') + '|' + dash;
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_speed', [vals[0]]);
            this.client.uniform(x.ref, 'u_rpm', [vals[1]]);
            this.client.uniform(x.ref, 'u_fuel', [vals[2]]);
            this.client.uniform(x.ref, 'u_oil', [vals[3]]);
            this.client.uniform(x.ref, 'u_dash', [dash]);
        } else if (w.type === 'ddash') {
            const rpm = this._raw('rpm'), sp = this._shift();
            const q = (v, n) => Math.round(Math.min(1, Math.max(0, v)) * n) / n;
            const vals = x.gauges.map((G) => { const v = this._raw(G.signal); return isNum(v) ? q((v - G.min) / (G.max - G.min), 200) : 0; });
            const fuel = this._raw('fuel'), cool = this._raw('coolant');
            const lows = [isNum(cool) ? q((cool - 50) / 80, 200) : 0, isNum(fuel) ? q(fuel, 200) : 0];
            const r = isNum(rpm) ? q(rpm / (w.max || 8000), 1000) : 0;
            const key = r + '|' + sp.now + '|' + vals.join('|') + '|' + lows.join('|');
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_rpm', [r]);
            this.client.uniform(x.ref, 'u_shiftNow', [sp.now ? 1 : 0]);
            this.client.uniform(x.ref, 'u_vals', vals);
            this.client.uniform(x.ref, 'u_lowVals', lows);
        } else if (w.type === 'mdash') {
            const lat = this._raw('gLat'), lon = this._raw('gLong');
            const g = [isNum(lat) ? Math.round(lat * 100) / 100 : 0, isNum(lon) ? -Math.round(lon * 100) / 100 : 0];
            const vals = x.gauges.map(([u, G]) => {
                const v = G.signal ? this._raw(G.signal) : null;
                return [u, G, isNum(v) ? Math.round(Math.min(1, Math.max(0, (v - G.min) / (G.max - G.min))) * 200) / 200 : 0];
            });
            const key = g.join('|') + '|' + vals.map((v) => v[2]).join('|');
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_g', g);
            vals.forEach(([u, G, v]) => this.client.uniform(x.ref, u, [G.cx || 0, G.cy || 0, G.r || 0, v]));
        } else if (w.type === 'mtach') {
            const rpm = this._raw('rpm'), sp = this._shift();
            const v = isNum(rpm) ? Math.min(1, Math.max(0, rpm / (w.max || 8000))) : 0;
            const key = Math.round(v * 600) + '|' + sp.now;
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_value', [v]);
            this.client.uniform(x.ref, 'u_shiftNow', [sp.now ? 1 : 0]);
        } else if (w.type === 'segbar') {
            const v = this._raw(w.signal);
            const lit = isNum(v) ? Math.max(0, Math.min(w.max, Math.round(v))) : 0;
            if (!force && lit === x.last) return;
            x.last = lit;
            this.client.uniform(x.ref, 'u_lit', [lit]);
        } else if (w.type === 'revbar') {
            const rpm = this._raw('rpm'), sp = this._shift();
            const v = isNum(rpm) ? Math.round(Math.max(0, rpm) / 10) * 10 : 0;
            const peak = Math.round(this.score.peak / 10) * 10;
            const key = v + '|' + sp.rpm + '|' + peak + '|' + sp.now;
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_value', [v]);
            this.client.uniform(x.ref, 'u_shift', [sp.rpm]);
            this.client.uniform(x.ref, 'u_peak', [peak]);
            this.client.uniform(x.ref, 'u_shiftNow', [sp.now ? 1 : 0]);
        } else if (w.type === 'lights') {
            const rpm = this._raw('rpm'), sp = this._shift(), n = w.count || 12;
            const lit = isNum(rpm) ? Math.floor(Math.min(1, Math.max(0, (rpm - (sp.rpm - 2000)) / 2000)) * n) : 0;
            const key = lit + '|' + sp.now;
            if (!force && key === x.last) return;
            x.last = key;
            this.client.uniform(x.ref, 'u_lit', [lit]);
            this.client.uniform(x.ref, 'u_strobe', [sp.now ? 1 : 0]);
        }
    }

    /** A rounded tag: fill in the tone colour (bright for a fresh grade), text centred on it. Empty text: nothing. */
    _paintBadge(w, s, tone, fresh) {
        const W = w.w, H = w.h, buf = Buffer.alloc(W * H * 4, 0);
        if (!s) return buf;
        const r = Math.min(6, H / 2), fillA = fresh ? 0.45 : 0.2;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                // rounded-rect coverage, 1 px soft edge
                const qx = Math.max(Math.abs(x + 0.5 - W / 2) - (W / 2 - r), 0), qy = Math.max(Math.abs(y + 0.5 - H / 2) - (H / 2 - r), 0);
                const cov = Math.min(1, Math.max(0, r + 0.5 - Math.sqrt(qx * qx + qy * qy)));
                if (cov <= 0) continue;
                const o = (y * W + x) * 4;
                buf[o] = tone[0]; buf[o + 1] = tone[1]; buf[o + 2] = tone[2]; buf[o + 3] = Math.round(255 * fillA * cov);
            }
        }
        const font = textRaster.loadFont(w.font);
        const ty = Math.round((H - font.metrics.cellHeight) / 2);
        const m = textRaster.mask(W, H, s, { font: w.font, align: 'center', spacing: w.spacing, offsetY: ty });
        const tc = fresh ? this.theme.fg : tone;
        for (let i = 0; i < m.length; i++) {
            if (!m[i]) continue;
            const a = m[i] / 255, o = i * 4, ba = buf[o + 3] / 255;
            const outA = a + ba * (1 - a);
            for (let c = 0; c < 3; c++) buf[o + c] = Math.round((tc[c] * a + buf[o + c] * ba * (1 - a)) / outA);
            buf[o + 3] = Math.round(outA * 255);
        }
        return buf;
    }

    /** "x/y" at every step, uploaded as small rects (not the whole, mostly empty, image). */
    _paintGridLabels(x) {
        const w = x.w, W = w.w, H = w.h, step = w.step || 100, font = w.font;
        const cell = textRaster.loadFont(font).metrics.cellHeight;
        const rects = [], parts = [];
        for (let gy = 0; gy < H; gy += step) {
            for (let gx = 0; gx < W; gx += step) {
                const label = (w.x + gx) + '/' + (w.y + gy);
                const lw = Math.min(W - gx - 2, textRaster.measure(label, font, 0) + 2);
                const lh = Math.min(H - gy - 2, cell);
                if (lw <= 0 || lh <= 0) continue;
                const buf = textRaster.drawText(lw, lh, label, { font, color: [255, 230, 0, 255] });
                rects.push({ x: gx + 2, y: gy + 2, w: lw, h: lh });
                parts.push(buf);
            }
        }
        this.client.pixels(x.ref, rects, Buffer.concat(parts));
    }

    _paintStripe(x) {
        const w = x.w, buf = Buffer.alloc(w.w * w.h * 4, 0);
        for (let px = 0; px < w.w; px++) {
            const c = M_STRIPE[Math.min(2, Math.floor(px * 3 / w.w))];
            for (let py = 0; py < w.h; py++) c.forEach((v, i) => { buf[(py * w.w + px) * 4 + i] = v; });
        }
        this.client.pixels(x.ref, null, buf);
    }

    _paintScale(x) {
        const w = x.w, n = this._barMax(w) / 1000 + 1, red = this.setting('redline');
        const m = Buffer.alloc(w.w * w.h, 0), hot = Buffer.alloc(w.w * w.h, 0);
        for (let i = 0; i < n; i++) {
            const label = String(i);
            const lw = textRaster.measure(label, w.font, 0);
            const cx = i / (n - 1) * w.w;
            const left = Math.round(Math.max(0, Math.min(w.w - lw, cx - lw / 2)));
            const one = textRaster.mask(w.w, w.h, label, { font: w.font, x: left });
            const into = w.redFrom && i * 1000 >= red ? hot : m;
            for (let k = 0; k < m.length; k++) if (one[k] > into[k]) into[k] = one[k];
        }
        const buf = textRaster.tint(m, w.w, w.h, { color: color(this.theme, w.color || 'dim'), font: w.font });
        if (w.redFrom) {
            const hb = textRaster.tint(hot, w.w, w.h, { color: this.theme.hot, font: w.font });
            for (let k = 0; k < hot.length; k++) if (hot[k]) hb.copy(buf, k * 4, k * 4, k * 4 + 4);
        }
        this.client.pixels(x.ref, null, buf);
    }
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

module.exports = HudApp;
