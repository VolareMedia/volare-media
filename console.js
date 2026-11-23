// Volare Media console concept.
// One WebGL canvas shows the footage in black and white. Every clip plays at normal speed.
// Picking a chapter cuts to its clip with angled strips that sweep in alternate directions,
// starting from the word you picked, while the menu words shrink into a rail and the
// headline wipes in on a slant.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body;
const chapters = $$(".chapter");
const order = chapters.map((c) => c.dataset.id);
const byId = Object.fromEntries(chapters.map((c) => [c.dataset.id, c]));
const menuButtons = $$(".menu button");
const credit = $(".hud-credit");
const clock = $(".hud-time");
const slash = $(".slash");
const ease = "cubic-bezier(0.7, 0, 0.2, 1)";

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
uniform float uProg, uTime, uAspA, uAspB, uScreen, uDim, uStrips, uAngle;
uniform vec2 uOrigin;

vec2 cover(vec2 uv, float asp) {
  vec2 s = vec2(1.0);
  if (uScreen > asp) s.y = asp / uScreen; else s.x = uScreen / asp;
  return (uv - 0.5) * s + 0.5;
}
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 grade(float l) {
  // black and white, from the brand's near-black to its cream
  l = smoothstep(0.03, 0.97, l);
  l = pow(l, 1.12);
  return mix(vec3(0.047, 0.051, 0.035), vec3(0.957, 0.953, 0.91), l);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float io(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

void main() {
  vec2 uv = vUv;
  float span = uScreen + 1.0;
  vec2 r = rot(vec2((uv.x - 0.5) * uScreen, uv.y - 0.5), uAngle);
  float sy = (r.y / span + 0.5) * uStrips;
  float idx = floor(sy);
  float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;

  // strips nearest the word you picked move first
  vec2 ro = rot(vec2((uOrigin.x - 0.5) * uScreen, uOrigin.y - 0.5), uAngle);
  float oIdx = floor((ro.y / span + 0.5) * uStrips);
  float delay = abs(idx - oIdx) / uStrips * 0.5;
  float lp = io(clamp((uProg - delay) / 0.5, 0.0, 1.0));
  float moving = step(0.0001, lp) * step(lp, 0.9999);

  float ax = r.x / span + 0.5;
  if (dir < 0.0) ax = 1.0 - ax;
  float edge = ax - (lp * 1.12 - 0.06);       // above 0: old clip, below 0: new clip
  float showB = step(edge, 0.0);
  float near = 1.0 - smoothstep(0.0, 0.09, abs(edge));

  // pull the picture along the strip near the moving edge
  vec2 along = vec2(cos(uAngle) / uScreen, -sin(uAngle)) * dir;
  vec2 offA = along * near * 0.05 * moving;
  vec2 offB = -along * near * 0.035 * moving;

  float split = near * 0.006 * moving;  // a thin colour fringe at the edge only
  vec2 ua = cover(uv + offA, uAspA), ub = cover(uv + offB, uAspB);
  float la = luma(texture2D(uA, ua).rgb);
  float lb = luma(texture2D(uB, ub).rgb);
  vec3 col = mix(grade(la), grade(lb), showB);
  float lbR = luma(texture2D(uB, ub + along * split).rgb);
  col += vec3(0.79, 0.73, 0.96) * (lbR - lb) * 2.5 * showB * moving;   // mauve fringe

  // strip seams while the cut is moving
  float f = fract(sy);
  col *= mix(1.0, smoothstep(0.0, 0.025, f) * smoothstep(1.0, 0.975, f), moving * 0.7);

  // the volt edge
  float line = (1.0 - smoothstep(0.0, 0.0035, abs(edge))) * moving;
  col = mix(col, vec3(0.839, 1.0, 0.239), line);
  col += vec3(0.839, 1.0, 0.239) * (1.0 - smoothstep(0.0, 0.03, abs(edge))) * moving * 0.18;

  // keep the type readable
  col *= uDim;
  col *= 1.0 - 0.38 * smoothstep(0.62, 0.0, uv.y);
  vec2 q = (uv - 0.5) * vec2(uScreen / max(uScreen, 1.0), 1.0);
  col *= 1.0 - dot(q, q) * 0.9;

  // subtle console texture: fine scan lines and moving grain
  col *= 0.975 + 0.025 * sin(gl_FragCoord.y * 1.6);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * 0.055;
  gl_FragColor = vec4(col, 1.0);
}`;

let stage = null;
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ["uA", "uB", "uProg", "uTime", "uAspA", "uAspB", "uScreen", "uDim", "uStrips", "uAngle", "uOrigin"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    const mkTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 13, 9, 255])); return t; };
    const texA = mkTex(0), texB = mkTex(1);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    stage = { gl, U, texA, texB, a: null, b: null, prog: 0, dim: 0, dimTo: 0.6, strips: 9, angle: -0.42, origin: [0.2, 0.3] };
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
function frame(t) {
  requestAnimationFrame(frame);
  if (stage) {
    resize();
    const { U } = stage;
    stage.dim += (stage.dimTo - stage.dim) * 0.05;
    upload(stage.texA, 0, stage.a);
    if (stage.prog > 0) upload(stage.texB, 1, stage.b);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U.uProg, stage.prog);
    gl.uniform1f(U.uTime, t / 1000);
    gl.uniform1f(U.uScreen, canvas.width / canvas.height);
    gl.uniform1f(U.uAspA, stage.a && stage.a.videoWidth ? stage.a.videoWidth / stage.a.videoHeight : 16 / 9);
    gl.uniform1f(U.uAspB, stage.b && stage.b.videoWidth ? stage.b.videoWidth / stage.b.videoHeight : 16 / 9);
    gl.uniform1f(U.uDim, stage.dim);
    gl.uniform1f(U.uStrips, stage.strips);
    gl.uniform1f(U.uAngle, stage.angle);
    gl.uniform2f(U.uOrigin, stage.origin[0], stage.origin[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const v = videos[current];
  if (v && v.duration) clock.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
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
  stage.angle = cutNo % 2 ? -0.42 : 0.42;          // alternate the slant on every cut
  stage.strips = [9, 7, 12, 8][cutNo % 4];
  stage.dimTo = DIM[id] ?? 0.46;
  upload(stage.texB, 1, v);
  slashSweep(origin);
  await tween(reduce ? 350 : 1250, (k) => (stage.prog = k));
  // the new clip becomes the base layer
  const old = stage.a;
  [stage.texA, stage.texB] = [stage.texB, stage.texA];
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stage.texA);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, stage.texB);
  stage.a = v; stage.b = null; stage.prog = 0;
  if (old && old !== v) old.pause();
}

function slashSweep(origin) {
  if (reduce) return;
  const dir = cutNo % 2 ? 1 : -1;
  const x0 = dir > 0 ? -0.15 * innerWidth : 1.15 * innerWidth, x1 = dir > 0 ? 1.15 * innerWidth : -0.15 * innerWidth;
  const sk = dir > 0 ? -24 : 24;
  slash.animate([
    { transform: `translateX(${x0}px) skewX(${sk}deg)`, opacity: 0 },
    { opacity: 1, offset: 0.15 },
    { opacity: 1, offset: 0.8 },
    { transform: `translateX(${x1}px) skewX(${sk}deg)`, opacity: 0 },
  ], { duration: 1100, easing: ease });
}

/* ---------------- type: slanted wipes ---------------- */
const CLIP_HIDDEN_L = "polygon(-12% 0, -12% 0, -22% 100%, -22% 100%)";
const CLIP_SHOWN = "polygon(-12% 0, 122% 0, 112% 100%, -22% 100%)";
const CLIP_HIDDEN_R = "polygon(122% 0, 122% 0, 112% 100%, 112% 100%)";
function wipeIn(el, delay = 0) {
  if (reduce) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay, fill: "both" }).finished;
  return el.animate([
    { clipPath: CLIP_HIDDEN_L, transform: "translateX(-0.4em)" },
    { clipPath: CLIP_SHOWN, transform: "none" },
  ], { duration: 820, delay, easing: ease, fill: "both" }).finished;
}
function wipeOut(el, delay = 0) {
  if (reduce) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay, fill: "both" }).finished;
  return el.animate([
    { clipPath: CLIP_SHOWN, transform: "none" },
    { clipPath: CLIP_HIDDEN_R, transform: "translateX(0.4em)" },
  ], { duration: 520, delay, easing: "cubic-bezier(0.6, 0, 0.8, 0.3)", fill: "both" }).finished;
}
const parts = (ch) => [...$$(".title .ln", ch), ...$$(".sub, .more, .contact-big a, .roll", ch)];

async function showChapter(ch, d0 = 0) {
  ch.hidden = false; ch.classList.add("is-on");
  await Promise.all(parts(ch).map((el, i) => wipeIn(el, d0 + i * 80)));
}
async function hideChapter(ch) {
  await Promise.all(parts(ch).map((el, i) => wipeOut(el, i * 45)));
  ch.classList.remove("is-on"); ch.hidden = true;
  parts(ch).forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
}

/* ---------------- readouts ---------------- */
const GLYPHS = "/\\<>[]_-=+*#%";
function typeCredit(text) {
  if (!text) { credit.textContent = ""; return; }
  const label = `Footage: ${text}`;
  if (reduce) { credit.textContent = label; return; }
  let i = 0;
  const id = setInterval(() => {
    i++;
    credit.textContent = label.slice(0, i) + Array.from({ length: Math.min(4, label.length - i) }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]).join("");
    if (i >= label.length) clearInterval(id);
  }, 28);
}

/* ---------------- menu: big words <-> rail, animated as one piece ---------------- */
function flipMenu(toRail) {
  const before = menuButtons.map((b) => b.getBoundingClientRect());
  body.classList.toggle("is-rail", toRail);
  const after = menuButtons.map((b) => b.getBoundingClientRect());
  if (reduce) return;
  menuButtons.forEach((b, i) => {
    const a = before[i], z = after[i];
    const s = a.height / z.height;
    b.animate([
      { transform: `translate(${a.left - z.left}px, ${a.top - z.top}px) scale(${s})` },
      { transform: "none" },
    ], { duration: 900, delay: (toRail ? i : menuButtons.length - i) * 22, easing: ease, fill: "backwards" });
  });
}

/* ---------------- navigation ---------------- */
let current = "home";
let busy = false;
function originOf(el) {
  if (!el) return [0.5, 0.5];
  const r = el.getBoundingClientRect();
  return [(r.left + r.width / 2) / innerWidth, 1 - (r.top + r.height / 2) / innerHeight];
}
async function go(id, from) {
  if (busy || id === current || !byId[id]) return;
  busy = true;
  body.classList.add("is-switching");
  const prev = byId[current], next = byId[id];
  menuButtons.forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === id)));
  const leaving = hideChapter(prev);
  if ((current === "home") !== (id === "home")) setTimeout(() => flipMenu(id !== "home"), 120);
  const cut = cutTo(id, originOf(from));
  await leaving;
  typeCredit(next.dataset.credit);
  current = id;
  history.replaceState(null, "", id === "home" ? location.pathname : `#${id}`);
  await showChapter(next, 260);
  await cut;
  body.classList.remove("is-switching");
  busy = false;
  // warm up the neighbours so the next cut starts instantly
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

/* ---------------- intro: title card, then the console ---------------- */
async function intro() {
  busy = true;
  requestAnimationFrame(frame);
  const v = videoFor("home");
  play(v);
  await whenReady(v);
  if (stage) { stage.a = v; stage.dimTo = 0.5; }
  else $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
  typeCredit(byId.home.dataset.credit);
  const home = byId.home;
  home.classList.add("is-on");
  await Promise.all($$(".title .ln", home).map((el, i) => wipeIn(el, 300 + i * 140)));
  await new Promise((r) => setTimeout(r, reduce ? 200 : 1300));

  // the title card settles into the corner and the menu wipes in
  const t = $(".title", home);
  const a = t.getBoundingClientRect();
  body.classList.remove("is-intro");
  const z = t.getBoundingClientRect();
  if (stage) stage.dimTo = DIM.home;
  if (!reduce) t.animate([
    { transform: `translate(${a.left - z.left}px, ${a.top - z.top}px) scale(${a.height / z.height})`, transformOrigin: "0 0" },
    { transform: "none", transformOrigin: "0 0" },
  ], { duration: 1000, easing: ease });
  wipeIn($(".sub", home), 500);
  await Promise.all(menuButtons.map((b, i) => wipeIn(b, 350 + i * 70)));
  busy = false;

  // open a chapter straight from the address bar (#production etc.)
  const start = location.hash.slice(1);
  if (byId[start] && start !== "home") setTimeout(() => go(start, $(`.menu button[data-go="${start}"]`)), 1400);
}
intro();
