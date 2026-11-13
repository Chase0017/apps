'use strict';
/**
 * gt3ui.js - the GT3 look for the apps' own centre-screen pages (chase0017-apps, Nov 13 2026; design:
 * design/settings-v3/): black, every section a frame in the box colour with a solid header strip and dark text on
 * it, Barlow Condensed caps (the kit font family 'race'), square corners. Used by shared/page.js (Apex Cluster,
 * Apex HUD) and apps/apex_telemetry/setup.js.
 *
 * Every piece draws with the kit canvas calls (roundRect, fillRect, text, textWidth, target, line, arc, circle) and
 * takes P, the palette from palette(boxColour). Text y is the baseline. Plain Node 8.
 */
const FONT = { font: 'race', literal: true };
/** The box colours (setting "boxColour"): [value, colour, name]. Text on a box is dark, white on the dark ones. */
const BOX = [
    ['white', '#ffffff', 'White'], ['silver', '#c9d3df', 'Silver'], ['yellow', '#ffd60a', 'Yellow'], ['orange', '#ff9f0a', 'Orange'],
    ['red', '#ff3b30', 'Red'], ['mblue', '#1c69d4', 'M blue'], ['green', '#3ddc84', 'Green'],
];
const WHITE_INK = ['red', 'mblue'];

/** The page colours for a box colour: box (frames, header strips, selected), ink (text on them), and the fixed ones. */
function palette(key) {
    const b = BOX.find((x) => x[0] === key) || BOX[0];
    return {
        key: b[0], name: b[2], box: b[1], ink: WHITE_INK.indexOf(b[0]) >= 0 ? '#ffffff' : '#0b0d10',
        bg: '#050607', text: '#ffffff', dim: '#9aa0a8', line: '#ffffff2e', off: '#ffffff40',
        ok: '#3ddc84', warm: '#ffd60a', hot: '#ff3b30', cold: '#4aa3ff',
    };
}
/** A box colour as [r, g, b, a] (cluster-render themes). */
function rgba(key) {
    const h = (BOX.find((x) => x[0] === key) || BOX[0])[1];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
}

const up = (s) => String(s).toUpperCase();
function txt(cv, s, x, y, size, c, opt) { return cv.text(s, x, y, size, c, opt ? Object.assign({}, FONT, opt) : FONT); }
function tw(cv, s, size) { return cv.textWidth(s, size, FONT); }
/** text shrunk to fit w (down to min) */
function fit(cv, s, x, y, size, w, c, opt, min) {
    const k = tw(cv, s, size);
    return txt(cv, s, x, y, k > w ? Math.max(min || 12, size * w / k) : size, c, opt);
}

/* ---------- held values (Nov 13 2026) ----------
 * A value the car stopped sending stays on screen, dimmed, with a small amber dot after it at cap height (it used to
 * be a "!"). The dot sits in room the text gives up, so a right-aligned number still ends where it did. */
const HELD_AMBER = '#ffb000';
const HELD_DIM = 0.45;
/** colour c ('#rrggbb', '#rrggbbaa' or [r, g, b, a]) at HELD_DIM brightness, as '#rrggbbaa' */
function heldDim(c) {
    let v = c;
    if (typeof c === 'string' && c.charAt(0) === '#') v = [1, 3, 5, 7].map((i) => (i < c.length ? parseInt(c.slice(i, i + 2), 16) : 255));
    if (!Array.isArray(v)) return c;
    const h = (n) => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
    return '#' + h(v[0] * HELD_DIM) + h(v[1] * HELD_DIM) + h(v[2] * HELD_DIM) + h(v[3] === undefined ? 255 : v[3]);
}
/** the dot's radius and the room it takes after the text, for text of this size */
function heldDot(size) { const r = Math.max(3, Math.round(size * 0.085)); return { r, room: Math.round(r * 2 + Math.max(3, r * 0.9)) }; }
/** Text that may be held: held and not a dash draws dimmed with the amber dot; otherwise plain cv.text. o: cv.text options
 *  (align, font) and maxW: the width the text may take; without room for the dot there, the text stays put and the dot
 *  sits at its right end just above the digits (the size never shrinks for it). Returns the width taken. */
