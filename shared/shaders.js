'use strict';
/**
 * The HUD's GLSL ES 1.00 fragment shaders for cluster-render "effect" layers, drawn on the
 * car's GPU. Kept as JS strings because the kit's build ships an app's top-level .js files
 * as they are (a data folder becomes a JSON-only pack). hud.js sends the uniforms.
 */
const SHIFTBAR = `// Segmented shift bar for a cluster-render "effect" layer (GLSL ES 1.00).
// v_uv is 0..1 across the layer, (0,0) at the top-left as on the car. Uniforms come from hud.js:
//   u_value   0..1, how much of the bar is lit (rpm / bar max)
//   u_size    layer size in px (w, h), for round corners and gaps in pixels
//   u_segs    segment count
//   u_low, u_mid, u_high   zone colours (rgb 0..1)
//   u_midAt, u_highAt      where the mid and high zones start (0..1 of the bar)
//   u_track   unlit segment colour (rgba, straight alpha)
//   u_flash   1 = at the redline: every lit segment shows the high colour
// Output is straight alpha. Whether cluster-render blends effect layers as
// straight or premultiplied alpha is not confirmed yet: check the edges on the car.
precision mediump float;
varying vec2 v_uv;
uniform float u_value;
uniform vec2 u_size;
uniform float u_segs;
uniform vec3 u_low;
uniform vec3 u_mid;
uniform vec3 u_high;
uniform float u_midAt;
uniform float u_highAt;
uniform vec4 u_track;
uniform float u_flash;

void main() {
    float gapPx = 3.0;
    float slot = u_size.x / u_segs;                 // px per segment incl. gap
    float px = v_uv.x * u_size.x;
    float idx = floor(px / slot);
    float inSeg = px - idx * slot;                  // px into this slot
    float segW = slot - gapPx;
    float py = v_uv.y * u_size.y;           // px from the top

    // rounded-rect coverage for this segment, radius 2px, 1px soft edge
    vec2 hs = vec2(segW, u_size.y) * 0.5;
    vec2 p = vec2(inSeg, py) - hs;
    vec2 q = abs(p) - (hs - vec2(2.0));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 2.0;
    float cover = clamp(0.5 - d, 0.0, 1.0);
    if (inSeg > segW) cover = 0.0;
    if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }

    float pos = (idx + 0.5) / u_segs;               // segment centre, 0..1
    bool lit = pos <= u_value;
    vec3 c = pos >= u_highAt ? u_high : (pos >= u_midAt ? u_mid : u_low);
    if (u_flash > 0.5) c = u_high;
    gl_FragColor = lit ? vec4(c, cover) : vec4(u_track.rgb, u_track.a * cover);
}
`;

const ARC = `// Thin open arc gauge for a cluster-render "effect" layer (GLSL ES 1.00).
// u_start / u_sweep (radians, clockwise from 12 o'clock; a negative sweep runs anticlockwise), round
// ends, filled from the start. hud.js default: 270 degrees from the lower left, the gap at the bottom.
// Uniforms from hud.js:
//   u_value  0..1 of the sweep
//   u_size   layer size in px (w, h)
//   u_color  lit arc (rgb 0..1)
//   u_track  unlit arc (rgba, straight alpha)
//   u_width  stroke width in px
// Output is straight alpha (same open question as the shift bar shader above).
precision mediump float;
varying vec2 v_uv;
uniform float u_value;
uniform vec2 u_size;
uniform vec3 u_color;
uniform vec4 u_track;
uniform float u_width;
uniform float u_start;
uniform float u_sweep;

const float PI = 3.14159265359;

// distance from point p (centred, px) to the arc from angle a0 sweeping s, radius r
float arcDist(vec2 p, float r, float a0, float s) {
    float a = atan(p.x, p.y);           // clockwise from 12 o'clock, -PI..PI
    float rel = mod(a - a0 + 4.0 * PI, 2.0 * PI);
    if (rel <= s) return abs(length(p) - r);
    vec2 e0 = r * vec2(sin(a0), cos(a0));
    vec2 e1 = r * vec2(sin(a0 + s), cos(a0 + s));
    return min(length(p - e0), length(p - e1));   // round end caps
}

void main() {
    vec2 p = vec2(v_uv.x - 0.5, 0.5 - v_uv.y) * u_size;   // px from centre, +y up (v_uv is top-left)
    float start = u_start, sweep = u_sweep;
    if (sweep < 0.0) { p.x = -p.x; start = -start; sweep = -sweep; }   // anticlockwise = mirrored clockwise
    float r = min(u_size.x, u_size.y) * 0.5 - u_width * 0.5 - 1.0;
    float hw = u_width * 0.5;
    float dTrack = arcDist(p, r, start, sweep) - hw;
    float lit = clamp(u_value, 0.0, 1.0) * sweep;
    float dLit = lit > 0.001 ? arcDist(p, r, start, lit) - hw : 1e5;
    float cLit = clamp(0.5 - dLit, 0.0, 1.0);
    float cTrack = clamp(0.5 - dTrack, 0.0, 1.0);
    if (cLit > 0.0) gl_FragColor = vec4(u_color, cLit);
    else gl_FragColor = vec4(u_track.rgb, u_track.a * cTrack);
}
`;

