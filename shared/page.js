'use strict';
/**
 * page.js - the app's own centre-screen page (Apex Cluster, Apex HUD), in place of BMW's plain settings list.
 * Look (chase0017-apps, Nov 13 2026, design/settings-v3/): GT3 like the dash, from shared/gt3ui.js: black, sections
 * framed in the box colour (setting "boxColour") with a header strip, Barlow Condensed caps, a rail of tabs on the
 * left (icon, name, current value). Tabs: Layouts, Readouts, Units, Shift & alerts, Badge & clock (cluster),
 * Position & colours (HUD), System.
 *
 * Drawn on the kit's canvas screen (kit/runtime/display.js): on the Store's renderer it fills the screen at
 * up to 60 fps and every tap or controller press lands on a target (cv.target); without the renderer the
 * same drawing goes to the HMI as a picture. The kit's own Settings sheet (bar button) stays as the fallback.
 *
 *   new Page(ctx, hud, {
 *       title, what: 'cluster' | 'HUD',
 *       look: { name: 'Themes', style: 'hero' | 'cards', tags: { gt3: 'race dash', ... } },
 *       tabs: ['look', 'readouts', 'units', 'shift', 'clock', 'system'],   // and 'position' (HUD)
 *       display: ['showBoost', 'tankLitres', ...],   // the System tab's Display rows, after the box colour
 *   }).start();
 *
 * Theme pictures: previews.js (shot on the bench by tools/previews.py; the centre screen can't draw our
 * cluster-render themes live). Plain Node 8 (the car's 8.16.2).
 */
const G = require('./kit/gauges');
const gt3 = require('./gt3ui');
const themes = require('./kit/themes');
const previews = require('./previews');
const sensors = require('./sensors');
const visible = require('./visible');
const badges = require('./badges');
const tz = require('./tz');

const W = 1600, H = 520;
const A = G.withAlpha;
// GT3: black, white text; "blue" is the box colour (selected chips, switches, frames) and "ink" the text on it.
// Both follow the boxColour setting: render() fills them in from gt3ui.palette() every frame.
const C = {
    bg: '#050607', glow: '#050607', text: '#ffffff', dim: '#9aa0a8', label: '#9aa0a8', line: '#ffffff2e',
    blue: '#ffffff', blueHi: '#ffffff', blueDeep: '#ffffff', live: '#ffffff', off: '#c3cad6', ink: '#0b0d10',
};
const RAIL = { x: 16, y: 50, w: 252 };
const CX = 288, CR = 1584, CW = CR - CX;
const MODES = [['inComfort', 'Comfort'], ['inSport', 'Sport'], ['inEco', 'Eco Pro']];
const MODE_KEY = { comfort: 'inComfort', sport: 'inSport', eco: 'inEco' };
const TAB = {
    look: { icon: 'screen' },
    readouts: { name: 'Readouts', icon: 'lines' },
    position: { name: 'Position & colours', icon: 'move' },
    units: { name: 'Units', icon: 'units' },
    shift: { name: 'Shift & alerts', icon: 'alert' },
    clock: { name: 'Badge & clock', icon: 'clock' },
    system: { name: 'System', icon: 'cog' },
};
// the Test row's six dots per shift light colour pattern (setting "shiftColours"; hud.js SHIFT_PATTERNS draws the lights)
const SHIFT_DOTS = {
    gt3: ['#2fd27a', '#2fd27a', '#ffc21a', '#ff2a2a', '#ff2a2a', '#286eff'], f1: ['#2fd27a', '#2fd27a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#286eff'],
    red: ['#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a', '#ff2a2a'], blue: ['#286eff', '#286eff', '#286eff', '#286eff', '#286eff', '#286eff'],
};
// the warning limits on Shift & alerts: [key, name, what it does, scale low, scale high (C / bar)]
const WARN_ROWS = [
    ['warnOil', 'Oil temperature', 'Red over the limit', 90, 160],
    ['cautionCoolant', 'Coolant caution', 'Yellow over the limit', 90, 130],
    ['warnCoolant', 'Coolant warning', 'Flashing red over the limit', 90, 130],
    ['warnBoost', 'Boost warning', 'Red over the limit', 0, 2],
];

// the kit's own chrome (header, bar, Settings sheet) in black and white, to match the page
Object.assign(themes.THEMES.ice, { sel: '#ffffff', selText: '#0b0d10', bg: C.bg });

class Page {
    constructor(ctx, hud, cfg) {
        this.ctx = ctx; this.hud = hud; this.cfg = cfg;
        this.tab = cfg.tabs[0];
        this.picker = null;              // { key, title } while a list of choices is open over the page
        this.loop = null;
        this.slotLayout = null;          // Readouts: the layout whose slots are edited (null: the one showing)
        this.slot = null;                // Readouts: the slot picked (its id)
        this.cat = sensors.CATS[0];      // Readouts: the sensor group shown
        this.series = null;              // Badge: the series shown (null: the picked model's)
        this.confirm = null;             // { title, lines, yes, run } while a question is open over the page
    }

    start() {
        const ctx = this.ctx;
        this.loop = ctx.loop('MAIN', 10, () => this.render());
        ctx.settings.onChange(() => this.kick());
        ctx.onLayout(() => this.kick());
        this.hud.onStatus(() => this.kick());
        this.render();
    }
    kick() { if (this.loop && this.loop.kick) this.loop.kick(); }

    /* ---------- settings ---------- */
    get(k) { return this.hud.setting(k); }
    set(k, v) { if (this.ctx.settings.get(k) !== v) this.ctx.settings.set(k, v); this.kick(); }
    item(k) { return this.ctx.settings.item(k); }
    optLabel(k, v) {
        const s = this.item(k), o = s && (s.options || []).find((x) => x[0] === v);
        return o ? o[1] : String(v);
    }
    /** a layout's short name: "Off (BMW's own cluster)" -> "BMW's own" */
    layoutName(v) { return v === 'off' ? "BMW's own" : this.optLabel('hudLayout', v); }
    valueText(k) {
        const s = this.item(k), v = this.get(k);
        if (!s) return '';
        if (s.type === 'bool') return v ? 'On' : 'Off';
        if (s.type === 'number' && WARN_KEYS.indexOf(k) >= 0) return warnText(k, v, this.hud.unitUs(k === 'warnBoost' ? 'press' : 'temp'));
        if (k === 'timeZone') return tzText(v);
        if (k === 'tankLitres') return fmtInt(v) + ' L';
        if (s.type === 'number') return k === 'shiftBefore' ? (v ? fmtInt(v) + ' rpm before' : 'At the redline') : fmtInt(v) + ' rpm';
        return this.optLabel(k, v);
    }
    /** the layout showing now, else the one meant to (before cluster-render answers) */
    shownName() { return this.hud.activeName || this.hud._layoutName() || 'off'; }
    /** the layouts a theme card can show (not the calibration ones) */
    looks() { return ((this.item('inSport') || {}).options || []).map((o) => o[0]); }
    /**
     * A theme or layout picked on this page (key: hudLayout or a drive mode's). The cluster panel and the HUD
     * share one screen (screen.js): when the other app is drawing, ask first whether to turn it off; yes takes
     * the screen (the other app steps aside), Cancel changes nothing. Any pick here ends our own stepping aside.
     */
    chooseLayout(key, v) {
        const scr = this.hud.screen;
        if (v === 'off' || !scr || !scr.otherOn()) {
            if (scr) scr.release();
            this.set(key, v);
            return;
        }
        const cluster = this.cfg.what === 'cluster';
        this.confirm = {
            title: scr.otherName + ' is on',
            lines: cluster
                ? ['A cluster theme and the HUD can\'t show at the same time.', 'Turn Apex HUD off so ' + this.layoutName(v) + ' shows?']
                : ['The HUD and a cluster theme can\'t show at the same time.', 'Turn the cluster theme off so ' + this.layoutName(v) + ' shows?'],
            yes: cluster ? 'Turn HUD off' : 'Turn theme off',
            run: () => { scr.claim(); this.set(key, v); },
        };
        this.kick();
    }
    /** what the Look tab says while the other app has the screen, else null */
    yieldNote() {
        const scr = this.hud.screen;
        return scr && scr.yielded ? 'Off · ' + scr.otherName + ' has the screen · pick one to take it back' : null;
    }

