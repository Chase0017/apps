'use strict';
/**
 * draw.js - Apex Telemetry's page: a GT3 pit board on the centre screen, 1600 x 520 logical px (the kit's page).
 *
 *   ENGINE (left)        TYRES (middle)                         CAR (right)
 *   coolant  oil         FL box   [car, wheels lit by temp]  FR   boost     gearbox
 *   oil psi  intake      RL box                              RR   outside   fuel
 *   AFR      timing                                               range     g-force
 *
 * Black, white boxes with a white header strip and dark text on it (Apex Cluster's look), Barlow Condensed
 * numbers (the kit font family 'race', tools/bake_kit_font.py). Tyres: big pressure, temperature in its state
 * colour (cold blue, ok green, warm amber, hot red) and the difference to the car's target pressure.
 *
 * Pure: draw(cv, snap, opt) uses only the kit canvas calls (fillRect, roundRect, strokeRoundRect, gradientRect,
 * circle, text, textWidth), so tools/telemetry-preview/ runs this same file in a browser.
 *   snap: Telemetry.snapshot() (SI units)   opt: { us, tyreHot (C), tyreCold (C), frame(cv, badges), target(cb) }
 */
(function (root) {
    const W = 1600, TOP = 52, BOTTOM = 512;
    const C = {
        bg: '#050607', line: '#ffffff', head: '#ffffff', ink: '#0b0d10', text: '#ffffff', dim: '#9aa0a8', faint: '#ffffff1f',
        cold: '#4aa3ff', ok: '#3ddc84', warm: '#ffb020', hot: '#ff3b30', body: '#14171c',
    };
    const F = { font: 'race', literal: true };
    const isNum = (x) => typeof x === 'number' && isFinite(x);
    const HEAD = 30;

    /* ---------- units ---------- */
    const fmt = (v, d) => (isNum(v) ? v.toFixed(d) : '--');
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
        const size = value.length > 5 ? 64 : 72;
        cv.text(value, x + w - 14, y + HEAD + (sub ? 70 : 84), size, color || C.text, Object.assign({ align: 'right' }, F));
        if (sub) {
            const ss = Math.max(16, Math.min(22, 22 * (w - 24) / Math.max(1, cv.textWidth(sub, 22, F))));
            cv.text(sub, x + w - 14, y + h - 12, ss, subColor || C.dim, Object.assign({ align: 'right' }, F));
        }
    }

    function tyreState(c, opt) {
        if (!isNum(c)) return C.dim;
        if (c >= opt.tyreHot) return C.hot;
        if (c >= opt.tyreHot - 15) return C.warm;
        if (c < opt.tyreCold) return C.cold;
        return C.ok;
    }
    /** colour of a pressure against its target (bar): within ~1 psi green, ~3 psi amber, else red */
    function pressState(p, target) {
        if (!isNum(p) || !isNum(target)) return C.text;
        const d = Math.abs(p - target);
        return d <= 0.07 ? C.ok : d <= 0.21 ? C.warm : C.hot;
    }

    function tyreBox(cv, x, y, w, h, name, t, partner, opt, right) {
        const us = opt.us;
        box(cv, x, y, w, h, name, U.press(us));
        const sc = tyreState(t.t, opt);
        // the temperature stripe on the side towards the car
        cv.fillRect(right ? x + 2 : x + w - 10, y + HEAD, 8, h - HEAD - 2, sc);
        const pv = isNum(t.p) ? (us ? fmt(t.p * 14.5038, 1) : fmt(t.p, 2)) : '--';
        const px = right ? x + w - 16 : x + w - 22;
        cv.text(pv, px, y + HEAD + 98, 96, C.text, Object.assign({ align: 'right' }, F));
        // temperature (left) and the difference to target (right)
        const tl = right ? x + 22 : x + 14;
        cv.text(isNum(t.t) ? fmt(temp(t.t, us), 0) + U.temp(us) : '--', tl, y + h - 16, 44, sc, F);
        const target = isNum(t.target) ? t.target : null;
        let delta = '', dc = C.dim;
        if (isNum(t.p) && target !== null) {
            const d = t.p - target, dv = us ? d * 14.5038 : d;
            delta = (dv >= 0 ? '+' : '') + (us ? dv.toFixed(1) : dv.toFixed(2));
            dc = pressState(t.p, target);
        } else if (isNum(t.p) && isNum(partner)) {
            const d = Math.abs(t.p - partner);
            if (d > 0.14) { delta = 'UNEVEN'; dc = C.warm; }
        }
        if (delta) {
            cv.text(delta, px, y + h - 16, 32, dc, Object.assign({ align: 'right' }, F));
            cv.text(target !== null ? 'VS TARGET' : 'VS OTHER SIDE', px, y + h - 50, 16, C.dim, Object.assign({ align: 'right' }, F));
        }
    }

    /** the car from above, wheels lit by their temperature */
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
            const c = tyreState((s.tyres[k] || {}).t, opt);
            cv.roundRect(wx, wy, ww, wh, 7, c);
            cv.roundRect(wx + 4, wy + 6, ww - 8, wh - 12, 4, '#0b0d10aa');
        });
    }

    function draw(cv, s, opt) {
        const us = !!opt.us;
        cv.clear(C.bg);
        if (opt.frame) opt.frame(cv, [s.demo ? { text: 'DEMO DATA', color: '#ffb020' } : null]);
        const rows = 3, gap = 11, rh = (BOTTOM - TOP - gap * (rows - 1)) / rows, bw = 210, g = 16;
        const ry = (i) => TOP + i * (rh + gap);
        const T = (c) => (isNum(c) ? fmt(temp(c, us), 0) + '°' : '--');

        /* ---------- engine, left ---------- */
        const L = [16, 16 + bw + g];
        const oilPc = isNum(s.oilP) && s.oilP < 0.5 && isNum(s.rpm) && s.rpm > 500 ? C.hot : null;
        readout(cv, L[0], ry(0), bw, rh, 'COOLANT', U.temp(us), T(s.coolant), isNum(s.coolant) && s.coolant >= 115 ? C.hot : null);
        readout(cv, L[1], ry(0), bw, rh, 'OIL TEMP', U.temp(us), T(s.oil), isNum(s.oil) && s.oil >= 140 ? C.hot : isNum(s.oil) && s.oil < 70 ? C.cold : null,
            isNum(s.oil) && s.oil < 70 ? 'WARMING UP' : '', C.cold);
        readout(cv, L[0], ry(1), bw, rh, 'OIL PRESS', U.press(us), isNum(s.oilP) ? (us ? fmt(s.oilP * 14.5038, 0) : fmt(s.oilP, 1)) : '--', oilPc,
            !isNum(s.oilP) && opt.why ? opt.why('oilPressure') : '');
        readout(cv, L[1], ry(1), bw, rh, 'INTAKE', U.temp(us), T(s.intake), null,
            isNum(s.intake) && isNum(s.ambient) ? '+' + fmt(Math.max(0, (s.intake - s.ambient) * (us ? 1.8 : 1)), 0) + '° OVER OUTSIDE' : '');
        readout(cv, L[0], ry(2), bw, rh, 'AFR', '', fmt(s.afr, 1), isNum(s.afr) && s.afr > 15.5 && isNum(s.boost) && s.boost > 0.3 ? C.hot : null,
            isNum(s.afr) ? 'LAMBDA ' + (s.afr / 14.7).toFixed(2) : '');
        readout(cv, L[1], ry(2), bw, rh, 'TIMING', 'BTDC', isNum(s.timing) ? fmt(s.timing, 1) + '°' : '--');

        /* ---------- tyres, middle ---------- */
        const mx0 = L[1] + bw + g, mx1 = W - 16 - 2 * bw - g - g, mw = mx1 - mx0;
        cv.roundRect(mx0, TOP, mw, HEAD, 5, C.head);
        cv.text('TYRES', mx0 + 12, TOP + 22, 22, C.ink, F);
        const tg = s.tyres.FL && isNum(s.tyres.FL.target) && s.tyres.RL && isNum(s.tyres.RL.target)
            ? 'TARGET ' + (us ? fmt(s.tyres.FL.target * 14.5038, 0) + ' / ' + fmt(s.tyres.RL.target * 14.5038, 0) : fmt(s.tyres.FL.target, 1) + ' / ' + fmt(s.tyres.RL.target, 1)) + ' ' + U.press(us)
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
        const bv = isNum(s.boost) ? (us ? fmt(s.boost * 14.5038, 1) : fmt(s.boost, 2)) : '--';
        const bp = s.peak && s.peak.boost > 0 ? 'PEAK ' + (us ? fmt(s.peak.boost * 14.5038, 1) : fmt(s.peak.boost, 2)) : '';
        readout(cv, R[0], ry(0), bw, rh, 'BOOST', U.press(us), bv, null, bp);
        readout(cv, R[1], ry(0), bw, rh, 'TRANS', U.temp(us), T(s.gearbox), isNum(s.gearbox) && s.gearbox >= 120 ? C.hot : null);
        readout(cv, R[0], ry(1), bw, rh, 'OUTSIDE', U.temp(us), T(s.ambient), isNum(s.ambient) && s.ambient <= 3 ? C.cold : null,
            isNum(s.ambient) && s.ambient <= 3 ? 'ICE POSSIBLE' : '', C.cold);
        readout(cv, R[1], ry(1), bw, rh, 'FUEL', us ? 'GAL' : 'L', isNum(s.fuelL) ? (us ? fmt(s.fuelL / 3.78541, 1) : fmt(s.fuelL, 0)) : '--',
            isNum(s.fuelL) && s.fuelL < 9 ? C.warm : null);
        readout(cv, R[0], ry(2), bw, rh, 'RANGE', us ? 'MI' : 'KM', isNum(s.rangeKm) ? fmt(us ? s.rangeKm / 1.609344 : s.rangeKm, 0) : '--',
            isNum(s.rangeKm) && s.rangeKm < 80 ? C.warm : null);
        const gNow = isNum(s.gLat) && isNum(s.gLong) ? Math.sqrt(s.gLat * s.gLat + s.gLong * s.gLong) : null;
        readout(cv, R[1], ry(2), bw, rh, 'G-FORCE', 'G', fmt(gNow, 2), null,
            s.peak ? 'MAX ' + fmt(s.peak.gLat, 2) + ' LAT  ' + fmt(s.peak.gLong, 2) + ' LONG' : '');
        if (opt.target) opt.target(cv, R[1], ry(2), bw, rh);     // a tap here resets the peaks
    }

    const api = { draw, W, colors: C };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ApexTelemetryDraw = api;
})(this);
