// Volare Media console concept.
// One WebGL canvas shows the footage in black and white. Every clip plays at normal speed.
// Between cuts the footage is shown plain: flat, still and full frame. Nothing follows the pointer.
// Picking a chapter turns it into slanted panes of glass on two depth layers: each pane
// tilts toward or away from the camera, bends the picture and splits it into the full spectrum
// near its edges, and carries the cut from the old clip to the new one, while the camera pushes in,
// swings and rolls. Then the panes settle flat and the camera comes back to rest.
// Every movement runs on one curve (smootherstep): it starts and stops with no speed and
// no sudden change of acceleration.

import { smoother, EASE, reduce, whenReady, createStage } from "./glass-stage.js?v=2";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const body = document.body;
const chapters = $$(".chapter");
const order = chapters.map((c) => c.dataset.id);
const byId = Object.fromEntries(chapters.map((c) => [c.dataset.id, c]));
const menuButtons = $$(".menu button");

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
function play(v) { if (!reduce) v.play().catch(() => {}); }

/* ---------------- the glass stage (shared with the inner pages) ---------------- */
const stage = createStage($("#stage"));
if (!stage) body.classList.add("no-gl");

/* ---------------- credits roll ---------------- */
// The roll runs by itself, but it never makes you wait: it opens with the first names already on screen,
// and the wheel, a trackpad or a finger moves it at your own pace (it carries on by itself a moment after you stop).
const roll = { box: $(".roll"), el: $(".roll-inner"), y: 0, max: 0, start: 0, kick: 0, heldUntil: 0, hover: false, v: spring() };
const measureRoll = () => {
  roll.max = roll.el.offsetHeight - roll.box.clientHeight;
  roll.start = Math.max(0, parseFloat(getComputedStyle(roll.el).paddingTop) - roll.box.clientHeight * 0.4);
};
// move the roll by hand; returns how much of the movement did not fit (you were already at one end)
function nudgeRoll(d, eased) {
  const pos = roll.y + roll.kick, to = Math.min(roll.max - 1, Math.max(0, pos + d));
  if (eased) roll.kick += to - pos; else roll.y += to - pos;
  roll.heldUntil = performance.now() + 2500;
  return pos + d - to;
}
roll.box.addEventListener("pointerenter", () => (roll.hover = true));
roll.box.addEventListener("pointerleave", () => (roll.hover = false));
addEventListener("resize", measureRoll);

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;

  if (!reduce) {
    const speed = current === "credits" && !roll.hover && now > roll.heldUntil ? innerHeight * 0.092 : 0;
    roll.y += follow(roll.v, speed, dt, 0.6, 0.4) * dt;
    const k = roll.kick * (1 - Math.exp(-dt * 14));          // your own scrolling, eased out
    roll.y += k; roll.kick -= k;
    if (roll.max > 0 && roll.y >= roll.max) roll.y = 0;      // both ends of the roll are empty, so the loop is invisible
    roll.el.style.transform = `translate3d(0, ${-roll.y.toFixed(2)}px, 0)`;
  }
}
const DIM = { home: 0.6, credits: 0.32, contact: 0.3 };
let fallbackCuts = 0;
async function cutTo(id, origin) {
  const v = videoFor(id);
  play(v);
  await whenReady(v);
  if (!stage) {
    $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
    return;
  }
  const old = stage.a;
  sweeps(stage.cutNo + 1);
  await stage.cut(v, { origin, dim: DIM[id] ?? 0.46 });
  if (old && old !== v) old.pause();
}

