'use strict';
/**
 * setup.js - Apex Telemetry's settings page (chase0017-apps, Nov 13 2026; design/settings-v3/), opened with the
 * header's Settings tab and closed with it or the rail's Pit board tab. The GT3 look of shared/gt3ui.js, as Apex Cluster's page.
 *
 *   Readouts  the five small boxes (settings tBox1..5): which value each shows, with a map of where it sits
 *   Units     US / Metric / Custom, then speed, temperature and pressure each
 *   Tyres     temperature (yellow / red from) and pressure (blue under, yellow / red over the car's target) limits
 *   Data      every engine unit value: the identifiers it is asked as, what the car answers, how old the reading is
 *   System    box colour, about
 *
 * draw(cv, bottom, snap, u): snap = Telemetry.snapshot(), u = { sp, tf, ps } (US units or not, per measure).
 */
const gt3 = require('./gt3ui');
const D = require('./draw');

const CX = 288, CR = 1584, CW = CR - CX;
const TABS = [['board', 'Pit board', 'back'], ['readouts', 'Readouts', 'lines'], ['units', 'Units', 'units'], ['tyres', 'Tyres', 'tyre'], ['data', 'Data', 'data'], ['system', 'System', 'cog']];
const CATS = ['Engine', 'Temps', 'Fuel', 'Chassis'];
const TYRE_F = { 43: 110, 49: 120, 54: 130, 60: 140, 66: 150, 71: 160, 77: 170, 82: 180 };   // the tyre settings' own °F labels
// where the five small boxes and the rest sit on the 1600 x 520 pit board (draw.js): [x, y, w, h]
const BOARD = {
    1: [1148, 52, 135, 146], 2: [1299, 52, 135, 146], 3: [1449, 52, 135, 146], 4: [16, 366, 210, 146], 5: [242, 366, 210, 146],
    BOOST: [16, 52, 436, 303], TYRES: [468, 52, 664, 460], INTERCOOLER: [1148, 209, 436, 146], 'G-FORCE': [1148, 366, 436, 146],
};

class Setup {
    /** opts: { kick(), close(), unitUs(dim) } */
    constructor(ctx, tel, opts) {
        this.ctx = ctx; this.tel = tel; this.opts = opts;
        this.tab = 'readouts'; this.slot = 1; this.cat = null;
    }
    get(k) { return this.ctx.settings.get(k); }
    item(k) { return this.ctx.settings.item(k); }
    set(k, v) { if (this.ctx.settings.get(k) !== v) this.ctx.settings.set(k, v); this.opts.kick(); }
    slotId(i) { const v = this.get('tBox' + i); return D.SLOTS[v] ? v : D.SLOT_DEFAULTS[i - 1]; }
    /** a sensor's value now, as the board shows it: "199 °F" */
    valueText(id, snap, u) {
        const r = D.SLOTS[id].get(snap, Object.assign({ running: true }, u));
        if (r[0] === '--') return '--';
        return r[0] + (r[1] ? (r[0].slice(-1) === '°' ? r[1].replace('°', '') : ' ' + (r[1].charAt(0) === '°' ? r[1] : r[1].toLowerCase())) : '');
    }

    draw(cv, bottom, snap, u) {
        const P = this.P = gt3.palette(this.get('boxColour'));
        cv.clear(P.bg);
        const rows = this.tel.dataRows(), ok = rows.filter((r) => r.ok).length;
        const value = {
            board: 'back to the live page', readouts: '5 small boxes', units: (u.sp ? 'mph' : 'km/h') + ' · ' + (u.tf ? '°F' : '°C') + ' · ' + (u.ps ? 'psi' : 'bar'),
            tyres: 'warm ' + this.tyreT(this.get('tyreWarn'), u) + ' · hot ' + this.tyreT(this.get('tyreHot'), u),
            data: ok + ' of ' + rows.length + ' answering', system: 'v' + this.ctx.spec.version + ' · ' + P.name.toLowerCase() + ' boxes',
        };
        gt3.rail(cv, P, 16, 50, 252, bottom, TABS.map((t) => ({ id: t[0], name: t[1], icon: t[2], value: value[t[0]] })), this.tab,
            (id) => { if (id === 'board') this.opts.close(); else { this.tab = id; this.opts.kick(); } });
        const body = { readouts: this.readouts, units: this.units, tyres: this.tyres, data: this.data, system: this.system }[this.tab];
        if (body) body.call(this, cv, bottom, snap, u, rows);
    }
    tyreT(v, u) { const c = Number(v); return u.tf ? (TYRE_F[c] || Math.round(c * 9 / 5 + 32)) + ' °F' : c + ' °C'; }

