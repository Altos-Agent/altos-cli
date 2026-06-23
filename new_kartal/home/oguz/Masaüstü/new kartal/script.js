(function () {
  'use strict';

  // ----- Element references ----------------------------------------------

  var body        = document.body;
  var toggle      = document.querySelector('.navbar__toggle');
  var menu        = document.getElementById('menu-overlay');
  var panel       = menu ? menu.querySelector('.menu__panel') : null;
  var closers     = menu ? menu.querySelectorAll('[data-menu-close]') : [];
  var stack       = menu ? menu.querySelector('[data-menu-stack]') : null;
  var projects    = menu ? menu.querySelectorAll('[data-menu-project]') : [];
  var dotsWrap    = menu ? menu.querySelector('[data-menu-dots]') : [];
  var dots        = dotsWrap ? dotsWrap.querySelectorAll('.menu__dot') : [];
  var titleEl     = menu ? menu.querySelector('[data-menu-title]') : null;
  var descEl      = menu ? menu.querySelector('[data-menu-desc]')  : null;

  // Map of dot id -> { title, desc }
  var metaById = {
    nitro:    { title: 'Nitro',         desc: 'Live systems and experimental product infrastructure' },
    scam:     { title: 'ScamSpotter',   desc: 'Brand and identity to raise awareness of online scams' },
    fruitful: { title: 'Fruitful',      desc: 'Founding designer building brand and product' },
    gemini:   { title: 'Gemini',        desc: 'The most general and capable AI models Google has ever built.' },
    wabi:     { title: 'Wabi',          desc: 'Crafting a product for a new era of personal software' }
  };

  // ----- Open / close ----------------------------------------------------

  function openMenu() {
    if (!menu || !toggle) return;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    body.classList.add('menu-open');
    window.setTimeout(function () {
      if (panel) panel.focus && panel.focus({ preventScroll: true });
    }, 60);
  }

  function closeMenu() {
    if (!menu || !toggle) return;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    body.classList.remove('menu-open');
    toggle.focus({ preventScroll: true });
  }

  function isOpen() {
    return menu && menu.classList.contains('is-open');
  }

  // ----- Project switching -----------------------------------------------

  function showProject(id) {
    if (!id || !metaById[id]) return;

    for (var i = 0; i < projects.length; i++) {
      var card = projects[i];
      var matches = card.getAttribute('data-project-id') === id;
      if (matches) {
        card.removeAttribute('hidden');
      } else {
        card.setAttribute('hidden', '');
      }
    }

    for (var j = 0; j < dots.length; j++) {
      var dot = dots[j];
      var active = dot.getAttribute('data-dot-id') === id;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (titleEl) titleEl.textContent = metaById[id].title;
    if (descEl)  descEl.textContent  = metaById[id].desc;
  }

  // ----- Event wiring ----------------------------------------------------

  if (toggle) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (isOpen()) closeMenu(); else openMenu();
    });
  }

  for (var c = 0; c < closers.length; c++) {
    closers[c].addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
    });
  }

  if (panel) {
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  for (var d = 0; d < dots.length; d++) {
    dots[d].addEventListener('click', function (e) {
      e.preventDefault();
      var id = this.getAttribute('data-dot-id');
      showProject(id);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (isOpen()) {
        e.preventDefault();
        closeMenu();
      }
    }
  });

  // Initialise meta text to the active dot on first paint
  (function initActive() {
    if (!dots.length) return;
    var initial = null;
    for (var i = 0; i < dots.length; i++) {
      if (dots[i].classList.contains('is-active')) { initial = dots[i]; break; }
    }
    if (initial) showProject(initial.getAttribute('data-dot-id'));
  })();

  // ============================================================
  // Drag-to-scroll for the project rail
  //   - mousedown + drag moves the scroll container horizontally
  //   - trackpad/touch native horizontal scroll still works
  //   - clicks on links still work; we only kick in after a drag
  // ============================================================

  function initDragScroll(el) {
    if (!el) return;
    var isDown = false;
    var startX = 0;
    var scrollStart = 0;
    var moved = 0;
    var DRAG_THRESHOLD = 4;     // px before we consider it a drag

    el.addEventListener('mousedown', function (e) {
      // Only the primary mouse button
      if (e.button !== 0) return;
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollStart = el.scrollLeft;
      moved = 0;
      el.classList.add('is-dragging');
    });

    el.addEventListener('mouseleave', function () {
      isDown = false;
      el.classList.remove('is-dragging');
    });

    el.addEventListener('mouseup', function () {
      isDown = false;
      el.classList.remove('is-dragging');
    });

    el.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      var x = e.pageX - el.offsetLeft;
      var walk = (x - startX) * 1.2;
      moved = Math.abs(walk);
      el.scrollLeft = scrollStart - walk;
    });

    // Convert vertical wheel into horizontal scroll for the rail
    el.addEventListener('wheel', function (e) {
      // If the user uses a real horizontal trackpad gesture, let it through
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    // Suppress click on links if we actually dragged
    el.addEventListener('click', function (e) {
      if (moved > DRAG_THRESHOLD) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  var rails = document.querySelectorAll('.rail__track');
  for (var r = 0; r < rails.length; r++) {
    initDragScroll(rails[r]);
    // Cursor affordance
    rails[r].style.cursor = 'grab';
    rails[r].addEventListener('mousedown', function () { this.style.cursor = 'grabbing'; });
    rails[r].addEventListener('mouseup',   function () { this.style.cursor = 'grab'; });
    rails[r].addEventListener('mouseleave',function () { this.style.cursor = 'grab'; });
  }

  // ============================================================
  // Archive parallax — columns drift at different speeds on scroll
  //   data-speed is a multiplier; positive = down, negative = up
  // ============================================================

  var archiveCols = document.querySelectorAll('[data-archive-col]');
  if (archiveCols.length > 0) {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduceMotion) {
      var ticking = false;

      function applyParallax() {
        var y = window.pageYOffset || document.documentElement.scrollTop;
        for (var i = 0; i < archiveCols.length; i++) {
          var col = archiveCols[i];
          var speed = parseFloat(col.getAttribute('data-speed')) || 0;
          col.style.transform = 'translate3d(0, ' + (y * speed).toFixed(2) + 'px, 0)';
        }
        ticking = false;
      }

      function onScroll() {
        if (!ticking) {
          window.requestAnimationFrame(applyParallax);
          ticking = true;
        }
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      applyParallax();
    }
  }
})();
