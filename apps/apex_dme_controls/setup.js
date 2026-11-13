'use strict';
/**
 * setup.js - Apex DME Controls' settings page (design/dme-controls-v1/), opened with the header's Settings tab and
 * closed with it or the rail's Controls tab. The GT3 look of shared/gt3ui.js, as the other Apex apps.
 *
 *   Tuning           the tuning software on the DME (Off / MHD / BM3), confirm before a map switch
 *   Maps             a name for each of the four maps (picked from a list: typing is no good in a car)
 *   Units            US / Metric, then temperature and speed each
 *   Valve & cooling  the valve at every start, hold, the close limit; what Max Cooling needs
 *   System           box colour, demo data, about, BMW's plain list
 *
 * draw(cv, bottom, v, u): v = Control.view(), u = { sp, tf } (US units or not).
 */
const gt3 = require('./gt3ui');

const CX = 288, CR = 1584, CW = CR - CX;
const TABS = [['back', 'Controls', 'back'], ['tuning', 'Tuning', 'cog'], ['maps', 'Maps', 'lines'], ['units', 'Units', 'units'], ['valve', 'Valve & cooling', 'alert'], ['system', 'System', 'screen']];
const TUNER = { off: 'Off', mhd: 'MHD', bm3: 'BM3' };

class Setup {
    /** opts: { kick(), close(), openList() } */
    constructor(ctx, opts) { this.ctx = ctx; this.opts = opts; this.tab = 'tuning'; }
    get(k) { return this.ctx.settings.get(k); }
    item(k) { return this.ctx.settings.item(k); }
    set(k, v) { if (this.ctx.settings.get(k) !== v) this.ctx.settings.set(k, v); this.opts.kick(); }
    label(k) { return this.ctx.settings.display(k); }

    draw(cv, bottom, v, u) {
        const P = this.P = gt3.palette(this.get('boxColour'));
        cv.clear(P.bg);
        const lim = this.get('closeLimit');
        const value = {
            back: 'map, valve, Max Cooling', tuning: TUNER[v.tuner] + (v.tuner === 'off' ? ' · valve only' : ''),
            maps: [1, 2, 3, 4].map((i) => this.label('map' + i)).join(' · '), units: (u.tf ? '°F' : '°C') + ' · ' + (u.sp ? 'mph' : 'km/h'),
            valve: 'start ' + this.label('valveStart') + ' · closed to ' + (lim === 'off' ? 'any rpm' : lim + ' rpm'),
            system: 'v' + this.ctx.spec.version + ' · ' + P.name.toLowerCase() + ' boxes',
        };
        gt3.rail(cv, P, 16, 50, 252, bottom, TABS.map((t) => ({ id: t[0], name: t[1], icon: t[2], value: value[t[0]] })), this.tab,
            (id) => { if (id === 'back') this.opts.close(); else { this.tab = id; this.opts.kick(); } });
        const body = { tuning: this.tuning, maps: this.maps, units: this.units, valve: this.valveTab, system: this.system }[this.tab];
        if (body) body.call(this, cv, bottom, v, u);
    }

    tuning(cv, bottom, v) {
        const P = this.P, w = (CW - 16) / 2, x = CX;
        let y = gt3.section(cv, P, x, 50, w, 30 + 2 * 70, 'Tuning software', 'on the engine unit');
        let cy = gt3.row(cv, P, x, y, w, 70, 'Software', 'The flash on your DME', true);
        gt3.seg(cv, P, x + w - 14, cy, [['off', 'Off'], ['mhd', 'MHD'], ['bm3', 'BM3']], v.tuner, (t) => this.set('tuner', t), 'tuner', 21);
        cy = gt3.row(cv, P, x, y + 70, w, 70, 'Confirm map switch', 'Ask before a map is sent');
        gt3.toggle(cv, P, x + w - 14, cy, this.get('confirmMap') !== false, () => this.set('confirmMap', this.get('confirmMap') === false), 'confirmMap');
        gt3.note(cv, P, x + 4, 50 + 30 + 140 + 30, [
            'Pick what is flashed: MHD and BM3 can\'t be told apart from here.',
            v.tuner === 'bm3' ? (v.bm3Rom ? 'BM3 ROM ' + v.bm3Rom + ' found on the DME.' : 'BM3: the ROM is read from the DME at start.') : '',
        ].filter(Boolean));
        const rx = x + w + 16;
        y = gt3.section(cv, P, rx, 50, w, 30 + 3 * 70, 'What each one does');
        [['Off', 'Exhaust valve only (BMW\'s own job, any DME)'], ['MHD', 'Engine map 1 to 4, exhaust valve, Max Cooling'],
            ['BM3', 'Engine map 1 to 4 (read back), exhaust valve']].forEach((r, i) => {
            gt3.row(cv, P, rx, y + i * 70, w, 70, r[0], r[1], !i);
        });
    }

