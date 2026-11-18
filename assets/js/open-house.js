/* Demo 1: OPEN HOUSE. Signature move: brackets close around each work photo.
   Supporting motion: inner parallax on bleeding photos, headline lines rise on load, timeline rule draws. */
(function () {
  'use strict';
  var RI = window.RI || {};
  var doc = document;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  /* ---------- quotes: one at a time, no autoplay ---------- */
  (function () {
    var stage = $('[data-quotes]');
    if (!stage) return;
    var quotes = $$('[data-quote]', stage);
    var nav = $('[data-quote-nav]', stage);
    var count = $('[data-quote-count]', stage);
    var at = 0;
    function show(i, animate) {
      at = (i + quotes.length) % quotes.length;
      quotes.forEach(function (q, n) { q.hidden = n !== at; });
      count.textContent = (at + 1) + ' / ' + quotes.length;
      count.setAttribute('aria-label', count.dataset.wordQuote + ' ' + (at + 1) + ' ' + count.dataset.wordOf + ' ' + quotes.length);
      if (animate && RI.motion) window.gsap.fromTo(quotes[at], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'transform,opacity' });
    }
    nav.hidden = false;
    count.setAttribute('role', 'status');
    $('[data-quote-prev]', stage).addEventListener('click', function () { show(at - 1, true); });
    $('[data-quote-next]', stage).addEventListener('click', function () { show(at + 1, true); });
    show(0);
  })();

  /* ---------- industries: hovering or focusing a row swaps the large preview ---------- */
  (function () {
    var rows = $$('[data-ind-row]');
    var panes = $$('[data-ind-pane]');
    if (!rows.length || !panes.length) return;
    function on(i) { panes.forEach(function (p) { p.classList.toggle('is-on', p.dataset.indPane === i); }); }
    rows.forEach(function (row) {
      row.addEventListener('mouseenter', function () { on(row.dataset.indRow); });
      row.addEventListener('focus', function () { on(row.dataset.indRow); });
    });
  })();

  var h1 = $('[data-oh-h1]');
  if (!RI.motion) { if (h1) h1.classList.add('is-ready'); return; }
  var gsap = window.gsap;

  /* ---------- headline lines rise on load, 90ms apart ---------- */
  if (h1) {
    var a = $('.oh-h1-a', h1);
    var b = $('.oh-h1-b', h1);
    a.innerHTML = a.textContent.trim().split(/\s+/).map(function (w) { return '<span class="oh-line"><span>' + w + '</span></span>'; }).join(' ');
    b.innerHTML = '<span class="oh-line"><span>' + b.innerHTML + '</span></span>';
    h1.classList.add('is-ready');
    gsap.from($$('.oh-line > span', h1), { yPercent: 108, duration: 0.9, ease: 'power3.out', stagger: 0.09, delay: 0.1, clearProps: 'transform' });
    gsap.from('.oh-eyebrow, .oh-hero-more > *', { opacity: 0, y: 16, duration: 0.7, ease: 'power2.out', stagger: 0.08, delay: 0.45, clearProps: 'transform,opacity' });
  }

  /* ---------- numbers count up to the exact strings ---------- */
  $$('[data-count]').forEach(function (el) { RI.countUp(el, { trigger: el.closest('.oh-numbers') }); });

  /* ---------- brackets close: once per photo ---------- */
  $$('[data-spread]').forEach(function (spread) {
    var clip = $('[data-spread-clip]', spread);
    var zoom = $('img', clip);
    var paths = $$('.oh-photo-brackets path', spread);
    var numeral = $('[data-numeral]', spread);
    var target = parseInt(numeral.textContent, 10);
    var n = { v: 0 };
    gsap.set(paths, { strokeDashoffset: 1 });
    gsap.set(clip, { clipPath: 'inset(10% 10% 10% 10%)' });
    gsap.set(zoom, { scale: 1.08 });
    numeral.textContent = '00';
    gsap.timeline({ scrollTrigger: { trigger: clip, start: 'top 78%', once: true } })
      .to(clip, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power3.out' }, 0)
      .to(zoom, { scale: 1, duration: 1.4, ease: 'power2.out' }, 0)
      .to(paths, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.12 }, 0.15)
      .to(n, { v: target, duration: 0.9, ease: 'power1.out', onUpdate: function () { numeral.textContent = String(Math.round(n.v)).padStart(2, '0'); } }, 0.15)
      .from($$('.oh-caption > *:not(.oh-numeral)', spread), { opacity: 0, y: 20, duration: 0.7, ease: 'power2.out', stagger: 0.06, clearProps: 'transform,opacity' }, 0.3);
  });

  /* ---------- parallax and the timeline, rebuilt across the 1024 breakpoint ---------- */
  var mm = gsap.matchMedia();
  function drift(amount) {
    var frames = $$('[data-drift], [data-spread-clip]');
    frames.forEach(function (frame) {
      frame.classList.add('is-drifting');
      gsap.fromTo($('img', frame), { yPercent: -amount }, {
        yPercent: amount, ease: 'none',
        scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
    return function () { frames.forEach(function (f) { f.classList.toggle('is-drifting', false); }); };
  }
  mm.add('(min-width: 1024px)', function () {
    var undo = drift(6.9); /* 8% of the frame on a 116% image */
    var years = $$('.oh-time-year');
    years.forEach(function (el) { el.classList.add('is-drawing'); });
    gsap.from('.oh-time-item', {
      '--draw': 0, duration: 0.5, ease: 'none', stagger: 0.22,
      scrollTrigger: { trigger: '.oh-time', start: 'top 80%', once: true },
    });
    return function () { undo(); years.forEach(function (el) { el.classList.toggle('is-drawing', false); }); };
  });
  mm.add('(max-width: 1023px)', function () {
    return drift(3.45); /* half the drift on small screens */
  });
})();
