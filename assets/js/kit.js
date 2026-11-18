/* RI Workplace home demos: shared kit.
   Nav, mobile sheet, film dialog, contact form, reveal utility, motion bootstrap, demo switcher.
   Exposes window.RI for the per-demo scripts. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };

  var RI = (window.RI = { reduced: reduced, touch: touch, lenis: null, motion: hasGsap && !reduced });
  if (reduced) root.classList.add('reduced');
  if (hasGsap) window.gsap.registerPlugin(window.ScrollTrigger);

  /* ---------- motion bootstrap: Lenis wired to ScrollTrigger ---------- */
  var wantLenis = doc.body.dataset.lenis !== 'off';
  if (hasGsap && !reduced && !touch && wantLenis && typeof window.Lenis !== 'undefined') {
    var lenis = (RI.lenis = new window.Lenis({
      lerp: 0.11,
      anchors: { offset: -(parseInt(getComputedStyle(root).getPropertyValue('--nav-h'), 10) || 78) },
    }));
    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    window.gsap.ticker.lagSmoothing(0);
  }
  RI.scrollTo = function (target, opts) {
    if (RI.lenis) RI.lenis.scrollTo(target, opts || {});
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
    else if (target && target.scrollIntoView) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  RI.lock = function (on) {
    doc.body.classList.toggle('is-locked', on);
    if (RI.lenis) { if (on) RI.lenis.stop(); else RI.lenis.start(); }
  };

  /* ---------- reveal utility: one attribute, fade and 24px rise, once ---------- */
  RI.reveal = function (ctx) {
    if (!RI.motion) return;
    $$('[data-reveal]', ctx).forEach(function (el) {
      if (el.dataset.revealed) return;
      el.dataset.revealed = '1';
      var rise = el.dataset.reveal === 'fade' ? 0 : 24;
      window.gsap.from(el, {
        opacity: 0, y: rise, duration: 0.7, ease: 'power2.out',
        delay: parseFloat(el.dataset.revealDelay || 0),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: function () { window.gsap.set(el, { clearProps: 'transform,opacity' }); },
      });
    });
  };

  /* ---------- count-up that lands on the exact source string ---------- */
  RI.countUp = function (el, opts) {
    var final = el.textContent.trim();
    var m = final.match(/^(.*?)(\d+(?:\.\d+)?)(.*)$/);
    if (!RI.motion || !m) return;
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
    var state = { v: 0 };
    window.gsap.to(state, {
      v: parseFloat(m[2]), duration: (opts && opts.duration) || 1.4, ease: 'power2.out',
      scrollTrigger: { trigger: (opts && opts.trigger) || el, start: 'top 97%', once: true },
      onUpdate: function () { view.textContent = m[1] + state.v.toFixed(dec) + m[3]; },
      onComplete: function () { view.textContent = final; },
    });
  };

  /* ---------- desktop dropdowns ---------- */
  var dropItems = $$('.nav-item.has-drop');
  function closeDrops(except) {
    dropItems.forEach(function (item) {
      if (item === except) return;
      item.classList.remove('is-open');
      var b = $('.nav-caret', item);
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  dropItems.forEach(function (item) {
    var caret = $('.nav-caret', item);
    caret.addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      closeDrops(item);
      item.classList.remove('is-shut');
      item.classList.toggle('is-open', open);
      caret.setAttribute('aria-expanded', String(open));
    });
    item.addEventListener('mouseenter', function () { item.classList.remove('is-shut'); });
    item.addEventListener('focusin', function () { item.classList.remove('is-shut'); });
    item.addEventListener('focusout', function (e) {
      if (!item.contains(e.relatedTarget)) { item.classList.remove('is-open'); caret.setAttribute('aria-expanded', 'false'); }
    });
    item.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      item.classList.add('is-shut');
      item.classList.remove('is-open');
      caret.setAttribute('aria-expanded', 'false');
      $('.nav-link', item).focus();
    });
  });
  doc.addEventListener('click', function (e) { if (!e.target.closest('.nav-item.has-drop')) closeDrops(); });

  /* ---------- mobile sheet ---------- */
  var sheet = $('#sheet');
  var sheetOpener = $('[data-sheet-open]');
  function focusables(ctx) {
    return $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', ctx).filter(function (el) {
      return el.offsetParent !== null;
    });
  }
  function setSheet(open) {
    if (!sheet) return;
    sheet.hidden = !open;
    sheetOpener.setAttribute('aria-expanded', String(open));
    RI.lock(open);
    if (open) $('[data-sheet-close]', sheet).focus();
    else sheetOpener.focus();
  }
  if (sheet && sheetOpener) {
    sheetOpener.addEventListener('click', function () { setSheet(true); });
    $$('[data-sheet-close]', sheet).forEach(function (el) {
      el.addEventListener('click', function () { setSheet(false); });
    });
    $$('.sheet-caret', sheet).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sub = doc.getElementById(btn.getAttribute('aria-controls'));
        var open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        sub.hidden = !open;
      });
    });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setSheet(false); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(sheet);
      if (!f.length) return;
      if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    window.matchMedia('(min-width: 1200px)').addEventListener('change', function (e) {
      if (e.matches && !sheet.hidden) { sheet.hidden = true; sheetOpener.setAttribute('aria-expanded', 'false'); RI.lock(false); }
    });
  }

  /* ---------- film dialog: the embed loads only after play is pressed ---------- */
  var film = $('[data-film]');
  if (film && typeof film.showModal === 'function') {
    var stage = $('[data-film-stage]', film);
    var play = $('[data-film-play]', film);
    var opener = null;
    $$('[data-film-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        opener = btn;
        film.showModal();
        RI.lock(true);
        play.focus();
      });
    });
    play.addEventListener('click', function () {
      var frame = doc.createElement('iframe');
      frame.src = film.dataset.filmSrc;
      frame.title = film.dataset.filmTitle;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      play.hidden = true;
      stage.appendChild(frame);
      $('[data-film-close]', film).focus();
    });
    $('[data-film-close]', film).addEventListener('click', function () { film.close(); });
    film.addEventListener('click', function (e) { if (e.target === film) film.close(); });
    film.addEventListener('close', function () {
      var frame = $('iframe', stage);
      if (frame) frame.remove();
      play.hidden = false;
      RI.lock(false);
      if (opener) opener.focus();
    });
  } else {
    $$('[data-film-open]').forEach(function (btn) { btn.hidden = true; });
  }

  /* ---------- contact form ---------- */
  $$('[data-form]').forEach(function (form) {
    var status = $('[data-form-status]', form);
    var send = $('[data-form-send]', form);
    var sendLabel = send.textContent;
    var fields = $$('[required]', form);
    function check(field) {
      var ok;
      if (field.type === 'checkbox') ok = field.checked;
      else if (field.type === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(field.value.trim());
      else if (field.type === 'tel') ok = field.value.replace(/\D/g, '').length >= 7;
      else ok = field.value.trim() !== '';
      var err = doc.getElementById(field.getAttribute('aria-describedby'));
      field.setAttribute('aria-invalid', String(!ok));
      if (err) err.hidden = ok;
      return ok;
    }
    fields.forEach(function (field) {
      field.addEventListener('blur', function () { if (field.dataset.touched) check(field); });
      field.addEventListener('input', function () { field.dataset.touched = '1'; if (field.getAttribute('aria-invalid') === 'true') check(field); });
      field.addEventListener('change', function () { field.dataset.touched = '1'; check(field); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = fields.filter(function (f) { return !check(f); });
      status.textContent = '';
      if (bad.length) { bad[0].focus(); return; }
      if (form.elements._gotcha.value) { status.textContent = form.dataset.msgSuccess; return; }
      send.disabled = true;
      send.textContent = form.dataset.msgSending;
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          status.removeAttribute('data-demo-scaffold');
          status.textContent = form.dataset.msgSuccess;
        })
        .catch(function () {
          status.setAttribute('data-demo-scaffold', '');
          status.textContent = form.dataset.msgFailure;
        })
        .then(function () { send.disabled = false; send.textContent = sendLabel; });
    });
  });

  /* ---------- demo switcher: lift clear of the form while contact is in view ---------- */
  var switcher = $('[data-switcher]');
  var contact = $('#contact');
  if (switcher && contact && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      switcher.classList.toggle('is-lifted', entries[0].isIntersecting);
    }, { rootMargin: '0px 0px -10% 0px' }).observe(contact);
  }

  /* ---------- kick off ---------- */
  RI.reveal();
  if (hasGsap) {
    window.addEventListener('load', function () { window.ScrollTrigger.refresh(); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
  }
})();
