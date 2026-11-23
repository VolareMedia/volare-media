// Volare Media inner pages. Calmer than the console: the page is about its content.
//  1. The opening photo (or footage) starts dark and is revealed once through the glass panes, then sits plain.
//  2. Headings wipe in line by line behind a mauve bar as they come into view; other blocks follow with a plain slanted wipe.
//
// How nothing shows early: glass.css hides everything that will animate from the very first paint
// (html.anim, set by the one-line script in <head>). This file never hides anything. It only un-hides a block,
// by starting its animations and marking it data-in in the same step.
// Nothing here follows the pointer, and nothing keeps moving once it has arrived.
import { EASE, reduce, whenReady, createStage } from "./glass-stage.js?v=1";

const root = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
root.style.setProperty("--ease", EASE);
root.classList.add("glass-on");                      // tells the <head> script this file arrived
const animate = root.classList.contains("anim") && !reduce;

/* ---------------- 1. the opening photo, through the glass ---------------- */
const hero = document.querySelector("main > :first-child");
if (animate && hero && hero.matches(".photo-band, .video-band")) glassHero(hero);
else root.classList.add("no-glass");

async function glassHero(box) {
  const vid = box.querySelector(":scope > video.band-video");
  let src = vid;
  if (vid) {
    if (!vid.getAttribute("src") && vid.dataset.src) vid.src = vid.dataset.src;
    vid.muted = true; vid.loop = true; vid.playsInline = true;
  } else {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(box.style.getPropertyValue("--photo"));
    if (m) { src = new Image(); src.decoding = "async"; src.src = m[1]; }
  }
  const canvas = el("canvas", "hero-stage");
  canvas.setAttribute("aria-hidden", "true");
  const stage = src ? (box.prepend(canvas), createStage(canvas)) : null;
  if (!stage) { canvas.remove(); root.classList.add("no-glass"); return; }     // no WebGL: the page's own photo shows instead
  box.classList.add("has-stage");
  const sweeps = el("div", "cut-sweeps");
  sweeps.setAttribute("aria-hidden", "true");
  sweeps.append(el("span", "cut-sweep cut-sweep--mauve"), el("span", "cut-sweep cut-sweep--volt"));
  box.append(sweeps);

  // only draw (and only play footage) while the opening photo is on screen
  new IntersectionObserver(([e]) => {
    stage.paused = !e.isIntersecting;
    if (vid) e.isIntersecting ? vid.play().catch(() => {}) : vid.pause();
  }).observe(box);

  await whenReady(src, 3000);
  const w = box.clientWidth;
  const run = (node, pad, ms, delay) => node.animate([
    { transform: `translateX(${-pad}px) skewX(-24deg)`, opacity: 0 },
    { opacity: 1, offset: 0.25 },
    { opacity: 1, offset: 0.75 },
    { transform: `translateX(${w + pad}px) skewX(-24deg)`, opacity: 0 },
  ], { duration: ms, delay, easing: EASE, fill: "backwards" });
  run(sweeps.lastChild, w * 0.2, 1100, 0);
  run(sweeps.firstChild, w * 0.35, 1500, 60);
  stage.cut(src, { origin: [0.1, 0.35], dim: 0.5 });   // from dark to the photo, through the panes
}

/* ---------------- 2. type ---------------- */
const T = "-0.15em", B = "calc(100% + 0.2em)", R0 = "calc(100% + 1em)", R1 = "calc(100% + 0.38em)";
const CLIP_HIDDEN = `polygon(-0.4em ${T}, -0.4em ${T}, -1.02em ${B}, -1.02em ${B})`;
const CLIP_SHOWN = `polygon(-0.4em ${T}, ${R0} ${T}, ${R1} ${B}, -1.02em ${B})`;
const DUR = 820;