    /** the key a tap on a theme sets: the drive mode's own while it changes with the drive mode */
    lookKey() {
        const m = this.hud.driveMode;
        return this.get('byMode') === true && MODE_KEY[m] ? MODE_KEY[m] : 'hudLayout';
    }

    /* ---------- drawing ---------- */
    render() {
        const cv = gt3.raceText(this.ctx.canvas(W, H));
        const bottom = G.pageBottom(cv);
        const P = this.P = gt3.palette(this.get('boxColour'));
        C.blue = C.blueDeep = P.box; C.ink = P.ink;
        cv.clear(C.bg);
        const on = this.hud.activeName && this.hud.activeName !== 'off';
        const demo = this.hud.car && this.hud.car.data().demo;
        G.frame(cv, this.theme(), [], -1, [
            demo ? { text: 'DEMO DATA', color: '#ffb020' } : null,
            { text: on ? 'ON THE ' + this.cfg.what.toUpperCase() : this.cfg.what.toUpperCase() + ' OFF', color: on ? '#3ddc84' : C.dim },
        ]);
        // the page under an open list takes no taps: the list (and a tap beside it to close) does
        const target = cv.target;
        if (this.picker || this.confirm) cv.target = function () { return this; };
        this.rail(cv, bottom);
        const body = { look: this.lookTab, readouts: this.readoutsTab, position: this.positionTab, units: this.unitsTab, shift: this.shiftTab, clock: this.clockTab, system: this.systemTab }[this.tab];
        if (body) body.call(this, cv, bottom);
        cv.target = target;
        if (this.picker) this.drawPicker(cv, bottom);
        if (this.confirm) this.drawConfirm(cv, bottom);
        return this.ctx.ui.image('MAIN_GFX', cv);
    }
    theme() { return this.ctx.theme(); }

    rail(cv, bottom) {
        const tabs = this.cfg.tabs.map((id) => ({ id, name: this.tabName(id), value: this.tabValue(id), icon: (TAB[id] || {}).icon }));
        gt3.rail(cv, this.P, RAIL.x, RAIL.y, RAIL.w, bottom, tabs, this.tab, (id) => { this.tab = id; this.picker = null; this.kick(); });
    }
    tabName(id) { return id === 'look' ? this.cfg.look.name : TAB[id].name; }
    tabValue(id) {
        if (id === 'look') return this.layoutName(this.shownName());
        if (id === 'readouts') { const l = this.editLayout(); return l ? this.layoutName(l) + ' · ' + this.hud.slotsOf(l).length + ' slots' : 'none here'; }
        if (id === 'position') {
            const p = this.hud.placeInfo();
            return (p.x || p.y ? 'moved' : 'centred') + ' · ' + Math.round(p.scale * 100) + ' % · ' + this.valueText('hudTheme').replace(/ \(.*\)$/, '');
        }
        if (id === 'units') return (this.hud.unitUs('speed') ? 'mph' : 'km/h') + ' · ' + (this.hud.unitUs('temp') ? '°F' : '°C') + ' · ' + (this.hud.unitUs('press') ? 'psi' : 'bar');
        if (id === 'shift') {
            const n = WARN_KEYS.filter((k) => this.item(k) && this.get(k) > 0).length;
            return fmtInt(this.get('redline') - (this.get('shiftBefore') || 0)) + ' rpm · ' + n + ' warning' + (n === 1 ? '' : 's');
        }
        if (id === 'clock') return (badges.text(this.get('badge'), false) || 'no badge') + ' · ' + (this.get('clock') === '24h' ? '24-hour' : '12-hour');
        if (id === 'system') return 'v' + this.ctx.spec.version + ' · ' + this.P.name.toLowerCase() + ' boxes';
        return '';
    }

    /* ---------- Themes / Layouts ---------- */
    lookTab(cv, bottom) {
        if (this.cfg.look.style === 'hero') this.lookHero(cv, bottom);
        else this.lookCards(cv, bottom);
    }

    /** Cluster: the theme showing now, the drive modes beside it; every theme below in two rows. */
    lookHero(cv, bottom) {
        const shown = this.shownName();
        label(cv, CX, 70, 'Now showing');
        const pw = 523, ph = 196, px = CX, py = 82;
        this.picture(cv, shown, 'big', px, py, pw, ph);
        // right: name, tag line, the drive modes side by side
        const rx = px + pw + 28, rw = CR - rx;
        cv.text(this.layoutName(shown), rx, py + 32, 34, '#ffffff', { font: 'bold', literal: true });
        cv.text(this.yieldNote() || this.tag(shown), rx, py + 58, 17, this.yieldNote() ? '#e0a340' : C.dim, { literal: true });
        const y = this.toggleRow(cv, rx, py + 72, rw, 'Change with the drive mode', 'byMode', 46);
        if (this.get('byMode') === true) {
            const now = MODE_KEY[this.hud.driveMode], cw = (rw - 24) / 3;
            MODES.forEach((m, i) => this.modeCell(cv, rx + i * (cw + 12), y, cw, m[1] + (m[0] === now ? '  ·  now' : ''), m[0]));
        } else this.pickRow(cv, rx, y, rw, 'Theme', 'hudLayout', (v) => this.layoutName(v), 52);
        // the gallery, two rows: a tap shows that theme (in the drive mode the car is in, when it changes with it)
        const looks = this.looks(), cols = Math.max(5, Math.ceil(looks.length / 2)), gap = 12, gy = py + ph + 16;
        const gw = (CW - gap * (cols - 1)) / cols, gh = (bottom - gy - 4 - gap) / 2;
        looks.forEach((v, i) => {
            const x = CX + (i % cols) * (gw + gap), yy = gy + Math.floor(i / cols) * (gh + gap), sel = v === shown;
            glass(cv, x, yy, gw, gh, sel);
            const ih = Math.min(gh - 34, (gw - 16) * 0.375), iw = ih / 0.375;
            this.picture(cv, v, 'small', x + (gw - iw) / 2, yy + 8, iw, ih);
            const nw = cv.text(this.layoutName(v), x + 12, yy + gh - 10, 16, '#ffffff', { font: 'bold', literal: true });
            if (nw + cv.textWidth(this.tag(v), 13, { literal: true }) + 36 < gw) cv.text(this.tag(v), x + gw - 12, yy + gh - 10, 13, C.dim, { align: 'right', literal: true });
            cv.target(x, yy, gw, gh, () => this.chooseLayout(this.lookKey(), v), 'look:' + v, 16);
        });
    }

