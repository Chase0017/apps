'use strict';
/**
 * What the driver can actually see of each target, measured from car photos (Nov 5 2026,
 * design/photos/calibration-2026-11-05.json next to the pictures). The renderer draws 1:1,
 * but parts of the panel are hidden by the car and parts of the HUD fall outside the
 * windshield window. Used by layouts.js (a warning per widget) and the bench (the car view).
 *
 * Plain Node 8 (the car's 8.16.2): no optional chaining, no ??, no dependencies.
 */

/** Cluster (1920x720): the first visible y along each vertical line [x, y]; the hood hides
 *  everything above it. Linear between points; x 1920 is taken as y 240. Bottom and sides
 *  are fully visible. */
const HOOD = [
    [0, 273], [100, 138], [200, 85], [300, 57], [400, 36], [500, 21], [600, 18], [700, 12], [800, 3], [900, 2],
    [1000, 1], [1100, 2], [1200, 5], [1300, 10], [1400, 19], [1500, 37], [1600, 67], [1700, 84], [1800, 128], [1900, 196],
    [1920, 240],
];
/** BMW draws a solid black box over our panel here (its gear slot): [x0, y0, x1, y1]. */
const BLACK_BOX = [1406, 342, 1597, 419];
/** BMW's seat-belt warning light is drawn over us here: [x0, y0, x1, y1]. */
const BELT = [587, 663, 626, 700];
/** 2022+ (LCI) cars with Driving Assistant Professional: the driver attention camera's pod sits in front of the panel,
 *  top centre, and hides it here (measured from photos of the Retro 80s and GT3 themes on a 2023 X3 M40i, Nov 12 2026;
 *  about +-15 px, it moves with eye height): [x0, y0, x1, y1]. */
const CAMERA = [750, 0, 1190, 132];
/** BMW's green turn-signal arrows, drawn over us either side of the camera: [x0, y0, x1, y1] each (same photos). */
const ARROWS = [[695, 100, 775, 168], [1160, 100, 1235, 168]];
/** BMW's red PARK (parking brake) light, drawn over us top right (same photos, rough): [x0, y0, x1, y1]. */
const PARK = [1830, 185, 1910, 252];
/** More of BMW's warning lights drawn over us (2023 X3 M40i photo with them lit, Nov 12 2026; about +-20 px):
 *  [name, [x0, y0, x1, y1]]. */
const WARNINGS = [
    ['brake, tyre pressure, ABS and traction lights', [0, 220, 112, 462]],
    ['steering warning light', [1844, 258, 1920, 320]],
    ['gear letter (P)', [1395, 660, 1440, 705]],
];
/** The part of the 800x480 HUD target seen through the windshield: BMW's own height-adjust frame (car photo Nov 7,
 *  measured Nov 9 2026) spans x 117..681, y ~85..395. The Nov 5 grid photo's right edge (x 600) was the phone's angle. */
const HUD_WINDOW = { x: 120, y: 100, w: 560, h: 280 };
/** BMW's own HUD items that draw over ours, bottom left: its speed and speed-limit sign (Comfort), and in Sport also
 *  its segmented rev band (x ~125..335, y ~245..280, Nov 9 photos). Every layout keeps it clear: [x0, y0, x1, y1]. */
const HUD_BMW = [120, 235, 350, 380];

/** A ramped row of shift lights ("rise"), one rect per light where the lights shader draws it (shaders.js LIGHTS). */
function lightRects(w) {
    const n = w.count || 12, gap = 6, slot = (w.w + gap) / n, segW = slot - gap;
    const rise = Math.max(0, Math.min(w.h - 4, w.rise)), segH = w.h - rise;
    const out = [];
    for (let i = 0; i < n; i++) {
        const li = w.mirror ? n - 1 - i : i;
        const top = rise * (1 - li / Math.max(1, n - 1));
        const d = w.round ? Math.min(segW, segH) : 0;
        out.push({ id: w.id + '.' + (i + 1), x: w.x + i * slot + (d ? (segW - d) / 2 : 0), y: w.y + top + (d ? (segH - d) / 2 : 0),
            w: d || segW, h: d || segH });
    }
    return out;
}

