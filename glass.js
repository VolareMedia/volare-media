// Volare Media inner pages. Calmer than the console: the page is about its content.
//  1. The opening photo (or footage) is revealed once through the glass panes, then sits plain.
//  2. Headings wipe in line by line behind a mauve bar as they come into view; other blocks follow with a plain slanted wipe.
// Nothing here follows the pointer, and nothing keeps moving once it has arrived.
import { EASE, reduce, whenReady, createStage } from "./glass-stage.js?v=1";

const root = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
root.style.setProperty("--ease", EASE);

/* ---------------- 1. the opening photo, through the glass ---------------- */
const hero = document.querySelector("main > :first-child");
if (hero && hero.matches(".photo-band, .video-band")) glassHero(hero);

async function glassHero(box) {
  const vid = box.querySelector(":scope > video.band-video");
  let src = vid;
  if (vid) {
    if (!vid.getAttribute("src") && vid.dataset.src) vid.src = vid.dataset.src;
    vid.muted = true; vid.loop = true; vid.playsInline = true;
  } else {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(box.style.getPropertyValue("--photo"));
    if (!m) return;
    src = new Image(); src.decoding = "async"; src.src = m[1];
  }
  const canvas = el("canvas", "hero-stage");
  canvas.setAttribute("aria-hidden", "true");
  box.prepend(canvas);
  const stage = createStage(canvas);
  if (!stage) { canvas.remove(); return; }           // no WebGL: the page's own photo stays
  box.classList.add("has-stage");
  const sweeps = el("div", "cut-sweeps");
  sweeps.setAttribute("aria-hidden", "true");
  sweeps.append(el("span", "cut-sweep cut-sweep--mauve"), el("span", "cut-sweep cut-sweep--volt"));
  box.append(sweeps);

  // only draw (and only play footage) while the opening photo is on screen
  new IntersectionObserver(([e]) => {
    stage.paused = !e.isIntersecting;
    if (vid) e.isIntersecting && !reduce ? vid.play().catch(() => {}) : vid.pause();
  }).observe(box);

  await whenReady(src, 3000);
  if (!reduce) {
    const w = box.clientWidth;
    const run = (node, pad, ms, delay) => node.animate([
      { transform: `translateX(${-pad}px) skewX(-24deg)`, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, offset: 0.75 },
      { transform: `translateX(${w + pad}px) skewX(-24deg)`, opacity: 0 },
    ], { duration: ms, delay, easing: EASE, fill: "backwards" });
    run(sweeps.lastChild, w * 0.2, 1100, 0);
    run(sweeps.firstChild, w * 0.35, 1500, 60);
  }
  stage.cut(src, { origin: [0.1, 0.35], dim: 0.5 });   // from black to the photo, through the panes
}

/* ---------------- 2. type ---------------- */
const T = "-0.15em", B = "calc(100% + 0.2em)", R0 = "calc(100% + 1em)", R1 = "calc(100% + 0.38em)";
const CLIP_HIDDEN = `polygon(-0.4em ${T}, -0.4em ${T}, -1.02em ${B}, -1.02em ${B})`;
const CLIP_SHOWN = `polygon(-0.4em ${T}, ${R0} ${T}, ${R1} ${B}, -1.02em ${B})`;

// a plain slanted wipe; a heading line also gets the mauve bar riding its edge
function wipe(node, delay = 0, bar = null, ms = 820) {
  const a = node.animate([
    { clipPath: CLIP_HIDDEN, transform: "translateX(-0.4em)" },
    { clipPath: CLIP_SHOWN, transform: "none" },
  ], { duration: ms, delay, easing: EASE, fill: "both" });
  if (bar) bar.animate([
    { left: "-0.6em", opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { opacity: 1, offset: 0.7 },
    { left: "calc(100% + 0.8em)", opacity: 0 },
  ], { duration: ms, delay, easing: EASE, fill: "backwards" });
  return a.finished.then(() => a.cancel(), () => {});      // drop the clip once the text is fully in
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
    else if (n.nodeType === 1) units.push(n);            // a highlighted word or the full stop stays in one piece
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
  const done = [];
  h.replaceChildren(...rows.map((row, i) => {
    const ln = el("span", "ln"), w = el("span", "ln-w"), t = el("span", "ln-t"), b = el("span", "bar");
    t.append(...row); w.append(t, b); ln.append(w);
    done.push([t, b, delay + i * 110]);
    return ln;
  }));
  Promise.all(done.map(([t, b, d]) => wipe(t, d, b))).then(() => { h.innerHTML = html; });
}

// bring one block in: its headings by line, a big-word list word by word, anything else as a single wipe
function reveal(node, d = 0) {
  node.removeAttribute("data-wipe");
  if (reduce) return;
  if (node.matches("h1, h2")) return lines(node, d);
  if (node.matches(".big-list")) return [...node.children].forEach((li, i) => wipe(li.firstElementChild || li, d + i * 70));
  const heads = $$("h1, h2", node);
  if (!heads.length) return wipe(node, d);
  for (const c of node.children) {
    const hs = c.matches("h1, h2") ? [c] : $$("h1, h2", c);
    if (hs.length) hs.forEach((h) => { lines(h, d); d += 140; });
    else { wipe(c, d + 120); d += 90; }
  }
}

// what animates: the hero's own text straight away, and every block the page marks .reveal as it scrolls into view
const first = hero ? $$(":scope > .wrap > *", hero) : [];
const later = $$(".reveal").filter((n) => !first.some((f) => f === n || f.contains(n)) && !n.parentElement.closest(".reveal"));
[...first, ...later].forEach((n) => n.setAttribute("data-wipe", ""));
root.classList.remove("v3-pending");

first.forEach((n, i) => reveal(n, 250 + i * 160));
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    reveal(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  later.forEach((n) => io.observe(n));
} else later.forEach((n) => n.removeAttribute("data-wipe"));
