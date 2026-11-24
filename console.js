// Volare Media console concept.
// One WebGL canvas shows the footage in black and white. Every clip plays at normal speed.
// Between cuts the footage is shown plain: flat, still and full frame. Nothing follows the pointer.
// Picking a chapter turns it into slanted panes of glass on two depth layers: each pane
// tilts toward or away from the camera, bends the picture and splits it into the full spectrum
// near its edges, and carries the cut from the old clip to the new one, while the camera pushes in,
// swings and rolls. Then the panes settle flat and the camera comes back to rest.
// Every movement runs on one curve (smootherstep): it starts and stops with no speed and
// no sudden change of acceleration.

import { smoother, EASE, reduce, whenReady, createStage } from "./glass-stage.js?v=5";

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
// A chapter's picture: footage (data-clip) or a still photo (data-photo). One player per file, shared by chapters that use the same one.
function videoFor(id) {
  const ch = byId[id], file = ch.dataset.clip || ch.dataset.photo;
  if (videos[file]) return videos[file];
  let v;
  if (ch.dataset.clip) {
    v = document.createElement("video");
    v.src = file;
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.preload = "auto";
    if (body.classList.contains("no-gl")) $(".stage-fallback").appendChild(v);
  } else {
    v = new Image(); v.decoding = "async"; v.src = file;
    if (body.classList.contains("no-gl")) $(".stage-fallback").appendChild(v);
  }
  videos[file] = v;
  return v;
}
const isClip = (v) => v instanceof HTMLVideoElement;
const rest = (v) => { if (v && isClip(v)) v.pause(); };
function play(v) { if (!reduce && isClip(v)) v.play().catch(() => {}); }

/* ---------------- the glass stage (shared with the inner pages) ---------------- */
const stage = createStage($("#stage"));
if (!stage) body.classList.add("no-gl");