/** The first visible y at x on the panel (interpolated along HOOD). */
function hoodY(x) {
    if (x <= HOOD[0][0]) return HOOD[0][1];
    const last = HOOD[HOOD.length - 1];
    if (x >= last[0]) return last[1];
    for (let i = 1; i < HOOD.length; i++) {
        const a = HOOD[i - 1], b = HOOD[i];
        if (x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return last[1];
}

function overlaps(w, box) {
    return w.x < box[2] && w.x + w.w > box[0] && w.y < box[3] && w.y + w.h > box[1];
}

/**
 * Warnings (strings, one per problem) for the widgets ({ id, x, y, w, h }) of a layout on
 * `target` ('panel' or 'hud'). Never throws; a widget without numeric x/y/w/h is skipped.
 */
function check(widgets, target) {
    const out = [];
    if (!Array.isArray(widgets)) return out;
    // a frame drawn in one layer (GT3's "boxes", Dyno's "tiles"): check each box, not the full-panel layer
    const all = [];
    widgets.forEach((w) => {
        const sub = w && (w.boxes || w.tiles);
        if (Array.isArray(sub)) sub.forEach((b) => { if (b) all.push(Object.assign({ overBlackBox: w.overBlackBox }, b, { id: w.id + '.' + b.id })); });
        else if (w && w.type === 'lights' && w.rise > 0) lightRects(w).forEach((b) => all.push(b));
        else all.push(w);
    });
    all.forEach((w) => {
        if (!w || typeof w.x !== 'number' || typeof w.y !== 'number' || typeof w.w !== 'number' || typeof w.h !== 'number') return;
        const id = String(w.id);
        if (target === 'panel') {
            // the top edge: both corners, then a few samples along it (the hood curve is not straight)
            const under = [];
            const tryX = (x, what) => {
                const d = Math.ceil(hoodY(x) - w.y);
                if (d > 0) under.push({ d, what });
            };
            tryX(w.x, 'top-left corner');
            tryX(w.x + w.w, 'top-right corner');
            const steps = 4;
            for (let i = 1; i < steps; i++) tryX(w.x + w.w * i / steps, 'top edge at x ' + Math.round(w.x + w.w * i / steps));
            if (under.length) {
                const worst = under.reduce((a, b) => (b.d > a.d ? b : a));
                out.push(id + ': ' + worst.what + ' ' + worst.d + ' px under the hood');
            }
            if (!w.overBlackBox && overlaps(w, BLACK_BOX)) {   // overBlackBox: a 2022+ layout (that cluster draws no such box)
                out.push(id + ': overlaps BMW\'s gear box x' + BLACK_BOX[0] + '-' + BLACK_BOX[2] + ' y' + BLACK_BOX[1] + '-' + BLACK_BOX[3]);
            }
            if (overlaps(w, CAMERA)) {
                out.push(id + ': under the driver camera x' + CAMERA[0] + '-' + CAMERA[2] + ' y' + CAMERA[1] + '-' + CAMERA[3]);
            }
            ARROWS.forEach((a, i) => {
                if (overlaps(w, a)) out.push(id + ': under BMW\'s ' + (i ? 'right' : 'left') + ' turn arrow x' + a[0] + '-' + a[2] + ' y' + a[1] + '-' + a[3]);
            });
            WARNINGS.forEach((wn) => {
                const r = wn[1];
                if (overlaps(w, r)) out.push(id + ': under BMW\'s ' + wn[0] + ' x' + r[0] + '-' + r[2] + ' y' + r[1] + '-' + r[3]);
            });
            if (overlaps(w, PARK)) {
                out.push(id + ': under BMW\'s PARK light x' + PARK[0] + '-' + PARK[2] + ' y' + PARK[1] + '-' + PARK[3]);
            }
            if (overlaps(w, BELT)) {
                out.push(id + ': overlaps BMW\'s seat-belt light x' + BELT[0] + '-' + BELT[2] + ' y' + BELT[1] + '-' + BELT[3]);
            }
        } else if (target === 'hud') {
            const win = HUD_WINDOW;
            const d = Math.max(
                win.x - w.x, win.y - w.y,
                (w.x + w.w) - (win.x + win.w), (w.y + w.h) - (win.y + win.h));
            if (d > 0) {
                out.push(id + ': ' + Math.ceil(d) + ' px outside the visible HUD window ' + win.x + ',' + win.y + ' ' + win.w + 'x' + win.h);
            }
            if (overlaps(w, HUD_BMW)) {
                out.push(id + ': under BMW\'s own speed / Sport rev band x' + HUD_BMW[0] + '-' + HUD_BMW[2] + ' y' + HUD_BMW[1] + '-' + HUD_BMW[3]);
            }
        }
    });
    return out;
}

module.exports = { HOOD, BLACK_BOX, BELT, CAMERA, ARROWS, PARK, WARNINGS, HUD_WINDOW, HUD_BMW, hoodY, check };
