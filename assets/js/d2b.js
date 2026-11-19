/* CROSS SECTION (round 4): drawn to built. Ported from the WJG Architects kit (setD2b, tweenD2b, initD2b).
   One figure, two layers: the photo underneath, the drawing on top, clipped from the left by --d2b.
   0% = all drawing, 100% = all photo. Modes: drag, wipe, scrub, hover. data-d2b-mobile swaps the mode under 768px.
   The photo is the truth: no GSAP, or reduced motion, shows the photo. Drag still works under reduced motion
   (the visitor moves it, nothing moves on its own) and starts at 50 with no intro.
   Loaded on CROSS SECTION only, after kit.js and before cross-section.js. Exposes RI.d2b = { set, tween }. */
(function () {
  'use strict';
  var RI = window.RI || (window.RI = {});
  var doc = document;
  var gsap = window.gsap;
  var hasGsap = !!(gsap && window.ScrollTrigger);
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };

  /* Run cb once, the first time el is `amount` in view. */
  function onEnter(el, cb, amount) {
    if (!('IntersectionObserver' in window)) { cb(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); cb(e.target); }
      });
    }, { threshold: amount == null ? 0.2 : amount, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
  }

  /* --d2b drives the clip, --d2b-n (0 to 1) drives the tags. */
  function set(el, pct) {
    el.style.setProperty('--d2b', pct + '%');
    el.style.setProperty('--d2b-n', (Math.round(pct * 10) / 1000).toString());
  }

  function tween(el, from, to, dur, delay, ease) {
    if (!hasGsap) { set(el, to); return null; }
    var o = { v: from };
    return gsap.to(o, {
      v: to, duration: dur, delay: delay || 0, ease: ease || 'power2.inOut', overwrite: true,
      onStart: function () { set(el, from); },
      onUpdate: function () { set(el, o.v); }
    });
  }

  function init(el) {
    var mode = el.getAttribute('data-d2b');
    if (el.getAttribute('data-d2b-mobile') && window.matchMedia('(max-width: 767px)').matches) {
      mode = el.getAttribute('data-d2b-mobile');
    }
    if (!hasGsap) { set(el, 100); return; }
    if (reduced && mode !== 'drag') { set(el, 100); return; }
    el.classList.add('is-live');

    if (mode === 'wipe') {
      set(el, 0);
      onEnter(el, function () { tween(el, 0, 100, 1.4, 0.25); }, 0.35);

    } else if (mode === 'hover') {
      /* Rests on the photo. Plays drawing-to-photo once on enter, then shows
         the drawing again whenever the visitor hovers or focuses the host. */
      var host = el.closest('[data-d2b-host]') || el;
      var played = false;
      set(el, 0);
      onEnter(el, function () {
        var t = tween(el, 0, 100, 1.2, 0.2);
        if (t) { t.eventCallback('onComplete', function () { played = true; }); }
      }, 0.3);
      var now = function () { return parseFloat(el.style.getPropertyValue('--d2b')); };
      var show = function () { if (played) { tween(el, now(), 0, 0.55, 0, 'power2.out'); } };
      var hide = function () { if (played) { tween(el, now(), 100, 0.7, 0, 'power2.inOut'); } };
      if (window.matchMedia('(hover: hover)').matches) {
        host.addEventListener('mouseenter', show);
        host.addEventListener('mouseleave', hide);
      }
      host.addEventListener('focusin', show);
      host.addEventListener('focusout', hide);

    } else if (mode === 'scrub') {
      var o2 = { v: 0 };
      set(el, 0);
      gsap.to(o2, {
        v: 100, ease: 'none',
        onUpdate: function () { set(el, o2.v); },
        scrollTrigger: { trigger: el, start: 'top 75%', end: 'center 40%', scrub: 0.4 }
      });

    } else if (mode === 'drag') {
      var label = el.getAttribute('data-d2b-label') || 'Drawing to photo';
      var start = reduced ? 50 : 0;
      var range = doc.createElement('input');
      range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.value = String(start);
      range.className = 'd2b__range';
      range.setAttribute('aria-label', label);
      range.setAttribute('aria-valuetext', start + ' percent photo');
      var handle = doc.createElement('span');
      handle.className = 'd2b__handle';
      handle.setAttribute('aria-hidden', 'true');
      handle.innerHTML = '<svg class="ico" focusable="false"><use href="#i-move-horizontal"/></svg>';
      el.appendChild(range);
      el.appendChild(handle);
      el.classList.add('is-drag');
      var apply = function (v) {
        set(el, v);
        range.setAttribute('aria-valuetext', Math.round(v) + ' percent photo');
      };
      apply(start);
      var intro = null;
      range.addEventListener('input', function () {
        if (intro) { intro.kill(); intro = null; }
        apply(parseFloat(range.value));
      });
      if (!reduced) {
        onEnter(el, function () {
          if (range.value !== '0') return; /* the visitor got there first */
          var o3 = { v: 0 };
          intro = gsap.to(o3, { v: 50, duration: 1.3, delay: 0.25, ease: 'power2.inOut',
            onUpdate: function () { range.value = String(Math.round(o3.v)); apply(o3.v); },
            onComplete: function () { intro = null; } });
        }, 0.4);
      }
    }
  }

  RI.d2b = { set: set, tween: tween, onEnter: onEnter };
  $$('.d2b[data-d2b]').forEach(init);
})();
