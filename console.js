// Volare Media console concept.
// One WebGL canvas shows the footage in black and white. Every clip plays at normal speed.
// Between cuts the footage is shown plain: flat, still and full frame. Nothing follows the pointer.
// Picking a chapter turns it into slanted panes of glass on two depth layers: each pane
// tilts toward or away from the camera, bends the picture and splits it into the full spectrum
// near its edges, and carries the cut from the old clip to the new one, while the camera pushes in,
// swings and rolls. Then the panes settle flat and the camera comes back to rest.
// Every movement runs on one curve (smootherstep): it starts and stops with no speed and
// no sudden change of acceleration.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body;
const chapters = $$(".chapter");
const order = chapters.map((c) => c.dataset.id);
const byId = Object.fromEntries(chapters.map((c) => [c.dataset.id, c]));
const menuButtons = $$(".menu button");

/* ---------------- one easing curve for everything ---------------- */
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const EASE = CSS.supports("animation-timing-function", "linear(0, 1)")
  ? `linear(${Array.from({ length: 49 }, (_, i) => smoother(i / 48).toFixed(4)).join(", ")})`
  : "cubic-bezier(0.65, 0, 0.35, 1)";
document.documentElement.style.setProperty("--ease", EASE);

// value follows a target through two soft springs, so even its acceleration changes gradually
function damp(s, target, time, dt) {
  const w = 2 / time, k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const d = s.x - target, tmp = (s.v + w * d) * dt;
  s.v = (s.v - w * tmp) * e;
  s.x = target + (d + tmp) * e;
}
const spring = () => ({ a: { x: 0, v: 0 }, b: { x: 0, v: 0 } });
function follow(s, target, dt, t1 = 0.5, t2 = 0.3) { damp(s.a, target, t1, dt); damp(s.b, s.a.x, t2, dt); return s.b.x; }

