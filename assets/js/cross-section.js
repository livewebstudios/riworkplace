/* Demo 3: CROSS SECTION. Signature move: the cut, four sliced rooms that shear against each other.
   Supporting motion: almost none. Count-up, table rows fade in once. Native scroll, no Lenis. */
(function () {
  'use strict';
  var RI = window.RI || {};
  var doc = document;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var gsap = window.gsap;

  /* ---------- project index: filter chips by sector ---------- */
  var rows = $$('[data-row]');
  var filters = $('[data-filters]');
  var chips = filters ? $$('[data-filter]', filters) : [];
  if (filters) {
    filters.hidden = false;
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var sector = chip.dataset.filter;
        chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
        rows.forEach(function (row) { row.hidden = sector !== '' && row.dataset.sector !== sector; });
        var first = rows.filter(function (r) { return !r.hidden; })[0];
        if (first) show(first);
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      });
    });
  }

  /* ---------- project index: hovering or focusing a row fills the fixed preview panel ---------- */
  var preview = $('[data-preview]');
  var view = preview ? $('img', preview) : null;
  var current = null;
  function show(row) {
    if (!view || row === current) return;
    var img = $('img', row);
    if (current) current.classList.toggle('is-current', false);
    current = row;
    row.classList.add('is-current');
    view.removeAttribute('sizes');
    if (img.getAttribute('srcset')) view.setAttribute('srcset', img.getAttribute('srcset')); else view.removeAttribute('srcset');
    view.setAttribute('sizes', '40vw');
    view.src = img.getAttribute('src');
    view.alt = img.alt;
    $('[data-preview-n]', preview).textContent = $('.cs-cell-no', row).textContent;
    $('[data-preview-name]', preview).textContent = $('.cs-cell-name', row).textContent;
    $('[data-preview-place]', preview).textContent = $('.cs-cell-place', row).textContent;
    if (RI.motion) gsap.fromTo(view, { opacity: 0.35 }, { opacity: 1, duration: 0.3, ease: 'power1.out', overwrite: true, clearProps: 'opacity' });
  }
  if (preview) {
    rows.forEach(function (row) {
      row.addEventListener('mouseenter', function () { show(row); });
      row.addEventListener('focusin', function () { show(row); });
    });
    if (rows[0]) { current = rows[0]; rows[0].classList.add('is-current'); }
    /* Warm the small previews once the table is near, so hovering feels instant. Desktop only. */
    var desktop = window.matchMedia('(min-width: 1024px)');
    if ('IntersectionObserver' in window) {
      var warm = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting || !desktop.matches) return;
        warm.disconnect();
        var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 400); };
        idle(function () {
          rows.forEach(function (row) {
            var img = $('img', row);
            var first = (img.getAttribute('srcset') || img.getAttribute('src')).split(',')[0].trim().split(' ')[0];
            var pre = new Image();
            pre.src = first;
          });
        });
      }, { rootMargin: '400px' });
      warm.observe(preview);
    }
  }

  /* ---------- the cut: below 768 a tap widens a slice, a second tap opens the project ---------- */
  var slices = $$('[data-slice]');
  var small = window.matchMedia('(max-width: 767px)');
  var onWide = null; /* set by the hero below: a widened slice also lifts to its photo */
  slices.forEach(function (slice) {
    $('.cs-slice-link', slice).addEventListener('click', function (e) {
      if (!small.matches || slice.classList.contains('is-wide')) return;
      e.preventDefault();
      slices.forEach(function (s) { s.classList.toggle('is-wide', s === slice); });
      if (onWide) onWide(slice);
    });
  });

  /* Round 4: the page script ran, so the failsafe in <head> stands down. Without GSAP the hero shows its photos. */
  RI.csHero = true;
  if (!RI.motion && !RI.reduced) doc.documentElement.classList.add('cs-static');
  if (!gsap || !RI.motion) return;

  /* ---------- the cut: unmask from the bottom on load, 110ms apart, layers settle from 1.15 ----------
     Round 4: the slices load as drawings (the photos sit fully clipped under them), so the intro plays on the drawings. */
  var photos = $$('[data-slice-photo]');
  var imgs = $$('[data-slice-layers] img');
  gsap.set(photos, { clipPath: 'inset(100% 0% 0% 0%)' });
  gsap.set(imgs, { scale: 1.15 });
  var intro = gsap.timeline({ delay: 0.15 });
  intro.to(photos, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.95, ease: 'power3.out', stagger: 0.11 }, 0)
    .from('.cs-slice-label', { opacity: 0, duration: 0.5, ease: 'power1.out', stagger: 0.11 }, 0.35)
    .from('.cs-eyebrow, .cs-h1, .cs-sub, .cs-actions, .cs-hero .link-film', { opacity: 0, duration: 0.6, ease: 'power1.out', stagger: 0.05, clearProps: 'opacity' }, 0);

  /* Construction lines draw once, on load, and end in their dots. */
  var lines = $$('.cs-lead path');
  var dots = $$('.cs-lead-dot');
  gsap.set(lines, { strokeDashoffset: 1 });
  gsap.set(dots, { scale: 0 });
  intro.to(lines, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut', stagger: 0.11 }, 0.7)
    .to(dots, { scale: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.11 }, 1.2);
  /* both layers of a slice settle together, slices 110ms apart */
  photos.forEach(function (p, i) { intro.to($$('img', p), { scale: 1, duration: 1.3, ease: 'power2.out' }, i * 0.11); });

  /* ---------- the section cut (round 4) ----------
     One cut, 20 degrees off vertical, crosses the whole strip of slices left to right; the photos build in behind it.
     One progress P (0 all drawings, 1 all photos). Each slice clips its photo where the line crosses that slice,
     measured in strip coordinates, so the line reads straight across the 2px gaps. */
  var strip = $('[data-cut]');
  var TAN = Math.tan(20 * Math.PI / 180);
  var items = slices.map(function (el) {
    return { el: el, frame: $('[data-slice-photo]', el), layers: $('[data-slice-layers]', el), has: el.classList.contains('has-drawn'), lift: 0, x: 0, w: 0, h: 0 };
  });
  var geo = { left: 0, W: 0, H: 0, lean: 0 };
  var P = 0;
  function measure() {
    var sr = strip.getBoundingClientRect();
    items.forEach(function (it) {
      var r = it.frame.getBoundingClientRect();
      it.x = r.left - sr.left; it.w = r.width; it.h = r.height;
    });
    var shown = items.filter(function (it) { return it.w > 0; });
    if (!shown.length) return;
    var last = shown[shown.length - 1];
    geo.left = shown[0].x;
    geo.W = last.x + last.w - geo.left;
    geo.H = shown[0].h;
    geo.lean = geo.H * TAN;
  }
  function render() {
    var xb = P * (geo.W + geo.lean) - geo.lean; /* where the line meets the strip's bottom edge */
    items.forEach(function (it) {
      if (!it.has || !it.w) return;
      var local = xb - (it.x - geo.left);
      /* a hovered or focused slice lifts its sheet: its own cut runs on past the right edge */
      var eff = local + it.lift * (Math.max(it.w, local) - local);
      /* the clip is drawn on the layer, which is 118% tall and drifts: map the frame's line into layer space */
      var hl = it.h * 1.18;
      var top = -0.09 * it.h + (gsap.getProperty(it.layers, 'yPercent') / 100) * hl;
      var st = it.el.style;
      st.setProperty('--x0', (eff + (it.h - top) * TAN).toFixed(1) + 'px');
      st.setProperty('--x1', (eff + (it.h - top - hl) * TAN).toFixed(1) + 'px');
      st.setProperty('--xb', eff.toFixed(1) + 'px');
      st.setProperty('--cut-o', eff > -geo.lean + 0.5 && eff < it.w - 0.5 ? '1' : '0');
    });
  }
  function refresh() { measure(); render(); }
  if ('ResizeObserver' in window) {
    /* the slices change width on hover (flex-grow) and on resize: re-measure, never animate layout */
    var queued = false;
    var ro = new ResizeObserver(function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () { queued = false; refresh(); });
    });
    items.forEach(function (it) { ro.observe(it.frame); });
  } else {
    window.addEventListener('resize', refresh);
  }
  var setP = function (v) { P = v; render(); };

  var navH = function () { return parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--nav-h')) || 60; };
  var run = $('[data-hero-run]');
  var hero = $('[data-hero]');
  var mm = gsap.matchMedia();
  /* 1024 and up, 640 tall and up: the sticky stage. The cut sweeps over the first 84% of the run, then holds. */
  mm.add('(min-width: 1024px) and (min-height: 640px)', function () {
    var s = { p: 0 };
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: run,
        start: function () { return 'top ' + navH() + 'px'; },
        end: function () { return '+=' + Math.max(1, run.offsetHeight - hero.offsetHeight); },
        scrub: 0.4, invalidateOnRefresh: true,
      },
    });
    tl.to(s, { p: 1, duration: 0.84, ease: 'none', onUpdate: function () { setP(s.p); } })
      .to({}, { duration: 0.16 });
    return function () { setP(0); };
  });
  /* Under 1024: no stage. The cut is scrubbed while the strip climbs, from its top at mid screen to the nav. */
  mm.add('(max-width: 1023px)', function () {
    var s = { p: 0 };
    var top = function () { return strip.getBoundingClientRect().top + window.scrollY; };
    var from = function () { return Math.max(24, top() - window.innerHeight * 0.5); };
    var to = function () { return Math.max(from() + 140, top() - navH()); };
    gsap.to(s, {
      p: 1, ease: 'none',
      onUpdate: function () { setP(s.p); },
      scrollTrigger: { start: from, end: to, scrub: 0.4, invalidateOnRefresh: true },
    });
    return function () { setP(0); };
  });
  /* Wide but short: no room for a stage. Draw, hold three seconds, build. */
  mm.add('(min-width: 1024px) and (max-height: 639px)', function () {
    var s = { p: 0 };
    gsap.to(s, { p: 1, duration: 1.6, delay: 3, ease: 'power2.inOut', onUpdate: function () { setP(s.p); } });
    return function () { setP(0); };
  });

  /* Hover or focus still widens a slice (CSS). While the sweep is unfinished it also lifts that sheet to its photo
     over 0.55s and lets it fall back to the sweep over 0.7s (WJG hover timings). */
  function liftTo(it, v) {
    if (!it.has || (v && P >= 1)) return;
    gsap.to(it, { lift: v, duration: v ? 0.55 : 0.7, ease: v ? 'power2.out' : 'power2.inOut', overwrite: true, onUpdate: render });
  }
  var canHover = window.matchMedia('(hover: hover)').matches;
  items.forEach(function (it) {
    if (canHover) {
      it.el.addEventListener('mouseenter', function () { liftTo(it, 1); });
      it.el.addEventListener('mouseleave', function () { liftTo(it, 0); });
    }
    it.el.addEventListener('focusin', function () { liftTo(it, 1); });
    it.el.addEventListener('focusout', function () { liftTo(it, 0); });
  });
  onWide = function (slice) { items.forEach(function (it) { liftTo(it, it.el === slice ? 1 : 0); }); };

  /* On scroll each slice drifts at its own rate, so the four rooms shear against each other.
     Round 4: the wrapper drifts (drawing and photo together) and the cut is redrawn so it stays put on the frame. */
  var rates = [6, 10, 14, 18]; /* percent of the frame height, total travel */
  items.forEach(function (it, i) {
    var half = (rates[i] / 2) / 1.18; /* the wrapper is 118% of its frame */
    gsap.fromTo(it.layers, { yPercent: -half }, {
      yPercent: half, ease: 'none',
      onUpdate: it.has ? render : null,
      scrollTrigger: { trigger: '.cs-cut', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
  refresh();

  /* ---------- numbers count up ---------- */
  $$('[data-count]').forEach(function (el) { RI.countUp(el, { duration: 1.1 }); });
})();