    maps(cv, bottom, v) {
        const P = this.P, w = 760, x = CX;
        const y = gt3.section(cv, P, x, 50, w, 30 + 4 * 70, 'Map names', 'shown on the map tiles');
        for (let i = 1; i <= 4; i++) {
            const k = 'map' + i, it = this.item(k), opts = (it && it.options) || [], cur = this.get(k), j = opts.findIndex((o) => o[0] === cur);
            const cy = gt3.row(cv, P, x, y + (i - 1) * 70, w, 70, 'Map ' + i, v.map.active === i ? 'Active now' : '', i === 1);
            const step = (d) => () => this.set(k, opts[(Math.max(0, j) + d + opts.length) % opts.length][0]);
            gt3.stepper(cv, P, x + w - 14, cy, gt3.up(this.label(k)), step(-1), step(1), k, 220);
        }
        const rx = x + w + 16, rw = CR - rx;
        const y2 = gt3.section(cv, P, rx, 50, rw, 30 + 2 * 70, 'Switching');
        gt3.row(cv, P, rx, y2, rw, 70, 'Only when stopped', 'Under 5 km/h (3 mph), engine running', true);
        gt3.row(cv, P, rx, y2 + 70, rw, 70, 'Fixed', 'A safety rule, not a setting');
    }

    units(cv, bottom, v, u) {
        const P = this.P, lw = 760, x = CX;
        const pre = u.sp && u.tf ? 'us' : !u.sp && !u.tf ? 'metric' : 'custom';
        let y = gt3.section(cv, P, x, 50, lw, 30 + 3 * 66, 'Units');
        let cy = gt3.row(cv, P, x, y, lw, 66, 'Preset', pre === 'custom' ? 'Your own mix, set below' : 'Sets both below', true);
        gt3.seg(cv, P, x + lw - 14, cy, [['us', 'US'], ['metric', 'Metric'], ['custom', 'Custom']], pre, (val) => {
            if (val === 'custom') return;
            this.set('units', val);
            ['unitSpeed', 'unitTemp'].forEach((k) => this.set(k, 'auto'));
        }, 'preset', 21);
        y += 66;
        [['Temperature', 'unitTemp', [['f', '°F'], ['c', '°C']], u.tf], ['Speed', 'unitSpeed', [['mph', 'mph'], ['kmh', 'km/h']], u.sp]].forEach(([n, k, opts, on]) => {
            cy = gt3.row(cv, P, x, y, lw, 66, n);
            gt3.seg(cv, P, x + lw - 14, cy, opts, on ? opts[0][0] : opts[1][0], (val) => this.set(k, val), 'unit:' + k);
            y += 66;
        });
        const px = x + lw + 16, pw = CR - px;
        y = gt3.section(cv, P, px, 50, pw, 30 + 2 * 66, 'Preview');
        gt3.row(cv, P, px, y, pw, 66, 'Coolant 96 °C', null, true);
        gt3.txt(cv, u.tf ? '205°' : '96°', px + pw - 16, y + 44, 34, P.text, { align: 'right' });
        gt3.row(cv, P, px, y + 66, pw, 66, 'Maps switch under');
        gt3.txt(cv, u.sp ? '3 MPH' : '5 KM/H', px + pw - 16, y + 66 + 44, 34, P.text, { align: 'right' });
    }