const REVBAR = `// G20 Live Cockpit style rev bar for a cluster-render "effect" layer (GLSL ES 1.00), after
// cauliflowermossgrape's Redline app (MIT). From the top of the layer: u_top px for the shift-point and
// redline marks, then the bar (u_barH px, slanted: its top edge is u_slant px right of its bottom
// edge), then the scale ticks. The bar fills left to right in 500 rpm segments; each lit segment
// takes the ramp colour of its position up to the shift point (u_from -> u_to), all u_hot from the
// shift point on. Unlit: u_track, and u_hot faint past the redline. A white needle leads the fill;
// a thin slanted line holds the peak. Uniforms (rpm values are rpm, not 0..1):
//   u_size, u_top, u_barH, u_slant   px
//   u_max, u_value, u_shift, u_red, u_peak   rpm
//   u_from, u_to, u_hot   rgb 0..1;  u_track, u_tick, u_fg   rgba (straight alpha)
//   u_shiftNow   1 = at or past the shift point
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_top;
uniform float u_barH;
uniform float u_slant;
uniform float u_max;
uniform float u_value;
uniform float u_shift;
uniform float u_red;
uniform float u_peak;
uniform vec3 u_from;
uniform vec3 u_to;
uniform vec3 u_hot;
uniform vec4 u_track;
uniform vec4 u_tick;
uniform vec4 u_fg;
uniform float u_shiftNow;

vec4 over(vec4 top, vec4 under) {           // straight-alpha "top over under"
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}

void main() {
    float px = v_uv.x * u_size.x;
    float py = v_uv.y * u_size.y;   // px from the top
    float bw = u_size.x - u_slant;            // bar length along the bottom edge
    float perRpm = bw / u_max;
    vec4 c = vec4(0.0);

    // marks above the bar: shift point (amber) and redline (red), at the bar's top edge
    if (py < u_top - 2.0) {
        float ds = abs(px - (u_shift * perRpm + u_slant));
        float dr = abs(px - (u_red * perRpm + u_slant));
        if (ds < 2.0) c = vec4(1.0, 0.76, 0.1, clamp(2.0 - ds, 0.0, 1.0));
        if (dr < 2.0) c = vec4(u_hot, clamp(2.0 - dr, 0.0, 1.0));
        gl_FragColor = c; return;
    }

    float by = py - u_top;                    // px down from the bar's top edge
    if (by <= u_barH) {
        float off = u_slant * (u_barH - by) / u_barH;
        float s = px - off;                   // px along the bar at this height
        float rpm = s / perRpm;
        float inside = clamp(s + 0.5, 0.0, 1.0) * clamp(bw - s + 0.5, 0.0, 1.0)
            * clamp(by + 0.5, 0.0, 1.0) * clamp(u_barH - by + 0.5, 0.0, 1.0);
        // slanted 3 px gap every 500 rpm
        float seg = floor(rpm / 500.0);
        float dGap = abs(s - floor(rpm / 500.0 + 0.5) * 500.0 * perRpm);
        float gap = rpm > 250.0 && rpm < u_max - 250.0 ? clamp(dGap - 1.0, 0.0, 1.0) : 1.0;
        vec4 bar;
        if (rpm <= u_value) {
            float f = clamp((seg * 500.0 + 250.0) / u_shift, 0.0, 1.0);
            vec3 col = u_shiftNow > 0.5 ? u_hot : mix(u_from, u_to, f);
            bar = vec4(col, 1.0);
        } else if (rpm >= u_red) bar = vec4(u_hot, 0.3);
        else bar = u_track;
        c = vec4(bar.rgb, bar.a * inside * gap);
        // peak: a thin slanted line where the rpm last peaked (only above the current rpm)
        if (u_peak > u_value + 60.0) {
            float dp = abs(s - u_peak * perRpm);
            vec3 pc = u_peak >= u_shift ? u_hot : mix(u_from, u_to, clamp(u_peak / u_shift, 0.0, 1.0));
            c = over(vec4(pc, clamp(1.5 - dp, 0.0, 1.0) * inside), c);
        }
        // needle: the bright leading edge of the fill
        if (u_value > 50.0) {
            float dn = abs(s - min(u_value, u_max) * perRpm);
            c = over(vec4(1.0, 1.0, 1.0, clamp(2.5 - dn, 0.0, 1.0) * clamp(by + 2.5, 0.0, 1.0) * clamp(u_barH - by + 2.5, 0.0, 1.0)), c);
        }
        gl_FragColor = c; return;
    }

    // scale ticks under the bar: every 500 rpm, longer every 1000, red from the redline
    float ty = by - u_barH - 4.0;
    if (ty >= 0.0) {
        float rpm = px / perRpm;
        float k = floor(rpm / 500.0 + 0.5);
        float d = abs(px - k * 500.0 * perRpm);
        bool major = mod(k, 2.0) < 0.5;
        float len = major ? 10.0 : 5.0;
        float hw = major ? 1.25 : 0.75;
        float a = clamp(hw + 0.5 - d, 0.0, 1.0) * (ty <= len ? 1.0 : 0.0);
        vec4 tc = k * 500.0 >= u_red ? vec4(u_hot, 1.0) : (major ? u_fg : u_tick);
        c = vec4(tc.rgb, tc.a * a);
    }
    gl_FragColor = c;
}
`;

const LIGHTS = `// Shift lights for a cluster-render "effect" layer (GLSL ES 1.00), after cauliflowermossgrape's Redline
// app (MIT): u_n rounded lights in a row, green -> yellow -> red from left to right. u_lit of them are
// on (they fill over the last 2000 rpm before the shift point); u_strobe 1 = at the shift point: all red.
// The last u_tail lights are blue instead (the GT3 dash look; 0 = none). u_round 1 = round lights.
//   u_size px, u_n count, u_lit count (0..u_n), u_tail count, u_strobe 0/1, u_green/u_yellow/u_red/u_blue rgb,
//   u_off (alpha when off)
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_n;
uniform float u_lit;
uniform float u_tail;
uniform float u_round;
uniform float u_strobe;
uniform vec3 u_green;
uniform vec3 u_yellow;
uniform vec3 u_red;
uniform vec3 u_blue;
uniform float u_off;

void main() {
    float gapPx = 6.0;
    float slot = (u_size.x + gapPx) / u_n;
    float px = v_uv.x * u_size.x;
    float py = v_uv.y * u_size.y;
    float idx = floor(px / slot);
    float inSeg = px - idx * slot;
    float segW = slot - gapPx;
    if (inSeg > segW || idx >= u_n) { gl_FragColor = vec4(0.0); return; }
    vec2 hs = vec2(segW, u_size.y) * 0.5;
    vec2 p = vec2(inSeg, py) - hs;
    float r = u_round > 0.5 ? min(hs.x, hs.y) : min(4.0, hs.y);
    if (u_round > 0.5) hs = vec2(r);
    p = vec2(inSeg, py) - vec2(segW, u_size.y) * 0.5;
    vec2 q = abs(p) - (hs - vec2(r));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float cover = clamp(0.5 - d, 0.0, 1.0);
    float nMain = max(1.0, u_n - u_tail);
    float f = idx / max(1.0, nMain - 1.0);
    vec3 col = idx >= nMain ? u_blue : (f < 0.42 ? u_green : (f < 0.75 ? u_yellow : u_red));
    bool on = idx < u_lit;
    if (u_strobe > 0.5) { col = u_red; on = true; }
    gl_FragColor = vec4(col, cover * (on ? 1.0 : u_off));
}
`;

const FILL = `// Solid fill for a cluster-render "effect" layer (GLSL ES 1.00): u_color everywhere, except a
// see-through rounded hole u_hole (x, y, w, h px from the layer's top left; w = 0: no hole), radius u_holeR.
// On the cluster, an opaque fill hides BMW's own gauges under it; the hole lets the map window show.
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_color;
uniform vec4 u_hole;
uniform float u_holeR;

void main() {
    vec2 p = vec2(v_uv.x * u_size.x, v_uv.y * u_size.y);
    float a = u_color.a;
    if (u_hole.z > 0.0) {
        vec2 hs = u_hole.zw * 0.5;
        vec2 q = abs(p - (u_hole.xy + hs)) - (hs - vec2(u_holeR));
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_holeR;
        a *= clamp(d + 0.5, 0.0, 1.0);
    }
    gl_FragColor = vec4(u_color.rgb, a);
}
`;

const BOX = `// Framed box for a cluster-render "effect" layer (GLSL ES 1.00), the race-dash readout box: a rounded
// frame u_border px wide in u_line, filled u_fill, with a header strip u_headH px tall in u_head across the
// top (0 = none). Colours rgba, straight alpha. u_size, u_border, u_headH, u_radius in px.
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_fill;
uniform vec4 u_line;
uniform vec4 u_head;
uniform float u_headH;
uniform float u_border;
uniform float u_radius;

void main() {
    vec2 p = vec2(v_uv.x * u_size.x, v_uv.y * u_size.y);
    vec2 hs = u_size * 0.5;
    vec2 q = abs(p - hs) - (hs - vec2(u_radius));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;   // < 0 inside
    float outer = clamp(0.5 - d, 0.0, 1.0);
    if (outer <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec4 c = p.y < u_headH ? u_head : u_fill;
    float edge = clamp(d + u_border + 0.5, 0.0, 1.0);                       // 1 within the frame
    vec4 col = mix(c, u_line, edge);
    gl_FragColor = vec4(col.rgb, col.a * outer);
}
`;

