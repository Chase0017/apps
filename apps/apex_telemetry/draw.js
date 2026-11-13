'use strict';
/**
 * draw.js - Apex Telemetry's page: a GT3 pit board on the centre screen, 1600 x 520 logical px (the kit's page).
 *
 *   BOOST CONTROL (left)   TYRES (middle)                         CAR (right)
 *   actual target dev.     FL box   [car, wheels lit by temp]  FR   gearbox outside range
 *   [bar: actual, target]  RL box                              RR   intercooler (before, after, drop, soak)
 *   rail fuel  low fuel                                             g-force (lat, long, peaks)
 *
 * Nothing the Apex Cluster dash already shows. Black, white boxes with a white header strip and dark text on it
 * (Apex Cluster's look), Barlow Condensed numbers (the kit font family 'race', tools/bake_kit_font.py).
 * Colours: yellow = warning, red = near critical (limits in LIM, app.json config._comment); blue = cold.
 *
 * Pure: draw(cv, snap, opt) uses only the kit canvas calls (fillRect, roundRect, strokeRoundRect, gradientRect,
 * circle, text, textWidth), so tools/telemetry-preview/ runs this same file in a browser.
 *   snap: Telemetry.snapshot() (SI units; s.held: the values the car stopped sending, drawn with "!" after them)   opt: { us (mph, mi), tempF (°F), psi, tyreWarn (C), tyreHot (C), tyreLow / tyreOver /
 *         tyreOverRed (psi off the target), box ({ box, ink }: the box colour), slots ([5 SLOTS ids]), frame(cv, badges), target(cb),
 *         why(name): what the engine unit answered for config.dme[name], shown in a box without a value }
 */