    valveTab(cv) {
        const P = this.P, w = (CW - 16) / 2, x = CX;
        let y = gt3.section(cv, P, x, 50, w, 30 + 3 * 74, 'Exhaust valve');
        let cy = gt3.row(cv, P, x, y, w, 74, 'At every start', 'Sent once the car is on', true);
        gt3.seg(cv, P, x + w - 14, cy, [['oem', 'OEM'], ['open', 'Open'], ['closed', 'Closed']], this.get('valveStart'), (val) => this.set('valveStart', val), 'valveStart');
        cy = gt3.row(cv, P, x, y + 74, w, 74, 'Hold open / closed', this.get('hold') === 'off' ? 'Off: the car takes over after ~20 s' : 'Sent again every 15 s');
        gt3.toggle(cv, P, x + w - 14, cy, this.get('hold') !== 'off', () => this.set('hold', this.get('hold') === 'off' ? 'on' : 'off'), 'hold');
        cy = gt3.row(cv, P, x, y + 148, w, 74, 'Closed: back to OEM above', 'Resumes 500 rpm below it');
        const it = this.item('closeLimit'), opts = (it && it.options) || [], cur = this.get('closeLimit'), j = opts.findIndex((o) => o[0] === cur);
        gt3.stepper(cv, P, x + w - 14, cy, cur === 'off' ? 'NEVER' : cur + ' RPM',
            j > 0 ? () => this.set('closeLimit', opts[j - 1][0]) : null, j < opts.length - 1 ? () => this.set('closeLimit', opts[j + 1][0]) : null, 'closeLimit', 150);
        const rx = x + w + 16;
        y = gt3.section(cv, P, rx, 50, w, 30 + 2 * 74, 'Max cooling');
        gt3.row(cv, P, rx, y, w, 74, 'Needs', 'MHD, and the engine running (over 500 rpm)', true);
        gt3.row(cv, P, rx, y + 74, w, 74, 'Off', 'Always allowed');
    }

    system(cv, bottom, v) {
        const P = this.P, w = (CW - 16) / 2, x = CX;
        let y = gt3.section(cv, P, x, 50, w, 30 + 64, 'Display');
        let cy = gt3.row(cv, P, x, y, w, 64, 'Box colour', P.name, true);
        gt3.swatches(cv, P, x + w - 14, cy, P.key, (val) => this.set('boxColour', val));
        y = 50 + 30 + 64 + 12;
        y = gt3.section(cv, P, x, y, w, 30 + 64, 'Data');
        cy = gt3.row(cv, P, x, y, w, 64, 'Demo data', 'Nothing is sent to the car while it shows', true);
        gt3.seg(cv, P, x + w - 14, cy, [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], this.get('demo'), (val) => this.set('demo', val), 'demo');
        const rx = x + w + 16, spec = this.ctx.spec;
        y = gt3.section(cv, P, rx, 50, w, 30 + 200, 'About');
        gt3.txt(cv, spec.title, rx + 16, y + 40, 32, P.text);
        gt3.txt(cv, 'v' + spec.version, rx + 24 + gt3.tw(cv, spec.title, 32), y + 40, 20, P.dim);
        gt3.txt(cv, 'Commands from cauliflowermossgrape\'s Engine Config', rx + 16, y + 74, 20, P.text);
        gt3.txt(cv, 'Car data: ' + (v.demo ? 'demo, nothing sent' : 'live') + ' · link ' + (v.link ? 'up' : 'down'), rx + 16, y + 102, 20, v.demo ? P.warm : P.ok);
        gt3.txt(cv, 'Back to the controls: Settings again, or the Controls tab.', rx + 16, y + 130, 17, P.dim);
        if (this.opts.openList) gt3.button(cv, P, rx + 16, y + 146, 'Every setting as a list', () => this.opts.openList(), 'list', true, 17);
    }
}

module.exports = Setup;
