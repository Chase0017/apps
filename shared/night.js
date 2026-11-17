'use strict';
/**
 * night.js - night dimming for the apps' own centre-screen pages (chase0017-apps, Nov 16 2026; first in Apex
 * Telemetry 0.8.0). After sunset a black veil at 40 % goes over the whole page (VEIL), so everything drawn, the kit's
 * header too, is at 60 % brightness, as Apex Cluster's Night colours (hud.js NIGHT_DIM 0.6).
 *
 *   const isNight = night.dimmer(settings, 'pageDim');   // setting: auto (after sunset) | on | off
 *   ... if (isNight()) cv.fillRect(0, 0, W, H, night.VEIL);
 *
 * Sunset (sun.js) at the middle of the "timeZone" setting's zone (tz.js; the head unit's clock is UTC and gives no
 * zone), else the middle of the US; worked out once a minute (isNight.reset() makes the next call work it out).
 */
const sun = require('./sun');
const tz = require('./tz');

const VEIL = '#00000066';

function dimmer(settings, key) {
    let at = 0, now = false;
    const isNight = () => {
        const v = settings.get(key);
        if (v === 'off') return false;
        if (v === 'on') return true;
        if (Date.now() - at > 60000) {
            const p = tz.place(Number(settings.get('timeZone'))) || tz.FALLBACK;
            now = sun.isNight(Date.now(), p.lat, p.lon); at = Date.now();
        }
        return now;
    };
    isNight.reset = () => { at = 0; };
    return isNight;
}

module.exports = { VEIL, dimmer };
