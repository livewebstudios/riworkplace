/* MOVE-IN DAY (round 3). Uses window.RI from kit.js.
   The hero: seven stacked plates crossfaded by scroll, one GSAP timeline scrubbed across the pinned stage.
   Seven equal segments: shell, finishes (01 Dream), sofa and rug (02 Design), chairs (03 Build),
   tables and ottoman (03 Build holds), lanterns (04 Transform), the Scotts.
   Desktop pins for six more screens, under 1024 for 3.8. gsap.matchMedia kills and rebuilds across 1024.
   Reduced motion and no JS: no pin, no scrub, plate 6 with the H1, sub and buttons. */
(function () {
  'use strict';

  var RI = window.RI || {};
  var doc = document;
  var html = doc.documentElement;
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var gsap = window.gsap;
  var motion = Boolean(RI.motion && gsap && window.ScrollTrigger);

  /* The head script adds mi-motion before first paint unless reduced motion is set (or the phone is
     under 600px tall, too short to pin the stage). If the motion stack did not boot, fall back to the still hero. */
  if (!motion) html.classList.remove('mi-motion');
  var heroMotion = motion && html.classList.contains('mi-motion');

  /* ---------- late plates: plates 1 to 6 load after window load ---------- */
  function late() { html.classList.add('mi-late'); if (motion) window.ScrollTrigger.refresh(); }
  if (doc.readyState === 'complete') late();
  else window.addEventListener('load', late);

  /* =========================================================
     HERO
     ========================================================= */
  var hero = $('[data-hero]');
  var head = $('[data-head]');
  if (heroMotion && hero) {
    var stage = $('[data-stage]', hero);
    var platesWrap = $('[data-plates]', hero);
    var plates = $$('.mi-plate', hero);
    var glow = $('[data-glow]', hero);
    var copy = $('[data-copy]', hero);
    var actions = $('[data-actions]', hero);
    var caps = $$('[data-cap]', hero);
    var ticks = $$('[data-tick]', hero);
    var cue = $('[data-cue]', hero);
    var lastPlate = plates[plates.length - 1];
    var box = $('.mi-box', hero);
    var text = $('.mi-text', hero);
    // Under 1024 the stage is the photo box plus the words. On a short phone that can be taller than the
    // screen below the header: then the stage takes its full height and sticks with its bottom on the
    // bottom of the screen, so nothing is cut off while it is pinned.
    function fit() {
      stage.style.height = '';
      stage.style.top = '';
      var need = box.offsetHeight + text.offsetHeight;
      var navH = head ? head.offsetHeight : 0;
      if (need > window.innerHeight - navH) {
        stage.style.height = need + 'px';
        stage.style.top = (window.innerHeight - need) + 'px';
      }
    }
    // segment -> caption shown (segment 4 holds 03 Build)
    var capFor = [0, 1, 2, 3, 3, 4, 5];

    var layers = [platesWrap].concat(plates);
    function promote(on) { layers.forEach(function (el) { el.style.willChange = on ? (el === platesWrap ? 'transform' : 'opacity') : ''; }); }
    function setSolid(on) { if (head) head.classList.toggle('is-solid', on); }

    var mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 1024px)', mob: '(max-width: 1023.98px)' }, function (ctx) {
      var desk = ctx.conditions.desk;
      if (!desk) { fit(); window.ScrollTrigger.addEventListener('refreshInit', fit); }
      // start state
      gsap.set(plates, { opacity: 0 });
      gsap.set(plates[0], { opacity: 1 });
      gsap.set(caps, { autoAlpha: 0, y: 16 });
      gsap.set(caps[0], { y: 16 });
      gsap.set([copy, actions], { autoAlpha: 1, y: 0 });
      gsap.set(glow, { opacity: 0 });
      gsap.set(ticks.slice(1), { scaleX: 0 });
      lastPlate.setAttribute('aria-hidden', 'true');

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero,
          start: function () { return 'top ' + (parseFloat(getComputedStyle(stage).top) || 0); },
          end: 'bottom bottom',
          scrub: 0.8,
          invalidateOnRefresh: true,
          onToggle: function (self) { promote(self.isActive); },
          onLeave: function () { if (desk) setSolid(true); },
          onEnterBack: function () { if (desk) setSolid(false); },
          onUpdate: function (self) {
            // the plate with the Scotts carries the alt text once it is the one on screen
            var on = self.progress > 6.3 / 7;
            if (on !== (lastPlate.getAttribute('aria-hidden') !== 'true')) lastPlate.setAttribute('aria-hidden', on ? 'false' : 'true');
          },
        },
      });

      // slow push out across the whole pin
      tl.fromTo(platesWrap, { scale: 1.06 }, { scale: 1, duration: 7 }, 0);
      // scroll cue goes as soon as the scroll starts
      tl.to(cue, { autoAlpha: 0, duration: 0.2 }, 0);

      // segment 0: the shell. H1, sub and buttons leave over its second half, the first caption takes their place.
      tl.to([copy, actions], { autoAlpha: 0, y: -24, duration: 0.4, ease: 'power1.in' }, 0.4);
      tl.to(caps[0], { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.68);

      // segments 1 to 6: each plate fades in over its segment's first 60% (segment 1 takes the whole segment),
      // then the plate under it drops to 0, so only the visible plate and the next one are ever above 0.
      for (var k = 1; k < 7; k++) {
        var fade = k === 1 ? 1 : 0.6;
        tl.to(plates[k], { opacity: 1, duration: fade, ease: k === 1 ? 'power1.inOut' : 'power1.out' }, k);
        tl.set(plates[k - 1], { opacity: 0 }, k + fade);
        tl.to(ticks[k], { scaleX: 1, duration: 0.25, ease: 'power2.out' }, k);
        if (capFor[k] !== capFor[k - 1]) {
          tl.to(caps[capFor[k - 1]], { autoAlpha: 0, y: -16, duration: 0.2, ease: 'power1.in' }, k);
          tl.fromTo(caps[capFor[k]], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, k + 0.18);
        }
      }
      // segment 5: the lanterns come on
      tl.to(glow, { opacity: 0.35, duration: 0.6, ease: 'power2.out' }, 5);
      // segment 6: the plate with the Scotts has its own light; the glow hands over to it
      tl.to(glow, { opacity: 0, duration: 0.6 }, 6);
      // segment 6: buttons come back under the last caption
      tl.fromTo(actions, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', immediateRender: false }, 6.45);
      // hold the last frame a beat before the pin lets go
      tl.to({}, { duration: 0.15 }, 6.85);

      return function () {
        window.ScrollTrigger.removeEventListener('refreshInit', fit);
        stage.style.height = '';
        stage.style.top = '';
        promote(false);
        setSolid(false);
        lastPlate.removeAttribute('aria-hidden');
      };
    });
  }

  /* =========================================================
     SECTIONS
     ========================================================= */

  /* ---------- section headings: a bronze rule draws 0 to 48px, then the heading rises ---------- */
  if (motion) {
    $$('.mi-head, .mi-family-copy, .mi-show-copy, .mi-contact-copy').forEach(function (box) {
      var rule = $('.mi-rule', box);
      var h = $('.mi-h2', box);
      if (!rule || !h) return;
      var rest = $$(':scope > p, :scope > .mi-lead', box);
      var tl = gsap.timeline({ scrollTrigger: { trigger: box, start: 'top 85%', once: true } });
      tl.from(rule, { scaleX: 0, duration: 0.5, ease: 'power2.inOut' })
        .from(h, { y: 20, opacity: 0, duration: 0.7, ease: 'power2.out', clearProps: 'transform,opacity' }, '-=0.15');
      if (rest.length) tl.from(rest, { y: 20, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out', clearProps: 'transform,opacity' }, '-=0.45');
    });

    /* ---------- photos: clip-path reveal from the bottom, once ---------- */
    $$('[data-clip], .mi-ind-photo, .mi-show-photo').forEach(function (el) {
      gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: function () { gsap.set(el, { clearProps: 'clipPath' }); },
      });
    });

    /* ---------- numbers count up, once, landing on the deck strings ---------- */
    $$('[data-count]').forEach(function (el) { RI.countUp(el, { trigger: $('.mi-stats') }); });

    /* ---------- the Scotts: portrait cards rise 24px, 90ms apart ---------- */
    var people = $$('[data-person]');
    if (people.length) {
      gsap.from(people, {
        y: 24, opacity: 0, duration: 0.7, stagger: 0.09, ease: 'power2.out',
        scrollTrigger: { trigger: people[0], start: 'top 88%', once: true },
        clearProps: 'transform,opacity',
      });
    }

    /* ---------- steps: the four columns rise in order ---------- */
    var steps = $$('[data-step]');
    if (steps.length) {
      gsap.from(steps, {
        y: 20, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out',
        scrollTrigger: { trigger: steps[0], start: 'top 88%', once: true },
        clearProps: 'transform,opacity',
      });
    }
  }

  /* ---------- recent work: one large, two stacked, NEXT rotates through all six ---------- */
  var work = $('[data-work]');
  var next = $('[data-work-next]');
  if (work && next) {
    var projs = $$('[data-proj]', work);
    var status = $('[data-work-status]');
    var at = 0;
    function place() {
      projs.forEach(function (p) { p.removeAttribute('data-pos'); });
      for (var i = 0; i < 3; i++) projs[(at + i) % projs.length].setAttribute('data-pos', String(i));
    }
    work.classList.add('is-live');
    next.hidden = false;
    place();
    var busy = false;
    next.addEventListener('click', function () {
      if (busy) return;
      at = (at + 1) % projs.length;
      if (status) status.textContent = projs[at].querySelector('.mi-proj-name').textContent + ', ' + (at + 1) + ' ' + status.dataset.labelOf + ' ' + projs.length;
      if (!motion) { place(); return; }
      busy = true;
      var shown = $$('[data-pos]', work);
      gsap.to(shown, {
        opacity: 0, x: -12, duration: 0.25, ease: 'power1.in', stagger: 0.04,
        onComplete: function () {
          place();
          var fresh = $$('[data-pos]', work);
          gsap.fromTo(fresh, { opacity: 0, x: 12 }, {
            opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', stagger: 0.06, clearProps: 'transform,opacity',
            onComplete: function () { busy = false; window.ScrollTrigger.refresh(); },
          });
        },
      });
    });
  }

  /* ---------- quotes: one at a time, prev and next ---------- */
  var quotes = $('[data-quotes]');
  if (quotes) {
    var items = $$('[data-quote]', quotes);
    var nav = $('[data-quote-nav]', quotes);
    var count = $('[data-quote-count]', quotes);
    var qStatus = $('[data-quote-status]', quotes);
    var q = 0;
    if (items.length > 1 && nav) {
      quotes.classList.add('is-live');
      nav.hidden = false;
      var show = function (i, announce) {
        q = (i + items.length) % items.length;
        items.forEach(function (el, n) { el.classList.toggle('is-on', n === q); el.setAttribute('aria-hidden', String(n !== q)); });
        count.textContent = (q + 1) + ' / ' + items.length;
        if (announce) qStatus.textContent = qStatus.dataset.labelQuote + ' ' + (q + 1) + ' ' + qStatus.dataset.labelOf + ' ' + items.length;
      };
      show(0, false);
      $('[data-quote-prev]', quotes).addEventListener('click', function () { show(q - 1, true); });
      $('[data-quote-next]', quotes).addEventListener('click', function () { show(q + 1, true); });
    }
  }

  /* ---------- logos: slow marquee, about 40s a loop, pauses on hover and focus ---------- */
  var marquee = $('[data-marquee]');
  if (marquee && motion) {
    var track = $('[data-marquee-track]', marquee);
    $$('li', track).forEach(function (li) {
      var c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      $$('img', c).forEach(function (img) { img.alt = ''; });
      track.appendChild(c);
    });
    marquee.classList.add('is-live');
  }
})();