(function (root) {
    const W = 1600, TOP = 52, BOTTOM = 512;
    const C = {
        bg: '#050607', line: '#ffffff', head: '#ffffff', ink: '#0b0d10', text: '#ffffff', dim: '#9aa0a8', faint: '#ffffff1f',
        cold: '#4aa3ff', ok: '#3ddc84', warm: '#ffd60a', hot: '#ff3b30', body: '#14171c', track: '#1c2027', mark: '#e9f2ff',
    };
    const F = { font: 'race', literal: true };
    const isNum = (x) => typeof x === 'number' && isFinite(x);
    const HEAD = 30;
    // warning (yellow) / near critical (red) limits, SI units
    const LIM = {
        boostOff: 0.207, boostHold: 750, boostFrom: 0.2, // red when 3 psi off target for 0.75 s (spool-up lag isn't a fault), while the target is over boostFrom bar
        lpfp: [4.0, 3.0], hpfp: [25, 15],            // bar, low = bad (engine running)
        gearbox: [110, 125], range: [80, 40],        // C high = bad; km low = bad
        ice: 3,                                      // C
        icAfter: [50, 60], icSoak: [20, 30],          // C: air after the intercooler; after minus outside (heat soak)
        cold: { gearbox: 40, ambient: 3, icAfter: 10 }, // C: blue (cold) below these
        tyreLow: 0.207, tyreHigh: [0.207, 0.345],    // bar against the car's target: blue 3 psi under, yellow 3 / red 5 psi over
    };
    const high = (v, l) => (!isNum(v) ? null : v >= l[1] ? C.hot : v >= l[0] ? C.warm : null);
    const low = (v, l) => (!isNum(v) ? null : v < l[1] ? C.hot : v < l[0] ? C.warm : null);
    const cold = (v, below) => (isNum(v) && v < below ? C.cold : null);

    /*
     * What a small box (a slot, setting tBox1..5) can show: id -> { name, head, cat, dme (the config.dme value it needs),
     * get(s, u) -> [value text, unit, colour, line under it] }. u: { sp, tf, ps, running }.
     */
    const PS = (v, u, d) => (isNum(v) ? (u.ps ? fmt(v * 14.5038, d[0]) : fmt(v, d[1])) : '--');
    const TT = (c, u) => (isNum(c) ? fmt(u.tf ? c * 9 / 5 + 32 : c, 0) + '°' : '--');
    const SLOTS = {
        gearbox: { name: 'Gearbox oil', head: 'TRANS', cat: 'Temps', dme: 'egs', get: (s, u) => { const gc = cold(s.gearbox, LIM.cold.gearbox); return [TT(s.gearbox, u), U.temp(u.tf), high(s.gearbox, LIM.gearbox) || gc, gc ? 'WARMING UP' : 'GEARBOX', gc]; } },
        ambient: { name: 'Outside', head: 'OUTSIDE', cat: 'Temps', get: (s, u) => { const ice = isNum(s.ambient) && s.ambient <= LIM.ice; return [TT(s.ambient, u), U.temp(u.tf), ice ? C.cold : null, ice ? 'ICE POSSIBLE' : '', C.warm]; } },
        coolant: { name: 'Coolant', head: 'COOLANT', cat: 'Temps', get: (s, u) => [TT(s.coolant, u), U.temp(u.tf), high(s.coolant, [113, 120]) || cold(s.coolant, 40), ''] },
        oil: { name: 'Oil temperature', head: 'OIL TEMP', cat: 'Temps', get: (s, u) => { const oc = cold(s.oil, 70); return [TT(s.oil, u), U.temp(u.tf), high(s.oil, [125, 135]) || oc, oc ? 'WARMING UP' : '', oc]; } },
        intake: { name: 'Intake air', head: 'INTAKE', cat: 'Temps', dme: 'intake', get: (s, u) => [TT(s.intake, u), U.temp(u.tf), high(s.intake, LIM.icAfter), 'AFTER THE INTERCOOLER'] },
        range: { name: 'Range', head: 'RANGE', cat: 'Fuel', get: (s, u) => [isNum(s.rangeKm) ? fmt(u.sp ? s.rangeKm / 1.609344 : s.rangeKm, 0) : '--', u.sp ? 'MI' : 'KM', low(s.rangeKm, LIM.range), ''] },
        fuel: { name: 'Fuel level', head: 'FUEL', cat: 'Fuel', get: (s, u) => [isNum(s.fuelL) ? (u.sp ? fmt(s.fuelL / 3.78541, 1) : fmt(s.fuelL, 0)) : '--', u.sp ? 'GAL' : 'L', low(s.fuelL, [9, 5]), ''] },
        hpfp: { name: 'Fuel rail', head: 'FUEL RAIL', cat: 'Fuel', dme: 'hpfp', get: (s, u) => [PS(s.hpfp, u, [0, 0]), U.press(u.ps), u.running ? low(s.hpfp, LIM.hpfp) : null, 'HIGH PRESSURE'] },
        lpfp: { name: 'Low fuel pressure', head: 'LOW FUEL', cat: 'Fuel', dme: 'lpfp', get: (s, u) => [PS(s.lpfp, u, [0, 1]), U.press(u.ps), u.running ? low(s.lpfp, LIM.lpfp) : null, 'LOW PRESSURE PUMP'] },
        oilP: { name: 'Oil pressure', head: 'OIL PRESS', cat: 'Engine', dme: 'oilPressure', get: (s, u) => [PS(s.oilP, u, [0, 1]), U.press(u.ps), u.running ? low(s.oilP, [1.0, 0.5]) : null, ''] },
        afr: { name: 'Air-fuel ratio', head: 'AFR', cat: 'Engine', dme: 'afr', get: (s) => [fmt(s.afr, 1), '', isNum(s.afr) && s.afr > 15.5 && isNum(s.boost) && s.boost > 0.3 ? C.hot : null, isNum(s.afr) ? 'LAMBDA ' + (s.afr / 14.7).toFixed(2) : ''] },
        timing: { name: 'Ignition timing', head: 'TIMING', cat: 'Engine', dme: 'timing', get: (s) => [isNum(s.timing) ? fmt(s.timing, 1) + '°' : '--', 'BTDC', null, ''] },
        load: { name: 'Engine load', head: 'LOAD', cat: 'Engine', get: (s) => [fmt(s.loadActual, 0), '%', null, isNum(s.loadTarget) ? 'TARGET ' + fmt(s.loadTarget, 0) + ' %' : ''] },
        boost: { name: 'Boost', head: 'BOOST', cat: 'Engine', get: (s, u) => [PS(s.boost, u, [1, 2]), U.press(u.ps), null, ''] },
        rpm: { name: 'Engine speed', head: 'RPM', cat: 'Engine', get: (s) => [isNum(s.rpm) ? String(Math.round(s.rpm / 10) * 10) : '--', '', null, ''] },
        speed: { name: 'Speed', head: 'SPEED', cat: 'Chassis', get: (s, u) => [isNum(s.speed) ? fmt(u.sp ? s.speed * 0.621371 : s.speed, 0) : '--', u.sp ? 'MPH' : 'KM/H', null, ''] },
        gLat: { name: 'Lateral g', head: 'LAT G', cat: 'Chassis', get: (s) => [isNum(s.gLat) ? Math.abs(s.gLat).toFixed(2) : '--', 'G', null, ''] },
    };
    const SLOT_DEFAULTS = ['gearbox', 'ambient', 'range', 'hpfp', 'lpfp'];
    const SLOT_WHERE = ['Top right, left', 'Top right, middle', 'Top right, right', 'Bottom left', 'Bottom left, right'];

    /* ---------- units ---------- */
    const fmt = (v, d) => (isNum(v) ? v.toFixed(d) : '--');
    /** "!" after a held value (the car stopped sending it: Telemetry.snapshot() s.held), nothing after a dash */
    const bang = (txt, held) => (held && txt !== '--' ? txt + '!' : txt);
    // the snapshot value each small box shows (s.held)
    const SLOT_SRC = { gearbox: 'gearbox', ambient: 'ambient', coolant: 'coolant', oil: 'oil', intake: 'intake', range: 'rangeKm', fuel: 'fuelL',
        hpfp: 'hpfp', lpfp: 'lpfp', oilP: 'oilP', afr: 'afr', timing: 'timing', load: 'loadActual', boost: 'boost', rpm: 'rpm', speed: 'speed', gLat: 'gLat' };
    const temp = (c, us) => (isNum(c) ? (us ? c * 9 / 5 + 32 : c) : null);
    const U = {
        temp: (us) => (us ? '°F' : '°C'),
        press: (us) => (us ? 'PSI' : 'BAR'),
    };

    /* ---------- pieces ---------- */
    function box(cv, x, y, w, h, label, unit) {
        cv.roundRect(x, y, w, h, 5, C.line);
        cv.roundRect(x + 2, y + HEAD, w - 4, h - HEAD - 2, 3, C.bg);
        cv.text(label, x + 12, y + 22, 22, C.ink, F);
        if (unit) cv.text(unit, x + w - 12, y + 22, 22, C.ink, Object.assign({ align: 'right' }, F));
    }
    /** a readout box: header, a big number right-aligned, an optional line under it */
    function readout(cv, x, y, w, h, label, unit, value, color, sub, subColor) {
        box(cv, x, y, w, h, label, unit);
        const base = value.length > 5 ? 64 : 72, room = w - 28, tw = cv.textWidth(value, base, F);
        const size = tw > room ? Math.max(40, base * room / tw) : base;
        cv.text(value, x + w - 14, y + HEAD + (sub ? 70 : 84), size, color || C.text, Object.assign({ align: 'right' }, F));
        if (sub) {
            const room = w - 24, RA = Object.assign({ align: 'right' }, F), fit = (t, max) => Math.min(max, max * room / Math.max(1, cv.textWidth(t, max, F)));
            const parts = sub.split(', ');
            if (fit(sub, 22) >= 16 || parts.length < 2) cv.text(sub, x + w - 14, y + h - 12, Math.max(16, fit(sub, 22)), subColor || C.dim, RA);
            else {
                // a long note (what the engine unit answered): two lines
                const half = Math.ceil(parts.length / 2), l1 = parts.slice(0, half).join(', '), l2 = parts.slice(half).join(', ');
                const sz = Math.max(12, Math.min(fit(l1, 16), fit(l2, 16)));
                cv.text(l1, x + w - 14, y + h - 12 - sz - 2, sz, subColor || C.dim, RA);
                cv.text(l2, x + w - 14, y + h - 12, sz, subColor || C.dim, RA);
            }
        }
    }

    /** a tyre temperature: no colour while fine, yellow from tyreWarn, red from tyreHot (nothing for cold) */
    function tyreState(c, opt) {
        if (!isNum(c)) return null;
        return c >= opt.tyreHot ? C.hot : c >= opt.tyreWarn ? C.warm : null;
    }
    /** a tyre pressure against the car's target: no colour while fine, blue 3 psi under, yellow 3 / red 5 psi over */
    function tyreOff(p, target) {
        if (!isNum(p) || !isNum(target)) return null;
        const d = p - target;
        return d <= -LIM.tyreLow ? C.cold : high(d, LIM.tyreHigh);
    }
    function pressState(p, target) { return tyreOff(p, target) || C.text; }

    function tyreBox(cv, x, y, w, h, name, t, partner, opt, right) {
        const ps = opt.psi, tf = opt.tempF;
        box(cv, x, y, w, h, name, U.press(ps));
        const sc = tyreState(t.t, opt);
        // the temperature stripe on the side towards the car, only while it is warm or hot
        if (sc) cv.fillRect(right ? x + 2 : x + w - 10, y + HEAD, 8, h - HEAD - 2, sc);
        const pv = bang(isNum(t.p) ? (ps ? fmt(t.p * 14.5038, 1) : fmt(t.p, 2)) : '--', t.heldP);
        const px = right ? x + w - 16 : x + w - 22;
        cv.text(pv, px, y + HEAD + 98, 96, pressState(t.p, t.target), Object.assign({ align: 'right' }, F));
        // temperature (left) and the difference to target (right)
        const tl = right ? x + 22 : x + 14;
        cv.text(bang(isNum(t.t) ? fmt(temp(t.t, tf), 0) + U.temp(tf) : '--', t.heldT), tl, y + h - 16, 44, sc || (isNum(t.t) ? C.text : C.dim), F);
        const target = isNum(t.target) ? t.target : null;
        let delta = '', dc = C.dim;
        if (isNum(t.p) && target !== null) {
            const d = t.p - target, dv = ps ? d * 14.5038 : d;
            delta = (dv >= 0 ? '+' : '') + (ps ? dv.toFixed(1) : dv.toFixed(2));
            dc = pressState(t.p, target);
        } else if (isNum(t.p) && isNum(partner)) {
            const d = Math.abs(t.p - partner);
            if (d >= LIM.tyreHigh[0]) { delta = 'UNEVEN'; dc = d >= LIM.tyreHigh[1] ? C.hot : C.warm; }
        }
        if (delta) {
            cv.text(delta, px, y + h - 16, 32, dc, Object.assign({ align: 'right' }, F));
            cv.text(target !== null ? 'VS TARGET' : 'VS OTHER SIDE', px, y + h - 50, 16, C.dim, Object.assign({ align: 'right' }, F));
        }
    }

    /** a small box showing slot sensor `id` (SLOTS); its sub line says what the engine unit answered while it has no value */
    function slotBox(cv, x, y, w, h, id, s, u, why) {
        const sn = SLOTS[id] || SLOTS.gearbox, r = sn.get(s, u), none = r[0] === '--';
        r[0] = bang(r[0], (s.held || {})[SLOT_SRC[id] || id]);
        const note = none && sn.dme ? why(null, sn.dme) : '';
        readout(cv, x, y, w, h, sn.head, r[1], r[0], r[2], note || r[3], note ? C.dim : r[4]);
    }

    /** the car from above, wheels lit while their tyre is warm or hot */
    function car(cv, cx, top, bottom, s, opt) {
        const bw = 120, x = cx - bw / 2, h = bottom - top;
        cv.roundRect(x, top, bw, h, 46, '#2a2f37');
        cv.roundRect(x + 4, top + 4, bw - 8, h - 8, 42, C.body);
        // glass
        cv.roundRect(x + 16, top + h * 0.26, bw - 32, h * 0.13, 10, '#2b3442');
        cv.roundRect(x + 18, top + h * 0.66, bw - 36, h * 0.09, 8, '#2b3442');
        cv.roundRect(x + 14, top + h * 0.41, bw - 28, h * 0.23, 8, '#1b2027');
        const ww = 26, wh = 74, fy = top + h * 0.12, ry = top + h * 0.70;
        [['FL', x - ww + 4, fy], ['FR', x + bw - 4, fy], ['RL', x - ww + 4, ry], ['RR', x + bw - 4, ry]].forEach(([k, wx, wy]) => {
            const c = tyreState((s.tyres[k] || {}).t, opt) || '#3a414b';
            cv.roundRect(wx, wy, ww, wh, 7, c);
            cv.roundRect(wx + 4, wy + 6, ww - 8, wh - 12, 4, '#0b0d10aa');
        });
    }

    /** boost against its target: the three numbers, a bar with the target marked, the peak and what it means */
    let boostOffSince = 0;     // since when boost has been off target (0: it isn't)
    function boostPanel(cv, x, y, w, h, s, us) {     // us: psi
        box(cv, x, y, w, h, 'BOOST CONTROL', U.press(us));
        const k = us ? 14.5038 : 1, dp = us ? 1 : 2, a = s.boost, t = s.boostTarget;
        const on = isNum(t) && t > LIM.boostFrom, dev = isNum(a) && isNum(t) ? a - t : null;
        // white while fine, red while off target for longer than a spool-up takes
        const off = on && isNum(dev) && Math.abs(dev) >= LIM.boostOff, now = Date.now();
        if (!off) boostOffSince = 0; else if (!boostOffSince) boostOffSince = now;
        const bad = off && now - boostOffSince >= LIM.boostHold;
        const dc = bad ? C.hot : on && isNum(dev) ? C.text : C.dim;
        const cw = (w - 28) / 3, R = Object.assign({ align: 'right' }, F);
        const hd = s.held || {};
        [['ACTUAL', bang(fmt(isNum(a) ? a * k : null, dp), hd.boost), C.text], ['TARGET', bang(fmt(isNum(t) ? t * k : null, dp), hd.boostTarget), C.mark],
            ['DEVIATION', bang(isNum(dev) ? (dev >= 0 ? '+' : '') + (dev * k).toFixed(dp) : '--', hd.boost || hd.boostTarget), dc]].forEach(([l, v, c], i) => {
            const cx = x + 14 + cw * (i + 1) - 8;
            cv.text(l, cx, y + HEAD + 26, 18, C.dim, R);
            cv.text(v, cx, y + HEAD + 92, us ? 64 : 54, c, R);     // bar has two decimals
        });
        // the bar: 0 .. max, actual filled (red while off target), the target a tall tick
        const max = us ? 25 / 14.5038 : 1.75, bx = x + 16, bw = w - 32, by = y + HEAD + 118, bh = 34;
        const X = (v) => bx + bw * Math.max(0, Math.min(1, v / max));
        cv.roundRect(bx, by, bw, bh, 4, C.track);
        if (isNum(a) && a > 0) cv.roundRect(bx, by, Math.max(8, X(a) - bx), bh, 4, bad ? C.hot : C.text);
        if (isNum(t) && t > 0) cv.fillRect(X(t) - 2, by - 8, 4, bh + 16, C.mark);
        const ticks = us ? [0, 5, 10, 15, 20, 25] : [0, 0.5, 1, 1.5];
        ticks.forEach((v, i) => {
            const tx = X(v / k);
            cv.fillRect(tx - 0.5, by + bh + 4, 1, 8, C.dim);
            cv.text(String(v), tx, by + bh + 30, 18, C.dim, Object.assign({ align: i === 0 ? 'left' : i === ticks.length - 1 && !us ? 'center' : i === ticks.length - 1 ? 'right' : 'center' }, F));
        });
        // the word for it, and the peak
        let word = 'OFF BOOST', wc = C.dim;
        if (on && isNum(dev)) {
            word = !bad ? 'ON TARGET' : dev > 0 ? 'OVERBOOST' : 'UNDERBOOST'; wc = bad ? C.hot : C.text;
        } else if (!isNum(t)) word = 'NO TARGET FROM THE ENGINE';
        cv.text(word, x + 16, y + h - 14, 26, wc, F);
        if (isNum(s.loadActual)) cv.text('LOAD ' + fmt(s.loadActual, 0) + (isNum(s.loadTarget) ? '/' + fmt(s.loadTarget, 0) : '') + '%' + (hd.loadActual ? '!' : ''),
            x + w * 0.53, y + h - 14, 20, C.dim, Object.assign({ align: 'center' }, F));
        if (s.peak && s.peak.boost > 0) cv.text('PEAK ' + fmt(s.peak.boost * k, dp), x + w - 16, y + h - 14, 26, C.dim, R);
    }

    /** the intercooler: charge air before and after it, the drop across it, and heat soak (after minus outside) */
    function icBox(cv, x, y, w, h, s, us, note) {     // us: °F
        box(cv, x, y, w, h, 'INTERCOOLER', U.temp(us));
        const R = Object.assign({ align: 'right' }, F), cw = (w - 28) / 3, b = s.chargeBefore, a = s.intake;
        const drop = isNum(b) && isNum(a) ? b - a : null, soak = isNum(a) && isNum(s.ambient) ? a - s.ambient : null;
        const ac = [high(a, LIM.icAfter), high(soak, LIM.icSoak)].indexOf(C.hot) >= 0 ? C.hot
            : high(a, LIM.icAfter) || high(soak, LIM.icSoak) || cold(a, LIM.cold.icAfter);
        const k = us ? 1.8 : 1;
        const hd = s.held || {};
        [['BEFORE', bang(isNum(b) ? fmt(temp(b, us), 0) + '°' : '--', hd.chargeBefore), C.text], ['AFTER', bang(isNum(a) ? fmt(temp(a, us), 0) + '°' : '--', hd.intake), ac || C.text],
            ['DROP', bang(isNum(drop) ? fmt(drop * k, 0) + '°' : '--', hd.chargeBefore || hd.intake), C.mark]].forEach(([l, v, c], i) => {
            const rx = x + 14 + cw * (i + 1) - 8;
            cv.text(l, rx, y + HEAD + 26, 18, C.dim, R);
            cv.text(v, rx, y + HEAD + 84, 60, c, R);
        });
        if (note) cv.text(note, x + w - 14, y + h - 12, Math.max(14, Math.min(20, 20 * (w - 28) / Math.max(1, cv.textWidth(note, 20, F)))), C.dim, R);
        else if (isNum(soak)) {
            const sc = high(soak, LIM.icSoak);
            cv.text('HEAT SOAK ' + (soak >= 0 ? '+' : '') + fmt(soak * k, 0) + '° OVER OUTSIDE' + (sc === C.hot ? '  ·  LET IT COOL' : ''),
                x + w - 14, y + h - 12, 20, sc || C.dim, R);
        }
    }

    /** g-force: lateral and longitudinal now, their peaks under them */
    function gBox(cv, x, y, w, h, s) {
        box(cv, x, y, w, h, 'G-FORCE', 'TAP TO RESET PEAKS');
        const R = Object.assign({ align: 'right' }, F), cw = (w - 28) / 2;
        const hd = s.held || {};
        [['LATERAL', s.gLat, s.peak && s.peak.gLat, hd.gLat], ['LONGITUDINAL', s.gLong, s.peak && s.peak.gLong, hd.gLong]].forEach(([l, v, pk, held], i) => {
            const rx = x + 14 + cw * (i + 1) - 8;
            cv.text(l, x + 22 + cw * i, y + HEAD + 26, 18, C.dim, F);
            cv.text(bang(isNum(v) ? Math.abs(v).toFixed(2) : '--', held), rx, y + HEAD + 86, 64, C.text, R);
            cv.text('PEAK ' + fmt(pk, 2), rx, y + h - 12, 20, C.dim, R);
        });
        cv.fillRect(x + w / 2, y + HEAD + 12, 1, h - HEAD - 24, C.faint);
    }

    function draw(cv, s, opt) {
        if (opt.box) { C.line = C.head = opt.box.box; C.ink = opt.box.ink; }
        LIM.tyreLow = (opt.tyreLow || 3) / 14.5038;
        LIM.tyreHigh = [(opt.tyreOver || 3) / 14.5038, (opt.tyreOverRed || 5) / 14.5038];
        const us = !!opt.us;                                                       // speed and distance
        const tf = opt.tempF === undefined ? us : !!opt.tempF, ps = opt.psi === undefined ? us : !!opt.psi;
        opt = Object.assign({}, opt, { tempF: tf, psi: ps });
        const why = (v, ...names) => (isNum(v) || !opt.why ? '' : names.map((n) => opt.why(n)).filter(Boolean).join(', '));
        cv.clear(C.bg);
        if (opt.frame) opt.frame(cv, []);
        const rows = 3, gap = 11, rh = (BOTTOM - TOP - gap * (rows - 1)) / rows, bw = 210, g = 16;
        const ry = (i) => TOP + i * (rh + gap);
        const T = (c) => (isNum(c) ? fmt(temp(c, tf), 0) + '°' : '--');

        /* ---------- boost control and fuel, left ---------- */
        const L = [16, 16 + bw + g];
        const running = isNum(s.rpm) ? s.rpm > 500 : true;
        boostPanel(cv, L[0], ry(0), 2 * bw + g, 2 * rh + gap, s, ps);
        const slots = (opt.slots || []).slice(0, 5), u = { sp: us, tf, ps, running }, slot = (i) => slots[i] || SLOT_DEFAULTS[i];
        slotBox(cv, L[0], ry(2), bw, rh, slot(3), s, u, why);
        slotBox(cv, L[1], ry(2), bw, rh, slot(4), s, u, why);

        /* ---------- tyres, middle ---------- */
        const mx0 = L[1] + bw + g, mx1 = W - 16 - 2 * bw - g - g, mw = mx1 - mx0;
        cv.roundRect(mx0, TOP, mw, HEAD, 5, C.head);
        cv.text('TYRES', mx0 + 12, TOP + 22, 22, C.ink, F);
        const tg = s.tyres.FL && isNum(s.tyres.FL.target) && s.tyres.RL && isNum(s.tyres.RL.target)
            ? 'TARGET ' + (ps ? fmt(s.tyres.FL.target * 14.5038, 0) + ' / ' + fmt(s.tyres.RL.target * 14.5038, 0) : fmt(s.tyres.FL.target, 1) + ' / ' + fmt(s.tyres.RL.target, 1)) + ' ' + U.press(ps)
            : 'TPMS';
        cv.text(tg, mx0 + mw - 12, TOP + 22, 22, C.ink, Object.assign({ align: 'right' }, F));
        const tw = 236, th = (BOTTOM - TOP - HEAD - 8 - gap) / 2, ty0 = TOP + HEAD + 8, ty1 = ty0 + th + gap;
        const P = (k) => (s.tyres[k] || {});
        tyreBox(cv, mx0, ty0, tw, th, 'FRONT LEFT', P('FL'), P('FR').p, opt, false);
        tyreBox(cv, mx0 + mw - tw, ty0, tw, th, 'FRONT RIGHT', P('FR'), P('FL').p, opt, true);
        tyreBox(cv, mx0, ty1, tw, th, 'REAR LEFT', P('RL'), P('RR').p, opt, false);
        tyreBox(cv, mx0 + mw - tw, ty1, tw, th, 'REAR RIGHT', P('RR'), P('RL').p, opt, true);
        car(cv, mx0 + mw / 2, ty0 + 6, BOTTOM - 6, s, opt);

        /* ---------- car, right ---------- */
        const R = [W - 16 - 2 * bw - g, W - 16 - bw];
        const sw = (2 * bw - g) / 3, S3 = [R[0], R[0] + sw + g, R[0] + 2 * (sw + g)];
        [0, 1, 2].forEach((i) => slotBox(cv, S3[i], ry(0), sw, rh, slot(i), s, u, why));
        icBox(cv, R[0], ry(1), 2 * bw + g, rh, s, tf, why(isNum(s.chargeBefore) && isNum(s.intake) ? 0 : null, 'chargeBefore', 'intake'));
        gBox(cv, R[0], ry(2), 2 * bw + g, rh, s);
        if (opt.target) opt.target(cv, R[0], ry(2), 2 * bw + g, rh);     // a tap here resets the peaks
    }

    const api = { draw, W, colors: C, SLOTS, SLOT_DEFAULTS, SLOT_WHERE };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ApexTelemetryDraw = api;
})(this);