    /* ---------- Readouts ---------- */
    readouts(cv, bottom, snap, u) {
        const P = this.P, lw = 640, x = CX;
        let y = gt3.section(cv, P, x, 50, lw, bottom - 50, 'Small boxes', 'tap one, then pick its value');
        // the map: the pit board drawn small, the five boxes numbered, the one being set filled in
        const k = (lw - 40) / 1600, mx = x + 20, my = y + 12;
        Object.keys(BOARD).forEach((n) => {
            const b = BOARD[n], slot = /^\d$/.test(n), sel = slot && Number(n) === this.slot;
            const bx = mx + b[0] * k, by = my + b[1] * k, bw = b[2] * k, bh = b[3] * k;
            cv.roundRect(bx, by, bw, bh, 3, slot ? P.box : '#ffffff40');
            if (!sel) cv.roundRect(bx + 2, by + 2, bw - 4, bh - 4, 2, P.bg);
            gt3.fit(cv, slot ? n : n, bx + bw / 2, by + bh / 2 + 6, slot ? 18 : 13, bw - 6, sel ? P.ink : slot ? P.text : P.dim, { align: 'center' });
            if (slot) cv.target(bx, by, bw, bh, () => { this.slot = Number(n); this.cat = null; this.opts.kick(); }, 'map:' + n, 3);
        });
        y = my + 520 * k + 12;
        const rh = Math.min(52, Math.floor((bottom - 8 - y) / 5));
        for (let i = 1; i <= 5; i++) {
            const id = this.slotId(i), sn = D.SLOTS[id], sel = i === this.slot, ry = y + (i - 1) * rh;
            if (sel) cv.fillRect(x + 2, ry, lw - 4, rh, '#ffffff14');
            cv.fillRect(x + 2, ry, lw - 4, 1, P.line);
            cv.roundRect(x + 14, ry + rh / 2 - 15, 30, 30, 4, P.box);
            gt3.txt(cv, String(i), x + 29, ry + rh / 2 + 7, 20, P.ink, { align: 'center' });
            gt3.txt(cv, gt3.up(sn.name), x + 56, ry + rh / 2 + 1, 21, P.text);
            gt3.txt(cv, D.SLOT_WHERE[i - 1] + (this.get('tBox' + i) === D.SLOT_DEFAULTS[i - 1] ? ' · default' : ''), x + 56, ry + rh / 2 + 19, 15, P.dim);
            gt3.txt(cv, this.valueText(id, snap, u), x + lw - 16, ry + rh / 2 + 8, 22, P.text, { align: 'right' });
            cv.target(x, ry, lw, rh, () => { this.slot = i; this.cat = null; this.opts.kick(); }, 'slot:' + i, 0);
        }
        // right: the values to pick from, by group
        const cur = this.slotId(this.slot), cat = this.cat || D.SLOTS[cur].cat, rx = x + lw + 16, rw = CR - rx;
        y = gt3.section(cv, P, rx, 50, rw, bottom - 50, 'Box ' + this.slot + ' · pick a value', D.SLOTS[cur].name);
        let cx = rx + 14;
        CATS.forEach((c) => { cx += gt3.chip(cv, P, cx, y + 12, c, c === cat, () => { this.cat = c; this.opts.kick(); }, 'cat:' + c) + 8; });
        const dft = D.SLOT_DEFAULTS[this.slot - 1];
        gt3.button(cv, P, rx + rw - 14 - gt3.tw(cv, 'DEFAULT', 17) - 36, y + 10, 'Default', cur === dft ? null : () => this.set('tBox' + this.slot, dft), 'slot:default', true, 17);
        const list = Object.keys(D.SLOTS).filter((id) => D.SLOTS[id].cat === cat), ly = y + 58, lh = Math.min(50, Math.floor((bottom - 6 - ly) / list.length));
        list.forEach((id, i) => {
            const yy = ly + i * lh, sel = id === cur;
            if (sel) cv.roundRect(rx + 8, yy + 2, rw - 16, lh - 4, 3, P.box);
            else if (i) cv.fillRect(rx + 14, yy, rw - 28, 1, P.line);
            gt3.txt(cv, gt3.up(D.SLOTS[id].name), rx + 22, yy + lh / 2 + 8, 21, sel ? P.ink : P.text);
            gt3.txt(cv, this.valueText(id, snap, u), rx + rw - 22, yy + lh / 2 + 8, 20, sel ? P.ink : P.dim, { align: 'right' });
            cv.target(rx + 8, yy, rw - 16, lh, () => this.set('tBox' + this.slot, id), 'pick:' + id, 3);
        });
    }

