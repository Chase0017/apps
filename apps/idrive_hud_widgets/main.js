'use strict';
/**
 * Apex HUD (bimmer-lab's HUD Widgets, chase0017-apps fork): custom widgets on the iDrive 7 windshield HUD, drawn
 * through cluster-render.
 *
 * The center screen is the app's own page (shared/page.js, a canvas screen): the layouts with their
 * pictures, which drive mode shows which, and the settings. Each choice is saved in the app's data/settings.json
 * by the kit; the shared engine (hud.js) listens and redraws at once. It keeps running after the page is
 * closed (OAP apps stay up in the background), so the page is only needed for changes. The kit's own
 * settings list stays one tap away (the bar's All settings).
 *
 * Autostart (app.json "autostart": true): the head unit starts the app by itself when the car wakes, with no screen.
 * background() starts the engine then, so the HUD comes up without opening the app; when the app is opened, start()
 * puts the page on the engine that already runs (or starts one, on a unit or Store that doesn't autostart).
 */
const mgu = require('./kit/mgu');
const HudApp = require('./hud');
const Page = require('./page');

/** The drawing engine: needs only settings, signals, log, spec and dataDir, so it runs without screens. */
function background(bg) {
    let hud;
    try {
        hud = new HudApp(bg);
    } catch (e) {
        // nothing drawn, but stay up: an exit here would count as a crash on the car
        bg.log.error('HUD failed to start: ' + (e && e.stack || e));
        return null;
    }
    hud.start();
    process.on('exit', () => { try { hud.stop(); } catch (e) { /* exiting anyway */ } });
    bg.log.info('HUD engine started' + (bg.app && !bg.app.rhmiApplication ? ' in the background (autostart)' : ''));
    return hud;
}

mgu.run({
    background,
    start(ctx) {
        const hud = ctx.background || background(ctx);
        if (!hud) return;
        new Page(ctx, hud, {
            title: ctx.spec.title, what: 'HUD',
            look: { name: 'Layouts', style: 'cards', tags: { daily: 'gear · clock · oil', sport: 'rev bar · temps · boost', redline: 'shift lights · shift score', minimal: 'round BMW speed', shiftonly: 'lights · gear', boost: 'boost · peak', warmup: 'oil · coolant · intake', track: 'lights · G-meter', cruise: 'range · trip', retro: 'amber digital' } },
            tabs: ['look', 'readouts', 'position', 'colours', 'alerts', 'gmeter', 'settings'],
            settings: ['units', 'unitSpeed', 'unitTemp', 'unitPress', 'clock', 'timeZone', 'tankLitres', 'redline', 'shiftBefore', 'coldGuard', 'showClock', 'showOil', 'showCoolant', 'showBoost', 'demo'],
        }).start();
    },
});