/* ---------------- credits roll ---------------- */
// The roll runs by itself, but it never makes you wait: it opens with the first names already on screen,
// and the wheel, a trackpad or a finger moves it at your own pace (it carries on by itself a moment after you stop).
const roll = { on: !!$(".roll"), box: $(".roll"), el: $(".roll-inner"), y: 0, max: 0, start: 0, kick: 0, heldUntil: 0, hover: false, v: spring() };
const measureRoll = () => {
  if (!roll.on) return;
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
if (roll.on) {
  roll.box.addEventListener("pointerenter", () => (roll.hover = true));
  roll.box.addEventListener("pointerleave", () => (roll.hover = false));
}
addEventListener("resize", measureRoll);

/* ---------------- our work: the reel grows to fill the screen, then the projects follow ---------------- */
// The footage behind the home screen becomes a frame you scroll through. work.y is how far you have scrolled inside the section:
//   0 .. grow             the frame grows from half size to almost the whole screen and "Play reel" arrives
//   .. grow + hold        it stays there for one more scroll
//   beyond                it scrolls away upward like an ordinary page, and the projects come up underneath
// work.mix (0 to 1) is how much of this layout is applied: it glides up when the section opens and back down when it closes,
// which is what turns the full-screen footage into the frame and back.
const S0 = 0.5, S1 = 0.88;                       // frame size at the start, and at its biggest (close to full screen, clear of the logo)
const work = { canvas: $("#stage"), reel: $(".reel"), label: $(".reel-play"), intro: $(".work-intro"), list: $(".projects"),
  y: 0, kick: 0, mix: 0, grow: 1, hold: 1, max: 0 };
const measureWork = () => {
  if (!work.reel) return;
  work.grow = innerHeight * 0.9; work.hold = innerHeight * 0.7;
  work.max = work.grow + work.hold + work.list.offsetHeight;
};
addEventListener("resize", measureWork);
$$(".project-shot img").forEach((img) => img.addEventListener("load", measureWork));
// scroll the section by hand; returns how much of the movement did not fit (you were already at one end)
function nudgeWork(d, eased) {
  const pos = work.y + work.kick, to = Math.min(work.max, Math.max(0, pos + d));
  if (eased) work.kick += to - pos; else work.y += to - pos;
  return pos + d - to;
}
const ramp = (x, a, b) => smoother(Math.min(1, Math.max(0, (x - a) / (b - a))));
function layoutWork(dt) {
  if (!work.reel || (current !== "work" && work.mix === 0)) return;
  const k = work.kick * (1 - Math.exp(-dt * 12));          // your own scrolling, eased out
  work.y += k; work.kick -= k;
  const vh = innerHeight, m = work.mix;
  const p = Math.min(1, work.y / work.grow), grown = smoother(p);
  const away = Math.max(0, work.y - work.grow - work.hold);         // how far the frame has scrolled off the top
  const scale = 1 + (S0 + (S1 - S0) * grown - 1) * m;
  const tf = m > 0.0005 ? `translate3d(0, ${(-away * m).toFixed(1)}px, 0) scale(${scale.toFixed(4)})` : "";
  work.canvas.style.transform = tf; work.reel.style.transform = tf;
  const gone = m > 0.99 && away > vh * 1.02;
  if (stage) stage.paused = gone;                                    // nothing to draw once the frame is off screen
  const label = m * ramp(p, 0.4, 0.95);
  work.label.style.opacity = label.toFixed(3);
  work.reel.classList.toggle("is-live", label > 0.6 && !gone);
  work.intro.style.opacity = (1 - ramp(p, 0.05, 0.4)).toFixed(3);
  body.classList.toggle("over-reel", current === "work" && p > 0.45 && away < vh * 0.9);
  body.classList.toggle("in-list", current === "work" && away > vh * 0.3);
  work.list.style.transform = `translate3d(0, ${(vh - away).toFixed(1)}px, 0)`;
  work.list.style.visibility = away > 0 && m > 0 ? "visible" : "hidden";
}
const eases = new Map();
function easeTo(obj, key, to, ms) {
  const from = obj[key], t0 = performance.now(), token = {};
  eases.set(key, token);
  const tick = (now) => {
    if (eases.get(key) !== token) return;
    const k = Math.min(1, (now - t0) / ms);
    obj[key] = from + (to - from) * smoother(k);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// opening the section: the full-screen footage pulls back into the frame, in colour and at full brightness
function enterWork(instant) {
  work.y = 0; work.kick = 0; measureWork();
  const ms = instant || reduce ? 1 : 1100;
  easeTo(work, "mix", 1, ms);
  if (stage) { stage.glide("colour", 1, ms); stage.glide("clean", 1, ms); }
}
// closing it: the frame opens back out to the full screen, or, if it had already scrolled away, the next picture simply fades up
function leaveWork() {
  const away = work.y - work.grow - work.hold > innerHeight * 0.6;
  const ms = away || reduce ? 1 : 1100;
  if (away && stage) stage.dim = 0;
  work.kick = 0;
  easeTo(work, "mix", 0, ms);
  if (stage) { stage.paused = false; stage.glide("colour", 0, ms); stage.glide("clean", 0, ms); }
  body.classList.remove("over-reel", "in-list");
}

// coming back up into the section from the chapter below: the old picture fades out, and the section is simply there,
// scrolled to its end, with the reel waiting above
async function workFromBelow() {
  const v = videoFor("work"), old = stage && stage.a;
  play(v);
  if (!stage) return;
  await stage.glide("dim", 0, reduce ? 1 : 450);
  eases.set("mix", {}); work.mix = 1;
  stage.colour = 1; stage.clean = 1;
  stage.show(v, DIM.work, 1);
  if (old !== v) rest(old);
}

/* ---------------- player: the reel or a project, with sound ---------------- */
const player = $(".player"), playerBox = $(".player-box");
// The demo reel is our own file in our own player: the picture, a thin progress line and Close, nothing else.
// The line and Close fade away after a moment and come back when the pointer moves. Click the picture to pause, click the line to jump.
// The project videos open in their YouTube or Vimeo player.
let reelVid = null, reelBar = null, awakeT = 0, closeT = 0;
function wake() {
  player.classList.add("is-awake");
  clearTimeout(awakeT);
  awakeT = setTimeout(() => { if (!reelVid || !reelVid.paused) player.classList.remove("is-awake"); }, 2200);
}
function openPlayer(what) {
  const i = what.indexOf(":"), kind = what.slice(0, i), id = what.slice(i + 1);
  clearTimeout(closeT);
  player.classList.toggle("player--clean", kind === "file");
  if (kind === "file") {
    playerBox.innerHTML = `<video src="${id}" autoplay playsinline></video><div class="player-line" aria-hidden="true"><i></i></div>`;
    reelVid = $("video", playerBox); reelBar = $(".player-line i", playerBox);
    reelVid.addEventListener("click", () => { reelVid.paused ? reelVid.play() : reelVid.pause(); wake(); });
    reelVid.addEventListener("ended", closePlayer);            // when it finishes you are back on the Work section, not on an end screen
    $(".player-line", playerBox).addEventListener("click", (ev) => {
      const r = ev.currentTarget.getBoundingClientRect();
      if (reelVid.duration) reelVid.currentTime = ((ev.clientX - r.left) / r.width) * reelVid.duration;
    });
    wake();
  } else {
    playerBox.innerHTML = kind === "vimeo"
      ? `<iframe src="https://player.vimeo.com/video/${id}?autoplay=1" title="Video player" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
      : `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="Video player" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  }
  player.hidden = false;
  requestAnimationFrame(() => player.classList.add("is-open"));
  if (stage) rest(stage.a);
  // keyboard focus moves into the player (to the picture for the reel, so the space bar pauses it and does not press Close)
  if (reelVid) { reelVid.tabIndex = -1; reelVid.focus({ preventScroll: true }); } else $(".player-close").focus({ preventScroll: true });
}
function closePlayer() {
  if (player.hidden || !player.classList.contains("is-open")) return false;
  player.classList.remove("is-open", "is-awake");
  playerBox.innerHTML = "";                                   // stops the sound at once
  reelVid = reelBar = null;
  closeT = setTimeout(() => (player.hidden = true), 500);
  if (stage && stage.a) play(stage.a);
  return true;
}
player.addEventListener("pointermove", wake);
$$("[data-play]").forEach((b) => b.addEventListener("click", () => openPlayer(b.dataset.play)));
$(".player-close").addEventListener("click", closePlayer);
player.addEventListener("click", (e) => { if (e.target === player) closePlayer(); });

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;

  if (!reduce && roll.on) {
    const speed = current === "credits" && !roll.hover && now > roll.heldUntil ? innerHeight * 0.092 : 0;
    roll.y += follow(roll.v, speed, dt, 0.6, 0.4) * dt;
    const k = roll.kick * (1 - Math.exp(-dt * 14));          // your own scrolling, eased out
    roll.y += k; roll.kick -= k;
    if (roll.max > 0 && roll.y >= roll.max) roll.y = 0;      // both ends of the roll are empty, so the loop is invisible
    roll.el.style.transform = `translate3d(0, ${-roll.y.toFixed(2)}px, 0)`;
  }
  layoutWork(dt);
  if (reelBar && reelVid.duration) reelBar.style.transform = `scaleX(${(reelVid.currentTime / reelVid.duration).toFixed(4)})`;
}
const DIM = { home: 0.6, work: 1, credits: 0.32, contact: 0.3 };
// how bright the picture sits behind a chapter: the chapter can say (data-dim), otherwise by name, otherwise a middle value
const dimFor = (id) => parseFloat(byId[id].dataset.dim) || DIM[id] || 0.46;
let fallbackCuts = 0;
async function cutTo(id, origin) {
  const v = videoFor(id);
  play(v);
  await whenReady(v);
  if (!stage) {
    $$(".stage-fallback > *").forEach((x) => x.classList.toggle("on", x === v));
    return;
  }
  const old = stage.a;
  sweeps(stage.cutNo + 1);
  // the home screen and the Work section show the same reel: no cut between them, only the brightness changes
  if (old === v) { stage.cutNo++; return stage.glide("dim", dimFor(id), reduce ? 1 : 1100); }
  await stage.cut(v, { origin, dim: dimFor(id) });
  if (old !== v) rest(old);
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
const parts = (ch) => [...$$(".title .ln-t", ch), ...$$(".sub, .points li, .shots > li, .more, .contact-big a, .roll, .projects-in", ch)].filter((n) => !n.closest(".projects-in") || n.matches(".projects-in"));

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
async function go(id, from, dir = 0) {
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
  if (current === "work") leaveWork();
  // scrolling back up into Work from the chapter below lands at the foot of the project list, as it would on an ordinary page
  const fromBelow = id === "work" && dir < 0;
  const cut = fromBelow ? workFromBelow() : cutTo(id, origin);
  if (id === "work" && !fromBelow) enterWork();
  await leaving;
  current = id;
  if (id === "credits") { next.hidden = false; measureRoll(); roll.y = roll.start; roll.kick = 0; roll.heldUntil = 0; }
  history.replaceState(null, "", id === "home" ? location.pathname : `#${id}`);
  const shown = showChapter(next, 260);
  if (id === "work") measureWork();          // the section is on the page now, so its length can be measured
  if (fromBelow) { work.y = work.max; work.kick = 0; }
  await shown;
  await cut;
  busy = false;
  // warm up the neighbours so the next cut starts at once
  const i = order.indexOf(id);
  [order[(i + 1) % order.length], order[(i - 1 + order.length) % order.length]].forEach((n) => { const m = videoFor(n); if (isClip(m)) m.load(); });
}
function step(d) {
  const i = order.indexOf(current);
  const n = order[(i + d + order.length) % order.length];
  go(n, $(`.menu button[data-go="${n}"]`) || $(".logo"), d);
}

$$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go, b)));
// a menu word that leaves the page (for example Home on an inner page)
$$("[data-href]").forEach((b) => b.addEventListener("click", () => { location.href = b.dataset.href; }));
addEventListener("keydown", (e) => {
  if (!player.hidden) {                                     // while a video is open the keys belong to it
    if (e.key === "Escape") closePlayer();
    if (e.key === " " && reelVid) { e.preventDefault(); reelVid.paused ? reelVid.play() : reelVid.pause(); wake(); }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); step(1); }
  if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
  if (e.key === "Escape") go("home", $(".logo"));
});
let wheelAcc = 0, wheelT = 0, lastWheel = 0, fromEdge = true;
const rollInHand = () => roll.on && current === "credits" && !reduce && roll.max > 0;
const workInHand = () => current === "work" && !busy && player.hidden;
// whichever section scrolls by hand right now (the credits roll or the Work section), or nothing
const inHand = () => (rollInHand() ? nudgeRoll : workInHand() ? nudgeWork : null);
addEventListener("wheel", (e) => {
  let d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
  if (!player.hidden) return;
  // on Credits and in Work the wheel scrolls the section; only what is left over at either end goes on to the next chapter
  const hand = inHand(), now = performance.now(), fresh = now - lastWheel > 200;
  lastWheel = now;
  if (hand) {
    const left = hand(d, true);
    // Leaving a section takes a scroll of its own: one that starts when you are already at its end.
    // The tail of the scroll that brought you to the end never carries you into the next chapter.
    if (fresh) fromEdge = Math.abs(left - d) < 1;      // this scroll began with (almost) nowhere left to go
    if (!left || !fromEdge) return;
    d = left;
  }
  if (busy) return;
  wheelAcc += d;
  clearTimeout(wheelT); wheelT = setTimeout(() => (wheelAcc = 0), 220);
  if (Math.abs(wheelAcc) > (hand ? 220 : 80)) { step(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
}, { passive: true });
let touchY = null, touchLast = null, touchRolled = false;
addEventListener("touchstart", (e) => { touchY = touchLast = e.touches[0].clientY; touchRolled = false; }, { passive: true });
addEventListener("touchmove", (e) => {
  const hand = inHand();
  if (touchLast == null || !hand) return;
  const y = e.touches[0].clientY, d = touchLast - y; touchLast = y;
  if (Math.abs(d - hand(d, false)) > 0.5) touchRolled = true;           // the section follows the finger
}, { passive: true });
addEventListener("touchend", (e) => {
  if (touchY == null) return;
  const dy = touchY - e.changedTouches[0].clientY; touchY = touchLast = null;
  if (touchRolled) return;                                              // that swipe moved the credits, not the chapter
  if (Math.abs(dy) > 60) step(dy > 0 ? 1 : -1);
}, { passive: true });

// For checking the cut by eye: index.html?debug, then __vm.freeze("production", 0.5) holds a cut halfway; __vm.freeze() lets go.
if (stage && new URLSearchParams(location.search).has("debug")) window.__vm = {
  async freeze(id, at) { if (id == null) return stage.freeze(); const v = videoFor(id); play(v); await whenReady(v); stage.freeze(v, at); },
  set(k, val) { stage[k] = val; },
};

/* ---------------- arriving ---------------- */
// The address can name a chapter by its id, or by an older anchor name the chapter also answers to (data-also).
function named() {
  const n = location.hash.slice(1);
  if (byId[n]) return n;
  const ch = n && chapters.find((c) => (c.dataset.also || "").split(" ").includes(n));
  return ch ? ch.dataset.id : "";
}
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
    if (stage) stage.show(v, dimFor(id), 1200);
    else $$(".stage-fallback > *").forEach((x) => x.classList.toggle("on", x === v));
  });
  if (id === "credits") { ch.hidden = false; measureRoll(); roll.y = roll.start; roll.kick = 0; roll.heldUntil = 0; }
  if (id === "work") enterWork(true);
  const coming = Promise.all([showChapter(ch, 120), ...menuButtons.map((b, i) => wipeIn(b, 80 + i * 50))]);
  body.classList.remove("is-loading");      // the animations above now hold everything hidden until its turn
  await coming;
  busy = false;
}

/* ---------------- intro: title card, then the console ---------------- */
async function intro() {
  requestAnimationFrame(frame);
  if (opened || reduce) return arrive(named() || "home");
  const v = videoFor("home");
  play(v);
  // the title card starts straight away; the footage fades up behind it as soon as it has a frame
  whenReady(v, 6000).then(() => {
    if (stage) stage.show(v, body.classList.contains("is-intro") ? 0.5 : dimFor("home"), 1600);
    else $$(".stage-fallback > *").forEach((x) => x.classList.toggle("on", x === v));
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
  if (stage && stage.a) stage.glide("dim", dimFor("home"), 1300);
  wipeIn($(".sub", home), 500);
  await Promise.all(menuButtons.map((b, i) => wipeIn(b, i * 70)));
  busy = false;

  // open a chapter straight from the address bar (#production etc.)
  const start = named();
  if (start && start !== "home") go(start, $(`.menu button[data-go="${start}"]`));
}
intro();
