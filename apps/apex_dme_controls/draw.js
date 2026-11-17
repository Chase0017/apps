'use strict';
/**
 * draw.js - Apex DME Controls' one page (1600 x 520, design: design/dme-controls-v1/): three boxes side by side,
 * engine map (left), exhaust valve (middle), Max Cooling (right). Pure canvas calls (kit canvas recorder) and taps
 * (cv.target); the actions come in through `act`.
 *
 *   draw(cv, bottom, v, opt, act)
 *     v    Control.view()
 *     opt  { P (gt3 palette), names [4], tempF, coolant, oil, rpm, held { coolant, oil, rpm } (dimmed with an amber dot), hold, closeLimit (rpm or null), locked (the confirm sheet is up: no taps) }
 *     act  { map(n), valve(mode), cooling(on), mgf(key, value), ethStep(d), ethApply() }
 *
 * With MG Flasher picked the page is MG Flasher's own (mgfPage): Exhaust (valve, burble), Cooling (Max Cooling, radiator
 * flap, temperatures), Fuel and car (ethanol override and content, valet mode). Each control lights what the DME
 * reads back; the one being sent has an amber edge.
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
    const right = v.tuner === 'off' || (v.tuner === 'mgf' && v.mgfJob === 'bmw') ? 'BMW job' : v.tuner === 'mgf' ? 'MG Flasher' : v.tuner.toUpperCase();
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
    const y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Max cooling', v.tuner === 'mgf' ? 'MG Flasher' : 'MHD');
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

/* ---------------- MG Flasher's page ---------------- */
const MCOLS = [[16, 520], [548, 520], [1080, 504]];
const FLAPS = [[0, 'OEM'], [2, 'OPEN'], [1, 'CLOSED']];

/** A row of buttons: opts [[value, label]], the read-back value filled, the one being sent edged amber. */
function group(cv, P, x, y, w, h, opts, cur, sending, can, pick, key, size) {
    cv.roundRect(x, y, w, h, 4, sending !== null && sending !== undefined ? P.warm : can ? P.box : P.off);
    cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, P.bg);
    const ow = (w - 4) / opts.length;
    opts.forEach((o, i) => {
        const on = cur === o[0], ox = x + 2 + i * ow, sendThis = sending === o[0];
        if (on) cv.fillRect(ox, y + 2, ow, h - 4, can ? P.box : P.off);
        else if (i && cur !== opts[i - 1][0]) cv.fillRect(ox, y + 12, 1, h - 24, P.line);
        if (sendThis) cv.fillRect(ox + 8, y + h - 9, ow - 16, 4, P.warm);
        fit(cv, o[1], ox + ow / 2, y + h / 2 + size * 0.36, size, ow - 12, on ? P.ink : can ? P.text : P.off, { align: 'center' });
        if (can && !on) cv.target(ox, y - 4, ow, h + 8, () => pick(o[0]), key + ':' + o[0], 3);
    });
}
/** A control's name over it, what the DME holds on the right. */
function label(cv, P, x, y, w, name, state, warm) {
    txt(cv, up(name), x + 2, y, 19, P.dim);
    if (state) fit(cv, up(state), x + w - 2, y, 19, w * 0.6, warm ? P.warm : P.text, { align: 'right' });
}
const sendingOf = (m, key) => (m.pending === key ? m.want : null);
const readOr = (n, f) => (n === null || n === undefined ? '--' : f(n));