    /** A drive mode's theme as a small two-line cell (name over value), a tap opens the list. */
    modeCell(cv, x, y, w, name, key) {
        const h = 52;
        glass(cv, x, y, w, h, false);
        cv.text(name, x + 14, y + 20, 14, C.dim, { literal: true });
        cv.text(this.layoutName(this.get(key)), x + 14, y + 42, 18, C.blueHi, { font: 'bold', literal: true });
        chevron(cv, x + w - 18, y + h / 2, C.dim);
        cv.target(x, y, w, h, () => { this.picker = { key, title: name, fmt: (v) => this.layoutName(v) }; this.kick(); }, 'set:' + key, 14);
    }

    /** HUD: a card per layout with its picture and the drive modes that show it, in two rows. */
    lookCards(cv, bottom) {
        const shown = this.shownName();
        label(cv, CX, 70, this.yieldNote() || this.cfg.look.name + ' · tap a drive mode to give it that layout');
        const looks = this.looks(), cols = Math.max(5, Math.ceil(looks.length / 2)), gap = 12, y0 = 84;
        const cw = (CW - gap * (cols - 1)) / cols, ch = (bottom - y0 - 56 - 12 - gap) / 2;
        looks.forEach((v, i) => {
            const x = CX + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap), sel = v === shown;
            glass(cv, x, y, cw, ch, sel);
            const ih = Math.min(ch - 82, (cw - 20) * 0.624), iw = ih / 0.624;
            this.picture(cv, v, 'big', x + (cw - iw) / 2, y + 10, iw, ih);
            const ty = y + 10 + ih + 22;
            cv.text(v === 'off' ? 'Off' : this.layoutName(v), x + 12, ty, 17, '#ffffff', { font: 'bold', literal: true });
            cv.text(this.tag(v), x + cw - 12, ty, 12, C.dim, { align: 'right', literal: true });
            if (v === 'off') {
                // the off switch: BMW's own HUD in every drive mode
                cv.target(x, y, cw, ch, () => { this.set('byMode', false); this.chooseLayout('hudLayout', 'off'); }, 'look:off', 16);
                cv.text(sel ? 'HUD is off' : 'Tap to turn the HUD off', x + 12, ty + 30, 14, sel ? C.blueHi : C.dim, { literal: true });
                return;
            }
            cv.target(x, y, cw, ih + 20, () => this.chooseLayout(this.lookKey(), v), 'look:' + v, 16);
            let cx = x + 12;
            MODES.forEach((m) => {
                const lit = this.get(m[0]) === v;
                cx += miniChip(cv, cx, ty + 12, m[1], lit, () => this.chooseLayout(m[0], lit ? 'off' : v), 'mode:' + v + ':' + m[0]) + 6;
            });
        });
        // under the cards: switching with the drive mode, and what shows when it doesn't
        const by = y0 + 2 * ch + gap + 12;
        const half = (CW - 20) / 2;
        this.toggleRow(cv, CX, by, half, 'Change with the drive mode', 'byMode', 50);
        this.pickRow(cv, CX + half + 20, by, half, this.get('byMode') ? 'Otherwise' : 'Layout', 'hudLayout', (v) => this.layoutName(v), 50);
    }

    tag(v) { return v === 'off' ? 'stock ' + this.cfg.what : (this.cfg.look.tags || {})[v] || ''; }

    /** A theme's picture (black when there is none: BMW's own, or a build without previews). */
    picture(cv, name, size, x, y, w, h) {
        cv.roundRect(x, y, w, h, 10, '#000000');
        const p = name !== 'off' && previews.get(name, size);
        if (p) cv.image(p.id, x, y, w, h);
        else cv.text(name === 'off' ? "BMW's own " + this.cfg.what : this.layoutName(name), x + w / 2, y + h / 2 + 7, 18, C.dim, { align: 'center', literal: true });
        cv.strokeRoundRect(x, y, w, h, 10, 1, '#ffffff10');
    }

    /* ---------- Readouts ---------- */
    /** the layouts that have readout slots */
    slotLayouts() { return this.looks().filter((v) => v !== 'off' && this.hud.slotsOf(v).length); }
    /** the layout the Readouts tab edits: the one picked there, else the one showing, else the first with slots */
    editLayout() {
        const ls = this.slotLayouts();
        if (this.slotLayout && ls.indexOf(this.slotLayout) >= 0) return this.slotLayout;
        const shown = this.shownName();
        return ls.indexOf(shown) >= 0 ? shown : ls[0] || null;
    }
    sensorText(sn) {
        if (!sn) return '--';
        const u = this.hud.sensorUnit(sn), v = this.hud.sensorValue(sn);
        return v + (sn.suffix && u.charAt(0) === '°' ? u : u ? ' ' + u.toLowerCase().replace(/^°/, '°') : '');
    }

    /** Numbered slots of a layout with what each shows (live) on the left; the sensors to pick from on the right. */
    readoutsTab(cv, bottom) {
        const lay = this.editLayout();
        if (!lay) { label(cv, CX, 70, 'Readouts'); note(cv, CX, 110, ['None of these ' + this.cfg.look.name.toLowerCase() + ' has readout slots.']); return; }
        const slots = this.hud.slotsOf(lay);
        if (!slots.some((x) => x.id === this.slot)) this.slot = slots[0].id;
        // which layout: chips; Reset on the right
        label(cv, CX, 70, this.layoutName(lay) + ' · readout slots');
        let cx = CX;
        this.slotLayouts().forEach((v) => { cx += chip(cv, cx, 82, this.layoutName(v), v === lay, () => { this.slotLayout = v; this.kick(); }, 'slots:' + v) + 8; });
        const rw = cv.textWidth('Reset slots', 16, { font: 'bold', literal: true }) + 30;
        chip(cv, CX + 700 - rw, 82, 'Reset slots', false, () => { slots.forEach((x) => this.hud.setSlot(lay, x.id, null)); this.kick(); }, 'slots:reset');
        // the slots
        // more than 8 slots (Dyno's 13): two columns of compact rows, the name and value only
        const lw = 700, two = slots.length > 8, per = two ? Math.ceil(slots.length / 2) : slots.length;
        const sw = two ? (lw - 8) / 2 : lw, rh = Math.min(56, Math.floor((bottom - 132) / per) - 6);
        slots.forEach((sl, i) => {
            const x = CX + (two && i >= per ? sw + 8 : 0), y = 130 + (i % per) * (rh + 6);
            const sel = sl.id === this.slot, sn = this.hud.slotSensor(lay, sl.id, slots);
            glass(cv, x, y, sw, rh, sel);
            cv.circle(x + 26, y + rh / 2, 14, sel ? C.blue : A(C.blue, 0.75));
            cv.text(String(i + 1), x + 26, y + rh / 2 + 6, 15, C.ink, { align: 'center', font: 'bold', literal: true });
            if (two) {
                cv.text(sn ? sn.head : '--', x + 50, y + rh / 2 - 1, 17, '#ffffff', { font: 'bold', literal: true });
                cv.text(sl.where || '', x + 50, y + rh / 2 + 16, 13, C.dim, { literal: true });
                cv.text(this.sensorText(sn), x + sw - 32, y + rh / 2 + 6, 17, C.live, { align: 'right', font: 'bold', literal: true });
            } else {
                cv.text(sn ? sn.name : '--', x + 60, y + rh / 2 - 1, 19, '#ffffff', { font: 'bold', literal: true });
                cv.text(sl.where || '', x + 60, y + rh / 2 + 18, 14, C.dim, { literal: true });
                cv.text(this.sensorText(sn), x + sw - 40, y + rh / 2 + 7, 20, C.live, { align: 'right', font: 'bold', literal: true });
            }
            chevron(cv, x + sw - 18, y + rh / 2, C.dim);
            cv.target(x, y, sw, rh, () => { this.slot = sl.id; if (sn) this.cat = sn.cat; this.kick(); }, 'slot:' + sl.id, 14);
        });
        // the sensors for the picked slot
        const px = CX + lw + 24, pw = CR - px, py = 82, ph = bottom - py - 4;
        cv.card(px, py, pw, ph, 16, [[0, '#ffffff0b'], [1, '#ffffff03']]);
        cv.strokeRoundRect(px, py, pw, ph, 16, 1, C.line);
        const n = slots.findIndex((x) => x.id === this.slot) + 1, cur = this.hud.slotSensor(lay, this.slot, slots);
        label(cv, px + 20, py + 32, 'Slot ' + n + ' · pick a sensor');
        let kx = px + 20;
        sensors.CATS.forEach((c) => { kx += chip(cv, kx, py + 46, c, c === this.cat, () => { this.cat = c; this.kick(); }, 'cat:' + c) + 6; });
        const list = sensors.LIST.filter((x) => x.cat === this.cat), lh = Math.min(48, Math.floor((ph - 100) / list.length));
        list.forEach((sn, i) => {
            const y = py + 94 + i * lh, sel = cur && cur.id === sn.id;
            if (sel) cv.roundRect(px + 10, y, pw - 20, lh - 4, 10, A(C.blue, 0.35));
            else if (i) cv.fillRect(px + 20, y - 2, pw - 40, 1, C.line);
            cv.text(sn.name, px + 24, y + lh / 2 + 4, 18, sel ? '#ffffff' : C.text, { font: sel ? 'bold' : 'label', literal: true });
            cv.text(this.sensorText(sn), px + pw - 24, y + lh / 2 + 4, 17, sel ? '#ffffff' : C.dim, { align: 'right', literal: true });
            cv.target(px + 10, y, pw - 20, lh - 4, () => { this.hud.setSlot(lay, this.slot, sn.id); this.kick(); }, 'sensor:' + sn.id, 10);
        });
    }

    /* ---------- Position (HUD) ---------- */
    /** The whole HUD on black, the part seen through the windshield dashed, the layout where it sits now; move pad and size. */
    positionTab(cv, bottom) {
        const shown = this.shownName(), p = this.hud.placeInfo();
        label(cv, CX, 70, (shown === 'off' ? 'HUD' : this.layoutName(shown)) + ' · where it sits on the glass');
        const k = Math.min(0.66, (bottom - 96 - 150) / 480), bw = 800 * k, bh = 480 * k, bx = CX, by = 84;
        cv.card(bx - 10, by - 10, bw + 20, bh + 20, 18, [[0, '#ffffff0b'], [1, '#ffffff03']]);
        cv.roundRect(bx, by, bw, bh, 10, '#000000');
        const pic = shown !== 'off' && previews.get(shown, 'full');
        if (pic) {
            // the picture is the whole 800x480 HUD with the layout unmoved: move it, and scale it about the layout's centre
            const b = p.box, cx = b.w ? b.x + b.w / 2 : 400, cy = b.h ? b.y + b.h / 2 : 240, s = p.scale;
            cv.clip(bx, by, bw, bh);
            cv.image(pic.id, bx + (cx * (1 - s) + p.x) * k, by + (cy * (1 - s) + p.y) * k, 800 * k * s, 480 * k * s);
            cv.noclip();
        } else cv.text(shown === 'off' ? "BMW's own HUD" : 'no picture', bx + bw / 2, by + bh / 2 + 7, 18, C.dim, { align: 'center', literal: true });
        const v = visible.HUD_WINDOW;
        dashed(cv, bx + v.x * k, by + v.y * k, v.w * k, v.h * k, A(C.blueHi, 0.9));
        cv.strokeRoundRect(bx, by, bw, bh, 10, 1, '#ffffff14');
        // the pad
        const rx = bx + bw + 60, pad = 84, gap = 10, mx = rx + pad + gap, my = by + 40;
        label(cv, rx, my - 14, 'Move');
        const step = (dx, dy) => () => {
            if (dx) this.set('hudX', clampStep(this.item('hudX'), (this.get('hudX') || 0) + dx));
            if (dy) this.set('hudY', clampStep(this.item('hudY'), (this.get('hudY') || 0) + dy));
        };
        padBtn(cv, mx, my, pad, 'up', step(0, -10), 'move:up');
        padBtn(cv, rx, my + pad + gap, pad, 'left', step(-10, 0), 'move:left');
        padBtn(cv, mx, my + pad + gap, pad, 'centre', () => { this.set('hudX', 0); this.set('hudY', 0); }, 'move:centre');
        padBtn(cv, mx + pad + gap, my + pad + gap, pad, 'right', step(10, 0), 'move:right');
        padBtn(cv, mx, my + 2 * (pad + gap), pad, 'down', step(0, 10), 'move:down');
        const sy = my + 3 * (pad + gap) + 16, w = CR - rx;
        this.stepRow(cv, rx, sy, w, 'Size', 'hudScale', (val) => val + ' %');
        cv.text('x ' + p.x + '  y ' + p.y, rx, sy + 92, 16, C.dim, { literal: true });
        note(cv, rx, sy + 122, ['The dashed frame is the part of the HUD you can see.', 'Every tap moves the real HUD right away.']);
        // the colours on the glass, under the picture (was the Colours tab)
        const P = this.P, cw = bw + 20, cx0 = bx - 10;
        let y = gt3.section(cv, P, cx0, by + bh + 22, cw, bottom - (by + bh + 22), 'Colours on the glass');
        const opts = (k2) => (this.item(k2).options || []).map((o) => [o[0], o[1].replace(/ \(.*\)$/, '')]);
        let cy = gt3.row(cv, P, cx0, y, cw, 52, 'Theme', null, true);
        gt3.seg(cv, P, cx0 + cw - 12, cy, opts('hudTheme'), this.get('hudTheme'), (v) => this.set('hudTheme', v), 'set:hudTheme', 17);
        if (this.get('hudTheme') === 'auto' && this.item('dayTheme')) {
            y += 52;
            cy = gt3.row(cv, P, cx0, y, cw, 52, 'In daylight');
            gt3.seg(cv, P, cx0 + cw - 12, cy, opts('dayTheme'), this.get('dayTheme'), (v) => this.set('dayTheme', v), 'set:dayTheme', 17);
        }
    }

    /* ---------- Badge & clock (cluster) ---------- */
    /** The series as chips and that series' models on the left; the badge, the lettering, the clock and night colours right. */
    clockTab(cv, bottom) {
        const P = this.P, model = this.get('badge'), lw = 640;
        const series = this.series || badges.seriesOf(model) || 'X';
        label(cv, CX, 70, 'Series');
        let cx = CX;
        badges.SERIES.forEach((s) => { cx += chip(cv, cx, 80, s[0], s[0] === series, () => { this.series = s[0]; this.kick(); }, 'series:' + s[0]) + 6; });
        label(cv, CX, 144, 'Model');
        const list = (badges.SERIES.find((s) => s[0] === series) || [null, []])[1];
        const cw = (lw - 12) / 2, rh = Math.min(50, Math.floor((bottom - 156) / Math.ceil(list.length / 2)) - 6);
        list.forEach((m, i) => {
            const x = CX + (i % 2) * (cw + 12), y = 156 + Math.floor(i / 2) * (rh + 6), sel = m === model;
            glass(cv, x, y, cw, rh, sel);
            cv.text(m, x + 18, y + rh / 2 + 7, 19, sel ? '#ffffff' : C.text, { font: sel ? 'bold' : 'label', literal: true });
            if (sel) check(cv, x + cw - 30, y + rh / 2, '#ffffff');
            cv.target(x, y, cw, rh, () => this.set('badge', m), 'badge:' + m, 6);
        });
        // right: the badge as it shows, the lettering, none; then the clock
        const rx = CX + lw + 16, rw = CR - rx, shown = badges.text(model, this.get('badgeBMW') === true);
        let y = gt3.section(cv, P, rx, 50, rw, 30 + 64 + 56 + 56, 'Badge', 'top left of the cluster');
        gt3.fit(cv, shown || 'NO BADGE', rx + rw / 2, y + 46, 40, rw - 40, shown ? P.text : P.dim, { align: 'center' });
        y += 64;
        let cy = gt3.row(cv, P, rx, y, rw, 56, 'BMW lettering');
        gt3.toggle(cv, P, rx + rw - 14, cy, this.get('badgeBMW') === true, () => this.set('badgeBMW', this.get('badgeBMW') !== true), 'set:badgeBMW');
        y += 56;
        cy = gt3.row(cv, P, rx, y, rw, 56, 'No badge');
        gt3.toggle(cv, P, rx + rw - 14, cy, model === 'none', () => this.set('badge', model === 'none' ? 'X3 M40i' : 'none'), 'badge:none');
        y = 50 + 30 + 64 + 56 + 56 + 12;
        y = gt3.section(cv, P, rx, y, rw, 30 + 3 * 60, 'Clock and night');
        cy = gt3.row(cv, P, rx, y, rw, 60, 'Clock', null, true);
        gt3.seg(cv, P, rx + rw - 14, cy, [['12h', '12-hour'], ['24h', '24-hour']], this.get('clock'), (v) => this.set('clock', v), 'clock');
        y += 60;
        cy = gt3.row(cv, P, rx, y, rw, 60, 'Time zone', 'Follows the car until set');
        gt3.button(cv, P, rx + rw - 14 - gt3.tw(cv, gt3.up(this.valueText('timeZone')), 19) - 36, cy - 19, this.valueText('timeZone'),
            () => { this.picker = { key: 'timeZone', title: 'Time zone', fmt: tzText }; this.kick(); }, 'set:timeZone', true);
        y += 60;
        if (this.item('nightDim')) {
            cy = gt3.row(cv, P, rx, y, rw, 60, 'Night colours', 'Dimmer after sunset');
            gt3.seg(cv, P, rx + rw - 14, cy, [['auto', 'Auto'], ['off', 'Off']], this.get('nightDim'), (v) => this.set('nightDim', v), 'nightDim');
        }
    }

    /* ---------- Units (both) ---------- */
    /** US / Metric / Custom, then speed, temperature and pressure each; a live preview of four readouts. */
    unitsTab(cv) {
        const P = this.P, lw = 760, x = CX, us = (d) => this.hud.unitUs(d);
        const pre = us('speed') && us('temp') && us('press') ? 'us' : !us('speed') && !us('temp') && !us('press') ? 'metric' : 'custom';
        let y = gt3.section(cv, P, x, 50, lw, 30 + 4 * 66, 'Units', 'torque and power follow the preset');
        let cy = gt3.row(cv, P, x, y, lw, 66, 'Preset', pre === 'custom' ? 'Your own mix, set below' : 'Sets all three below', true);
        gt3.seg(cv, P, x + lw - 14, cy, [['us', 'US'], ['metric', 'Metric'], ['custom', 'Custom']], pre, (v) => {
            if (v === 'custom') return;       // custom is what a single row below makes
            this.set('units', v);
            ['unitSpeed', 'unitTemp', 'unitPress'].forEach((k) => { if (this.item(k)) this.set(k, 'auto'); });
        }, 'preset', 21);
        y += 66;
        [['Speed and distance', 'unitSpeed', [['mph', 'mph · mi'], ['kmh', 'km/h · km']], 'speed'],
            ['Temperature', 'unitTemp', [['f', '°F'], ['c', '°C']], 'temp'],
            ['Pressure', 'unitPress', [['psi', 'psi'], ['bar', 'bar']], 'press']].forEach(([n, k, opts, d]) => {
            cy = gt3.row(cv, P, x, y, lw, 66, n);
            gt3.seg(cv, P, x + lw - 14, cy, opts, us(d) ? opts[0][0] : opts[1][0], (v) => this.set(k, v), 'unit:' + k);
            y += 66;
        });
        // the preview: four readouts as the dash draws them, live
        const px = x + lw + 16, pw = CR - px, bw = (pw - 36) / 2, bh = 112;
        y = gt3.section(cv, P, px, 50, pw, 30 + 2 * bh + 34, 'Preview', 'live');
        ['speed', 'coolant', 'boost', 'range'].forEach((id, i) => {
            const sn = sensors.get(id), bx = px + 12 + (i % 2) * (bw + 12), by = y + 12 + Math.floor(i / 2) * (bh + 10);
            const u = sn ? this.hud.sensorUnit(sn) : '', v = sn ? this.hud.sensorValue(sn) : '--';
            cv.roundRect(bx, by, bw, bh, 4, P.box);
            cv.roundRect(bx + 2, by + 26, bw - 4, bh - 28, 3, P.bg);
            gt3.txt(cv, sn ? sn.head : '', bx + 10, by + 20, 18, P.ink);
            gt3.txt(cv, u, bx + bw - 10, by + 20, 18, P.ink, { align: 'right' });
            gt3.fit(cv, v + (sn && sn.suffix ? sn.suffix : ''), bx + bw - 12, by + bh - 14, 64, bw - 24, P.text, { align: 'right' });
        });
    }

    /* ---------- Shift & alerts (both) ---------- */
    /** The shift lights (redline, shift point, and on Apex Cluster how the lights sit, their colours and start; cold guard,
     *  test) beside the warning limits with their colour bars. */
    shiftTab(cv) {
        const P = this.P, w = (CW - 16) / 2, x = CX, us = (d) => this.hud.unitUs(d);
        const at = this.get('redline') - (this.get('shiftBefore') || 0);
        // Apex Cluster's own light settings (Nov 13 2026): placement, colours, start rpm; tighter rows to make room
        const own = !!(this.item('shiftPlace') && this.item('shiftLights') && this.item('shiftColours') && this.item('shiftFrom'));
        const rh = own ? 48 : 64, th = own ? 80 : 84, off = own && this.get('shiftLights') === 'off', bar = own && this.get('shiftLights') === 'bar';
        let y = gt3.section(cv, P, x, 50, w, 30 + (own ? 7 : 3) * rh + th, 'Shift lights', off ? 'off' : fmtInt(at) + ' rpm');
        let cy = gt3.row(cv, P, x, y, w, rh, 'Redline', null, true);
        gt3.stepSetting(cv, P, x + w - 14, cy, this.item('redline'), this.get('redline'), (v) => this.set('redline', v), (v) => fmtInt(v) + ' rpm');
        y += rh;
        cy = gt3.row(cv, P, x, y, w, rh, 'Shift point', 'Lights flash at ' + fmtInt(at) + ' rpm');
        gt3.stepSetting(cv, P, x + w - 14, cy, this.item('shiftBefore'), this.get('shiftBefore'), (v) => this.set('shiftBefore', v), (v) => (v ? fmtInt(v) + ' before' : 'At redline'));
        y += rh;
        if (own) {
            const place = this.get('shiftPlace'), type = this.get('shiftLights');
            cy = gt3.row(cv, P, x, y, w, rh, 'Placement', place === 'nocam' ? 'Across the middle (no driver camera)' : 'Either side of the driver camera');
            gt3.seg(cv, P, x + w - 14, cy, [['camera', 'Camera'], ['nocam', 'No camera']], place, (v) => this.set('shiftPlace', v), 'set:shiftPlace', 17);
            y += rh;
            cy = gt3.row(cv, P, x, y, w, rh, 'Type', { bar: 'Slanted bar, yellow until both ends meet', off: 'No shift lights' }[type] || 'Round lights');
            gt3.seg(cv, P, x + w - 14, cy, [['row', 'Row'], ['bar', 'Bar'], ['off', 'Off']], type, (v) => this.set('shiftLights', v), 'set:shiftLights', 17);
            y += rh;
            cy = gt3.row(cv, P, x, y, w, rh, 'Colours', bar ? 'Bar: its colour once full' : null);
            gt3.seg(cv, P, x + w - 14, cy, [['gt3', 'GT3'], ['f1', 'F1'], ['red', 'Red'], ['blue', 'Blue']], this.get('shiftColours'), (v) => this.set('shiftColours', v), 'set:shiftColours', 17);
            y += rh;
            cy = gt3.row(cv, P, x, y, w, rh, 'First light', 'Lights fill from here to the shift point');
            gt3.stepSetting(cv, P, x + w - 14, cy, this.item('shiftFrom'), this.get('shiftFrom'), (v) => this.set('shiftFrom', v), (v) => fmtInt(v) + ' rpm');
            y += rh;
        }
        if (this.item('coldGuard')) {
            cy = gt3.row(cv, P, x, y, w, rh, 'Cold-engine guard', 'Earlier shift point until the oil is warm');
            gt3.toggle(cv, P, x + w - 14, cy, this.get('coldGuard') === true, () => this.set('coldGuard', this.get('coldGuard') !== true), 'set:coldGuard');
        }
        y += rh;
        const testing = this.hud.shiftTesting && this.hud.shiftTesting();
        const d = this.hud.car && this.hud.car.data(), moving = d && !d.demo && d.speed > 3;
        cy = gt3.row(cv, P, x, y, w, th, 'Test', testing ? 'Running: watch the cluster' : moving ? 'Only while the car stands' : 'Revs to the shift point for 4 s');
        let pal = SHIFT_DOTS[own ? this.get('shiftColours') : 'gt3'] || SHIFT_DOTS.gt3;
        if (bar) pal = ['#ffc21a', '#ffc21a', '#ffc21a', '#ffc21a', '#ffc21a', pal[3]];     // the Bar: yellow, then the pattern's red when full
        const bt = testing ? 'Running' : 'Run test';
        // the six dots: under the name, or (tighter Apex Cluster rows) left of the button
        const dx = own ? x + w - 14 - gt3.tw(cv, gt3.up(bt), 19) - 36 - 16 - 6 * 26 + 13 : x + 26, dy = own ? cy : cy + 30;
        pal.forEach((c, i) => cv.circle(dx + i * 26, dy, 9, off ? P.off : c));
        gt3.button(cv, P, x + w - 14 - gt3.tw(cv, gt3.up(bt), 19) - 36, cy - 19, bt, testing || moving ? null : () => {
            if (this.hud.testShift()) { this.kick(); setTimeout(() => this.kick(), 4000); }
        }, 'test:shift');
        // the warning limits, in the display units, each with its colour bar
        const rx = x + w + 16, rows = WARN_ROWS.filter((r) => this.item(r[0]));
        y = gt3.section(cv, P, rx, 50, w, 30 + rows.length * 74, 'Warnings', 'in ' + (us('temp') ? '°F' : '°C') + ' and ' + (us('press') ? 'psi' : 'bar') + ' · 0 = off');
        rows.forEach((r, i) => {
            const k = r[0], v = this.get(k);
            cy = gt3.row(cv, P, rx, y, w, 74, r[1], r[2], i === 0);
            const caution = k === 'cautionCoolant' || k === 'warnCoolant' ? this.get('cautionCoolant') : null;
            gt3.scaleBar(cv, P, rx + 16, cy + 27, w * 0.4, r[3], r[4], k === 'cautionCoolant' ? v : caution, k === 'cautionCoolant' ? this.get('warnCoolant') : v);
            gt3.stepSetting(cv, P, rx + w - 14, cy, this.item(k), v, (nv) => this.set(k, nv), (nv) => warnText(k, nv, this.hud.unitUs(k === 'warnBoost' ? 'press' : 'temp')));
            y += 74;
        });
    }

    /* ---------- System (both) ---------- */
    /** Box colour and the app's display rows, demo data; About: version, autostart, what the engine reports. */
    systemTab(cv, bottom) {
        const P = this.P, w = (CW - 16) / 2, x = CX, keys = (this.cfg.display || []).filter((k) => this.item(k));
        const rh = keys.length > 4 ? 52 : 60;
        let y = gt3.section(cv, P, x, 50, w, 30 + 64 + keys.length * rh, 'Display');
        let cy = gt3.row(cv, P, x, y, w, 64, 'Box colour', P.name + (this.cfg.what === 'HUD' ? ' · this page (the HUD\'s layouts have no boxes)' : ' · this page and the ' + this.cfg.what + '\'s boxes'), true);
        gt3.swatches(cv, P, x + w - 14, cy, P.key, (v) => this.set('boxColour', v));
        y += 64;
        keys.forEach((k) => {
            const it = this.item(k);
            cy = gt3.row(cv, P, x, y, w, rh, it.label);
            if (it.type === 'bool') gt3.toggle(cv, P, x + w - 14, cy, this.get(k) === true, () => this.set(k, this.get(k) !== true), 'set:' + k);
            else if (it.type === 'number') gt3.stepSetting(cv, P, x + w - 14, cy, it, this.get(k), (v) => this.set(k, v), () => this.valueText(k));
            else gt3.seg(cv, P, x + w - 14, cy, it.options.map((o) => [o[0], o[1].replace(/ \(.*\)$/, '')]), this.get(k), (v) => this.set(k, v), 'set:' + k, 17);
            y += rh;
        });
        // right: Data at the bottom, About above it
        const rx = x + w + 16, spec = this.ctx.spec, demo = this.hud.car && this.hud.car.data().demo, dataH = this.item('demo') ? 30 + 64 : 0;
        if (dataH) {
            y = gt3.section(cv, P, rx, bottom - dataH, w, dataH, 'Data');
            cy = gt3.row(cv, P, rx, y, w, 64, 'Demo data', 'Auto: only until the car sends data', true);
            gt3.seg(cv, P, rx + w - 14, cy, [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], this.get('demo'), (v) => this.set('demo', v), 'demo');
        }
        bottom -= dataH ? dataH + 12 : 0;
        y = gt3.section(cv, P, rx, 50, w, bottom - 50, 'About');
        gt3.txt(cv, spec.title, rx + 16, y + 40, 32, P.text);
        gt3.txt(cv, 'v' + spec.version, rx + 24 + gt3.tw(cv, spec.title, 32), y + 40, 20, P.dim);
        gt3.txt(cv, 'Starts with the car: ' + (spec.autostart ? 'yes' : 'no, open it from the menu'), rx + 16, y + 74, 20, P.text);
        const live = !demo && this.hud.car && this.hud.car.carPresent && this.hud.car.carPresent();
        gt3.txt(cv, 'Car data: ' + (demo ? 'demo' : live ? 'live' : 'waiting for the car'), rx + 16, y + 102, 20, live ? P.ok : P.warm);
        gt3.txt(cv, 'All of the settings as a list: the bar button All settings.', rx + 16, y + 130, 17, P.dim);
        // what the engine reports (layers, memory, why nothing shows), wrapped
        const words = String(this.hud.lastStatus || '').split(' '), lines = [];
        let line = '';
        words.forEach((wd) => { const t = line ? line + ' ' + wd : wd; if (gt3.tw(cv, t, 16) > w - 32 && line) { lines.push(line); line = wd; } else line = t; });
        if (line) lines.push(line);
        gt3.txt(cv, 'STATUS', rx + 16, y + 168, 16, P.dim);
        lines.slice(0, Math.floor((bottom - y - 190) / 21)).forEach((l, i) => gt3.txt(cv, l, rx + 16, y + 192 + i * 21, 16, P.text));
    }

    /* ---------- rows ---------- */
    /** A row's card (h: 56, or 46 for the compact ones); returns its text baseline. */
    rowBox(cv, x, y, w, name, h) {
        glass(cv, x, y, w, h, false);
        const base = y + h / 2 + 7;
        cv.text(name, x + 18, base, 19, C.text, { literal: true });
        return base;
    }
    toggleRow(cv, x, y, w, name, key, h) {
        h = h || 56;
        this.rowBox(cv, x, y, w, name, h);
        const on = this.get(key) === true, tx = x + w - 84, ty = y + h / 2 - 16;
        cv.roundRect(tx, ty, 66, 32, 16, on ? C.blue : '#ffffff1f');
        cv.circle(on ? tx + 50 : tx + 16, ty + 16, 12, on ? C.ink : '#c9d1dc');
        cv.target(x, y, w, h, () => this.set(key, !on), 'set:' + key, 14);
        return y + h + (h < 56 ? 6 : 8);
    }
    pickRow(cv, x, y, w, name, key, fmt, h) {
        h = h || 56;
        const base = this.rowBox(cv, x, y, w, name, h);
        const v = this.get(key), text = fmt ? fmt(v) : this.valueText(key);
        cv.text(text, x + w - 40, base, 19, C.blueHi, { align: 'right', font: 'bold', literal: true });
        chevron(cv, x + w - 24, y + h / 2, C.dim);
        cv.target(x, y, w, h, () => { this.picker = { key, title: name, fmt }; this.kick(); }, 'set:' + key, 14);
        return y + h + (h < 56 ? 6 : 8);
    }
    stepRow(cv, x, y, w, name, key, fmt) {
        this.rowBox(cv, x, y, w, name, 56);
        const s = this.item(key), steps = s.steps || [], i = steps.indexOf(this.get(key));
        const bx = x + w - 66, ax = bx - 236;
        stepBtn(cv, ax, y + 9, '-', i > 0, () => this.set(key, steps[i - 1]), 'dn:' + key);
        cv.text(fmt ? fmt(this.get(key)) : this.valueText(key), ax + 140, y + 35, 19, C.blueHi, { align: 'center', font: 'bold', literal: true });
        stepBtn(cv, bx, y + 9, '+', i < steps.length - 1, () => this.set(key, steps[i + 1]), 'up:' + key);
        return y + 64;
    }
    chipRow(cv, x, y, w, name, key) {
        glass(cv, x, y, w, 64, false);
        cv.text(name, x + 18, y + 39, 19, C.text, { literal: true });
        const s = this.item(key), v = this.get(key);
        let cx = x + 220;
        (s.options || []).forEach((o) => { cx += chip(cv, cx, y + 14, o[1], o[0] === v, () => this.set(key, o[0]), 'opt:' + key + ':' + o[0]) + 10; });
        return y + 72;
    }

    /** A list of a setting's choices over the page; a tap on one sets it, a tap beside it closes. */
    drawPicker(cv, bottom) {
        const p = this.picker, s = this.item(p.key), opts = s.type === 'number' ? (s.steps || []).map((v) => [v, null]) : s.options || [];
        cv.fillRect(0, 36, W, bottom + 20, '#000000b0');
        const w = 620, rh = 58, h = 76 + opts.length * rh, x = (W - w) / 2, y = Math.max(52, (bottom + 44 - h) / 2);
        cv.roundRect(x, y, w, h, 5, C.blue);
        cv.roundRect(x + 2, y + 44, w - 4, h - 46, 3, C.bg);
        cv.text(p.title.toUpperCase(), x + 18, y + 31, 22, C.ink, { font: 'race', literal: true });
        const v = this.get(p.key);
        opts.forEach((o, i) => {
            const ry = y + 60 + i * rh, sel = o[0] === v;
            if (sel) cv.roundRect(x + 12, ry, w - 24, rh - 6, 4, A(C.blue, 0.3));
            const text = p.fmt ? p.fmt(o[0]) : o[1] !== null ? o[1] : fmtInt(o[0]) + ' rpm';
            cv.text(text, x + 30, ry + 34, 20, sel ? '#ffffff' : C.text, { font: sel ? 'bold' : 'label', literal: true });
            if (sel) check(cv, x + w - 50, ry + 26, '#ffffff');
            cv.target(x + 12, ry, w - 24, rh - 6, () => {
                this.picker = null;
                if (LOOK_KEYS.indexOf(p.key) >= 0) this.chooseLayout(p.key, o[0]); else this.set(p.key, o[0]);
            }, 'pick:' + p.key + ':' + o[0], 12);
        });
        cv.target(0, 36, W, bottom, () => { this.picker = null; this.kick(); }, 'pick:close');
    }

    /** The question chooseLayout asks, over the page: the answer button, Cancel, a tap beside it cancels. */
    drawConfirm(cv, bottom) {
        const q = this.confirm, close = () => { this.confirm = null; this.kick(); };
        cv.fillRect(0, 36, W, bottom + 20, '#000000b0');
        const w = 720, h = 96 + q.lines.length * 30 + 84, x = (W - w) / 2, y = Math.max(52, (bottom + 44 - h) / 2);
        cv.roundRect(x, y, w, h, 5, C.blue);
        cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, C.bg);
        cv.text(q.title, x + 32, y + 56, 28, '#ffffff', { font: 'bold', literal: true });
        q.lines.forEach((s, i) => cv.text(s, x + 32, y + 98 + i * 30, 19, C.text, { literal: true }));
        const bh = 52, by = y + h - bh - 24;
        const yw = cv.textWidth(q.yes, 18, { font: 'bold', literal: true }) + 56, yx = x + w - 32 - yw;
        cv.roundRect(yx, by, yw, bh, 4, C.blue);
        cv.text(q.yes, yx + yw / 2, by + 33, 18, C.ink, { align: 'center', font: 'bold', literal: true });
        cv.target(yx, by, yw, bh, () => { this.confirm = null; q.run(); this.kick(); }, 'confirm:yes', 4);
        const nw = 150, nx = yx - 16 - nw;
        cv.roundRect(nx, by, nw, bh, 4, '#ffffff3a');
        cv.roundRect(nx + 2, by + 2, nw - 4, bh - 4, 3, C.bg);
        cv.text('Cancel', nx + nw / 2, by + 33, 18, C.text, { align: 'center', font: 'bold', literal: true });
        cv.target(nx, by, nw, bh, close, 'confirm:no', 4);
        cv.target(0, 36, W, bottom, close, 'confirm:close');
    }
}

