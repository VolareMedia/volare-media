// Volare Media tracking loader (2026-10-28).
// Meta pixel (612504680491197) and the Google tag (Ads AW-16968991307 + GA4
// G-0VDTC0MJHJ) are about 215 KB of third-party JavaScript. Loading them after
// the first interaction, or 3.5 s after the page is ready, keeps them off the
// critical path on mobile. Events fired before the scripts arrive are queued
// and sent as soon as they load, so nothing is lost.
(function () {
  // Stubs that queue calls until the real scripts arrive.
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };
  if (!window.fbq) {
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  }

  gtag('js', new Date());
  gtag('config', 'AW-16968991307');
  gtag('config', 'G-0VDTC0MJHJ');
  fbq('init', '612504680491197');
  fbq('track', 'PageView');

  var sent = /[?&]sent=1/.test(location.search);
  // Contact form sent (contact-form.php redirects to contact.html?sent=1)
  if (sent) {
    fbq('track', 'Lead');
    gtag('event', 'conversion', { 'send_to': 'AW-16968991307/e1ijCNKw5YYdEMuEuZs_' });
    gtag('event', 'generate_lead', { 'method': 'contact_form' });
  }
  // Phone number tapped (tel: links anywhere on the page)
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a[href^="tel:"]')) {
      fbq('track', 'Contact');
      gtag('event', 'conversion', { 'send_to': 'AW-16968991307/qA6TCNWw5YYdEMuEuZs_' });
      gtag('event', 'phone_tap');
    }
  });

  var loaded = false;
  function add(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function load() {
    if (loaded) return; loaded = true;
    ['scroll', 'pointerdown', 'touchstart', 'keydown', 'mousemove'].forEach(function (ev) {
      window.removeEventListener(ev, load, { passive: true });
    });
    add('https://connect.facebook.net/en_US/fbevents.js');
    add('https://www.googletagmanager.com/gtag/js?id=AW-16968991307');
  }
  ['scroll', 'pointerdown', 'touchstart', 'keydown', 'mousemove'].forEach(function (ev) {
    window.addEventListener(ev, load, { passive: true, once: true });
  });
  // Conversions must not wait on a gesture; everyone else gets a short grace period.
  if (sent) load();
  else if (document.readyState === 'complete') setTimeout(load, 3500);
  else window.addEventListener('load', function () { setTimeout(load, 3500); });
})();