function heldText(cv, s, x, y, size, c, o, held) {
    o = o || {};
    if (!held || /^-+$/.test(String(s))) return cv.text(s, x, y, size, c, o);
    const d = heldDot(size), w = cv.textWidth(s, size, o), total = w + d.room;
    if (o.maxW && total > o.maxW) {
        cv.text(s, x, y, size, heldDim(c), o);
        const right = o.align === 'right' ? x : o.align === 'center' ? x + w / 2 : x + w;
        cv.circle(right - d.r, y - size * 0.74 - d.r - 3, d.r, HELD_AMBER);
        return w;
    }
    const left = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    cv.text(s, left, y, size, heldDim(c), Object.assign({}, o, { align: 'left' }));
    cv.circle(left + total - d.r, y - size * 0.7 + d.r, d.r, HELD_AMBER);
    return total;
}

/** A section: a frame in the box colour, a 30 px header strip (title left, note right). Returns where its rows start. */
function section(cv, P, x, y, w, h, title, right) {
    cv.roundRect(x, y, w, h, 5, P.box);
    cv.roundRect(x + 2, y + 30, w - 4, h - 32, 3, P.bg);
    txt(cv, up(title), x + 12, y + 22, 21, P.ink);
    if (right) fit(cv, up(right), x + w - 12, y + 22, 18, w * 0.5, P.ink, { align: 'right' });
    return y + 30;
}
/** A row inside a section (a line above it unless first): its name in caps, a grey line under it. Returns its centre y. */
function row(cv, P, x, y, w, h, name, sub, first) {
    if (!first) cv.fillRect(x + 2, y, w - 4, 1, P.line);
    const cy = y + h / 2;
    if (sub) {
        txt(cv, up(name), x + 16, cy - 1, 22, P.text);
        fit(cv, sub, x + 16, cy + 19, 16, w * 0.55, P.dim);
    } else txt(cv, up(name), x + 16, cy + 8, 22, P.text);
    return cy;
}
/** Segmented buttons, right edge at xr, centred on cy: opts [[value, label]], the one equal to cur filled. Returns the left edge. */
function seg(cv, P, xr, cy, opts, cur, pick, key, size) {
    size = size || 19;
    const h = size + 16, pad = size * 0.8;
    const ws = opts.map((o) => tw(cv, up(o[1]), size) + 2 * pad), w = ws.reduce((a, b) => a + b, 0) + 4;
    const x = xr - w, y = cy - h / 2;
    cv.roundRect(x, y, w, h, 4, P.box);
    cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, P.bg);
    let cx = x + 2;
    opts.forEach((o, i) => {
        const on = String(o[0]) === String(cur);
        if (on) cv.fillRect(cx, y + 2, ws[i], h - 4, P.box);
        else if (i && String(opts[i - 1][0]) !== String(cur)) cv.fillRect(cx, y + 6, 1, h - 12, P.line);
        txt(cv, up(o[1]), cx + ws[i] / 2, cy + size * 0.36, size, on ? P.ink : P.text, { align: 'center' });
        cv.target(cx, y - 4, ws[i], h + 8, () => pick(o[0]), key + ':' + o[0], 3);
        cx += ws[i];
    });
    return x;
}
/** A square − / + button. run null: greyed out. */
function sq(cv, P, x, y, s, sign, run, key) {
    cv.roundRect(x, y, s, s, 4, run ? P.box : P.off);
    cv.roundRect(x + 2, y + 2, s - 4, s - 4, 3, P.bg);
    const c = run ? P.text : P.off;
    cv.fillRect(x + s / 2 - 8, y + s / 2 - 1.25, 16, 2.5, c);
    if (sign === '+') cv.fillRect(x + s / 2 - 1.25, y + s / 2 - 8, 2.5, 16, c);
    if (run) cv.target(x - 4, y - 6, s + 8, s + 12, run, key, 4);
}
/** − value + stepper, right edge at xr. dn / upFn null at an end. Returns the left edge. */
function stepper(cv, P, xr, cy, text, dn, upFn, key, valW) {
    valW = valW || 136;
    const s = 38, x1 = xr - s, x0 = x1 - valW - s;
    sq(cv, P, x0, cy - s / 2, s, '-', dn, 'dn:' + key);
    sq(cv, P, x1, cy - s / 2, s, '+', upFn, 'up:' + key);
    fit(cv, text, x0 + s + valW / 2, cy + 9, 26, valW - 8, P.text, { align: 'center' });
    return x0;
}
/** A steps setting's stepper: the value moves through s.steps. */
function stepSetting(cv, P, xr, cy, item, value, set, fmt, valW) {
    const st = (item && item.steps) || [], i = st.indexOf(value);
    return stepper(cv, P, xr, cy, fmt(value), i > 0 ? () => set(st[i - 1]) : null, i >= 0 && i < st.length - 1 ? () => set(st[i + 1]) : (i < 0 && st.length ? () => set(st[0]) : null), item ? item.key : 'step', valW);
}
/** An on / off switch, right edge at xr. */
function toggle(cv, P, xr, cy, on, run, key) {
    const w = 62, h = 30, x = xr - w, y = cy - h / 2;
    cv.roundRect(x, y, w, h, 4, P.box);
    if (!on) cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, P.bg);
    cv.roundRect(on ? x + w - 27 : x + 5, y + 5, 22, h - 10, 2, on ? P.ink : P.off);
    cv.target(x - 12, y - 10, w + 24, h + 20, run, key, 4);
    return x;
}
/** A button: filled, or framed (ghost). Returns its width. */
function button(cv, P, x, y, text, run, key, ghost, size) {
    size = size || 19;
    const w = tw(cv, up(text), size) + 36, h = size + 20;
    cv.roundRect(x, y, w, h, 4, run || !ghost ? P.box : P.off);
    if (ghost || !run) cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, P.bg);
    txt(cv, up(text), x + w / 2, y + h / 2 + size * 0.36, size, ghost || !run ? (run ? P.text : P.off) : P.ink, { align: 'center' });
    if (run) cv.target(x, y, w, h, run, key, 4);
    return w;
}
/** A chip (a small choice in a row of them). Returns its width. */
function chip(cv, P, x, y, text, on, run, key, size) {
    size = size || 17;
    const w = tw(cv, up(text), size) + 26, h = size + 14;
    cv.roundRect(x, y, w, h, 4, P.box);
    if (!on) cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, P.bg);
    txt(cv, up(text), x + w / 2, y + h / 2 + size * 0.36, size, on ? P.ink : P.text, { align: 'center' });
    if (run) cv.target(x, y, w, h, run, key, 4);
    return w;
}
/** The box colour swatches, right edge at xr. */
function swatches(cv, P, xr, cy, cur, pick) {
    const s = 34, g = 9;
    let x = xr - BOX.length * (s + g) + g;
    BOX.forEach((b) => {
        if (b[0] === cur) cv.roundRect(x - 4, cy - s / 2 - 4, s + 8, s + 8, 6, '#ffffff');
        cv.roundRect(x - 1, cy - s / 2 - 1, s + 2, s + 2, 5, '#000000');
        cv.roundRect(x, cy - s / 2, s, s, 4, b[1]);
        cv.target(x - 4, cy - s / 2 - 6, s + 8, s + 12, () => pick(b[0]), 'box:' + b[0], 4);
        x += s + g;
    });
}
/** A colour bar under a limit: grey, then yellow from yel, red from red (null: none), over lo..hi. */
function scaleBar(cv, P, x, y, w, lo, hi, yel, red) {
    const X = (v) => x + w * Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    cv.roundRect(x, y, w, 7, 2, '#ffffff22');
    if (yel > 0 && yel < hi) cv.fillRect(X(yel), y, Math.max(0, (red > 0 ? X(red) : x + w) - X(yel)), 7, P.warm);
    if (red > 0 && red < hi) cv.fillRect(X(red), y, x + w - X(red), 7, P.hot);
}
/** The rail of tabs on the left: tabs [{ id, name, value, icon }], the selected one filled in. */
function rail(cv, P, x, y, w, bottom, tabs, sel, pick) {
    const gap = 8, h = Math.min(56, Math.floor((bottom - y - gap * (tabs.length - 1)) / tabs.length));
    tabs.forEach((t, i) => {
        const ty = y + i * (h + gap), on = t.id === sel;
        cv.roundRect(x, ty, w, h, 5, P.box);
        if (!on) cv.roundRect(x + 2, ty + 2, w - 4, h - 4, 3, P.bg);
        icon(cv, t.icon, x + 28, ty + h / 2, on ? P.ink : P.box);
        fit(cv, up(t.name), x + 54, ty + h / 2 + (t.value ? -1 : 8), 23, w - 66, on ? P.ink : P.text);
        if (t.value) fit(cv, t.value, x + 54, ty + h / 2 + 18, 16, w - 66, on ? P.ink : P.dim);
        cv.target(x, ty, w, h, () => pick(t.id), 'tab:' + t.id, 5);
    });
}
/** A note in grey under a section. */
function note(cv, P, x, y, lines) { lines.forEach((s, i) => txt(cv, s, x, y + i * 22, 17, P.dim)); }