    /* ---------- Units ---------- */
    units(cv, bottom, snap, u) {
        const P = this.P, lw = 760, x = CX;
        const pre = u.sp && u.tf && u.ps ? 'us' : !u.sp && !u.tf && !u.ps ? 'metric' : 'custom';
        let y = gt3.section(cv, P, x, 50, lw, 30 + 4 * 66, 'Units');
        let cy = gt3.row(cv, P, x, y, lw, 66, 'Preset', pre === 'custom' ? 'Your own mix, set below' : 'Sets all three below', true);
        gt3.seg(cv, P, x + lw - 14, cy, [['us', 'US'], ['metric', 'Metric'], ['custom', 'Custom']], pre, (v) => {
            if (v === 'custom') return;
            this.set('units', v);
            ['unitSpeed', 'unitTemp', 'unitPress'].forEach((k) => this.set(k, 'auto'));
        }, 'preset', 21);
        y += 66;
        [['Speed and distance', 'unitSpeed', [['mph', 'mph · mi'], ['kmh', 'km/h · km']], u.sp],
            ['Temperature', 'unitTemp', [['f', '°F'], ['c', '°C']], u.tf],
            ['Pressure', 'unitPress', [['psi', 'psi'], ['bar', 'bar']], u.ps]].forEach(([n, k, opts, on]) => {
            cy = gt3.row(cv, P, x, y, lw, 66, n);
            gt3.seg(cv, P, x + lw - 14, cy, opts, on ? opts[0][0] : opts[1][0], (v) => this.set(k, v), 'unit:' + k);
            y += 66;
        });
        // preview: four of the board's values in the units picked
        const px = x + lw + 16, pw = CR - px, bw = (pw - 36) / 2, bh = 112;
        y = gt3.section(cv, P, px, 50, pw, 30 + 2 * bh + 34, 'Preview', 'live');
        ['range', 'gearbox', 'boost', 'lpfp'].forEach((id, i) => {
            const sn = D.SLOTS[id], r = sn.get(snap, Object.assign({ running: true }, u));
            const bx = px + 12 + (i % 2) * (bw + 12), by = y + 12 + Math.floor(i / 2) * (bh + 10);
            cv.roundRect(bx, by, bw, bh, 4, P.box);
            cv.roundRect(bx + 2, by + 26, bw - 4, bh - 28, 3, P.bg);
            gt3.txt(cv, sn.head, bx + 10, by + 20, 18, P.ink);
            gt3.txt(cv, r[1], bx + bw - 10, by + 20, 18, P.ink, { align: 'right' });
            gt3.fit(cv, r[0], bx + bw - 12, by + bh - 14, 64, bw - 24, P.text, { align: 'right' });
        });
    }

    /* ---------- Tyres ---------- */
    tyres(cv, bottom, snap, u) {
        const P = this.P, w = (CW - 16) / 2, x = CX;
        let y = gt3.section(cv, P, x, 50, w, 30 + 2 * 76, 'Tyre temperature', 'air inside the tyre');
        const warm = Number(this.get('tyreWarn')), hot = Number(this.get('tyreHot'));
        [['Warm (yellow) from', 'tyreWarn'], ['Hot (red) from', 'tyreHot']].forEach(([n, k], i) => {
            const it = this.item(k), cy = gt3.row(cv, P, x, y, w, 76, n, null, i === 0);
            gt3.scaleBar(cv, P, x + 16, cy + 20, w * 0.42, 20, 90, warm, hot);
            gt3.stepSetting(cv, P, x + w - 14, cy, { key: k, steps: (it.options || []).map((o) => o[0]) }, this.get(k), (v) => this.set(k, v), (v) => this.tyreT(v, u));
            y += 76;
        });
        gt3.note(cv, P, x + 4, y + 30, ['No colour while fine, nothing for cold.', 'Street tyres run about 80 to 110 °F (27 to 43 °C).']);
        const rx = x + w + 16, t = snap.tyres && snap.tyres.FL && snap.tyres.RL;
        const tgt = t && snap.tyres.FL.target > 0 && snap.tyres.RL.target > 0
            ? 'target ' + (u.ps ? Math.round(snap.tyres.FL.target * 14.5038) + ' / ' + Math.round(snap.tyres.RL.target * 14.5038) + ' psi' : snap.tyres.FL.target.toFixed(1) + ' / ' + snap.tyres.RL.target.toFixed(1) + ' bar')
            : 'against the car\'s target';
        y = gt3.section(cv, P, rx, 50, w, 30 + 3 * 70, 'Tyre pressure', tgt);
        const psi = (v) => (u.ps ? v + ' psi' : (v / 14.5038).toFixed(2) + ' bar');
        [['Low (blue) under target', 'tyreLow', ''], ['High (yellow) over target', 'tyreOver', 'Warm tyres gain a few psi'], ['High (red) over target', 'tyreOverRed', '']].forEach(([n, k, sub], i) => {
            const cy = gt3.row(cv, P, rx, y, w, 70, n, sub || null, i === 0);
            gt3.stepSetting(cv, P, rx + w - 14, cy, this.item(k), this.get(k), (v) => this.set(k, v), psi);
            y += 70;
        });
    }

