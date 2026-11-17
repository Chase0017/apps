'use strict';
/**
 * Apex DME Controls (chase0017-apps): one page on the centre screen to switch the engine map, set the exhaust valve
 * and turn on Max Cooling, in the Apex GT3 look; with MG Flasher, its own page of Live Control functions (burble,
 * radiator flap, ethanol, valet too). No xDrive control, on purpose.
 *
 *   control.js   the only file that sends anything to the car (commands from cauliflowermossgrape's Engine Config)
 *   draw.js      the page
 *   setup.js     the settings page (the header's Settings tab)
 *   bm3_*.js     BM3's map slot (from Engine Config, after ezl0l's BM3 Live)
 *
 * Opening the app sends nothing (with BM3 picked it reads the ROM and the active map). A command leaves on a press,
 * and the valve's "at every start" setting once per start. No demo data: a value the car never sent is a dash, one
 * it stopped sending stays, dimmed with an amber dot (kit car.js).
 *
 * Plain Node 8 (the car's 8.16.2).
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const themes = require('./kit/themes');
const Car = require('./kit/car');
const gt3 = require('./gt3ui');
const { Control } = require('./control');
const D = require('./draw');
const Setup = require('./setup');
const night = require('./night');

const W = 1600, H = 520;
Object.assign(themes.THEMES.ice, { sel: '#ffffff', selText: '#0b0d10', bg: '#050607' });

mgu.run({
    start(ctx) {
        const { settings, log } = ctx;
        let car, ctl;
        try {
            car = new Car(ctx, ['rpm', 'speed', 'temps']);
            ctl = new Control(ctx, car);
        } catch (e) {
            log.error('DME Controls failed to start: ' + (e && e.stack || e));   // stay up: an exit counts as a crash
            return;
        }
        const unit = (k, yes, no) => { const v = settings.get(k); return v === yes ? true : v === no ? false : settings.get('units') !== 'metric'; };
        const units = () => ({ sp: unit('unitSpeed', 'mph', 'kmh'), tf: unit('unitTemp', 'f', 'c') });
        let mode = 'main', confirm = null, sheet = null, ethDraft = null, loop = null;
        const kick = () => { if (loop && loop.kick) loop.kick(); };
        ctl.onChange = kick;
        const isNight = night.dimmer(settings, 'pageDim');      // the whole screen to 60 % after sunset (System, Display)
        const setup = new Setup(ctx, { kick, isNight, close: () => { mode = 'main'; kick(); }, openList: () => ctx.openSettingsList && ctx.openSettingsList() });
        const act = {
            map(n) {
                if (settings.get('confirmMap') === false) { ctl.setMap(n); return; }
                confirm = n; kick();
            },
            valve(m) { ctl.setValve(m); kick(); },
            cooling(on) { ctl.setCooling(on); kick(); },
            // MG Flasher: ethanol changes what the tune fuels for, so it is asked first
            mgf(key, value) {
                if (key === 'ethanol' && value === 1) {
                    const p = ctl.mgf.ethPct;
                    sheet = { title: 'Ethanol override on?', big: 'Fuel for ' + (p === null ? 'the set' : p + ' %') + ' ethanol',
                        body: 'The DME stops using the flex fuel sensor. Only do this if the tank really holds this blend.', yes: 'Turn on', run: () => ctl.setMgf('ethanol', 1) };
                } else ctl.setMgf(key, value);
                kick();
            },
            ethStep(d) { const cur = ethDraft !== null ? ethDraft : ctl.mgf.ethPct; if (typeof cur === 'number') ethDraft = Math.max(0, Math.min(100, Math.round((cur + d) / 5) * 5)); kick(); },
            ethApply() {
                const p = ethDraft;
                if (p === null) return;
                sheet = { title: 'Set ethanol to ' + p + ' %?', big: p + ' % ethanol', body: 'The DME fuels for this blend while the override is on. It must match what is in the tank.',
                    yes: 'Set ' + p + ' %', run: () => { ctl.setMgf('ethPct', p); ethDraft = null; } };
                kick();
            },
        };
        loop = ctx.loop('MAIN', 4, () => {
            const v = ctl.view(), u = units(), P = gt3.palette(settings.get('boxColour')), d = car.data();
            const cv = ctx.canvas(W, H), bottom = G.pageBottom(cv);
            if (confirm !== null && (v.mapBlock || v.busy)) confirm = null;          // the car moved off meanwhile
            if (sheet && (v.ethBlock || v.mgf.pending)) sheet = null;
            if (ethDraft !== null && ethDraft === v.mgf.ethPct) ethDraft = null;
            const badges = [!v.link ? { text: 'NO DIAGNOSTIC LINK', color: '#ffb020' } : null];
            if (mode === 'settings') {
                setup.draw(cv, bottom, v, u);
            } else {
                D.draw(cv, bottom, v, {
                    P, tempF: u.tf, coolant: d.coolant, oil: d.oil, hold: settings.get('hold') !== 'off', closeLimit: Number(settings.get('closeLimit')) || null, locked: confirm !== null || !!sheet, ethDraft,
                    rpm: d.rpm, held: { coolant: car.stale('coolant'), oil: car.stale('oil'), rpm: car.stale('rpm') },
                    names: [1, 2, 3, 4].map((i) => settings.display('map' + i)),
                }, act);
                if (confirm !== null) {
                    const n = confirm;
                    D.confirm(cv, bottom, P, n, settings.display('map' + n), () => { confirm = null; ctl.setMap(n); kick(); }, () => { confirm = null; kick(); });
                } else if (sheet) {
                    const s = sheet;
                    D.ask(cv, bottom, P, s.title, s.big, s.body, s.yes, () => { sheet = null; s.run(); kick(); }, () => { sheet = null; kick(); });
                }
            }
            G.frame(cv, ctx.theme(), [], -1, badges);
            if (isNight()) cv.fillRect(0, 0, W, H, night.VEIL);
            return ctx.ui.image('MAIN_GFX', cv);
        });
        // the Settings tab opens our page (and closes it again)
        if (ctx.ownSettings) ctx.ownSettings(() => { mode = mode === 'settings' ? 'main' : 'settings'; confirm = null; sheet = null; kick(); return null; });
        settings.onChange((k) => { if (k === 'tuner') { ctl.tunerChanged(); ethDraft = null; sheet = null; } isNight.reset(); kick(); });
        ctl.start().catch((e) => log.error('DME link: ' + (e && e.stack || e)));
        log.info('Apex DME Controls started');
    },
});