const BOXES = `// The GT3 race dash's frame in one cluster-render "effect" layer (GLSL ES 1.00): the background u_bg over the
// whole layer, a see-through rounded hole for BMW's map (u_hole x, y, w, h in layer px, already inset; w 0 = none;
// corner radius u_holeR) and up to 12 framed readout boxes from the layout: each a rounded frame in u_line, filled
// u_fill, with a header strip across its top in u_head (or u_accent). Array uniforms (sent with type vec4):
//   u_box[i]       x, y, w, h in layer px
//   u_boxStyle[i]  header height px, border px, corner radius px, header kind (0 u_head, 1 u_accent)
//   u_n            boxes in use (the rest are skipped). Boxes must not overlap each other or the hole.
// Colours rgba, straight alpha. The loop bound is constant and the arrays are indexed by the loop counter only,
// as GLSL ES 1.00 requires.
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_bg;
uniform vec4 u_hole;
uniform float u_holeR;
uniform float u_n;
uniform vec4 u_box[12];
uniform vec4 u_boxStyle[12];
uniform vec4 u_fill;
uniform vec4 u_line;
uniform vec4 u_head;
uniform vec4 u_accent;

// signed distance to the rounded rect r (x, y, w, h), radius rad; < 0 inside
float sdBox(vec2 p, vec4 r, float rad) {
    vec2 hs = r.zw * 0.5;
    vec2 q = abs(p - (r.xy + hs)) - (hs - vec2(rad));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
vec4 over(vec4 top, vec4 under) {           // straight-alpha "top over under"
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}

void main() {
    vec2 p = v_uv * u_size;
    vec4 c = u_bg;
    if (u_hole.z > 0.0) c.a *= clamp(sdBox(p, u_hole, u_holeR) + 0.5, 0.0, 1.0);
    for (int i = 0; i < 12; i++) {
        if (float(i) >= u_n) break;
        vec4 b = u_box[i];
        vec4 s = u_boxStyle[i];
        if (p.x < b.x - 1.0 || p.x > b.x + b.z + 1.0 || p.y < b.y - 1.0 || p.y > b.y + b.w + 1.0) continue;
        float d = sdBox(p, b, s.z);
        float outer = clamp(0.5 - d, 0.0, 1.0);
        if (outer <= 0.0) continue;
        vec4 inner = p.y < b.y + s.x ? (s.w > 0.5 ? u_accent : u_head) : u_fill;
        float edge = clamp(d + s.y + 0.5, 0.0, 1.0);               // 1 within the frame
        vec4 col = mix(inner, u_line, edge);
        c = over(vec4(col.rgb, col.a * outer), c);
    }
    gl_FragColor = c;
}
`;

const GRID = `// Calibration grid for a cluster-render "effect" layer (GLSL ES 1.00): a line every u_step px, a brighter
// one every u_major steps, a frame round the edge. v_uv (0,0) is the top-left.
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_step;
uniform float u_major;
uniform vec4 u_minor;
uniform vec4 u_majorC;

void main() {
    vec2 p = v_uv * u_size;
    vec2 m = mod(p, u_step);
    vec2 big = mod(p, u_step * u_major);
    bool edge = p.x < 2.0 || p.y < 2.0 || p.x > u_size.x - 2.0 || p.y > u_size.y - 2.0;
    if (edge || big.x < 2.0 || big.y < 2.0) gl_FragColor = u_majorC;
    else if (m.x < 1.0 || m.y < 1.0) gl_FragColor = u_minor;
    else gl_FragColor = vec4(0.0);
}
`;

const SEGBAR = `// Segmented level bar for a cluster-render "effect" layer (GLSL ES 1.00): u_segs segments, the first
// u_lit of them lit (brightening left to right), each slanted u_slant px. v_uv (0,0) is the top-left.
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_segs;
uniform float u_lit;
uniform vec4 u_on;
uniform vec4 u_offC;
uniform float u_slant;

void main() {
    vec2 p = v_uv * u_size;
    float x = p.x - u_slant * (1.0 - v_uv.y);
    float gap = 8.0;
    float slot = (u_size.x - u_slant + gap) / u_segs;
    float i = floor(x / slot);
    float fx = x - i * slot;
    float a = clamp(fx + 0.5, 0.0, 1.0) * clamp(slot - gap - fx + 0.5, 0.0, 1.0);
    if (i < 0.0 || i >= u_segs || a <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec4 col = i < u_lit ? vec4(u_on.rgb * mix(0.72, 1.0, fx / (slot - gap)), u_on.a) : u_offC;
    gl_FragColor = vec4(col.rgb, col.a * a);
}
`;

