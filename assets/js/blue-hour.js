/* BLUE HOUR (round 2). Uses window.RI from kit.js.
   Signature: lights on. Every RI photo starts at dusk and comes up to full light as it reaches you.
   Without JavaScript, or under reduced motion, every photo is already lit (the CSS default),
   every section is visible, the quotes are all shown and the logos sit in a static grid. */
(function () {
  'use strict';

  var doc = document;
  var RI = window.RI || {};
  var gsap = window.gsap;
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var motion = Boolean(RI.motion && gsap);
  if (motion) doc.documentElement.classList.add('bh-motion');

  /* ---------- recent work: arrows, mouse drag, snap ---------- */
  var row = $('[data-work-row]');
  if (row) {
    var arrows = $('[data-work-arrows]');
    var prev = $('[data-work-prev]');
    var next = $('[data-work-next]');
    var stepSize = function () {
      var cards = $$('[data-card]', row);
      if (cards.length < 2) return row.clientWidth;
      return cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left;
    };
    var sync = function () {
      var max = row.scrollWidth - row.clientWidth;
      arrows.hidden = max < 4;
      prev.disabled = row.scrollLeft <= 4;
      next.disabled = row.scrollLeft >= max - 4;
    };
    prev.addEventListener('click', function () { row.scrollBy({ left: -stepSize(), behavior: RI.reduced ? 'auto' : 'smooth' }); });
    next.addEventListener('click', function () { row.scrollBy({ left: stepSize(), behavior: RI.reduced ? 'auto' : 'smooth' }); });
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();

    // Mouse drag. Touch and trackpads scroll the row natively; the keyboard scrolls it once it has focus.
    var drag = null;
    var moved = false;
    row.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: row.scrollLeft, id: e.pointerId };
      moved = false;
    });
    row.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        row.classList.add('is-dragging');
        row.setPointerCapture(drag.id);
      }
      if (moved) row.scrollLeft = drag.left - dx;
    });
    var endDrag = function () {
      if (!drag) return;
      if (moved) {
        // Hand back to scroll snap, which settles on the nearest card.
        var left = row.scrollLeft;
        row.classList.remove('is-dragging');
        row.scrollLeft = left;
      }
      drag = null;
    };
    row.addEventListener('pointerup', endDrag);
    row.addEventListener('pointercancel', endDrag);
    row.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    row.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---------- industries: hover or focus swaps the photo and the badge ---------- */
  var items = $$('[data-ind-item]');
  var panes = $$('[data-ind-pane]');
  var badge = $('[data-ind-badge]');
  var current = 0;
  function showIndustry(i) {
    if (i === current) return;
    current = i;
    items.forEach(function (el, n) { el.classList.toggle('is-on', n === i); });
    var pane = panes.filter(function (p) { return +p.dataset.indPane === i; })[0];
    if (pane) panes.forEach(function (p) { p.classList.toggle('is-on', p === pane); }); // Educational has no photo: the last one stays
    var label = items[i].dataset.indLabel;
    if (motion) {
      gsap.killTweensOf(badge);
      gsap.to(badge, {
        y: -12, opacity: 0, duration: 0.18, ease: 'power1.in',
        onComplete: function () { badge.textContent = label; gsap.fromTo(badge, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }); },
      });
    } else {
      badge.textContent = label;
    }
  }
  items.forEach(function (el, n) {
    el.addEventListener('mouseenter', function () { showIndustry(n); });
    el.addEventListener('focus', function () { showIndustry(n); });
  });

  /* ---------- quotes: one at a time, crossfade with a slide, no autoplay ---------- */
  var quotes = $$('[data-quote]');
  var qNav = $('[data-quote-nav]');
  if (quotes.length > 1 && qNav) {
    var qStatus = $('[data-quote-status]');
    var q = 0;
    qNav.hidden = false;
    var go = function (dir) {
      var from = quotes[q];
      q = (q + dir + quotes.length) % quotes.length;
      var to = quotes[q];
      qStatus.textContent = qStatus.dataset.labelQuote + ' ' + (q + 1) + ' ' + qStatus.dataset.labelOf + ' ' + quotes.length;
      from.classList.remove('is-on');
      to.classList.add('is-on');
      if (!motion) return;
      gsap.killTweensOf([from, to]);
      from.classList.add('is-leaving');
      gsap.fromTo(from, { opacity: 1, x: 0 }, { opacity: 0, x: -16 * dir, duration: 0.5, ease: 'power2.inOut', onComplete: function () { from.classList.remove('is-leaving'); gsap.set(from, { clearProps: 'opacity,transform' }); } });
      gsap.fromTo(to, { opacity: 0, x: 16 * dir }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out', clearProps: 'opacity,transform' });
    };
    $('[data-quote-prev]').addEventListener('click', function () { go(-1); });
    $('[data-quote-next]').addEventListener('click', function () { go(1); });
  }

  /* ---------- trusted by: a slow marquee that pauses on hover and focus ---------- */
  var marquee = $('[data-marquee]');
  if (marquee && motion) {
    var track = $('[data-marquee-track]', marquee);
    $$('li', track).forEach(function (li) {
      var copy = li.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      $$('img', copy).forEach(function (img) { img.alt = ''; });
      track.appendChild(copy);
    });
    marquee.classList.add('is-running');
    var loop = gsap.to(track, { xPercent: -50, ease: 'none', duration: 40, repeat: -1, paused: true });
    var hold = false;
    var inView = false;
    var sync2 = function () { if (inView && !hold) loop.play(); else loop.pause(); };
    marquee.addEventListener('mouseenter', function () { hold = true; sync2(); });
    marquee.addEventListener('mouseleave', function () { hold = false; sync2(); });
    marquee.addEventListener('focusin', function () { hold = true; sync2(); });
    marquee.addEventListener('focusout', function () { hold = false; sync2(); });
    window.ScrollTrigger.create({ trigger: marquee, start: 'top bottom', end: 'bottom top', onToggle: function (self) { inView = self.isActive; sync2(); } });
  }

  if (!motion) return;
  var ST = window.ScrollTrigger;

  /* ---------- hero, on load: the lights come on ---------- */
  var hero = $('[data-hero]');
  var heroImg = $('.bh-hero-img', hero);
  var heroDusk = $('.bh-hero-card .bh-dusk', hero);
  var ghost = $('[data-ghost]', hero);
  var word = ghost.textContent.trim();
  ghost.textContent = '';
  word.split('').forEach(function (ch) {
    var s = doc.createElement('span');
    s.className = 'bh-ghost-l';
    s.textContent = ch;
    ghost.appendChild(s);
  });
  var letters = $$('.bh-ghost-l', ghost);
  var stats = $$('.bh-stat', hero);
  var lines = $$('[data-h1-line]', hero);

  // Count-ups that land on the exact deck strings. The real figure stays in the page for screen readers.
  var counts = $$('[data-count]', hero).map(function (el) {
    var final = el.textContent.trim();
    var m = final.match(/^(.*?)(\d+(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    var dec = (m[2].split('.')[1] || '').length;
    var view = doc.createElement('span');
    var keep = doc.createElement('span');
    view.setAttribute('aria-hidden', 'true');
    view.textContent = m[1] + (0).toFixed(dec) + m[3];
    keep.className = 'visually-hidden';
    keep.textContent = final;
    el.textContent = '';
    el.appendChild(view);
    el.appendChild(keep);
    return { view: view, final: final, pre: m[1], post: m[3], to: parseFloat(m[2]), dec: dec, v: 0 };
  }).filter(Boolean);

  gsap.set(heroDusk, { opacity: 0.88 });
  gsap.set(letters, { y: 40, opacity: 0 });
  gsap.set(stats, { x: 24, opacity: 0 });
  gsap.set(lines, { y: 28, opacity: 0 });

  var intro = function () {
    var tl = gsap.timeline({ delay: 0.2 });
    tl.to(heroDusk, { opacity: 0.1, duration: 1.6, ease: 'power2.out' }, 0);
    tl.to(letters, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.045, clearProps: 'transform,opacity' }, 0.1);
    tl.to(stats, { x: 0, opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.09, clearProps: 'transform,opacity' }, 0.45);
    counts.forEach(function (c, i) {
      tl.to(c, {
        v: c.to, duration: 1.3, ease: 'power2.out',
        onUpdate: function () { c.view.textContent = c.pre + c.v.toFixed(c.dec) + c.post; },
        onComplete: function () { c.view.textContent = c.final; },
      }, 0.5 + i * 0.09);
    });
    tl.to(lines, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12, clearProps: 'transform,opacity' }, 0.95);
  };
  var started = false;
  var start = function () { if (!started) { started = true; intro(); } };
  if (heroImg.complete && heroImg.naturalWidth) (heroImg.decode ? heroImg.decode() : Promise.resolve()).then(start, start);
  else { heroImg.addEventListener('load', function () { (heroImg.decode ? heroImg.decode() : Promise.resolve()).then(start, start); }); heroImg.addEventListener('error', start); }
  setTimeout(start, 2500); // never leave the hero dark

  /* ---------- scroll motion, rebuilt across the 1024 breakpoint ---------- */
  var mm = gsap.matchMedia();
  mm.add({ desk: '(min-width: 1024px)', small: '(max-width: 1023px)' }, function (ctx) {
    var desk = ctx.conditions.desk;
    var cleanups = [];

    // Hero, on scroll out: the photo drifts down inside its frame, the giant word drifts up and fades.
    gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .fromTo(heroImg, { yPercent: 0 }, { yPercent: 9, ease: 'none' }, 0)
      .fromTo(ghost, { yPercent: 0, opacity: 0.86 }, { yPercent: -18, opacity: 0.25, ease: 'none' }, 0);

    // Lights on, room by room: one scrubbed timeline per photo.
    $$('.bh-photo').forEach(function (frame) {
      if (frame.closest('[data-hero]')) return;
      var dusk = $(':scope > .bh-dusk', frame);
      var media = $$(':scope > img, :scope > .bh-ind-pane', frame);
      var drift = frame.hasAttribute('data-drift');
      var vh = window.innerHeight;
      var h = frame.offsetHeight;
      if (!drift) {
        gsap.timeline({ scrollTrigger: { trigger: frame, start: 'top 92%', end: 'center 60%', scrub: 0.6 } })
          .fromTo(dusk, { opacity: 0.7 }, { opacity: 0.06, ease: 'none' }, 0)
          .fromTo(media, { scale: 1.08 }, { scale: 1, ease: 'none' }, 0);
        return;
      }
      // Photos with inner parallax share the same timeline, so each photo still has one scrubbed animation.
      // The lights finish at "center 60%"; the drift runs until the photo leaves the screen.
      var lit = Math.min(1, (0.32 * vh + h / 2) / (0.92 * vh + h));
      gsap.timeline({ scrollTrigger: { trigger: frame, start: 'top 92%', end: 'bottom top', scrub: 0.6 } })
        .fromTo(media, { yPercent: -6 }, { yPercent: 6, ease: 'none', duration: 1 }, 0)
        .fromTo(dusk, { opacity: 0.7 }, { opacity: 0.06, ease: 'none', duration: lit }, 0)
        .fromTo(media, { scale: 1.08 }, { scale: 1, ease: 'none', duration: lit, immediateRender: false }, 0);
    });

    // Section headings: the sky rule draws to 40px, then the heading rises 24px. Once.
    $$('.bh-rule').forEach(function (rule) {
      var head = rule.nextElementSibling;
      gsap.timeline({ scrollTrigger: { trigger: rule, start: 'top 88%', toggleActions: 'play none none none' } })
        .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out' })
        .fromTo(head, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out', clearProps: 'transform,opacity' }, '-=0.15');
    });

    // Work row: cards rise in turn as the row enters.
    gsap.fromTo($$('[data-card]'), { y: 32, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.08, clearProps: 'transform,opacity',
      scrollTrigger: { trigger: row, start: 'top 85%', toggleActions: 'play none none none' },
    });

    // Featured KDLM: detail rows fade in one after another.
    gsap.fromTo($$('[data-fact]'), { opacity: 0, y: 12 }, {
      opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.15, clearProps: 'transform,opacity',
      scrollTrigger: { trigger: '.bh-facts', start: 'top 85%', toggleActions: 'play none none none' },
    });

    // Step tiles rise 90ms apart; each icon draws itself in as its tile enters, and again on hover.
    var tiles = $$('[data-tile]');
    tiles.forEach(function (tile, i) {
      var paths = $$('.bh-tile-icon path', tile);
      gsap.set(paths, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.timeline({ scrollTrigger: { trigger: tile, start: 'top 88%', toggleActions: 'play none none none' }, delay: desk ? i * 0.09 : 0 })
        .fromTo(tile, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power2.out', clearProps: 'transform,opacity' })
        .to(paths, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.15 }, 0.2);
      var redraw = function () {
        if (gsap.isTweening(paths[0])) return;
        gsap.fromTo(paths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut', stagger: 0.12 });
      };
      tile.addEventListener('mouseenter', redraw);
      tile.addEventListener('focusin', redraw);
      cleanups.push(function () { tile.removeEventListener('mouseenter', redraw); tile.removeEventListener('focusin', redraw); });
    });

    // Family: portraits rise; the timeline draws, and each dot pops as the line reaches it.
    gsap.fromTo($$('[data-person]'), { y: 32, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.1, clearProps: 'transform,opacity',
      scrollTrigger: { trigger: '.bh-people', start: 'top 85%', toggleActions: 'play none none none' },
    });
    var time = $('[data-time]');
    var line = $('[data-time-line]', time);
    var dots = $$('[data-time-dot]', time);
    var lineBox = line.getBoundingClientRect();
    var span = desk ? lineBox.width : lineBox.height;
    var draw = gsap.timeline({ scrollTrigger: { trigger: time, start: 'top 80%', toggleActions: 'play none none none' } });
    draw.fromTo(line, desk ? { scaleX: 0 } : { scaleY: 0 }, desk ? { scaleX: 1, duration: 1.6, ease: 'none' } : { scaleY: 1, duration: 1.6, ease: 'none' }, 0);
    dots.forEach(function (dot) {
      var b = dot.getBoundingClientRect();
      var at = desk ? (b.left + b.width / 2 - lineBox.left) / span : (b.top + b.height / 2 - lineBox.top) / span;
      draw.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(2.2)', clearProps: 'transform' }, Math.max(0, Math.min(1, at)) * 1.6);
    });

    return function () { cleanups.forEach(function (fn) { fn(); }); };
  });

  window.addEventListener('load', function () { ST.refresh(); });
})();
