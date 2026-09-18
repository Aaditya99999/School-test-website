/* ------------------------------------------------------------
   Trident Public School — interactions
   1. Hero slider (auto-advance, arrows, dots)
   2. Mobile nav + accordion submenus
   3. Podium rise + scroll reveal
   4. Newsletter form feedback
   ------------------------------------------------------------ */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. HERO SLIDER ---------- */
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var dots   = [].slice.call(document.querySelectorAll('.dot'));
  var index  = 0;
  var timer  = null;
  var DELAY  = 5500;

  function goTo(n) {
    if (!slides.length) return;
    index = (n + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
    dots.forEach(function (d, i) {
      d.classList.toggle('is-active', i === index);
      d.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  function start() {
    if (reduceMotion || slides.length < 2) return;
    stop();
    timer = setInterval(function () { goTo(index + 1); }, DELAY);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  // Any manual interaction restarts the clock, so the slide
  // the visitor just picked gets a full turn on screen.
  function jump(n) { goTo(n); start(); }

  dots.forEach(function (d) {
    d.addEventListener('click', function () { jump(parseInt(d.dataset.go, 10)); });
  });

  var prev = document.querySelector('.hero-prev');
  var next = document.querySelector('.hero-next');
  if (prev) prev.addEventListener('click', function () { jump(index - 1); });
  if (next) next.addEventListener('click', function () { jump(index + 1); });

  var hero = document.querySelector('.hero');
  if (hero) {
    hero.addEventListener('mouseenter', stop);
    hero.addEventListener('mouseleave', start);

    hero.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  jump(index - 1);
      if (e.key === 'ArrowRight') jump(index + 1);
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  start();

  /* ---------- 2. MOBILE NAV ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav    = document.getElementById('mainnav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Dropdown buttons: hover opens them on desktop (CSS), tap opens
  // them on narrow screens, where there is no hover to rely on.
  [].forEach.call(document.querySelectorAll('.has-sub > button'), function (btn) {
    btn.addEventListener('click', function (e) {
      if (window.innerWidth > 980) return;
      e.preventDefault();
      var parent = btn.parentElement;
      var open = parent.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  // Close any open dropdown when focus or a click leaves the nav.
  document.addEventListener('click', function (e) {
    if (nav && !nav.contains(e.target) && !(toggle && toggle.contains(e.target))) {
      [].forEach.call(nav.querySelectorAll('.has-sub.is-open'), function (p) {
        p.classList.remove('is-open');
        p.querySelector('button').setAttribute('aria-expanded', 'false');
      });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !nav) return;
    nav.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    [].forEach.call(nav.querySelectorAll('.has-sub.is-open'), function (p) {
      p.classList.remove('is-open');
      p.querySelector('button').setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- 3. PODIUM RISE ---------- */
  // Blocks grow up from the floor the first time they are seen.
  var podium = document.querySelector('.podium');

  if (podium && !reduceMotion && 'IntersectionObserver' in window) {
    // Only collapse the blocks if they are off-screen right now. Otherwise
    // the podium is already being read, and animating it would just flicker.
    var box = podium.getBoundingClientRect();

    if (box.top > window.innerHeight) {
      podium.classList.add('will-rise');

      var revealed = false;
      var reveal = function () {
        if (revealed) return;
        revealed = true;
        podium.classList.add('is-in');
      };

      var podObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          reveal();
          podObserver.unobserve(entry.target);
        });
      }, { threshold: 0.25 });

      podObserver.observe(podium);

      // Safety net: never leave the blocks collapsed because an observer
      // did not fire (odd viewports, restored scroll positions, older bugs).
      setTimeout(reveal, 8000);
    }
  }

  /* ---------- 4. SCROLL REVEAL ---------- */
  // Each section's contents arrive the first time it is reached. Items in
  // the same row are staggered so the row lands as a wave, not all at once.
  // A plain string rises from below; { sel, dir } slides in sideways.
  var REVEAL_GROUPS = [
    // Section headings, so the copy arrives before the cards under it.
    '.results-head',
    '.branches-head',
    '.gallery-head',
    '.facilities > .wrap > .eyebrow, .facilities > .wrap > h2',
    '.academics-main > .eyebrow, .academics-main > h2',

    // Two-column blocks meet in the middle.
    { sel: '.about-img',        dir: 'l' },
    { sel: '.about-body',       dir: 'r' },
    { sel: '.principal-figure', dir: 'l' },
    { sel: '.principal-body',   dir: 'r' },

    // Card rows.
    '.feature-card .feat',
    '.acad-card',
    '.fac-card',
    '.branch-card',
    '.blog-card',
    '.gal-strip figure',
    '.results-stats > div',

    // Closing bands.
    '.adm-inner > *',
    '.footer-grid > *'
  ];

  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-shown');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    REVEAL_GROUPS.forEach(function (group) {
      var selector = typeof group === 'string' ? group : group.sel;
      var dir      = typeof group === 'string' ? null   : group.dir;
      var items    = [].slice.call(document.querySelectorAll(selector));

      items.forEach(function (el, i) {
        // Leave anything already on screen alone — collapsing it now
        // would make visible content jump on load.
        if (el.getBoundingClientRect().top < window.innerHeight) return;

        // Nested targets would fade twice, once with their parent and
        // once on their own, which reads as a stutter.
        if (el.closest('.reveal')) return;

        el.style.setProperty('--d', (i % 4) * 90 + 'ms');
        el.classList.add('reveal');
        if (dir) el.classList.add('reveal-' + dir);
        revealObserver.observe(el);
      });
    });

    // Safety net: never leave a card stuck invisible because an observer
    // did not fire (odd viewports, restored scroll positions, older bugs).
    setTimeout(function () {
      [].forEach.call(document.querySelectorAll('.reveal:not(.is-shown)'), function (el) {
        el.classList.add('is-shown');
      });
    }, 8000);
  }

  /* ---------- 5. NEWSLETTER ---------- */
  var form = document.querySelector('.news-form');
  var msg  = document.querySelector('.news-msg');

  if (form && msg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var value = input.value.trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        msg.textContent = 'Enter a valid email address to subscribe.';
        input.focus();
        return;
      }

      // No backend yet — wire this to the school's mailing list.
      msg.textContent = 'Thank you. You are subscribed to school updates.';
      form.reset();
    });
  }
})();