const MDASH = `// The M theme's whole backdrop in one cluster-render "effect" layer (GLSL ES 1.00), after a current M8's cluster
// (design/photos/ref-m8-cluster.png): black, with a dark card either side whose inner edge follows the rev blade,
// whose top outer corner is cut on the hood's slant and whose bottom outer corner is bitten by the side gauge; the
// centre line with its end caps, the G-meter (rings, crosshair, dot), the two side gauges (arc, ticks, colour
// zones, red needle), the tricolour mark and the four setup level bars (slanted segments, the one at the level
// red, the rest grey, as the M8 draws them). Positions in target px from the layout (hud.js). v_uv (0,0) is the
// top-left. The card fill is black by default (u_cardFill 0): the car brightens dark tints, so only the outline
// draws until that curve is measured.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_card;      // left card x, y, w, h (the right one is its mirror)
uniform vec4 u_cardCut;   // the left card's top-left chamfer: the line from (x0, y0) to (x1, y1), the corner above it cut
uniform float u_cardFill; // the card's grey level 0..1 (0 = black, outline only)
uniform vec4 u_blade;     // the left rev blade's outer edge: x at the bend, y of the bend, x per y px above / below it
uniform vec2 u_bladeB;    // the bend's roundness px, the card's gap from the blade px
uniform vec4 u_line;      // centre line x0, y, x1, cap length
uniform vec3 u_gm;        // G-meter centre x, y, outer ring radius
uniform vec2 u_g;         // the dot, g (x right, y up)
uniform float u_maxG;     // g at the outer ring
uniform vec4 u_gaugeL;    // left gauge centre x, y, radius, value 0..1
uniform vec4 u_gaugeR;    // right gauge
uniform vec3 u_mark;      // tricolour mark x, y, scale (0 = none)
uniform vec3 u_red;
uniform vec4 u_seg0;      // setup level bars x, y, w, h (a height of 0: none)
uniform vec4 u_seg1;
uniform vec4 u_seg2;
uniform vec4 u_seg3;
uniform vec4 u_segLit;    // the level per bar (1-based; 0 = none lit)
uniform vec4 u_segMax;    // segments per bar
uniform float u_segSlant; // px each segment leans

const float PI = 3.14159265;

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

float sdRoundBox(vec2 p, vec4 r, float rad) {
    vec2 c = r.xy + r.zw * 0.5;
    vec2 q = abs(p - c) - r.zw * 0.5 + rad;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
float angOf(vec2 d) { float a = atan(d.x, -d.y); return a < 0.0 ? a + 2.0 * PI : a; }
// the left blade's outer edge x at y (mtach's curve)
float bladeX(float y) {
    float dy = y - u_blade.y;
    float k = dy < 0.0 ? u_blade.z : u_blade.w;
    return u_blade.x + k * (sqrt(dy * dy + u_bladeB.x * u_bladeB.x) - u_bladeB.x);
}
// the left card: a rounded box, its top-left corner cut on the chamfer line, its right side cut along the blade,
// its bottom-left corner bitten by the gauge; < 0 inside
float cardD(vec2 p, vec4 g) {
    float d = sdRoundBox(p, u_card, 36.0);
    vec2 a = u_cardCut.xy, e = u_cardCut.zw - u_cardCut.xy;
    d = max(d, -(e.x * (p.y - a.y) - e.y * (p.x - a.x)) / length(e));
    d = max(d, p.x - (bladeX(p.y) - u_bladeB.y));
    d = max(d, (g.z + 14.0) - length(p - g.xy));
    return d;
}
vec4 card(vec2 p, vec4 g, vec4 c) {
    float d = cardD(p, g);
    if (d > 2.0) return c;
    c = over(vec4(vec3(u_cardFill), cov(d)), c);
    c = over(vec4(0.5, 0.53, 0.58, 0.55 * cov(abs(d + 1.2) - 0.9)), c);
    return c;
}
// a setup level bar: s.y segments slanted, number lit (1-based) red, the rest grey
vec4 segbar(vec2 p, vec4 b, vec2 s, vec4 c) {
    if (b.w <= 0.0 || p.y < b.y - 1.0 || p.y > b.y + b.w + 1.0 || p.x < b.x - 1.0 || p.x > b.x + b.z + 1.0) return c;
    float fy = (p.y - b.y) / b.w;
    float x = p.x - b.x - u_segSlant * (1.0 - fy);
    float gap = 8.0;
    float slot = (b.z - u_segSlant + gap) / s.y;
    float i = floor(x / slot);
    float fx = x - i * slot;
    float a = clamp(fx + 0.5, 0.0, 1.0) * clamp(slot - gap - fx + 0.5, 0.0, 1.0) * clamp(p.y - b.y + 0.5, 0.0, 1.0) * clamp(b.y + b.w - p.y + 0.5, 0.0, 1.0);
    if (i < 0.0 || i >= s.y || a <= 0.0) return c;
    bool on = abs(i + 1.0 - s.x) < 0.5;
    vec3 col = on ? u_red * mix(0.8, 1.0, fx / (slot - gap)) : vec3(0.5, 0.53, 0.58);
    return over(vec4(col, (on ? 1.0 : 0.8) * a), c);
}

// a side gauge: arc from a0 (value 0) to a1 (value 1), clockwise angles from 12 o'clock
vec4 gauge(vec2 p, vec4 g, float a0, float a1, float zones, vec4 c) {
    vec2 d = p - g.xy;
    float r = length(d);
    if (r > g.z + 8.0 || r < g.z - 60.0) return c;
    float a = angOf(d);
    float t = (a - a0) / (a1 - a0);
    if (t >= -0.01 && t <= 1.01) {
        c = over(vec4(1.0, 1.0, 1.0, (r < g.z - 1.0 && r > g.z - 18.0) ? 0.06 : 0.0), c);   // glass band
        vec3 col = vec3(0.86, 0.88, 0.92);
        float s = cov(abs(r - g.z) - 1.1);
        if (zones > 0.5 && t > 0.86) { col = u_red; s = cov(abs(r - g.z + 1.5) - 2.6); }
        if (zones > 0.5 && t < 0.13) { col = vec3(0.16, 0.42, 0.95); s = cov(abs(r - g.z + 1.5) - 2.6); }
        c = over(vec4(col, s), c);
        float k = floor(t * 8.0 + 0.5) / 8.0;
        float along = abs(a - mix(a0, a1, k)) * r;
        float len = (k < 0.01 || k > 0.99 || abs(k - 0.5) < 0.01) ? 15.0 : 8.0;
        if (k >= 0.0 && k <= 1.0 && r < g.z - 2.0 && r > g.z - 2.0 - len) c = over(vec4(0.82, 0.84, 0.88, 0.85 * cov(along - 0.9)), c);
    }
    float an = mix(a0, a1, clamp(g.w, 0.0, 1.0));
    vec2 dir = vec2(sin(an), -cos(an));
    float nd = segD(p, g.xy + dir * (g.z - 3.0), g.xy + dir * (g.z - 50.0));
    c = over(vec4(u_red, cov(nd - 2.4)), c);
    c = over(vec4(1.0, 0.6, 0.6, 0.7 * cov(nd - 0.6)), c);
    return c;
}

void main() {
    vec2 p = v_uv * u_size;
    vec2 pm = vec2(u_size.x - p.x, p.y);        // the right half, mirrored into the left frame
    vec4 c = vec4(0.0, 0.0, 0.0, 1.0);           // black, as the M8

    // the two cards: the left one as laid out, the right one its mirror
    c = card(p, u_gaugeL, c);
    c = card(pm, vec4(u_size.x - u_gaugeR.x, u_gaugeR.yzw), c);

    // centre line, bright caps at both ends
    if (abs(p.y - u_line.y) < 6.0) {
        c = over(vec4(0.6, 0.65, 0.72, 0.75 * cov(segD(p, u_line.xy, u_line.zy) - 0.7)), c);
        float l = segD(p, u_line.xy + vec2(6.0, 0.0), u_line.xy + vec2(u_line.w, 0.0)) - 1.6 - 0.8 * clamp((p.x - u_line.x) / u_line.w, 0.0, 1.0);
        float r = segD(p, u_line.zy - vec2(u_line.w, 0.0), u_line.zy - vec2(6.0, 0.0)) - 1.6 - 0.8 * clamp((u_line.z - p.x) / u_line.w, 0.0, 1.0);
        c = over(vec4(0.95, 0.96, 0.98, cov(min(l, r))), c);
    }

    // G-meter
    vec2 gd = p - u_gm.xy;
    float gr = length(gd);
    if (gr < u_gm.z + 30.0) {
        float R = u_gm.z, rI = R * 0.8 / u_maxG;
        c = over(vec4(0.78, 0.84, 0.9, 0.5 * cov(abs(gr - R) - 0.7)), c);
        float seg = mod(angOf(gd) + 0.13, 2.0 * PI / 8.0) < (2.0 * PI / 8.0 - 0.26) ? 1.0 : 0.0;
        c = over(vec4(0.42, 0.48, 0.55, 0.65 * seg * cov(abs(gr - rI) - 3.5)), c);
        float hair = (abs(gd.y) < R + 24.0 ? cov(abs(gd.x) - 0.6) : 0.0) + (abs(gd.x) < R + 24.0 ? cov(abs(gd.y) - 0.6) : 0.0);
        c = over(vec4(0.78, 0.84, 0.9, 0.45 * clamp(hair, 0.0, 1.0)), c);
        vec2 gpos = u_gm.xy + vec2(u_g.x, -u_g.y) / u_maxG * R;
        float dd = length(p - gpos);
        c = over(vec4(u_red, 0.35 * exp(-dd * dd / 300.0)), c);
        c = over(vec4(u_red, cov(dd - 9.0)), c);
    }

    c = gauge(p, u_gaugeL, radians(196.0), radians(300.0), 0.0, c);
    c = gauge(p, u_gaugeR, radians(164.0), radians(60.0), 1.0, c);

    c = segbar(p, u_seg0, vec2(u_segLit.x, u_segMax.x), c);
    c = segbar(p, u_seg1, vec2(u_segLit.y, u_segMax.y), c);
    c = segbar(p, u_seg2, vec2(u_segLit.z, u_segMax.z), c);
    c = segbar(p, u_seg3, vec2(u_segLit.w, u_segMax.w), c);

    // tricolour mark: three slanted bars
    if (u_mark.z > 0.0) {
        vec2 m = (p - u_mark.xy) / u_mark.z;
        if (m.y > -1.0 && m.y < 21.0 && m.x > -2.0 && m.x < 60.0) {
            float lx = m.x - 7.0 * (1.0 - m.y / 20.0);
            float i = floor(lx / 16.0);
            float fx = lx - i * 16.0;
            float inside = cov((max(abs(fx - 6.5) - 6.5, abs(m.y - 10.0) - 10.0)) * u_mark.z);
            vec3 mc = i < 0.5 ? vec3(0.31, 0.71, 1.0) : (i < 1.5 ? vec3(0.17, 0.29, 0.78) : vec3(0.9, 0.13, 0.17));
            if (i >= 0.0 && i <= 2.0) c = over(vec4(mc, inside), c);
        }
    }
    gl_FragColor = c;
}
`;
const MTACH = `// The M theme's rev bar (GLSL ES 1.00): a glass blade with a bright silver outer edge that bends at u_geoA.z,
// tick notches pointing out every 1000 rpm (a long one at the bend), the part below the rpm lit light grey,
// a red needle line at the rpm with a red glow above it, orange dashes before the redline and a solid red line past it.
// Drawn as the left bar; u_side 1 mirrors it into the right one. v_uv (0,0) is the top-left.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_side;
uniform vec4 u_geoA;      // y at 0 rpm, y at max, y of the bend, outer-edge x at the bend (layer px, left frame)
uniform vec3 u_geoB;      // slope above the bend, slope below it, bend roundness px
uniform vec3 u_wid;       // blade width at 0 rpm, at max, extra at the bend
uniform float u_ticks;    // max / 1000
uniform float u_value;    // 0..1
uniform float u_orange;   // 0..1, orange dashes from here
uniform float u_redFrom;  // 0..1, red dashes from here (the redline)
uniform float u_shiftNow;
uniform vec3 u_red;

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

void main() {
    vec2 p = v_uv * u_size;
    if (u_side > 0.0) p.x = u_size.x - p.x;
    float y0 = u_geoA.x, y8 = u_geoA.y, ym = u_geoA.z, xm = u_geoA.w;
    float dy = p.y - ym;
    float k = dy < 0.0 ? u_geoB.x : u_geoB.y;
    float sq = sqrt(dy * dy + u_geoB.z * u_geoB.z);
    float xo = xm + k * (sq - u_geoB.z);
    float slope = k * dy / sq;
    float d = (p.x - xo) / sqrt(1.0 + slope * slope);      // + = into the blade, towards the middle
    float t = (y0 - p.y) / (y0 - y8);
    float w = mix(u_wid.x, u_wid.y, clamp(t, 0.0, 1.0)) + u_wid.z * exp(-dy * dy / 22000.0);
    vec4 c = vec4(0.0);
    if (t >= 0.0 && t <= 1.0) {
        float inBand = clamp(d + 0.5, 0.0, 1.0) * clamp(w - d + 0.5, 0.0, 1.0);
        float across = clamp(d / w, 0.0, 1.0);
        float yn = y0 - u_value * (y0 - y8);
        vec4 g = vec4(0.62, 0.67, 0.74, mix(0.2, 0.05, across));          // empty glass
        if (p.y > yn) g = u_shiftNow > 0.5 ? vec4(u_red * 0.8, 0.55) : vec4(mix(vec3(0.8, 0.82, 0.86), vec3(0.55, 0.58, 0.63), across), mix(0.42, 0.24, across));
        else g = over(vec4(u_red, 0.5 * exp(-(yn - p.y) / 42.0) * (1.0 - 0.4 * across)), g);
        float nl = cov(abs(p.y - yn) - 2.8);
        g = over(vec4(mix(u_red, vec3(1.0, 0.55, 0.55), cov(abs(p.y - yn) - 0.8)), nl), g);
        c = vec4(g.rgb, g.a * inBand);
        c = over(vec4(0.93, 0.95, 0.98, cov(abs(d) - 1.6)), c);               // outer edge
        c = over(vec4(1.0, 1.0, 1.0, 0.3 * cov(abs(d - 4.0) - 0.6)), c);       // its bevel
        c = over(vec4(0.66, 0.7, 0.76, 0.75 * cov(abs(d - w) - 0.8)), c);      // inner edge
        // BMW's marks: a solid red line from the redline, a few orange dashes in the run-up to it
        bool redM = t >= u_redFrom && d > 6.0 && d < 11.0;
        bool orM = t >= u_orange && t < u_redFrom - 0.01 && d > 6.0 && d < 11.0 && mod(p.y, 20.0) < 7.0;
        if (redM || orM) {
            c = over(vec4(redM ? u_red : vec3(1.0, 0.6, 0.1), 0.95), c);
        }
    }
    float kk = floor(t * u_ticks + 0.5);
    float yk = y0 - kk / u_ticks * (y0 - y8);
    if (kk >= 0.0 && kk <= u_ticks && d < 0.0) {
        float bend = abs(yk - ym) < 10.0 ? 1.0 : 0.0;
        float len = mix(11.0, 22.0, bend);
        float ty = abs(p.y - yk) - mix(1.1, 1.8, bend) * (bend > 0.5 ? (1.0 + d / len) : 1.0);
        if (d > -len) c = over(vec4(0.93, 0.95, 0.98, cov(ty)), c);
    }
    gl_FragColor = c;
}
`;
const SDASH = `// The Sport theme in one cluster-render "effect" layer (GLSL ES 1.00), after BMW's Live Cockpit Sport view:
// a blue speed bracket left and a red rev bracket right (the left one mirrored). Each is a thin bright outer
// line, a band that fills from the bottom (white marker at the value), a dark gap and a thin inner line round a
// black middle: plain black, or BMW's map through a see-through rounded hole (u_hole; only the fuel and oil bars
// and the bottom strip draw over it). Two-tone fuel and oil bars inside the brackets, a blue / red strip at the bottom. v_uv (0,0) is
// the top-left. The backdrop is pure black: the car brightens dark tints (seen Nov 5 2026), so no dark panels.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_geo;       // outer line: y at the top, y at the bend, y at the bottom, x at the bend (left side)
uniform vec3 u_k;         // x per y px above the bend, below it, bend roundness px
uniform float u_w;        // band width
uniform float u_inner;    // the inner line's distance from the outer line
uniform vec2 u_scale;     // y of the scale's 0 and of its top mark
uniform vec2 u_ticks;     // marks left (speed), right (rpm)
uniform float u_speed;    // 0..1 along the scale
uniform float u_rpm;      // 0..1
uniform float u_redFrom;  // 0..1 (the redline)
uniform float u_orange;   // 0..1, yellow marks from here to the redline
uniform float u_fuel;     // 0..1
uniform float u_oil;      // 0..1
uniform vec4 u_fuelSeg;   // full end x, y, empty end x, y
uniform vec4 u_oilSeg;
uniform vec4 u_hole;      // map window x, y, w, h, already inset (w 0 = none)
uniform float u_holeR;    // the hole's corner radius px
uniform vec4 u_strip;     // bottom strip: left end x, top y, height, slant px
uniform float u_topEnd;   // the top lines run from the bracket to this x (left; mirrored on the right)

const vec3 BLUE_LINE = vec3(0.36, 0.62, 1.0);
const vec3 BLUE_BAND = vec3(0.13, 0.3, 0.78);
const vec3 BLUE_LIT = vec3(0.62, 0.86, 1.0);
const vec3 BLUE_IN = vec3(0.2, 0.45, 0.98);
const vec3 RED_LINE = vec3(0.95, 0.12, 0.16);
const vec3 RED_BAND = vec3(0.33, 0.06, 0.1);
const vec3 RED_LIT = vec3(0.93, 0.1, 0.15);
const vec3 RED_IN = vec3(0.86, 0.08, 0.13);

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float segH(vec2 p, vec2 a, vec2 b) { vec2 ba = b - a; return clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0); }

float outerX(float y) {
    float dy = y - u_geo.y;
    float k = dy < 0.0 ? u_k.x : u_k.y;
    return u_geo.w + k * (sqrt(dy * dy + u_k.z * u_k.z) - u_k.z);
}
float outerSlope(float y) {
    float dy = y - u_geo.y;
    float k = dy < 0.0 ? u_k.x : u_k.y;
    return k * dy / sqrt(dy * dy + u_k.z * u_k.z);
}
// px from the outer line, inwards (perpendicular)
float dIn(vec2 q) { return (q.x - outerX(q.y)) / sqrt(1.0 + outerSlope(q.y) * outerSlope(q.y)); }

// one bracket in the left frame (q mirrored for the right one)
vec4 bracket(vec2 q, float val, float redFrom, float orange, float ticks, vec3 line, vec3 band, vec3 lit, vec3 inner, vec4 c) {
    float d = dIn(q);
    float yTopI = u_geo.x + 8.0;                              // the inner line's top run
    float t = (u_scale.x - q.y) / (u_scale.x - u_scale.y);    // 0 at the scale's 0
    bool inY = q.y > u_geo.x + 5.0 && q.y < u_geo.z - 4.0;
    // the band: lit up to the value, white marker on top
    float inB = (inY ? 1.0 : 0.0) * cov(-(d - 5.0)) * cov(d - 5.0 - u_w);
    if (inB > 0.0) {
        vec3 col = band;
        float a = 0.96;
        if (t <= val) col = mix(lit, mix(lit, vec3(1.0), 0.25), clamp((d - 5.0) / u_w, 0.0, 1.0)) * mix(0.8, 1.0, clamp(t / max(val, 0.01), 0.0, 1.0));
        c = over(vec4(col, a * inB), c);
        float yv = u_scale.x - val * (u_scale.x - u_scale.y);
        if (val > 0.002) c = over(vec4(1.0, 1.0, 1.0, inB * cov(abs(q.y - yv) - 2.0)), c);
        // marks at every label, on the band's outer half
        float kk = floor(t * ticks + 0.5);
        float yk = u_scale.x - kk / ticks * (u_scale.x - u_scale.y);
        if (kk >= 0.0 && kk <= ticks && d > 7.0 && d < 19.0) c = over(vec4(line, 0.9 * cov(abs(q.y - yk) - 1.2)), c);
        // redline: yellow dashes, then a solid red line, on the outer edge of the band
        if (redFrom < 1.5 && d > 8.0 && d < 13.0) {
            if (t >= redFrom && t <= 1.02) c = over(vec4(1.0, 0.2, 0.2, 1.0), c);
            else if (t >= orange && t < redFrom && mod(q.y, 16.0) < 7.0) c = over(vec4(1.0, 0.85, 0.1, 1.0), c);
        }
    }
    // the outer line, its top run and its bottom run
    float o = inY || abs(q.y - u_geo.x) < 6.0 || abs(q.y - u_geo.z) < 6.0 ? cov(abs(d - 1.0) - 1.8) : 0.0;
    vec2 tl = vec2(outerX(u_geo.x), u_geo.x), bl = vec2(outerX(u_geo.z), u_geo.z);
    o = max(o, cov(segD(q, tl, vec2(u_topEnd, u_geo.x)) - 2.2));
    o = max(o, cov(segD(q, bl, bl + vec2(u_inner + 40.0, 0.0)) - 2.2));
    c = over(vec4(line, 0.35 * exp(-abs(d) / 5.0) * (inY ? 1.0 : 0.0) * step(d, 0.0)), c);
    c = over(vec4(line, o), c);
    // the inner line: down the bracket from its top run to the bottom
    float il = (q.y > yTopI && q.y < u_geo.z - 6.0) ? cov(abs(d - u_inner) - 1.6) : 0.0;
    float xi = outerX(yTopI) + u_inner * sqrt(1.0 + outerSlope(yTopI) * outerSlope(yTopI));
    il = max(il, cov(segD(q, vec2(xi, yTopI), vec2(u_topEnd - 14.0, yTopI)) - 1.6));
    c = over(vec4(inner, 0.95 * il), c);
    return c;
}

// a two-tone slanted bar from the empty end b to the full end a, with a thin rail beside it
vec4 bar(vec2 p, vec4 s, float val, float zones, vec4 c) {
    vec2 a = s.xy, b = s.zw;
    float h = 1.0 - segH(p, a, b);
    vec2 dir = normalize(a - b), nrm = vec2(-dir.y, dir.x);
    float side = dot(p - b, nrm);
    float along = segD(p, a, b);
    if (along > 26.0) return c;
    float body = cov(abs(side) - 7.0) * cov(segD(p, a, b) - 7.5);
    vec3 col = vec3(0.92, 0.94, 0.97);
    if (zones > 0.5 && h > 0.88) col = vec3(1.0, 0.2, 0.22);
    if (zones > 0.5 && h < 0.1) col = vec3(0.25, 0.5, 1.0);
    c = over(vec4(0.36, 0.38, 0.44, 0.9 * body), c);
    c = over(vec4(col, body * step(h, val) * step(0.001, val)), c);
    c = over(vec4(0.5, 0.52, 0.58, 0.8 * cov(abs(side + 12.0) - 1.0) * cov(segD(p, a, b) - 13.0)), c);
    return c;
}

void main() {
    vec2 p = v_uv * u_size;
    vec2 pm = vec2(u_size.x - p.x, p.y);
    vec4 c = vec4(0.0, 0.0, 0.0, 1.0);

    c = bracket(p, u_speed, 2.0, 2.0, u_ticks.x, BLUE_LINE, BLUE_BAND, BLUE_LIT, BLUE_IN, c);
    c = bracket(pm, u_rpm, u_redFrom, u_orange, u_ticks.y, RED_LINE, RED_BAND, RED_LIT, RED_IN, c);
    // the map window: a rounded hole cut out of the backdrop and brackets, so BMW's map shows clean; the fuel and
    // oil bars and the bottom strip draw over it, as BMW's own Sport view lays them beside the map
    if (u_hole.z > 0.0) {
        vec2 hs = u_hole.zw * 0.5;
        vec2 q = abs(p - (u_hole.xy + hs)) - (hs - vec2(u_holeR));
        float hd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_holeR;
        c.a *= clamp(hd + 0.5, 0.0, 1.0);
    }
    c = bar(p, u_fuelSeg, u_fuel, 0.0, c);
    c = bar(p, u_oilSeg, u_oil, 1.0, c);
    // the bottom line between the brackets
    if (abs(p.y - u_geo.z) < 3.0 && abs(p.x - u_size.x * 0.5) < u_size.x * 0.5 - outerX(u_geo.z))
        c = over(vec4(mix(BLUE_LINE, RED_LINE, step(u_size.x * 0.5, p.x)) * 0.8, cov(abs(p.y - u_geo.z) - 1.2)), c);

    // bottom strip: slanted ends, blue left of the middle, red right, thin dividers
    float sy = p.y - u_strip.y;
    if (sy > -2.0 && sy < u_strip.z + 2.0) {
        float xl = u_strip.x + (u_strip.z - sy) / u_strip.z * u_strip.w;     // left end leans in at the top
        float dx = abs(p.x - u_size.x * 0.5), xe = u_size.x * 0.5 - xl;
        float inside = cov(dx - xe) * cov(-sy) * cov(sy - u_strip.z);
        float f = dx / xe;
        vec3 sc = p.x < u_size.x * 0.5 ? mix(vec3(0.06, 0.2, 0.62), vec3(0.15, 0.36, 0.92), f) : mix(vec3(0.4, 0.05, 0.1), vec3(0.85, 0.1, 0.16), f);
        c = over(vec4(sc, 0.95 * inside), c);
        float div = cov(abs(mod(p.x - (u_strip.z - sy) * 0.45, 150.0) - 75.0) - 73.8);
        c = over(vec4(0.02, 0.03, 0.08, 0.5 * inside * div), c);
        c = over(vec4(1.0, 1.0, 1.0, 0.25 * inside * cov(abs(sy) - 1.0)), c);
    }
    gl_FragColor = c;
}
`;