function mgfPage(cv, P, v, opt, act, bottom) {
    const m = v.mgf, can = !v.mgfBlock && m.pending === null, bh = 104, gap = bh + 56;
    const footer = (x, w, s, warn) => wrap(cv, s, x + 14, bottom - 46, w - 28, 18, warn ? P.warm : P.dim);
    const status = v.mgfBlock || (m.note || (m.found ? 'Read back from the DME every 10 s' : 'Reading the DME…'));
    const warnAll = !!v.mgfBlock || m.warn;

    // Exhaust: valve, burble
    let [x, w] = MCOLS[0];
    let y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Exhaust', 'MG Flasher');
    const valveCur = v.valve.want === 'closed' && v.valve.paused ? 0 : MGF_FLAP[v.valve.want];
    let y = y0 + 34;
    label(cv, P, x + 12, y, w - 24, 'Valve', v.valve.paused ? 'OEM above ' + opt.closeLimit + ' rpm' : readOr(m.valve, (n) => ['OEM · car decides', 'closed', 'open'][n]), v.valve.paused);
    group(cv, P, x + 12, y + 12, w - 24, bh, FLAPS, valveCur, sendingOf(m, 'valve'), can, (n) => act.valve(['oem', 'closed', 'open'][n]), 'valve', 34);
    y += gap;
    label(cv, P, x + 12, y, w - 24, 'Burble', readOr(m.burble, (n) => (n ? 'level ' + n : 'off')));
    group(cv, P, x + 12, y + 12, w - 24, bh, [[0, 'OFF'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], m.burble, sendingOf(m, 'burble'), can, (n) => act.mgf('burble', n), 'burble', 34);
    footer(x, w, 'Burble is on the throttle lift. 5 is the loudest.', false);

    // Cooling: Max Cooling, radiator flap, temperatures
    [x, w] = MCOLS[1];
    y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Cooling', 'MG Flasher');
    y = y0 + 34;
    const coolOn = m.cooling === 1, coolCan = can && !v.coolBlock;
    label(cv, P, x + 12, y, w - 24, 'Max cooling', readOr(m.cooling, (n) => (n ? 'fans and pump flat out' : 'off')));
    const tx = x + 12, ty = y + 12, tw0 = w - 24, sendCool = sendingOf(m, 'cooling');
    cv.roundRect(tx, ty, tw0, bh, 4, sendCool !== null ? P.warm : !coolCan ? P.off : coolOn ? P.cold : P.box);
    if (!coolOn) cv.roundRect(tx + 2, ty + 2, tw0 - 4, bh - 4, 3, P.bg);
    txt(cv, coolOn ? 'ON' : 'OFF', tx + 24, ty + bh / 2 + 15, 42, coolOn ? '#0b0d10' : coolCan ? P.text : P.off);
    txt(cv, coolOn ? 'TAP TO TURN OFF' : 'TAP TO TURN ON', tx + tw0 - 20, ty + bh / 2 + 7, 19, coolOn ? '#0b0d10' : P.dim, { align: 'right' });
    if (coolCan) cv.target(tx, ty, tw0, bh, () => act.cooling(!coolOn), 'cooling', 4);
    y += gap;
    label(cv, P, x + 12, y, w - 24, 'Radiator flap', readOr(m.radFlap, (n) => ['OEM · car decides', 'closed', 'open'][n]));
    group(cv, P, x + 12, y + 12, w - 24, bh, FLAPS, m.radFlap, sendingOf(m, 'radFlap'), can, (n) => act.mgf('radFlap', n), 'radFlap', 34);
    y += bh + 44;
    const held = opt.held || {}, col = (c, warm, hot) => (typeof c !== 'number' ? P.text : c >= hot ? P.hot : c >= warm ? P.warm : c < 70 ? P.cold : P.text);
    const t3 = (w - 24 - 16) / 3;
    [['COOLANT', T(opt.coolant, opt.tempF), col(opt.coolant, 108, 115), held.coolant], ['OIL', T(opt.oil, opt.tempF), col(opt.oil, 130, 140), held.oil],
        ['RPM', typeof opt.rpm === 'number' ? String(Math.round(opt.rpm / 10) * 10) : '--', P.text, held.rpm]].forEach((t, i) => {
        const bx = x + 12 + i * (t3 + 8);
        txt(cv, t[0], bx + 2, y + 18, 16, P.dim);
        gt3.heldText(cv, t[1], bx + t3 - 2, y + 18, 26, t[2], Object.assign({}, gt3.FONT, { align: 'right', maxW: t3 - 70 }), t[3]);
    });
    footer(x, w, v.coolBlock || 'Max Cooling needs the engine running. OEM hands the flap back to the car.', !!v.coolBlock);

    // Fuel and car: ethanol override and content, valet mode
    [x, w] = MCOLS[2];
    y0 = gt3.section(cv, P, x, TOP, w, bottom - TOP, 'Fuel and car', 'Maps on the wheel');
    y = y0 + 34;
    const ethCan = can && !v.ethBlock;
    label(cv, P, x + 12, y, w - 24, 'Ethanol override', readOr(m.ethanol, (n) => (n ? 'on · ' + readOr(m.ethPct, (p) => p + ' %') : 'off · flex sensor')));
    const sw = 190;
    group(cv, P, x + 12, y + 12, sw, bh, [[0, 'OFF'], [1, 'ON']], m.ethanol, sendingOf(m, 'ethanol'), ethCan, (n) => act.mgf('ethanol', n), 'ethanol', 30);
    // the content: a draft stepped in 5 % steps, sent with APPLY (and a confirm)
    const ex = x + 12 + sw + 12, ew = w - 24 - sw - 12, draft = opt.ethDraft !== null && opt.ethDraft !== undefined ? opt.ethDraft : m.ethPct;
    const changed = draft !== null && draft !== undefined && draft !== m.ethPct, sendPct = m.pending === 'ethPct';
    cv.roundRect(ex, y + 12, ew, bh, 4, sendPct ? P.warm : changed ? P.text : ethCan ? P.box : P.off);
    cv.roundRect(ex + 2, y + 14, ew - 4, bh - 4, 3, P.bg);
    const sq = 52, sy = y + 12 + (bh - sq) / 2;
    [[ex + 10, '-', -5], [ex + ew - 10 - sq, '+', 5]].forEach((b) => {
        const ok = ethCan && typeof draft === 'number' && draft + b[2] >= 0 && draft + b[2] <= 100;
        cv.roundRect(b[0], sy, sq, sq, 4, ok ? P.box : P.off);
        txt(cv, b[1], b[0] + sq / 2, sy + sq / 2 + 12, 34, ok ? P.ink : P.bg, { align: 'center' });
        if (ok) cv.target(b[0], sy - 6, sq, sq + 12, () => act.ethStep(b[2]), 'eth:' + b[1], 3);
    });
    txt(cv, readOr(draft, (p) => p + ' %'), ex + ew / 2, y + 12 + bh / 2 + 15, 40, ethCan ? P.text : P.off, { align: 'center' });
    y += bh + 20;
    if (changed && ethCan) {
        gt3.button(cv, P, ex, y, 'Apply ' + draft + ' %', () => act.ethApply(), 'ethApply', false, 19);
        fit(cv, 'NOW ' + readOr(m.ethPct, (p) => p + ' %'), x + 14, y + 26, 17, sw, P.dim);
    }
    y += 76;
    label(cv, P, x + 12, y, w - 24, 'Valet mode', readOr(m.valet, (n) => (n ? 'on · power held back' : 'off')), m.valet === 1);
    group(cv, P, x + 12, y + 12, w - 24, bh, [[0, 'OFF'], [1, 'ON']], m.valet, sendingOf(m, 'valet'), can, (n) => act.mgf('valet', n), 'valet', 34);
    footer(x, w, warnAll ? status : v.ethBlock && changed ? v.ethBlock : status, warnAll || (!!v.ethBlock && changed));
}
const MGF_FLAP = { oem: 0, closed: 1, open: 2 };

function draw(cv, bottom, v, opt, act) {
    const P = opt.P, target = cv.target;
    cv.clear(P.bg);
    if (opt.locked) cv.target = function () { return this; };     // under the confirm sheet: nothing on the page takes a tap
    try {
        if (v.tuner === 'mgf') mgfPage(cv, P, v, opt, act, bottom);
        else {
            mapBox(cv, P, v, opt, act, bottom);
            valveBox(cv, P, v, opt, act, bottom);
            coolBox(cv, P, v, opt, act, bottom);
        }
    } finally { cv.target = target; }
}

/** The confirm sheet over the page before a map switch. */
function confirm(cv, bottom, P, n, name, yes, no) {
    ask(cv, bottom, P, 'Switch to map ' + n + '?', name, 'The engine light may flash for a moment. Stay stopped until the page says ACCEPTED.', 'Switch', yes, no);
}
/** A confirm sheet: title, a big line, a note, and CANCEL / the yes button. */
function ask(cv, bottom, P, title, big, body, yesText, yes, no) {
    cv.fillRect(0, 36, 1600, bottom - 36 + 8, '#000000cc');
    const w = 640, h = 250, x = (1600 - w) / 2, y = 36 + (bottom - 36 - h) / 2;
    gt3.section(cv, P, x, y, w, h, title);
    fit(cv, up(big), x + 24, y + 80, 34, w - 48, P.text);
    wrap(cv, body, x + 24, y + 112, w - 48, 20, P.dim);
    const bw = (w - 60) / 2, by = y + h - 76;
    cv.roundRect(x + 20, by, bw, 58, 4, P.box); cv.roundRect(x + 22, by + 2, bw - 4, 54, 3, P.bg);
    txt(cv, 'CANCEL', x + 20 + bw / 2, by + 39, 26, P.text, { align: 'center' });
    cv.target(x + 20, by, bw, 58, no, 'confirm:no', 4);
    cv.roundRect(x + 40 + bw, by, bw, 58, 4, P.box);
    txt(cv, up(yesText), x + 40 + bw + bw / 2, by + 39, 26, P.ink, { align: 'center' });
    cv.target(x + 40 + bw, by, bw, 58, yes, 'confirm:yes', 4);
}

module.exports = { draw, confirm, ask, COLS, MCOLS };
