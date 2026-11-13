'use strict';
/**
 * Apex Telemetry (chase0017-apps): a GT3 pit board on the centre screen. One still page, nothing to page through,
 * and nothing the Apex Cluster dash already shows: the four tyres (pressure against the car's target, temperature)
 * round a car seen from above, boost against its target and the fuel pressures on the left, gearbox, outside, range,
 * load and g-force on the right. Yellow = warning, red = near critical. Tap the g-force box to reset the peaks.
 *
 *   telemetry.js  the values (car signals, TPMS, the engine unit over the kit's read-only link)
 *   draw.js       the page (pure canvas calls; tools/telemetry-preview/ draws the same file in a browser)
 *
 * Plain Node 8 (the car's 8.16.2).
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const themes = require('./kit/themes');
const Telemetry = require('./telemetry');
const D = require('./draw');

const W = 1600, H = 520;
// the kit's chrome (header, bar, Settings sheet) in Ice White, as Apex Cluster's page
Object.assign(themes.THEMES.ice, { sel: '#e9f2ff', selText: '#0b0d10', bg: '#050607' });

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
        const loop = ctx.loop('MAIN', 5, () => {
            tel.wanted();
            const cv = ctx.canvas(W, H);
            D.draw(cv, tel.snapshot(), {
                us: unit('unitSpeed', 'mph', 'kmh'), tempF: unit('unitTemp', 'f', 'c'), psi: unit('unitPress', 'psi', 'bar'),
                tyreWarn: num('tyreWarn', 54), tyreHot: num('tyreHot', 66),
                frame: (c, badges) => G.frame(c, ctx.theme(), [], -1, badges),
                why: (k) => tel.why(k),
                target: (c, x, y, w, h) => { if (c.target) c.target(x, y, w, h, () => { tel.resetPeaks(); if (loop && loop.kick) loop.kick(); }, 'peaks', 5); },
            });
            return ctx.ui.image('MAIN_GFX', cv);
        });
        settings.onChange(() => { if (loop && loop.kick) loop.kick(); });
        log.info('Apex Telemetry started');
    },
});