// two slanted sweeps cross the screen: a thin volt line, and a wide mauve band that lags behind it
function sweeps(n) {
  if (reduce) return;
  const dir = n % 2 ? 1 : -1, sk = dir > 0 ? -24 : 24;
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
  if (id === "credits") { next.hidden = false; measureRoll(); roll.y = roll.start; roll.kick = 0; roll.heldUntil = 0; }
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
const rollInHand = () => current === "credits" && !reduce && roll.max > 0;
addEventListener("wheel", (e) => {
  let d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
  // on Credits the wheel moves the roll; only what is left over at either end goes on to the next chapter
  if (rollInHand()) { d = nudgeRoll(d, true); if (!d) return; }
  if (busy) return;
  wheelAcc += d;
  clearTimeout(wheelT); wheelT = setTimeout(() => (wheelAcc = 0), 220);
  if (Math.abs(wheelAcc) > (rollInHand() ? 220 : 80)) { step(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
}, { passive: true });
let touchY = null, touchLast = null, touchRolled = false;
addEventListener("touchstart", (e) => { touchY = touchLast = e.touches[0].clientY; touchRolled = false; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (touchLast == null || !rollInHand()) return;
  const y = e.touches[0].clientY, d = touchLast - y; touchLast = y;
  if (Math.abs(d - nudgeRoll(d, false)) > 0.5) touchRolled = true;      // the roll follows the finger
}, { passive: true });
addEventListener("touchend", (e) => {
  if (touchY == null) return;
  const dy = touchY - e.changedTouches[0].clientY; touchY = touchLast = null;
  if (touchRolled) return;                                              // that swipe moved the credits, not the chapter
  if (Math.abs(dy) > 60) step(dy > 0 ? 1 : -1);
}, { passive: true });

// For checking the cut by eye: console.html?debug, then __vm.freeze("production", 0.5) holds a cut halfway; __vm.freeze() lets go.
if (stage && new URLSearchParams(location.search).has("debug")) window.__vm = {
  async freeze(id, at) { if (id == null) return stage.freeze(); const v = videoFor(id); play(v); await whenReady(v); stage.freeze(v, at); },
  set(k, val) { stage[k] = val; },
};

/* ---------------- arriving ---------------- */
// The title card is an opening, not a toll. It plays the first time someone lands here in a visit,
// and not again when they come back to this page from elsewhere on the site.
let opened = false;
try { opened = sessionStorage.getItem("vm-opened") === "1"; sessionStorage.setItem("vm-opened", "1"); } catch (e) {}

// Arriving without the title card: straight to the menu, or straight into a chapter if the address names one.
async function arrive(id) {
  const ch = byId[id], v = videoFor(id);
  body.classList.remove("is-intro");
  chapters.forEach((c) => { c.hidden = c !== ch; });      // only the chapter being opened is on stage
  body.classList.toggle("is-rail", id !== "home");
  menuButtons.forEach((b) => b.setAttribute("aria-current", String(b.dataset.go === id)));
  current = id;
  play(v);
  whenReady(v, 6000).then(() => {
    if (stage) stage.show(v, DIM[id] ?? 0.46, 1200);
    else $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
  });
  if (id === "credits") { ch.hidden = false; measureRoll(); roll.y = roll.start; roll.kick = 0; roll.heldUntil = 0; }
  const coming = Promise.all([showChapter(ch, 120), ...menuButtons.map((b, i) => wipeIn(b, 80 + i * 50))]);
  body.classList.remove("is-loading");      // the animations above now hold everything hidden until its turn
  await coming;
  busy = false;
}

/* ---------------- intro: title card, then the console ---------------- */
async function intro() {
  requestAnimationFrame(frame);
  const named = location.hash.slice(1);
  if (opened || reduce) return arrive(byId[named] ? named : "home");
  const v = videoFor("home");
  play(v);
  // the title card starts straight away; the footage fades up behind it as soon as it has a frame
  whenReady(v, 6000).then(() => {
    if (stage) stage.show(v, body.classList.contains("is-intro") ? 0.5 : DIM.home, 1600);
    else $$(".stage-fallback video").forEach((x) => x.classList.toggle("on", x === v));
  });
  const home = byId.home;
  home.classList.add("is-on");
  const card = Promise.all($$(".title .ln-t", home).map((el, i) => wipeIn(el, 300 + i * 140)));
  body.classList.remove("is-loading");      // the wipes above now hold the title hidden until its turn
  await card;
  await wait(reduce ? 200 : 1300);

  // The title card leaves the centre for its corner, one line at a time, and the menu starts in the same moment.
  // Each line is moved on its own: the card is centred and the corner is not, so moving the block as a whole made the lines jump.
  morph($$(".ln-w", home), () => body.classList.remove("is-intro"), 1000);
  if (stage && stage.a) stage.glide("dim", DIM.home, 1300);
  wipeIn($(".sub", home), 500);
  await Promise.all(menuButtons.map((b, i) => wipeIn(b, i * 70)));
  busy = false;

  // open a chapter straight from the address bar (#production etc.)
  const start = location.hash.slice(1);
  if (byId[start] && start !== "home") go(start, $(`.menu button[data-go="${start}"]`));
}
intro();
