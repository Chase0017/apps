'use strict';
/**
 * draw.js - Apex DME Controls' one page (1600 x 520, design: design/dme-controls-v1/): three boxes side by side,
 * engine map (left), exhaust valve (middle), Max Cooling (right). Pure canvas calls (kit canvas recorder) and taps
 * (cv.target); the actions come in through `act`.
 *
 *   draw(cv, bottom, v, opt, act)
 *     v    Control.view()
 *     opt  { P (gt3 palette), names [4], tempF, coolant, oil, rpm, held { coolant, oil, rpm } (dimmed with an amber dot), hold, closeLimit (rpm or null), locked (the confirm sheet is up: no taps) }
 *     act  { map(n), valve(mode), cooling(on) }
 */
const gt3 = require('./gt3ui');
const { txt, fit, tw, up } = gt3;

const TOP = 50;
const COLS = [[16, 590], [622, 472], [1110, 474]];

/** grey note lines, wrapped to w, from y down; returns the y after them */
function wrap(cv, s, x, y, w, size, c) {
    const words = String(s).split(' ');
    let line = '';
    words.forEach((wd) => {
        const t = line ? line + ' ' + wd : wd;
        if (tw(cv, t, size) > w && line) { txt(cv, line, x, y, size, c); y += size + 4; line = wd; } else line = t;
    });
    if (line) { txt(cv, line, x, y, size, c); y += size + 4; }
    return y;
}
const T = (c, f) => (typeof c === 'number' ? Math.round(f ? c * 9 / 5 + 32 : c) + '°' : '--');

function mapBox(cv, P, v, opt, act, bottom) {
    const [x, w] = COLS[0], f = v.features.map;
    const right = v.tuner === 'off' ? 'no tuning software' : v.tuner === 'bm3' ? 'BM3' + (v.bm3Rom ? ' · ROM ' + v.bm3Rom : '') : v.tuner === 'mgf' ? 'MG Flasher · on the wheel' : 'MHD';
    const y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Engine map', right);
    const tw2 = (w - 24 - 12) / 2, th = Math.floor((bottom - y0 - 36 - 76) / 2), can = f && !v.mapBlock && !v.busy && v.map.pending === null;
    for (let i = 0; i < 4; i++) {
        const n = i + 1, tx = x + 12 + (i % 2) * (tw2 + 12), ty = y0 + 12 + Math.floor(i / 2) * (th + 12);
        const act1 = v.map.active === n && v.map.pending === null, pend = v.map.pending === n;
        const edge = !f ? P.off : pend ? P.warm : P.box;
        cv.roundRect(tx, ty, tw2, th, 4, edge);
        if (!act1) cv.roundRect(tx + 2, ty + 2, tw2 - 4, th - 4, 3, P.bg);
        const ink = act1 ? P.ink : f ? P.text : P.off;
        txt(cv, String(n), tx + 16, ty + 80, 80, ink);
        fit(cv, up(opt.names[i] || 'Map ' + n), tx + 16, ty + th - 18, 28, tw2 - 32, act1 ? P.ink : f ? P.dim : P.off);
        const tag = act1 ? (v.map.confirmed ? 'ACTIVE' : 'ACCEPTED') : pend ? 'SENDING' : null;
        if (tag) {
            const tg = tw(cv, tag, 17) + 16;
            cv.roundRect(tx + tw2 - tg - 10, ty + 10, tg, 26, 3, act1 ? P.ink : P.warm);
            txt(cv, tag, tx + tw2 - 10 - tg / 2, ty + 29, 17, act1 ? P.box : '#0b0d10', { align: 'center' });
        }
        if (can && !act1) cv.target(tx, ty, tw2, th, () => act.map(n), 'map:' + n, 4);
    }
    const ny = y0 + 12 + 2 * (th + 12) + 22;
    const msg = v.map.note && (v.map.warn || v.map.pending !== null) ? v.map.note : v.mapBlock
        || (v.map.note ? v.map.note + '. ' : '') + 'The engine light may flash while the map changes. That is normal.';
    wrap(cv, msg, x + 14, ny, w - 28, 19, v.mapBlock || v.map.warn ? P.warm : P.dim);
}