/** Line icons for the rail, about 26 px, centred on (x, y). */
function icon(cv, name, x, y, c) {
    const lw = 2.2;
    if (name === 'screen') {
        cv.strokeRoundRect(x - 13, y - 10, 26, 17, 3, lw, c);
        cv.line(x - 6, y + 12, x + 6, y + 12, lw, c);
    } else if (name === 'lines') {
        [-8, 0, 8].forEach((d) => { cv.circle(x - 10, y + d, 2.2, c); cv.line(x - 4, y + d, x + 13, y + d, lw, c); });
    } else if (name === 'move') {
        cv.line(x - 13, y, x + 13, y, lw, c); cv.line(x, y - 13, x, y + 13, lw, c);
        [[0, -13, -4, -9, 4, -9], [0, 13, -4, 9, 4, 9], [-13, 0, -9, -4, -9, 4], [13, 0, 9, -4, 9, 4]].forEach((t) => {
            cv.line(x + t[0], y + t[1], x + t[2], y + t[3], lw, c); cv.line(x + t[0], y + t[1], x + t[4], y + t[5], lw, c);
        });
    } else if (name === 'units') {
        cv.line(x - 12, y - 5, x + 12, y - 5, lw, c); cv.line(x + 12, y - 5, x + 7, y - 10, lw, c);
        cv.line(x - 12, y + 5, x + 12, y + 5, lw, c); cv.line(x - 12, y + 5, x - 7, y + 10, lw, c);
    } else if (name === 'alert') {
        cv.polyline([[x, y - 12], [x + 13, y + 10], [x - 13, y + 10], [x, y - 12]], lw, c);
        cv.line(x, y - 4, x, y + 3, lw, c);
        cv.circle(x, y + 6.5, 1.4, c);
    } else if (name === 'clock') {
        cv.arc(x, y, 10.5, 12.7, 0, 360, c);
        cv.line(x, y, x, y - 7, lw, c); cv.line(x, y, x + 5, y + 3, lw, c);
    } else if (name === 'tyre') {
        cv.arc(x, y, 8.5, 12.7, 0, 360, c);
        cv.arc(x, y, 0, 3.2, 0, 360, c);
    } else if (name === 'data') {
        cv.line(x - 6, y - 12, x - 6, y + 12, lw, c); cv.line(x - 6, y - 12, x - 11, y - 7, lw, c);
        cv.line(x + 6, y + 12, x + 6, y - 12, lw, c); cv.line(x + 6, y + 12, x + 11, y + 7, lw, c);
    } else if (name === 'cog') {
        cv.arc(x, y, 6.5, 9, 0, 360, c);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            cv.line(x + Math.sin(a) * 9, y - Math.cos(a) * 9, x + Math.sin(a) * 13, y - Math.cos(a) * 13, 3, c);
        }
    } else if (name === 'back') {
        cv.line(x + 6, y - 10, x - 5, y, 3, c); cv.line(x - 5, y, x + 6, y + 10, 3, c);
    }
}

/**
 * Text in the kit's Ubuntu families drawn in the race font instead (a little larger: Barlow Condensed is narrow), so
 * the older page code (shared/page.js) takes the GT3 look without touching every call. Patches the recorder once.
 */
function raceText(cv) {
    if (!cv || cv.__race) return cv;
    const text = cv.text, width = cv.textWidth;
    const ours = (o) => !o || !o.font || o.font === 'bold' || o.font === 'label' || o.font === 'light';
    const map = (o) => (ours(o) ? Object.assign({}, o, { font: 'race', spacing: o && o.spacing ? o.spacing * 0.4 : 0 }) : o);
    cv.text = function (s, x, y, size, c, o) { return text.call(this, s, x, y, ours(o) ? size * 1.16 : size, c, map(o)); };
    cv.textWidth = function (s, size, o) { return width.call(this, s, ours(o) ? size * 1.16 : size, map(o)); };
    cv.__race = true;
    return cv;
}

module.exports = { HELD_AMBER, HELD_DIM, heldDim, heldDot, heldText, BOX, palette, rgba, up, txt, tw, fit, section, row, seg, stepper, stepSetting, toggle, button, chip, swatches, scaleBar, rail, note, icon, raceText, FONT };
