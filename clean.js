// Volare Media: clean site behaviour (2026-11-22), shared by every <body class="v2"> page.
// Full-screen menu, headline words that light up on scroll, background footage
// that loads near the screen and pauses off it.
(function () {
  // Full-screen menu
  var btn = document.querySelector('.menu-btn'), menu = document.getElementById('site-menu');
  if (btn && menu) {
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.firstChild.nodeValue = open ? 'Close ' : 'Menu ';
  }
  btn.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  }

  // Statement words light up as you scroll past
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-lit]').forEach(function (el) {
    var dot = el.querySelector('.dot');
    var text = el.firstChild.nodeValue.trim();
    el.firstChild.nodeValue = '';
    var words = text.split(' ').map(function (w, i, all) {
      var s = document.createElement('span'); s.className = 'w'; s.textContent = w;
      el.insertBefore(s, dot); if (i < all.length - 1) el.insertBefore(document.createTextNode(' '), dot);
      return s;
    });
    if (reduced) return;
    function update() {
      var r = el.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / (vh * 0.5);
      var n = Math.round(Math.max(0, Math.min(1, p)) * words.length);
      words.forEach(function (w, i) { w.classList.toggle('on', i < n); });
      dot.style.opacity = n >= words.length ? 1 : 0.18;
    }
    window.addEventListener('scroll', update, { passive: true }); update();
  });


  // Background footage: load when near the screen, pause when off it
  var lazyVids = document.querySelectorAll('video[data-src]:not(#beyond-the-reel video)');
  function play(v) { if (!v.src) v.src = v.dataset.src; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  if (!('IntersectionObserver' in window)) { lazyVids.forEach(play); }
  else {
    var vo = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { if (!reduced) play(e.target); } else e.target.pause(); });
    }, { rootMargin: '250px' });
    lazyVids.forEach(function (v) { vo.observe(v); });
  }

})();
