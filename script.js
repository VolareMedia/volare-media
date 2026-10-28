// Mobile nav toggle
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".main-nav");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  });
}

// Scroll reveal
const reveals = document.querySelectorAll(".reveal");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hero loop: the poster paints first, then the 30 MB loop loads once the page is
// ready. Set HERO_VIDEO_ON_MOBILE to false to keep the still image on phones.
const HERO_VIDEO_ON_MOBILE = true;
const heroVideo = document.querySelector(".hero-video[data-src]");
if (heroVideo) {
  const wide = window.matchMedia("(min-width: 768px)").matches;
  if (!reduced && (wide || HERO_VIDEO_ON_MOBILE)) {
    const start = () => {
      heroVideo.src = heroVideo.dataset.src;
      heroVideo.autoplay = true;
      heroVideo.play().catch(() => {});
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }
}

// Contact form result notices (?sent=1 / ?error=1)
const params = new URLSearchParams(window.location.search);
if (params.has("sent") || params.has("error")) {
  const notice = document.querySelector(params.has("sent") ? ".form-notice--sent" : ".form-notice--error");
  if (notice) {
    notice.hidden = false;
    notice.scrollIntoView({ block: "center" });
  }
}

// Click-to-play Vimeo embeds
document.querySelectorAll("[data-vimeo]").forEach((thumb) => {
  thumb.addEventListener("click", () => {
    if (thumb.classList.contains("is-playing")) return;
    const id = thumb.dataset.vimeo;
    const title = thumb.getAttribute("aria-label") || "Video player";
    thumb.classList.add("is-playing");
    thumb.innerHTML =
      '<iframe src="https://player.vimeo.com/video/' + id +
      '?autoplay=1&title=0&byline=0&portrait=0&dnt=1" ' +
      'allow="autoplay; fullscreen; picture-in-picture" allowfullscreen ' +
      'title="' + title + '"></iframe>';
  });
});

// Click-to-play YouTube embeds (privacy-enhanced nocookie domain)
document.querySelectorAll("[data-youtube]").forEach((thumb) => {
  thumb.addEventListener("click", () => {
    if (thumb.classList.contains("is-playing")) return;
    const id = thumb.dataset.youtube;
    const title = thumb.getAttribute("aria-label") || "Video player";
    thumb.classList.add("is-playing");
    thumb.innerHTML =
      '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0" ' +
      'allow="autoplay; fullscreen; picture-in-picture" allowfullscreen ' +
      'title="' + title + '"></iframe>';
  });
});

if (reduced || !("IntersectionObserver" in window)) {
  reveals.forEach((el) => el.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  reveals.forEach((el) => observer.observe(el));
}

// Pause the mockup loops when reduced motion is requested
if (reduced) document.querySelectorAll(".packages-stage video").forEach((v) => v.pause());