    /* ---------- Data ---------- */
    data(cv, bottom, snap, u, rows) {
        const P = this.P, x = CX, w = CW;
        let y = gt3.section(cv, P, x, 50, w, Math.min(bottom - 50, 30 + 40 + rows.length * 36 + 8), 'What the car answers', 'read only');
        const col = [x + 16, x + 300, x + 760, x + w - 16];
        [['VALUE', col[0]], ['ASKED AS', col[1]], ['ANSWER', col[2]]].forEach(([t, cx]) => gt3.txt(cv, t, cx, y + 28, 16, P.dim));
        gt3.txt(cv, 'LAST READING', col[3], y + 28, 16, P.dim, { align: 'right' });
        y += 40;
        rows.forEach((r) => {
            cv.fillRect(x + 2, y, w - 4, 1, P.line);
            gt3.txt(cv, r.name, col[0], y + 25, 20, P.text);
            gt3.fit(cv, r.ids, col[1], y + 25, 18, col[2] - col[1] - 20, P.dim);
            gt3.fit(cv, r.answer, col[2], y + 25, 19, col[3] - col[2] - 150, r.ok ? P.ok : /not shown/.test(r.answer) ? P.dim : P.warm);
            gt3.txt(cv, r.age === null ? '--' : r.age < 60 ? r.age.toFixed(1) + ' s ago' : Math.round(r.age / 60) + ' min ago', col[3], y + 25, 18, P.dim, { align: 'right' });
            y += 36;
        });
        gt3.note(cv, P, x + 4, Math.min(bottom - 24, y + 34), ['A value that never answers is asked every 15 s so it can\'t slow the rest down. Read only: nothing is written to the car.']);
    }

    /* ---------- System ---------- */
    system(cv, bottom) {
        const P = this.P, w = (CW - 16) / 2, x = CX;
        let y = gt3.section(cv, P, x, 50, w, 30 + 64, 'Display');
        let cy = gt3.row(cv, P, x, y, w, 64, 'Box colour', P.name + ' · this page and the pit board\'s boxes', true);
        gt3.swatches(cv, P, x + w - 14, cy, P.key, (v) => this.set('boxColour', v));
        gt3.note(cv, P, x + 4, 50 + 30 + 64 + 34, ['A value the car stops sending stays on the board with a "!" after it,',
            'held until the car answers again. One it never sent shows as a dash.']);
        const rx = x + w + 16, spec = this.ctx.spec, car = this.tel.car, live = !!(car.carPresent && car.carPresent());
        y = gt3.section(cv, P, rx, 50, w, 30 + 200, 'About');
        gt3.txt(cv, spec.title, rx + 16, y + 40, 32, P.text);
        gt3.txt(cv, 'v' + spec.version, rx + 24 + gt3.tw(cv, spec.title, 32), y + 40, 20, P.dim);
        gt3.txt(cv, 'Opens from the menu (doesn\'t start with the car)', rx + 16, y + 74, 20, P.text);
        gt3.txt(cv, 'Car data: ' + (live ? 'live' : 'waiting for the car'), rx + 16, y + 102, 20, live ? P.ok : P.warm);
        gt3.txt(cv, 'Back to the pit board: Settings again, or the Pit board tab.', rx + 16, y + 130, 17, P.dim);
        if (this.opts.openList) gt3.button(cv, P, rx + 16, y + 146, 'Every setting as a list', () => this.opts.openList(), 'list', true, 17);
    }
}

module.exports = Setup;