function valveBox(cv, P, v, opt, act, bottom) {
    const [x, w] = COLS[1];
    const right = v.tuner === 'off' || v.tuner === 'mgf' ? 'BMW job' : v.tuner.toUpperCase();
    const y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Exhaust valve', right);
    // three big buttons
    const bx = x + 12, bw = w - 24, bh = 96, by = y0 + 12, ow = (bw - 4) / 3;
    cv.roundRect(bx, by, bw, bh, 4, P.box);
    cv.roundRect(bx + 2, by + 2, bw - 4, bh - 4, 3, P.bg);
    [['oem', 'OEM'], ['open', 'OPEN'], ['closed', 'CLOSED']].forEach((o, i) => {
        const on = v.valve.want === o[0], ox = bx + 2 + i * ow;
        if (on) cv.fillRect(ox, by + 2, ow, bh - 4, P.box);
        else if (i && v.valve.want !== ['oem', 'open', 'closed'][i - 1]) cv.fillRect(ox, by + 12, 1, bh - 24, P.line);
        txt(cv, o[1], ox + ow / 2, by + bh / 2 + 14, 40, on ? P.ink : P.text, { align: 'center' });
        if (!v.busy) cv.target(ox, by - 4, ow, bh + 8, () => act.valve(o[0]), 'valve:' + o[0], 3);
    });
    // the pipe with the valve's butterfly: what it is told now (OEM: the car decides)
    const shown = v.valve.want === 'closed' && v.valve.paused ? 'oem' : v.valve.want;
    const open = shown === 'open', py = by + bh + 34, px = x + 32, pw = w - 64, ph = 70, cx = x + w / 2, cy = py + ph / 2;
    cv.strokeRoundRect(px, py, pw, ph, 5, 2.5, P.box);
    if (shown === 'oem') {
        txt(cv, 'AUTO', cx, cy + 9, 24, P.dim, { align: 'center' });
    } else {
        const a = open ? Math.PI * 0.45 : 0, r = ph / 2 - 4;
        cv.line(cx - Math.sin(a) * r, cy - Math.cos(a) * r, cx + Math.sin(a) * r, cy + Math.cos(a) * r, 7, '#ffffff');
        cv.circle(cx, cy, 6, P.bg); cv.arc(cx, cy, 5, 7, 0, 360, '#ffffff');
    }
    const state = v.valve.warn ? 'NOT ACCEPTED' : shown === 'oem' ? (v.valve.paused ? 'OEM (ABOVE THE CLOSE LIMIT)' : 'OEM · THE CAR DECIDES') : open ? 'OPEN' : 'CLOSED';
    fit(cv, state, cx, py + ph + 46, 34, w - 40, v.valve.warn ? P.warm : P.text, { align: 'center' });
    const ny = py + ph + 90;
    const hold = opt.hold ? 'Held: sent again every 15 s.' : 'The car takes over after about 20 s.';
    const msg = v.valve.note && v.valve.warn ? v.valve.note
        : v.valve.want === 'oem' ? 'The car opens and closes it as it always does.'
        : v.valve.paused ? (opt.closeLimit ? 'Closes again below ' + (opt.closeLimit - 500) + ' rpm.' : 'No engine speed: closes again once there is one.')
        : (v.valve.note ? v.valve.note + '. ' : '') + hold;
    wrap(cv, msg, x + 14, ny, w - 28, 19, v.valve.warn ? P.warm : P.dim);
}