const DDASH = `// The Dials theme in one cluster-render "effect" layer (GLSL ES 1.00): a black hatched backdrop, a big round
// tach in the middle (grey band, ticks, red zone, orange needle, dark inner disc for the speed and gear), four
// side gauges drawn as round dials, slanted bars or digital tiles (u_style), two thin bars at the bottom and the
// header lines. Positions in target px from the layout (hud.js). v_uv (0,0) is the top-left.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_tach;      // centre x, y, outer radius, band width
uniform float u_rpm;      // 0..1 of the scale
uniform float u_redFrom;  // 0..1 (the redline)
uniform float u_ticks;    // thousands on the scale (8)
uniform float u_shiftNow; // 1 at the shift point
uniform float u_style;    // side gauges: 0 round, 1 bar, 2 digital
uniform vec3 u_d0;        // round / digital gauge centre x, y, radius
uniform vec3 u_d1;
uniform vec3 u_d2;
uniform vec3 u_d3;
uniform vec4 u_b0;        // bar style: x0, y, x1, height
uniform vec4 u_b1;
uniform vec4 u_b2;
uniform vec4 u_b3;
uniform vec4 u_vals;      // the four gauges, 0..1
uniform vec4 u_low0;      // bottom bars x0, y, x1, height (coolant, fuel)
uniform vec4 u_low1;
uniform vec2 u_lowVals;
uniform vec2 u_head;      // header line y, x margin

const float PI = 3.14159265;
const float A0 = -2.0943951;   // the scale starts at 8 o'clock (-120 deg) ...
const float SW = 4.1887902;    // ... and sweeps 240 deg
const vec3 ORANGE = vec3(1.0, 0.42, 0.08);
const vec3 RED = vec3(0.86, 0.15, 0.07);

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdBox(vec2 p, vec2 c, vec2 hs, float rad) { vec2 q = abs(p - c) - hs + rad; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad; }
// clockwise from 12 o'clock, -PI..PI
float angS(vec2 d) { return atan(d.x, -d.y); }

vec4 tach(vec2 p, vec4 c) {
    vec2 d = p - u_tach.xy;
    float r = length(d), R = u_tach.z, B = u_tach.w;
    if (r > R + 30.0) return c;
    float Ri = R - B - 12.0;
    float t = (angS(d) - A0) / SW;                  // 0..1 along the scale
    float inArc = (t >= 0.0 && t <= 1.0) ? 1.0 : 0.0;
    float endD = max(-t, t - 1.0) * SW * r;         // px past the scale's ends
    float fy = clamp((d.y / R + 1.0) * 0.5, 0.0, 1.0);

    c = over(vec4(0.0, 0.0, 0.0, 0.55 * (1.0 - smoothstep(R, R + 28.0, r))), c);        // drop shadow
    // the grey band, lighter at the top and towards the rim
    float inBand = cov(max(r - (R - 3.0), (R - B) - r)) * cov(endD);
    float rr = clamp((r - (R - B)) / B, 0.0, 1.0);
    vec3 band = mix(vec3(0.43, 0.44, 0.46), vec3(0.24, 0.245, 0.255), fy) * mix(0.82, 1.08, rr);
    if (t >= u_redFrom) band = mix(RED, vec3(1.0, 0.38, 0.1), rr * 0.7) * mix(0.9, 1.15, 1.0 - fy);
    c = over(vec4(band, inBand), c);
    // rev sweep: an orange trail along the band's inner edge, up to the needle
    float trail = cov(abs(r - (R - B + 4.0)) - 3.0) * cov(endD) * step(t, u_rpm) * step(0.002, u_rpm);
    c = over(vec4(ORANGE, 0.9 * trail), c);
    // ticks on the band's outer edge: every 1000 long, every 250 short
    if (r > R - 26.0 && r < R - 2.0 && t > -0.01 && t < 1.01) {
        float n = u_ticks * 4.0;
        float k = floor(t * n + 0.5);
        float along = abs(t - k / n) * SW * r;
        bool major = mod(k, 4.0) < 0.5;
        float len = major ? 22.0 : 11.0;
        float w = major ? 1.6 : 0.8;
        float tk = cov(along - w) * step(R - 3.0 - len, r);
        c = over(vec4(0.96, 0.96, 0.97, 0.92 * tk), c);
    }
    // the silver rim, all the way round
    c = over(vec4(0.86, 0.87, 0.89, cov(abs(r - R) - 1.6)), c);
    c = over(vec4(0.03, 0.03, 0.035, 0.8 * cov(abs(r - R - 3.5) - 1.2)), c);
    // gap and inner disc with a bevelled grey ring
    if (r < R - B + 0.5) c = over(vec4(0.02, 0.02, 0.025, cov(r - (R - B))), c);
    float disc = cov(r - Ri);
    vec3 dc = mix(vec3(0.085, 0.09, 0.1), vec3(0.03, 0.032, 0.036), smoothstep(0.0, Ri, r));
    c = over(vec4(dc, disc), c);
    vec3 ring = mix(vec3(0.62, 0.63, 0.66), vec3(0.28, 0.29, 0.31), fy);
    c = over(vec4(ring, cov(abs(r - Ri) - 2.6)), c);

    // the needle: from the inner disc to the rim, tapering, with a glow
    float an = A0 + clamp(u_rpm, 0.0, 1.0) * SW;
    vec2 dir = vec2(sin(an), -cos(an));
    vec2 a = u_tach.xy + dir * (Ri + 6.0), b = u_tach.xy + dir * (R - 5.0);
    float h = clamp(dot(p - a, b - a) / dot(b - a, b - a), 0.0, 1.0);
    float nd = segD(p, a, b) - mix(4.2, 1.8, h);
    vec3 nc = u_shiftNow > 0.5 ? vec3(1.0, 0.12, 0.08) : ORANGE;
    c = over(vec4(nc, 0.4 * exp(-max(nd, 0.0) * max(nd, 0.0) / 30.0)), c);
    c = over(vec4(nc, cov(nd)), c);
    c = over(vec4(1.0, 0.85, 0.6, 0.6 * cov(segD(p, a, b) - 0.7)), c);
    return c;
}

// round: a metal ring round a dark disc, the value as an orange ring from the bottom (red tick), white tick on top
vec4 dial(vec2 p, vec3 g, float v, vec4 c) {
    vec2 d = p - g.xy;
    float r = length(d);
    if (r > g.z + 24.0) return c;
    float fy = clamp((d.y / g.z + 1.0) * 0.5, 0.0, 1.0);
    c = over(vec4(0.0, 0.0, 0.0, 0.5 * (1.0 - smoothstep(g.z, g.z + 22.0, r))), c);
    vec3 metal = mix(vec3(0.72, 0.73, 0.76), vec3(0.22, 0.225, 0.24), fy);
    c = over(vec4(metal, cov(r - g.z)), c);
    c = over(vec4(mix(vec3(0.1, 0.105, 0.115), vec3(0.035, 0.037, 0.04), smoothstep(0.0, g.z, r)), cov(r - (g.z - 11.0))), c);
    float t = mod(angS(d) - PI + 2.0 * PI, 2.0 * PI) / (2.0 * PI);   // 0 at the bottom, clockwise
    float band = cov(abs(r - (g.z - 20.0)) - 4.0);
    c = over(vec4(0.3, 0.31, 0.33, 0.5 * band), c);
    float lit = cov((t - v) * 2.0 * PI * r) * step(0.001, v);
    c = over(vec4(ORANGE, band * lit), c);
    float top = cov(abs(d.x) - 1.4) * step(-g.z + 13.0, d.y) * step(d.y, -g.z + 26.0);
    float bot = cov(abs(d.x) - 1.8) * step(g.z - 28.0, d.y) * step(d.y, g.z - 13.0);
    c = over(vec4(0.95, 0.95, 0.96, top), c);
    c = over(vec4(1.0, 0.16, 0.1, bot), c);
    return c;
}

// bar: slanted segments, white turning orange near the top end, ticks under it
vec4 bar(vec2 p, vec4 b, float v, vec4 c) {
    if (p.y < b.y - 6.0 || p.y > b.y + b.w + 16.0 || p.x < b.x - 20.0 || p.x > b.z + 20.0) return c;
    float sl = b.w * 0.5;
    float x = p.x - (b.y + b.w - p.y) / b.w * sl;         // slant back to an upright bar
    float L = b.z - b.x - sl;
    float f = (x - b.x) / L;
    float n = 40.0, slot = L / n;
    float k = floor((x - b.x) / slot);
    float inSeg = cov(max(abs(x - b.x - (k + 0.5) * slot) - (slot * 0.5 - 1.5), abs(p.y - b.y - b.w * 0.5) - b.w * 0.5));
    inSeg *= step(0.0, k) * step(k, n - 1.0);
    float pos = (k + 0.5) / n;
    vec3 on = mix(vec3(0.92, 0.93, 0.95), ORANGE, smoothstep(0.7, 0.95, pos));
    c = over(pos <= v ? vec4(on, inSeg) : vec4(0.2, 0.205, 0.22, inSeg), c);
    // ticks below: every 25%
    float tq = floor(f * 4.0 + 0.5) / 4.0;
    float tx = b.x + tq * L;
    float tk = cov(abs(p.x - tx) - 1.0) * step(b.y + b.w + 5.0, p.y) * step(p.y, b.y + b.w + (tq == 0.5 ? 14.0 : 10.0));
    c = over(vec4(0.6, 0.61, 0.64, tk), c);
    return c;
}

// digital: a framed tile, the value as a thin orange line along its bottom
vec4 tile(vec2 p, vec3 g, float v, vec4 c) {
    vec2 hs = vec2(g.z * 1.12, g.z * 0.9);
    vec2 ctr = g.xy + vec2(0.0, g.z * 0.05);
    float dd = sdBox(p, ctr, hs, 14.0);
    if (dd > 24.0) return c;
    c = over(vec4(0.0, 0.0, 0.0, 0.45 * (1.0 - smoothstep(0.0, 22.0, dd))), c);
    float fy = clamp((p.y - ctr.y + hs.y) / (2.0 * hs.y), 0.0, 1.0);
    c = over(vec4(mix(vec3(0.1, 0.105, 0.115), vec3(0.05, 0.052, 0.058), fy), cov(dd)), c);
    c = over(vec4(mix(vec3(0.6, 0.61, 0.64), vec3(0.26, 0.27, 0.29), fy), cov(abs(dd + 1.0) - 1.2)), c);
    float y0 = ctr.y + hs.y - 22.0, x0 = ctr.x - hs.x + 22.0, x1 = ctr.x + hs.x - 22.0;
    float line = cov(max(abs(p.y - y0) - 3.0, max(x0 - p.x, p.x - x1)));
    c = over(vec4(0.24, 0.25, 0.27, line), c);
    c = over(vec4(ORANGE, line * step(p.x, mix(x0, x1, v)) * step(0.001, v)), c);
    return c;
}

// a thin bottom bar with end ticks, orange when low
vec4 low(vec2 p, vec4 b, float v, float warnBelow, vec4 c) {
    if (p.y < b.y - 10.0 || p.y > b.y + b.w + 10.0) return c;
    float dd = sdBox(p, vec2((b.x + b.z) * 0.5, b.y + b.w * 0.5), vec2((b.z - b.x) * 0.5, b.w * 0.5), b.w * 0.5);
    c = over(vec4(0.2, 0.205, 0.22, cov(dd)), c);
    vec3 fc = v < warnBelow ? ORANGE : vec3(0.88, 0.89, 0.91);
    c = over(vec4(fc, cov(dd) * cov(p.x - mix(b.x, b.z, v))), c);
    float ends = cov(min(abs(p.x - b.x), abs(p.x - b.z)) - 1.0) * step(b.y - 8.0, p.y) * step(p.y, b.y + b.w + 8.0);
    float mid = cov(abs(p.x - (b.x + b.z) * 0.5) - 1.0) * step(b.y - 6.0, p.y) * step(p.y, b.y);
    c = over(vec4(0.62, 0.63, 0.66, max(ends, mid)), c);
    return c;
}

void main() {
    vec2 p = v_uv * u_size;
    // black (the car brightens dark tints, Nov 5 2026), a fine diagonal crosshatch fading out towards the edges
    vec2 q = (p - u_size * 0.5) / (u_size * vec2(0.62, 0.75));
    float vig = exp(-dot(q, q) * 1.2);
    vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
    float h1 = abs(fract((p.x + p.y) / 18.0) - 0.5) * 18.0, h2 = abs(fract((p.x - p.y) / 18.0) - 0.5) * 18.0;
    c = over(vec4(1.0, 1.0, 1.0, 0.035 * vig * max(cov(h1 - 0.6), cov(h2 - 0.6))), c);
    // header: a faint lighter strip and a line either side of the tach
    float gap = u_tach.z + 40.0;
    if (p.y < u_head.x + 4.0) {
        c = over(vec4(1.0, 1.0, 1.0, 0.025 * (1.0 - smoothstep(0.0, u_head.x, p.y))), c);
        float lx = min(p.x - u_head.y, (u_tach.x - gap) - p.x), rx = min(p.x - (u_tach.x + gap), (u_size.x - u_head.y) - p.x);
        float seg = max(cov(-lx), cov(-rx)) * smoothstep(0.0, 60.0, max(lx, rx));
        c = over(vec4(0.55, 0.56, 0.6, 0.7 * seg * cov(abs(p.y - u_head.x) - 0.8)), c);
    }

    if (u_style < 0.5) {
        c = dial(p, u_d0, u_vals.x, c); c = dial(p, u_d1, u_vals.y, c);
        c = dial(p, u_d2, u_vals.z, c); c = dial(p, u_d3, u_vals.w, c);
    } else if (u_style < 1.5) {
        c = bar(p, u_b0, u_vals.x, c); c = bar(p, u_b1, u_vals.y, c);
        c = bar(p, u_b2, u_vals.z, c); c = bar(p, u_b3, u_vals.w, c);
    } else {
        c = tile(p, u_d0, u_vals.x, c); c = tile(p, u_d1, u_vals.y, c);
        c = tile(p, u_d2, u_vals.z, c); c = tile(p, u_d3, u_vals.w, c);
    }
    c = low(p, u_low0, u_lowVals.x, -1.0, c);
    c = low(p, u_low1, u_lowVals.y, 0.15, c);
    c = tach(p, c);
    gl_FragColor = c;
}
`;

module.exports = { ddash: DDASH, shiftbar: SHIFTBAR, arc: ARC, revbar: REVBAR, lights: LIGHTS, fill: FILL, box: BOX, grid: GRID, segbar: SEGBAR, mdash: MDASH, mtach: MTACH, sdash: SDASH, boxes: BOXES };
