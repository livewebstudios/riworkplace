/* Demo 2: THE WALKTHROUGH. Signature move: the floor walk, the only pinned section in the project.
   Supporting motion: ghost word parallax, tiles count up, cards lift on hover (CSS). */
(function () {
  'use strict';
  var RI = window.RI || {};
  var doc = document;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  /* =====================================================================
     The floor walk
     At 1024 and up with motion on: the section pins and vertical scroll moves the track sideways.
     Below 1024: a native swipe row with scroll-snap. The rail and the blue dot follow either one.
     Reduced motion: neither. CSS lays the seven rooms out as a grid.
     ===================================================================== */
  (function () {
    var walk = $('[data-walk]');
    if (!walk) return;
    var pin = $('[data-walk-pin]', walk);
    var scroller = $('[data-walk-scroller]', walk);
    var track = $('[data-walk-track]', walk);
    var cards = $$('[data-walk-card]', walk);
    var stops = $$('[data-walk-stop]', walk);
    var runner = $('[data-walk-runner]', walk);
    var fill = $('[data-walk-fill]', walk);
    var active = -1;
    var pinned = null; /* the ScrollTrigger while pinned mode is on */

    function setActive(i) {
      if (i === active) return;
      active = i;
      stops.forEach(function (b, n) { if (n === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (gsap && RI.motion) gsap.to(runner, { xPercent: i * 100, duration: 0.6, ease: 'power3.out', overwrite: true });
    }

    /* Sideways offset that centers card i, clamped to the ends of the track. */
    function offsetFor(i, max) {
      var c = cards[i];
      var x = c.offsetLeft + c.offsetWidth / 2 - window.innerWidth / 2;
      return Math.max(0, Math.min(max, x));
    }
    function nearest(x, max) {
      var best = 0, gap = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(offsetFor(i, max) - x);
        if (d < gap - 0.5) { gap = d; best = i; }
      });
      return best;
    }

    /* ---- native row: rail follows the scroll position ---- */
    function nativeMax() { return scroller.scrollWidth - scroller.clientWidth; }
    function onNativeScroll() {
      if (pinned) return;
      var max = nativeMax();
      var x = scroller.scrollLeft;
      setActive(nearest(x, max));
      if (gsap && RI.motion) gsap.set(fill, { scaleX: max > 0 ? x / max : 0 });
    }
    scroller.addEventListener('scroll', onNativeScroll, { passive: true });

    function goTo(i) {
      if (pinned) {
        var max = pinned.end - pinned.start;
        RI.scrollTo(pinned.start + offsetFor(i, max));
      } else {
        scroller.scrollTo({ left: offsetFor(i, nativeMax()), behavior: RI.reduced ? 'auto' : 'smooth' });
      }
    }
    stops.forEach(function (btn, i) {
      btn.addEventListener('click', function () { goTo(i); });
      /* Keyboard: tabbing to a stop brings its room into view. */
      btn.addEventListener('focus', function () { if (btn.matches(':focus-visible')) goTo(i); });
    });

    setActive(0);
    if (!gsap || !RI.motion) return;

    /* ---- pinned mode, rebuilt whenever the viewport crosses 1024 ---- */
    gsap.matchMedia().add('(min-width: 1024px)', function () {
      walk.classList.add('is-pinned');
      scroller.scrollLeft = 0;
      scroller.removeAttribute('tabindex');
      var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tween = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: walk,
          pin: pin,
          /* With Lenis the scroll runs on the main thread, so the pin can ride a transform: no jump and no
             layout shift when a fast wheel crosses the start. Touch screens scroll natively and keep the fixed pin. */
          pinType: RI.lenis ? 'transform' : 'fixed',
          start: function () { return 'top ' + ($('.head').offsetHeight) + 'px'; },
          end: function () { return '+=' + distance(); }, /* track width minus one viewport */
          scrub: true,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          /* The demo switcher steps out of the way while the walk holds the screen. */
          onToggle: function (self) { var sw = $('[data-switcher]'); if (sw) sw.classList.toggle('is-tucked', self.isActive); },
          onUpdate: function (self) {
            var max = self.end - self.start;
            setActive(nearest(self.progress * max, max));
            gsap.set(fill, { scaleX: self.progress });
          },
        },
      });
      pinned = tween.scrollTrigger;
      /* Photos drift inside their cards as they cross the screen. */
      cards.forEach(function (card) {
        gsap.fromTo($('img', card), { xPercent: -5.5 }, {
          xPercent: 5.5, ease: 'none',
          scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
      });
      return function () {
        pinned = null;
        var sw = $('[data-switcher]');
        if (sw) sw.classList.toggle('is-tucked', false);
        walk.classList.toggle('is-pinned', false);
        scroller.setAttribute('tabindex', '0');
        active = -1;
        setActive(0);
        gsap.set(fill, { scaleX: 0 });
      };
    });
  })();

  /* =====================================================================
     Recent work: native scroll with snap, plus drag and arrow buttons
     ===================================================================== */
  (function () {
    var row = $('[data-row]');
    if (!row) return;
    var arrows = $('[data-row-arrows]');
    var prev = $('[data-row-prev]');
    var next = $('[data-row-next]');
    var step = function () { var c = $('.wt-card', row); return c ? c.offsetWidth + 24 : 400; };
    function sync() {
      var max = row.scrollWidth - row.clientWidth;
      prev.disabled = row.scrollLeft <= 4;
      next.disabled = row.scrollLeft >= max - 4;
    }
    arrows.hidden = false;
    prev.addEventListener('click', function () { row.scrollBy({ left: -step(), behavior: RI.reduced ? 'auto' : 'smooth' }); });
    next.addEventListener('click', function () { row.scrollBy({ left: step(), behavior: RI.reduced ? 'auto' : 'smooth' }); });
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();

    /* Mouse drag. Touch and trackpads already scroll the row natively. */
    var down = false, moved = 0, startX = 0, startLeft = 0;
    row.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = 0; startX = e.clientX; startLeft = row.scrollLeft;
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) { row.classList.add('is-dragging'); row.scrollLeft = startLeft - dx; }
    });
    window.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      row.classList.toggle('is-dragging', false);
    });
    row.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
    row.addEventListener('dragstart', function (e) { e.preventDefault(); });
  })();

  /* =====================================================================
     One team, four steps: hover, focus or tap a node to show its step
     ===================================================================== */
  (function () {
    var stepper = $('[data-stepper]');
    if (!stepper) return;
    var steps = $$('[data-step]', stepper);
    function select(i, animate) {
      steps.forEach(function (st, n) {
        var on = n === i;
        var was = st.classList.contains('is-on');
        st.classList.toggle('is-on', on);
        $('[data-step-node]', st).setAttribute('aria-expanded', String(on));
        if (on && !was && animate && RI.motion) {
          gsap.fromTo($('[data-step-panel]', st).children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.05, clearProps: 'transform,opacity' });
        }
      });
    }
    stepper.classList.add('is-enhanced');
    steps.forEach(function (st, i) {
      var node = $('[data-step-node]', st);
      node.addEventListener('mouseenter', function () { select(i, true); });
      node.addEventListener('focus', function () { select(i, true); });
      node.addEventListener('click', function () { select(i, true); });
    });
    select(0, false);
  })();

  /* =====================================================================
     What clients say: one card, dots to switch, no autoplay
     ===================================================================== */
  (function () {
    var card = $('[data-quotes]');
    if (!card) return;
    var quotes = $$('[data-quote]', card);
    var dots = $('[data-quote-dots]', card);
    var buttons = quotes.map(function (q, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'wt-dot';
      b.setAttribute('aria-label', dots.dataset.wordQuote + ' ' + (i + 1));
      b.addEventListener('click', function () { show(i, true); });
      dots.appendChild(b);
      return b;
    });
    function show(i, animate) {
      quotes.forEach(function (q, n) { q.hidden = n !== i; });
      buttons.forEach(function (b, n) { if (n === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      if (animate && RI.motion) gsap.fromTo(quotes[i], { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out', clearProps: 'opacity' });
    }
    dots.hidden = false;
    show(0, false);
  })();

  if (!gsap || !RI.motion) return;

  /* ---------- hero: the photo rises over the ghost word and they slide against each other ---------- */
  (function () {
    var stage = $('[data-hero-stage]');
    if (!stage) return;
    gsap.from('.wt-eyebrow, .wt-h1, .wt-sub, .wt-actions, .wt-hero .link-film', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', stagger: 0.07, clearProps: 'transform,opacity' });
    gsap.from('[data-hero-photo]', { yPercent: 18, opacity: 0, duration: 1.1, ease: 'power3.out', delay: 0.25, clearProps: 'opacity' });
    gsap.to('[data-ghost]', { yPercent: 46, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('[data-hero-photo] img', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: true } });
  })();

  /* ---------- tiles count up ---------- */
  $$('[data-count]').forEach(function (el) { RI.countUp(el); });
})();