const glides = new Map();
function glide(obj, key, to, ms) {
  const from = obj[key], t0 = performance.now(), token = {};
  glides.set(key, token);
  return new Promise((res) => {
    const step = (now) => {
      if (glides.get(key) !== token) return res();
      const k = Math.min(1, (now - t0) / ms);
      obj[key] = from + (to - from) * smoother(k);
      k < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- footage ---------------- */
const videos = {};
function videoFor(id) {
  if (videos[id]) return videos[id];
  const v = document.createElement("video");
  v.src = byId[id].dataset.clip;
  v.muted = true; v.loop = true; v.playsInline = true;
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  v.preload = "auto";
  videos[id] = v;
  if (body.classList.contains("no-gl")) $(".stage-fallback").appendChild(v);
  return v;
}
const hasFrame = (v) => v.readyState >= 2 && v.videoWidth > 0;
function whenReady(v, ms = 2500) {
  return new Promise((res) => {
    if (hasFrame(v)) return res();
    const t = setTimeout(res, ms);
    v.addEventListener("loadeddata", () => { clearTimeout(t); res(); }, { once: true });
  });
}
function play(v) { if (!reduce) v.play().catch(() => {}); }

/* ---------------- WebGL stage ---------------- */
const canvas = $("#stage");
const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uA, uB;
uniform float uProg, uTime, uAspA, uAspB, uScreen, uDim, uStrips, uAngle, uPx, uSeed, uSwing;
uniform vec2 uOrigin;
float gZoom;      // how far the camera is pushed in right now (exactly 1 between cuts)
float gLift;      // 0 at rest, 1 at the middle of a cut

const vec3 VOLT = vec3(0.839, 1.0, 0.239);
const vec3 LILAC = vec3(0.788, 0.729, 0.957);
const vec3 DARK = vec3(0.047, 0.051, 0.035);     // the brand's near-black
const vec3 CREAM = vec3(0.957, 0.953, 0.91);     // and its cream
const float K = 0.35;                             // how strongly a tilted pane shows perspective

float ss(float t) { t = clamp(t, 0.0, 1.0); return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float bump(float t) { return ss(t / 0.5) * (1.0 - ss((t - 0.5) / 0.5)); }   // 0 -> 1 -> 0, soft at every point
vec2 cover(vec2 uv, float asp) {
  vec2 s = vec2(1.0);
  if (uScreen > asp) s.y = asp / uScreen; else s.x = uScreen / asp;
  return (uv - 0.5) * s + 0.5;
}
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float tone(float l) { l = smoothstep(0.03, 0.97, l); return pow(l, 1.12); }
vec3 grade(float l) { return mix(DARK, CREAM, l); }
vec3 gradeM(float l) { return mix(vec3(0.05, 0.036, 0.085), vec3(0.86, 0.80, 1.0), l); }   // seen through mauve
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// strips of uneven width, so the cut reads as panes, not blinds
float warp(float s) { return s + 0.32 * sin(s * 1.9 + uSeed); }
float warpD(float s) { return 1.0 + 0.608 * cos(s * 1.9 + uSeed); }
// brightness of each clip at a point on the flat picture plane (centre 0,0; height 1)
// (a point pushed past the frame edge during a cut reads the picture mirrored, never a smeared edge)
vec2 mirror(vec2 uv) { return abs(mod(uv + 1.0, 2.0) - 1.0); }
float sampA(vec2 q) { return tone(luma(texture2D(uA, mirror((cover(vec2(q.x / uScreen + 0.5, q.y + 0.5), uAspA) - 0.5) / gZoom + 0.5)).rgb)); }
float sampB(vec2 q) { return tone(luma(texture2D(uB, mirror((cover(vec2(q.x / uScreen + 0.5, q.y + 0.5), uAspB) - 0.5) / gZoom + 0.5)).rgb)); }
// the colours of the spectrum from red (0) to violet (1), weighted so seven even steps add up to white
vec3 spectrum(float f) {
  return vec3((max(0.0, 1.0 - 2.0 * f) + 0.35 * max(0.0, 3.0 * f - 2.0)) / 2.525,
              max(0.0, 1.0 - abs(2.0 * f - 1.0)) / 3.0,
              max(0.0, 2.0 * f - 1.0) / 2.0);
}

struct Pane { float hit; vec2 q; float s; float id; float sn; float g; float lp; float dir; float t; };

// Which pane of this depth layer covers the pixel, and where on that (tilted) pane are we?
Pane paneAt(vec2 pc, float front, float lift) {
  Pane P;
  float z = front > 0.5 ? 0.075 : -0.035;                      // front panes come closer, back panes drop away
  vec2 pl = (pc - vec2(uSwing * 0.5, 0.0) * z * lift) / (1.0 + z * lift);   // closer panes slide further as the camera swings
  float span = uScreen + 1.0;
  vec2 r = rot(pl, uAngle);
  float S = (r.y / span + 0.5) * uStrips;
  float sy = warp(S);
  float id = floor(sy);
  float v = fract(sy) - 0.5;                                    // across the pane, as seen on screen
  float even = mod(id, 2.0) < 1.0 ? 1.0 : 0.0;
  float mine = front > 0.5 ? even : 1.0 - even;                 // the two layers take alternate panes

  // panes nearest the word you picked move first
  vec2 ro = rot(vec2((uOrigin.x - 0.5) * uScreen, uOrigin.y - 0.5), uAngle);
  float oId = floor(warp((ro.y / span + 0.5) * uStrips));
  float t = clamp((uProg - min(abs(id - oId) / uStrips, 1.0) * 0.38) / 0.62, 0.0, 1.0);   // each pane's turn overlaps its neighbours'
  float g = bump(t);                                            // this pane's swell: its tilt and its glass
  float dir = even > 0.5 ? 1.0 : -1.0;
  float th = g * dir * (0.23 + 0.23 * hash(vec2(id, uSeed)));  // tilt about the pane's long axis
  float sn = sin(th), cs = cos(th);
  // one end of the pane also swings away from the camera, so the gap beside it opens as a wedge
  float Y = g * 0.127 * (0.4 + 0.6 * hash(vec2(id + 7.0, uSeed))) * (0.5 + dir * r.x / span);
  float s = v * (1.0 + Y) / (cs - v * sn * K);                  // undo the tilt: where on the flat pane is this pixel
  float d = 1.0 + Y + s * sn * K;                               // how far that point sits from the camera

  float aa = uPx * uStrips / span * 2.0;
  float inside = 1.0 - smoothstep(0.5 - aa, 0.5, abs(s));
  P.hit = mine * mix(1.0, inside, ss(g * 6.0));                 // a flat pane fills its strip, so no seams at rest
  float yFlat = r.y + (s - v) / warpD(S) * span / uStrips;
  P.q = rot(vec2(r.x * d, yFlat), -uAngle);
  P.s = s; P.id = id; P.sn = sn; P.g = g; P.lp = ss(t); P.dir = dir; P.t = t;
  return P;
}

vec3 shade(Pane P) {
  float span = uScreen + 1.0;
  float ax = rot(P.q, uAngle).x / span + 0.5;
  if (P.dir < 0.0) ax = 1.0 - ax;
  float env = ss(P.lp / 0.2) * (1.0 - ss((P.lp - 0.8) / 0.2));
  float edge = ax - (P.lp * 1.14 - 0.07);          // above 0: old clip, below 0: new clip
  float aa = uPx * 1.5 / span;
  float showB = 1.0 - smoothstep(-aa, aa, edge);
  float near = 1.0 - smoothstep(0.0, 0.1, abs(edge));

  vec2 alongV = vec2(cos(uAngle), -sin(uAngle)) * P.dir;
  vec2 acrossV = vec2(sin(uAngle), cos(uAngle));
  float depth = 0.5 + hash(vec2(P.id, uSeed));

  // glass: the bevel along each long edge bends the picture, and the tilt shifts it sideways
  float bev = smoothstep(0.27, 0.5, abs(P.s)) * sign(P.s);
  vec2 refr = acrossV * (bev * abs(bev) * 0.058 + P.sn * 0.046) * P.g;
  vec2 qa = (P.q + alongV * (0.05 * depth * P.lp + near * 0.03 * env) + refr) / (1.0 + 0.10 * depth * P.lp);
  vec2 qb = (P.q - alongV * (0.05 * depth * (1.0 - P.lp) + near * 0.025 * env) + refr) / (1.0 + 0.12 * depth * (1.0 - P.lp));

  // full-spectrum colour split: seven samples fanned across the pane, red at one end and violet at the other,
  // wider toward the bevel, plus a lens split that grows toward the corners while the camera is moving.
  // Where the seven agree, the colours add back up to plain black and white.
  vec2 ab = acrossV * (0.012 + 0.052 * abs(bev)) * P.g + P.q * gLift * 0.013;
  float l0 = mix(sampA(qa), sampB(qb), showB);
  vec3 acc = l0 * spectrum(0.5);
  for (int i = 0; i < 7; i++) {
    if (i == 3) continue;                          // the middle sample is l0, taken above
    float f = float(i) / 6.0;
    vec2 o = ab * (f * 2.0 - 1.0);
    float l;
    if (showB > 0.5) l = sampB(qb + o); else l = sampA(qa + o);
    acc += l * spectrum(f);
  }
  vec3 col = DARK + (CREAM - DARK) * acc;

  // mauve trails each cut edge; volt leads it, with a mauve echo just behind
  col = mix(col, gradeM(l0), smoothstep(-0.18, 0.0, edge) * showB * env * 0.5);
  col = mix(col, LILAC, (1.0 - smoothstep(0.0, 0.002, abs(edge + 0.045))) * env * 0.6);
  col = mix(col, VOLT, (1.0 - smoothstep(0.0, 0.003, abs(edge))) * env);
  col += VOLT * (1.0 - smoothstep(0.0, 0.03, abs(edge))) * env * 0.14;

  // light on the glass: the side tipped toward the camera is brighter, and each long edge catches a rim
  col *= 1.0 - P.sn * P.s * 1.1;
  float rimW = uPx * uStrips / span * 3.0, as = abs(P.s);
  float rim = smoothstep(0.5 - rimW * 2.2, 0.5 - rimW * 0.6, as)                 // the outer edge
            + 0.45 * (1.0 - smoothstep(0.0, rimW * 1.2, abs(as - 0.455)));        // and a fainter inner one: the glass has thickness
  col += mix(CREAM, LILAC, 0.55) * rim * P.g * 0.58;
  // a glint slides across the pane as it tilts
  float gl = (P.s - (P.t * 1.6 - 0.8) * P.dir) / 0.09;
  col += mix(CREAM, LILAC, 0.4) * exp(-gl * gl) * P.g * 0.19;
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * uScreen, uv.y - 0.5);

  // The camera only moves during a cut: it pushes in, swings to one side, rolls and whips across, then settles.
  // Between cuts every one of these is exactly zero, so the footage is shown as it is: flat, still and full frame.
  float lift = bump(uProg);
  gLift = lift;
  gZoom = 1.0 + 0.12 * ss(uProg / 0.22) * (1.0 - ss((uProg - 0.78) / 0.22));
  p = rot(p, uSwing * lift * 0.045);
  vec2 lean = vec2(uSwing * lift * 0.12, -lift * 0.04);
  float inward = abs(lean.x) * uScreen * 0.5 + abs(lean.y) * 0.5;   // the lean only moves the picture inward
  vec2 pc = p * (1.0 + dot(p, lean) - inward) + vec2(uSwing * lift * 0.045, 0.0);

  vec3 col;
  if (uProg <= 0.0) {
    col = grade(sampA(p));                         // between cuts: the plain footage, no glass, no camera
  } else {
    Pane F = paneAt(pc, 1.0, lift);
    vec3 cf = vec3(0.0), cb = vec3(0.0);
    float hb = 0.0;
    if (F.hit > 0.001) cf = shade(F);
    if (F.hit < 0.999) {
      Pane Bk = paneAt(pc, 0.0, lift);
      hb = Bk.hit;
      if (hb > 0.001) cb = shade(Bk) * (1.0 - 0.18 * lift);        // the back layer sits in a little shade
    }
    vec3 deep = grade(sampB(pc * 1.02)) * 0.30;                     // between the panes: the new clip, further back and in shade
    col = mix(mix(deep, cb, hb), cf, F.hit);
  }

  // keep the type readable
  col *= uDim;
  col *= 1.0 - 0.38 * smoothstep(0.62, 0.0, uv.y);
  vec2 q = (uv - 0.5) * vec2(uScreen / max(uScreen, 1.0), 1.0);
  col *= 1.0 - dot(q, q) * 0.9;

  // fine grain
  col *= 0.985 + 0.015 * sin(gl_FragCoord.y * 1.6);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}`;

let stage = null;
const UNIFORMS = ["uA", "uB", "uProg", "uTime", "uAspA", "uAspB", "uScreen", "uDim", "uStrips", "uAngle", "uOrigin", "uPx", "uSeed", "uSwing"];
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; UNIFORMS.forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 13, 9, 255])); return t; };
    const texA = mkTex(0), texB = mkTex(1);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    stage = { gl, U, texA, texB, a: null, b: null, prog: 0, dim: 0, strips: 9, angle: -0.42, seed: 0, swing: 1, origin: [0.2, 0.3] };
  } catch (e) { console.warn("Console stage fell back to plain video:", e); }
}
if (!stage) body.classList.add("no-gl");

function upload(tex, unit, v) {
  if (!v || !hasFrame(v)) return;
  gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
}
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

/* ---------------- credits roll ---------------- */
const roll = { box: $(".roll"), el: $(".roll-inner"), y: 0, max: 0, hover: false, v: spring() };
const measureRoll = () => (roll.max = roll.el.offsetHeight - roll.box.clientHeight);
roll.box.addEventListener("pointerenter", () => (roll.hover = true));
roll.box.addEventListener("pointerleave", () => (roll.hover = false));
addEventListener("resize", measureRoll);

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;

  if (!reduce) {
    const speed = current === "credits" && !roll.hover ? innerHeight * 0.092 : 0;
    roll.y += follow(roll.v, speed, dt, 0.6, 0.4) * dt;
    if (roll.max > 0 && roll.y >= roll.max) roll.y = 0;      // both ends of the roll are empty, so the loop is invisible
    roll.el.style.transform = `translate3d(0, ${-roll.y.toFixed(2)}px, 0)`;
  }

  if (!stage) return;
  resize();
  const { U } = stage;
  upload(stage.texA, 0, stage.a);
  if (stage.prog > 0 || stage.hold != null) upload(stage.texB, 1, stage.b);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(U.uProg, stage.hold ?? stage.prog);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uScreen, canvas.width / canvas.height);
  gl.uniform1f(U.uPx, 1 / canvas.height);
  gl.uniform1f(U.uAspA, stage.a && stage.a.videoWidth ? stage.a.videoWidth / stage.a.videoHeight : 16 / 9);
  gl.uniform1f(U.uAspB, stage.b && stage.b.videoWidth ? stage.b.videoWidth / stage.b.videoHeight : 16 / 9);
  gl.uniform1f(U.uDim, stage.dim);
  gl.uniform1f(U.uStrips, stage.strips);
  gl.uniform1f(U.uAngle, stage.angle);
  gl.uniform1f(U.uSeed, stage.seed);
  gl.uniform1f(U.uSwing, stage.swing);
  gl.uniform2f(U.uOrigin, stage.origin[0], stage.origin[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
const tween = (ms, fn) => new Promise((res) => {
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});

const DIM = { home: 0.6, credits: 0.32, contact: 0.3 };
let cutNo = 0;
async function cutTo(id, origin) {
  const v = videoFor(id);
  play(v);
  await whenReady(v);
  if (!stage) {
    $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
    return;
  }
  cutNo++;
  stage.b = v;
  stage.origin = origin;
  stage.angle = cutNo % 2 ? -0.42 : 0.42;          // the slant flips on every cut
  stage.swing = cutNo % 2 ? 1 : -1;                // and so does the way the camera swings
  stage.strips = [9, 7, 11, 8][cutNo % 4];
  stage.seed = cutNo * 1.7;
  upload(stage.texB, 1, v);
  glide(stage, "dim", DIM[id] ?? 0.46, reduce ? 300 : 1300);
  sweeps();
  await tween(reduce ? 350 : 1250, (k) => (stage.prog = k));
  // the new clip becomes the base layer
  const old = stage.a;
  [stage.texA, stage.texB] = [stage.texB, stage.texA];
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stage.texA);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, stage.texB);
  stage.a = v; stage.b = null; stage.prog = 0;
  if (old && old !== v) old.pause();
}

// two slanted sweeps cross the screen: a thin volt line, and a wide mauve band that lags behind it
function sweeps() {
  if (reduce) return;
  const dir = cutNo % 2 ? 1 : -1, sk = dir > 0 ? -24 : 24;
  const run = (el, pad, ms, delay) => {
    const x0 = dir > 0 ? -pad : innerWidth + pad, x1 = dir > 0 ? innerWidth + pad : -pad;
    el.animate([
      { transform: `translateX(${x0}px) skewX(${sk}deg)`, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, offset: 0.75 },
      { transform: `translateX(${x1}px) skewX(${sk}deg)`, opacity: 0 },
    ], { duration: ms, delay, easing: EASE, fill: "backwards" });
  };
  run($(".sweep--volt"), innerWidth * 0.2, 1100, 0);
  run($(".sweep--mauve"), innerWidth * 0.35, 1500, 60);
}

/* ---------------- type: slanted wipes ---------------- */
// each headline line gets its own wrapper so a mauve bar can ride the edge of the wipe
$$(".title .ln").forEach((ln) => {
  const w = document.createElement("span"), t = document.createElement("span"), b = document.createElement("span");
  w.className = "ln-w"; t.className = "ln-t"; b.className = "bar"; b.setAttribute("aria-hidden", "true");
  while (ln.firstChild) t.appendChild(ln.firstChild);
  w.append(t, b); ln.appendChild(w);
});
const T = "-0.15em", B = "calc(100% + 0.2em)", R0 = "calc(100% + 1em)", R1 = "calc(100% + 0.38em)";
const CLIP_HIDDEN_L = `polygon(-0.4em ${T}, -0.4em ${T}, -1.02em ${B}, -1.02em ${B})`;
const CLIP_SHOWN = `polygon(-0.4em ${T}, ${R0} ${T}, ${R1} ${B}, -1.02em ${B})`;
const CLIP_HIDDEN_R = `polygon(${R0} ${T}, ${R0} ${T}, ${R1} ${B}, ${R1} ${B})`;

function wipeIn(el, delay = 0, ms = 820) {
  if (reduce) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay, fill: "backwards" }).finished;
  const title = el.classList.contains("ln-t");
  const a = el.animate([
    { clipPath: CLIP_HIDDEN_L, transform: "translateX(-0.4em)" },
    { clipPath: CLIP_SHOWN, transform: "none" },
  ], { duration: ms, delay, easing: EASE, fill: "both" });
  if (title) el.nextElementSibling.animate([
    { left: "-0.6em", opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { opacity: 1, offset: 0.7 },
    { left: "calc(100% + 0.8em)", opacity: 0 },
  ], { duration: ms, delay, easing: EASE, fill: "backwards" });
  return a.finished.then(() => a.cancel());      // drop the clip once the text is fully in
}
function wipeOut(el, delay = 0) {
  if (reduce) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay, fill: "both" }).finished;
  return el.animate([
    { clipPath: CLIP_SHOWN, transform: "none" },
    { clipPath: CLIP_HIDDEN_R, transform: "translateX(0.4em)" },
  ], { duration: 520, delay, easing: EASE, fill: "both" }).finished;
}
const parts = (ch) => [...$$(".title .ln-t", ch), ...$$(".sub, .more, .contact-big a, .roll", ch)];

async function showChapter(ch, d0 = 0) {
  ch.hidden = false; ch.classList.add("is-on");
  await Promise.all(parts(ch).map((el, i) => wipeIn(el, d0 + i * 80)));
}
async function hideChapter(ch) {
  await Promise.all(parts(ch).map((el, i) => wipeOut(el, i * 45)));
  ch.classList.remove("is-on"); ch.hidden = true;
  parts(ch).forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
}

// Move a set of elements from where they are to where a layout change puts them, as one smooth motion.
// The elements must keep the same proportions in both layouts, so each one scales evenly with nothing shifting inside it.
function morph(els, change, ms, delayOf = () => 0) {
  const before = els.map((el) => el.getBoundingClientRect());
  change();
  if (reduce) return;
  els.forEach((el, i) => {
    const a = before[i], z = el.getBoundingClientRect();
    if (!z.width || !z.height) return;
    el.animate([
      { transform: `translate(${a.left - z.left}px, ${a.top - z.top}px) scale(${a.width / z.width}, ${a.height / z.height})` },
      { transform: "none" },
    ], { duration: ms, delay: delayOf(i), easing: EASE, fill: "backwards" });
  });
}

/* ---------------- navigation ---------------- */
let current = "home";
let busy = true;
function originOf(el) {
  if (!el) return [0.5, 0.5];
  const r = el.getBoundingClientRect();
  return [(r.left + r.width / 2) / innerWidth, 1 - (r.top + r.height / 2) / innerHeight];
}
async function go(id, from) {
  if (busy || id === current || !byId[id]) return;
  busy = true;
  const prev = byId[current], next = byId[id];
  const origin = originOf(from);
  menuButtons.forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === id)));
  // big words <-> rail, starting on the click itself
  if ((current === "home") !== (id === "home")) {
    const toRail = id !== "home", n = menuButtons.length;
    morph(menuButtons, () => body.classList.toggle("is-rail", toRail), 900, (i) => (toRail ? i : n - 1 - i) * 22);
  }
  const leaving = hideChapter(prev);
  const cut = cutTo(id, origin);
  await leaving;
  current = id;
  if (id === "credits") { roll.y = 0; next.hidden = false; measureRoll(); }
  history.replaceState(null, "", id === "home" ? location.pathname : `#${id}`);
  await showChapter(next, 260);
  await cut;
  busy = false;
  // warm up the neighbours so the next cut starts at once
  const i = order.indexOf(id);
  [order[(i + 1) % order.length], order[(i - 1 + order.length) % order.length]].forEach((n) => videoFor(n).load());
}
function step(d) {
  const i = order.indexOf(current);
  const n = order[(i + d + order.length) % order.length];
  go(n, $(`.menu button[data-go="${n}"]`) || $(".logo"));
}

$$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go, b)));
addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); step(1); }
  if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
  if (e.key === "Escape") go("home", $(".logo"));
});
let wheelAcc = 0, wheelT = 0;
addEventListener("wheel", (e) => {
  if (busy) return;
  wheelAcc += e.deltaY;
  clearTimeout(wheelT); wheelT = setTimeout(() => (wheelAcc = 0), 220);
  if (Math.abs(wheelAcc) > 80) { step(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
}, { passive: true });
let touchY = null;
addEventListener("touchstart", (e) => (touchY = e.touches[0].clientY), { passive: true });
addEventListener("touchend", (e) => {
  if (touchY == null) return;
  const dy = touchY - e.changedTouches[0].clientY; touchY = null;
  if (Math.abs(dy) > 60) step(dy > 0 ? 1 : -1);
}, { passive: true });

// For checking the cut by eye: console.html?debug, then __vm.freeze("production", 0.5) holds a cut halfway; __vm.freeze() lets go.
if (new URLSearchParams(location.search).has("debug")) window.__vm = {
  async freeze(id, at) {
    if (!stage) return;
    if (id == null) { stage.hold = null; stage.b = null; return; }
    const v = videoFor(id); play(v); await whenReady(v);
    stage.b = v; upload(stage.texB, 1, v); stage.hold = at;
  },
  set(k, val) { stage[k] = val; },
};

/* ---------------- intro: title card, then the console ---------------- */
async function intro() {
  requestAnimationFrame(frame);
  const v = videoFor("home");
  play(v);
  // the title card starts straight away; the footage fades up behind it as soon as it has a frame
  whenReady(v, 6000).then(() => {
    if (stage) { stage.a = v; glide(stage, "dim", body.classList.contains("is-intro") ? 0.5 : DIM.home, 1600); }
    else $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
  });
  const home = byId.home;
  home.classList.add("is-on");
  await Promise.all($$(".title .ln-t", home).map((el, i) => wipeIn(el, 300 + i * 140)));
  await wait(reduce ? 200 : 1300);

  // The title card leaves the centre for its corner, one line at a time, and the menu starts in the same moment.
  // Each line is moved on its own: the card is centred and the corner is not, so moving the block as a whole made the lines jump.
  morph($$(".ln-w", home), () => body.classList.remove("is-intro"), 1000);
  if (stage && stage.a) glide(stage, "dim", DIM.home, 1300);
  wipeIn($(".sub", home), 500);
  await Promise.all(menuButtons.map((b, i) => wipeIn(b, i * 70)));
  busy = false;

  // open a chapter straight from the address bar (#production etc.)
  const start = location.hash.slice(1);
  if (byId[start] && start !== "home") go(start, $(`.menu button[data-go="${start}"]`));
}
intro();
