'use strict';
/**
 * Apex Telemetry (chase0017-apps): a GT3 pit board on the centre screen. One still page, nothing to page through,
 * and nothing the Apex Cluster dash already shows: the four tyres (pressure against the car's target, temperature)
 * round a car seen from above, boost against its target on the left, the intercooler and g-force on the right, and
 * five small boxes that each show a value of the driver's choosing (fuel rail, low fuel, gearbox, outside, range by
 * default). Yellow = warning, red = near critical. Tap the g-force box to reset the peaks.
 *
 * The bar's Setup button opens the settings page (setup.js: small boxes, units, tyre limits, what the car answers,
 * box colour) in place of the board; Setup again, or its Pit board tab, goes back.
 *
 *   telemetry.js  the values (car signals, TPMS, the engine unit over the kit's read-only link)
 *   draw.js       the board (pure canvas calls; tools/telemetry-preview/ draws the same file in a browser)
 *   setup.js      the settings page (shared/gt3ui.js)
 *
 * Plain Node 8 (the car's 8.16.2).
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const themes = require('./kit/themes');
const gt3 = require('./gt3ui');
const Telemetry = require('./telemetry');
const D = require('./draw');
const Setup = require('./setup');

const W = 1600, H = 520;
// the kit's chrome (header, bar, Settings sheet) in black and white, as Apex Cluster's page
Object.assign(themes.THEMES.ice, { sel: '#ffffff', selText: '#0b0d10', bg: '#050607' });

mgu.run({
    start(ctx) {
        const { settings, log } = ctx;
        let tel;
        try {
            tel = new Telemetry(ctx);
        } catch (e) {
            // stay up: an exit here would count as a crash on the car
            log.error('telemetry failed to start: ' + (e && e.stack || e));
            return;
        }
        const num = (k, d) => { const v = Number(settings.get(k)); return isFinite(v) ? v : d; };
        // each measure's own unit setting; "Follow Units" (auto) takes the Units setting
        const unit = (k, yes, no) => { const v = settings.get(k); return v === yes ? true : v === no ? false : settings.get('units') !== 'metric'; };
        const units = () => ({ sp: unit('unitSpeed', 'mph', 'kmh'), tf: unit('unitTemp', 'f', 'c'), ps: unit('unitPress', 'psi', 'bar') });
        const slots = () => [1, 2, 3, 4, 5].map((i) => { const v = settings.get('tBox' + i); return D.SLOTS[v] ? v : D.SLOT_DEFAULTS[i - 1]; });
        let mode = 'board', loop = null;
        const kick = () => { if (loop && loop.kick) loop.kick(); };
        const setup = new Setup(ctx, tel, { kick, close: () => { mode = 'board'; kick(); } });
        loop = ctx.loop('MAIN', 5, () => {
            tel.wanted();
            const sl = slots(), u = units(), snap = tel.snapshot();
            tel.setNeeds(sl.map((id) => D.SLOTS[id].dme));         // the engine unit is only asked for what a box shows
            const cv = ctx.canvas(W, H);
            if (mode === 'setup') {
                setup.draw(cv, G.pageBottom(cv), snap, u);
                G.frame(cv, ctx.theme(), [], -1, [snap.demo ? { text: 'DEMO DATA', color: '#ffb020' } : null, { text: 'SETUP', color: '#ffffff' }]);
            } else {
                D.draw(cv, snap, {
                    us: u.sp, tempF: u.tf, psi: u.ps, slots: sl, box: gt3.palette(settings.get('boxColour')),
                    tyreWarn: num('tyreWarn', 54), tyreHot: num('tyreHot', 66),
                    tyreLow: num('tyreLow', 3), tyreOver: num('tyreOver', 3), tyreOverRed: num('tyreOverRed', 5),
                    frame: (c, badges) => G.frame(c, ctx.theme(), [], -1, badges),
                    why: (k) => tel.why(k),
                    target: (c, x, y, w, h) => { if (c.target) c.target(x, y, w, h, () => { tel.resetPeaks(); kick(); }, 'peaks', 5); },
                });
            }
            return ctx.ui.image('MAIN_GFX', cv);
        });
        ctx.ui.onClick('BTN_SETUP', () => { mode = mode === 'setup' ? 'board' : 'setup'; kick(); });
        settings.onChange(() => kick());
        log.info('Apex Telemetry started');
    },
});
