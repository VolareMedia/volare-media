// The glass stage: one full-screen WebGL canvas that shows a video or a photo in black and white,
// and cuts from one picture to the next through slanted panes of tilting glass.
// Shared by the console (console.js) and the inner pages (glass.js).
//
// Between cuts the picture is shown plain: flat, still and full frame.
// During a cut the picture splits into panes on two depth layers; each pane tilts toward or away from
// the camera, bends the picture and splits it into the full spectrum near its edges, while the camera
// pushes in, swings and rolls. Then the panes settle flat and the camera comes back to rest.

export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// One easing curve for everything (smootherstep): it starts and stops with no speed and no sudden change of acceleration.
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const EASE = CSS.supports("animation-timing-function", "linear(0, 1)")
  ? `linear(${Array.from({ length: 49 }, (_, i) => smoother(i / 48).toFixed(4)).join(", ")})`
  : "cubic-bezier(0.65, 0, 0.35, 1)";

const isVideo = (s) => s instanceof HTMLVideoElement;
export const hasFrame = (s) => (isVideo(s) ? s.readyState >= 2 && s.videoWidth > 0 : s.complete && s.naturalWidth > 0);
export function whenReady(s, ms = 2500) {
  return new Promise((res) => {
    if (hasFrame(s)) return res();
    const t = setTimeout(res, ms);
    s.addEventListener(isVideo(s) ? "loadeddata" : "load", () => { clearTimeout(t); res(); }, { once: true });
  });
}
const tween = (ms, fn) => new Promise((res) => {
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); fn(k); k < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});

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
// 0 -> 1 -> 0, soft at every point. It rises in the first third and takes the other two thirds to settle,
// so a cut arrives with energy and eases out gently instead of stopping short.
float bump(float t) { return ss(t / 0.34) * (1.0 - ss((t - 0.34) / 0.66)); }
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
  gZoom = 1.0 + 0.12 * ss(uProg / 0.22) * (1.0 - ss((uProg - 0.3) / 0.7));    // pushes in fast, eases back out over the rest of the cut
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

  // (no grain and no scan lines: the picture is shown clean)
  gl_FragColor = vec4(col, 1.0);
}`;

const UNIFORMS = ["uA", "uB", "uProg", "uTime", "uAspA", "uAspB", "uScreen", "uDim", "uStrips", "uAngle", "uOrigin", "uPx", "uSeed", "uSwing"];

// Returns the stage, or null where WebGL is not available (the caller then falls back to plain pictures).
export function createStage(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const U = {};
  let texA, texB;
  try {
    const sh = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    UNIFORMS.forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 13, 9, 255])); return t; };
    texA = mkTex(0); texB = mkTex(1);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  } catch (e) { console.warn("Glass stage is off, falling back to plain pictures:", e); return null; }

  // a = the picture on screen, b = the picture a cut is bringing in
  const st = { a: null, b: null, prog: 0, hold: null, paused: false, dim: 0, strips: 9, angle: -0.42, seed: 0, swing: 1, origin: [0.5, 0.5], cutNo: 0, cutting: false };
  let dirtyA = false, dirtyB = false;      // a photo is sent to the graphics card once; a video every frame

  const aspect = (s) => (!s ? 16 / 9 : isVideo(s) ? (s.videoWidth ? s.videoWidth / s.videoHeight : 16 / 9) : (s.naturalWidth ? s.naturalWidth / s.naturalHeight : 16 / 9));
  function upload(tex, unit, s) {
    if (!s || !hasFrame(s)) return false;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); } catch (e) { return false; }
    return true;
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    // the canvas fills whatever box the page gives it: the whole screen on the console, the opening photo on inner pages
    const w = Math.round((canvas.clientWidth || innerWidth) * dpr), h = Math.round((canvas.clientHeight || innerHeight) * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden || st.paused) return;      // nothing is drawn while the tab or the picture is out of view
    resize();
    if (st.a && (isVideo(st.a) || dirtyA) && upload(texA, 0, st.a)) dirtyA = false;
    if (st.b && (st.prog > 0 || st.hold != null) && (isVideo(st.b) || dirtyB) && upload(texB, 1, st.b)) dirtyB = false;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U.uProg, st.hold ?? st.prog);
    gl.uniform1f(U.uTime, now / 1000);
    gl.uniform1f(U.uScreen, canvas.width / canvas.height);
    gl.uniform1f(U.uPx, 1 / canvas.height);
    gl.uniform1f(U.uAspA, aspect(st.a));
    gl.uniform1f(U.uAspB, aspect(st.b));
    gl.uniform1f(U.uDim, st.dim);
    gl.uniform1f(U.uStrips, st.strips);
    gl.uniform1f(U.uAngle, st.angle);
    gl.uniform1f(U.uSeed, st.seed);
    gl.uniform1f(U.uSwing, st.swing);
    gl.uniform2f(U.uOrigin, st.origin[0], st.origin[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(tick);

  // change a value smoothly (used for brightness)
  const glides = new Map();
  st.glide = (key, to, ms) => {
    const from = st[key], t0 = performance.now(), token = {};
    glides.set(key, token);
    return new Promise((res) => {
      const step = (now) => {
        if (glides.get(key) !== token) return res();
        const k = Math.min(1, (now - t0) / ms);
        st[key] = from + (to - from) * smoother(k);
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  };
  // put a first picture on screen and fade it up
  st.show = (s, dim, ms = 1600) => { st.a = s; dirtyA = true; return st.glide("dim", dim, ms); };
  // cut to a new picture through the glass panes; origin = where on screen the cut starts (0-1, y up)
  st.cut = async (s, { origin = [0.5, 0.5], dim = st.dim, ms = 1450 } = {}) => {
    st.cutNo++; st.cutting = true;
    st.b = s; dirtyB = !upload(texB, 1, s);
    st.origin = origin;
    st.angle = st.cutNo % 2 ? -0.42 : 0.42;         // the slant flips on every cut
    st.swing = st.cutNo % 2 ? 1 : -1;               // and so does the way the camera swings
    st.strips = [9, 7, 11, 8][st.cutNo % 4];
    st.seed = st.cutNo * 1.7;
    st.glide("dim", dim, reduce ? 300 : ms + 50);
    await tween(reduce ? 350 : ms, (k) => (st.prog = k));
    // the new picture becomes the base layer
    [texA, texB] = [texB, texA];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);
    dirtyA = dirtyB; dirtyB = false;
    st.a = s; st.b = null; st.prog = 0; st.cutting = false;
  };
  // for checking a cut by eye: hold it partway (freeze() with no picture lets go)
  st.freeze = (s, at) => { if (!s) { st.hold = null; st.b = null; return; } st.b = s; dirtyB = true; st.hold = at; };
  return st;
}