/* ---------- small pieces ---------- */
const LOOK_KEYS = ['hudLayout', 'inComfort', 'inSport', 'inEco'];
const WARN_KEYS = ['warnOil', 'cautionCoolant', 'warnCoolant', 'warnBoost'];
/** A warning limit as the page shows it, in the display units: "266 °F", "1.2 bar", "Off". */
function warnText(k, v, us) {
    if (!(v > 0)) return 'Off';
    if (k === 'warnBoost') return us ? Math.round(v * 14.5038) + ' psi' : v.toFixed(1) + ' bar';
    return us ? Math.round(v * 9 / 5 + 32) + ' °F' : v + ' °C';
}
/** a "timeZone" setting value as the row shows it (shared/tz.js) */
function tzText(v) { return tz.name(v); }
function fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function label(cv, x, y, s) { cv.text(s.toUpperCase(), x, y, 16, C.blue, { font: 'race', spacing: 1, literal: true }); }
function note(cv, x, y, lines) { lines.forEach((s, i) => cv.text(s, x, y + i * 26, 17, C.dim, { literal: true })); }
/** a card in the GT3 look: black in a grey frame, or framed in the box colour when selected */
function glass(cv, x, y, w, h, sel) {
    cv.roundRect(x, y, w, h, 5, sel ? C.blue : '#ffffff3a');
    cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, sel ? '#14161a' : C.bg);
}
function chip(cv, x, y, text, on, run, key) {
    const w = cv.textWidth(text.toUpperCase(), 17, { font: 'race', literal: true }) + 26, h = 34;
    cv.roundRect(x, y, w, h, 4, C.blue);
    if (!on) cv.roundRect(x + 2, y + 2, w - 4, h - 4, 3, C.bg);
    cv.text(text.toUpperCase(), x + w / 2, y + 23, 17, on ? C.ink : C.text, { align: 'center', font: 'race', literal: true });
    cv.target(x, y, w, h, run, key, 4);
    return w;
}
/** A small chip (the HUD cards' drive modes). */
function miniChip(cv, x, y, text, on, run, key) {
    const w = cv.textWidth(text.toUpperCase(), 14, { font: 'race', literal: true }) + 16, h = 26;
    cv.roundRect(x, y, w, h, 3, on ? C.blue : '#ffffff3a');
    if (!on) cv.roundRect(x + 2, y + 2, w - 4, h - 4, 2, C.bg);
    cv.text(text.toUpperCase(), x + w / 2, y + 18, 14, on ? C.ink : C.off, { align: 'center', font: 'race', literal: true });
    cv.target(x, y, w, h, run, key, 3);
    return w;
}
function stepBtn(cv, x, y, sign, live, run, key) {
    cv.roundRect(x, y, 48, 38, 4, live ? C.blue : '#ffffff20');
    cv.roundRect(x + 2, y + 2, 44, 34, 3, C.bg);
    const c = live ? C.text : '#ffffff30';
    cv.fillRect(x + 15, y + 18, 18, 2.5, c);
    if (sign === '+') cv.fillRect(x + 22.75, y + 10, 2.5, 18, c);
    if (live) cv.target(x, y, 48, 38, run, key, 10);
}
function clampStep(s, v) {
    const st = (s && s.steps) || [v];
    return st.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), st[0]);
}
function dashed(cv, x, y, w, h, c) {
    const d = 10, g = 7;
    for (let t = 0; t < w; t += d + g) { const l = Math.min(d, w - t); cv.fillRect(x + t, y, l, 2, c); cv.fillRect(x + t, y + h - 2, l, 2, c); }
    for (let t = 0; t < h; t += d + g) { const l = Math.min(d, h - t); cv.fillRect(x, y + t, 2, l, c); cv.fillRect(x + w - 2, y + t, 2, l, c); }
}
function padBtn(cv, x, y, s, what, run, key) {
    cv.roundRect(x, y, s, s, 5, C.blue);
    cv.roundRect(x + 2, y + 2, s - 4, s - 4, 3, C.bg);
    const cx = x + s / 2, cy = y + s / 2, a = 13, c = '#ffffff';
    if (what === 'up') cv.quad([[cx, cy - a], [cx + a, cy + a * 0.7], [cx, cy + a * 0.7], [cx - a, cy + a * 0.7]], c);
    else if (what === 'down') cv.quad([[cx, cy + a], [cx - a, cy - a * 0.7], [cx, cy - a * 0.7], [cx + a, cy - a * 0.7]], c);
    else if (what === 'left') cv.quad([[cx - a, cy], [cx + a * 0.7, cy - a], [cx + a * 0.7, cy], [cx + a * 0.7, cy + a]], c);
    else if (what === 'right') cv.quad([[cx + a, cy], [cx - a * 0.7, cy + a], [cx - a * 0.7, cy], [cx - a * 0.7, cy - a]], c);
    else cv.text('CENTRE', cx, cy + 6, 18, C.text, { align: 'center', font: 'race', literal: true });
    cv.target(x, y, s, s, run, key, 5);
}
function chevron(cv, x, y, c) { cv.line(x - 4, y - 7, x + 3, y, 2.5, c); cv.line(x + 3, y, x - 4, y + 7, 2.5, c); }
function check(cv, x, y, c) { cv.line(x - 9, y, x - 3, y + 6, 3, c); cv.line(x - 3, y + 6, x + 9, y - 7, 3, c); }

module.exports = Page;