function coolBox(cv, P, v, opt, act, bottom) {
    const [x, w] = COLS[2], f = v.features.cooling, on = v.cooling.on === true;
    const y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Max cooling', v.tuner === 'mgf' ? 'MG Flasher · on the wheel' : 'MHD');
    const bx = x + 12, bw = w - 24, bh = 176, by = y0 + 12, can = !v.coolBlock && !v.busy;
    cv.roundRect(bx, by, bw, bh, 4, !f ? P.off : on ? P.cold : P.box);
    if (!on) cv.roundRect(bx + 2, by + 2, bw - 4, bh - 4, 3, P.bg);
    const ink = on ? '#0b0d10' : f ? P.text : P.off;
    txt(cv, on ? 'ON' : 'OFF', bx + bw / 2, by + 106, 92, ink, { align: 'center' });
    txt(cv, on ? 'FANS AND PUMP FLAT OUT' : f ? 'TAP TO TURN ON' : 'NOT AVAILABLE', bx + bw / 2, by + 148, 21, on ? '#0b0d10' : P.dim, { align: 'center' });
    if (can) cv.target(bx, by, bw, bh, () => act.cooling(!on), 'cooling', 4);
    // coolant, oil, engine speed
    const tw3 = (bw - 16) / 3, ty = by + bh + 14, th = 92;
    const col = (c, warm, hot) => (typeof c !== 'number' ? P.text : c >= hot ? P.hot : c >= warm ? P.warm : c < 70 ? P.cold : P.text);
    const held = opt.held || {};
    [['COOLANT', T(opt.coolant, opt.tempF), col(opt.coolant, 108, 115), held.coolant], ['OIL', T(opt.oil, opt.tempF), col(opt.oil, 130, 140), held.oil],
        ['RPM', typeof opt.rpm === 'number' ? String(Math.round(opt.rpm / 10) * 10) : '--', P.text, held.rpm]].forEach((t, i) => {
        const tx = bx + i * (tw3 + 8);
        cv.roundRect(tx, ty, tw3, th, 4, P.box);
        cv.roundRect(tx + 2, ty + 26, tw3 - 4, th - 28, 3, P.bg);
        txt(cv, t[0], tx + 10, ty + 20, 17, P.ink);
        // held (the car stopped sending it): dimmed with an amber dot, shrunk to fit with the dot's room
        const room = tw3 - 20, k = tw(cv, t[1], 50);
        gt3.heldText(cv, t[1], tx + tw3 - 10, ty + th - 12, k > room ? Math.max(12, 50 * room / k) : 50, t[2], Object.assign({}, gt3.FONT, { align: 'right', maxW: room }), t[3]);
    });
    const msg = v.cooling.note && v.cooling.warn ? v.cooling.note : v.coolBlock
        || (v.cooling.note ? v.cooling.note + '. ' : '') + 'Needs the engine running. Use it after a hard run or in traffic on a hot day.';
    wrap(cv, msg, x + 14, ty + th + 26, w - 28, 19, v.coolBlock || v.cooling.warn ? P.warm : P.dim);
}

function draw(cv, bottom, v, opt, act) {
    const P = opt.P, target = cv.target;
    cv.clear(P.bg);
    if (opt.locked) cv.target = function () { return this; };     // under the confirm sheet: nothing on the page takes a tap
    try {
        mapBox(cv, P, v, opt, act, bottom);
        valveBox(cv, P, v, opt, act, bottom);
        coolBox(cv, P, v, opt, act, bottom);
    } finally { cv.target = target; }
}

/** The confirm sheet over the page before a map switch. */
function confirm(cv, bottom, P, n, name, yes, no) {
    cv.fillRect(0, 36, 1600, bottom - 36 + 8, '#000000cc');
    const w = 640, h = 250, x = (1600 - w) / 2, y = 36 + (bottom - 36 - h) / 2;
    gt3.section(cv, P, x, y, w, h, 'Switch to map ' + n + '?');
    fit(cv, up(name), x + 24, y + 80, 34, w - 48, P.text);
    wrap(cv, 'The engine light may flash for a moment. Stay stopped until the page says ACCEPTED.', x + 24, y + 112, w - 48, 20, P.dim);
    const bw = (w - 60) / 2, by = y + h - 76;
    cv.roundRect(x + 20, by, bw, 58, 4, P.box); cv.roundRect(x + 22, by + 2, bw - 4, 54, 3, P.bg);
    txt(cv, 'CANCEL', x + 20 + bw / 2, by + 39, 26, P.text, { align: 'center' });
    cv.target(x + 20, by, bw, 58, no, 'confirm:no', 4);
    cv.roundRect(x + 40 + bw, by, bw, 58, 4, P.box);
    txt(cv, 'SWITCH', x + 40 + bw + bw / 2, by + 39, 26, P.ink, { align: 'center' });
    cv.target(x + 40 + bw, by, bw, 58, yes, 'confirm:yes', 4);
}

module.exports = { draw, confirm, COLS };