// One piece arrives with a slanted wipe (a heading line also gets the mauve bar riding its edge).
// The animation holds the piece hidden through its delay, so starting it is what un-hides the piece.
function wipe(node, delay, bar = null) {
  // a clip cannot be applied to plain inline text, so that fades in instead
  const inline = getComputedStyle(node).display === "inline";
  const a = node.animate(inline
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ clipPath: CLIP_HIDDEN, transform: "translateX(-0.4em)" }, { clipPath: CLIP_SHOWN, transform: "none" }],
  { duration: DUR, delay, easing: EASE, fill: "both" });
  if (bar) bar.animate([
    { left: "-0.6em", opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { opacity: 1, offset: 0.7 },
    { left: "calc(100% + 0.8em)", opacity: 0 },
  ], { duration: DUR, delay, easing: EASE, fill: "backwards" });
  return a.finished.then(() => a.cancel(), () => {});      // once it is fully in, hand the piece back to the stylesheet
}

// Break a heading into the lines it is actually sitting on, wipe each line, then put the heading back exactly as it was.
function lines(h, delay) {
  const html = h.innerHTML;
  const units = [];
  [...h.childNodes].forEach((n) => {
    if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) units.push(document.createTextNode(" "));
      else { const s = el("span", "w"); s.textContent = part; units.push(s); }
    });
    else if (n.nodeType === 1) units.push(n);            // the full stop (or any marked word) stays in one piece
  });
  h.replaceChildren(...units);
  const rows = [];
  let mid = null;
  units.forEach((u) => {
    if (u.nodeType !== 1) { if (rows.length) rows[rows.length - 1].push(u); return; }
    const r = u.getBoundingClientRect(), m = r.top + r.height / 2;
    if (mid === null || Math.abs(m - mid) > r.height * 0.6) { rows.push([]); mid = m; }
    rows[rows.length - 1].push(u);
  });
  const jobs = [];
  h.replaceChildren(...rows.map((row, i) => {
    const ln = el("span", "ln"), w = el("span", "ln-w"), t = el("span", "ln-t"), b = el("span", "bar");
    t.append(...row); w.append(t, b); ln.append(w);
    jobs.push(wipe(t, delay + i * 110, b));
    return ln;
  }));
  Promise.all(jobs).then(() => { h.innerHTML = html; });
  return rows.length;
}

// List every piece of a block that should arrive on its own, in reading order:
// a heading (by line), each word of a big-word list, and otherwise the smallest blocks that hold no heading or list.
function pieces(node, out = []) {
  if (node.matches("h1, h2")) out.push([node, "lines"]);
  else if (node.matches(".big-list")) [...node.children].forEach((li) => out.push([li.firstElementChild || li, "block"]));
  else if (node.querySelector("h1, h2, .big-list")) [...node.children].forEach((c) => pieces(c, out));
  else out.push([node, "block"]);
  return out;
}

// Bring one block in. Every piece gets its animation first; only then is the block marked data-in,
// which lifts the stylesheet's hiding. Both happen before the browser paints again.
function reveal(node, d = 0) {
  if (node.hasAttribute("data-in")) return;
  if (animate) for (const [piece, kind] of pieces(node)) {
    if (kind === "lines") d += lines(piece, d) * 110 + 30;
    else { wipe(piece, d); d += 70; }
  }
  node.setAttribute("data-in", "");
  $$(".reveal", node).forEach((n) => n.setAttribute("data-in", ""));      // blocks nested inside came in with it
}

// what animates: the opening text straight away, and every block the page marks .reveal as it scrolls into view
const first = hero ? $$(":scope > .wrap > *", hero) : [];
const later = $$(".reveal").filter((n) => !first.some((f) => f === n || f.contains(n)) && !n.parentElement.closest(".reveal"));

let d0 = 200;
first.forEach((n) => { reveal(n, d0); d0 += 240; });
if (animate && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    reveal(e.target);
  }), { threshold: 0, rootMargin: "0px 0px -8% 0px" });   // as soon as any part of it is 8% up from the bottom edge (works for very tall blocks too)
  later.forEach((n) => io.observe(n));
} else later.forEach((n) => reveal(n));
