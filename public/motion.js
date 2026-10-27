(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const supportsAnimation = typeof Element.prototype.animate === 'function';
  const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const revealSelector = '[data-reveal]';
  let revealObserver = null;

  function canAnimate() {
    return !reducedMotion.matches && supportsAnimation;
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function playReveal(element, delay) {
    if (!canAnimate()) return;

    element.animate(
      [
        { opacity: 0, transform: 'translate3d(0, 16px, 0)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' }
      ],
      {
        duration: 560,
        delay: delay || 0,
        easing: EASING,
        fill: 'both'
      }
    );
  }

  function revealIndex(element) {
    const group = element.closest('[data-reveal-stagger]');
    if (!group) return 0;

    const items = Array.from(group.querySelectorAll(revealSelector));
    return Math.max(0, items.indexOf(element)) * 55;
  }

  function observeReveal(element) {
    if (element.dataset.cpRevealBound === 'true') return;
    element.dataset.cpRevealBound = 'true';

    if (!canAnimate() || !revealObserver) return;

    const rect = element.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.94) return;

    revealObserver.observe(element);
  }

  function refresh(root) {
    const scope = root || document;
    const elements = [];

    if (scope.matches && scope.matches(revealSelector)) elements.push(scope);
    if (scope.querySelectorAll) elements.push.apply(elements, scope.querySelectorAll(revealSelector));

    elements.forEach(observeReveal);
  }

  function initRevealObserver() {
    if (!canAnimate() || !('IntersectionObserver' in window)) return;

    revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          playReveal(entry.target, revealIndex(entry.target));
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' }
    );
  }

  function countTo(element, value, options) {
    if (!element) return;

    const target = Number(value) || 0;
    const settings = options || {};
    const duration = settings.duration || 560;
    const current = Number(element.dataset.countValue || 0);

    element.dataset.countValue = String(target);

    if (!canAnimate()) {
      element.textContent = String(target);
      return;
    }

    if (element._cpCountFrame) cancelAnimationFrame(element._cpCountFrame);

    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const next = Math.round(current + (target - current) * easeOutCubic(progress));
      element.textContent = String(next);

      if (progress < 1) {
        element._cpCountFrame = requestAnimationFrame(tick);
      } else {
        element.textContent = String(target);
        element._cpCountFrame = null;
      }
    }

    element._cpCountFrame = requestAnimationFrame(tick);
  }

  function initCounters(root) {
    const scope = root || document;
    const counters = [];

    if (scope.matches && scope.matches('[data-count-to]')) counters.push(scope);
    if (scope.querySelectorAll) counters.push.apply(counters, scope.querySelectorAll('[data-count-to]'));

    counters.forEach(function (counter) {
      if (counter.dataset.cpCountBound === 'true') return;
      counter.dataset.cpCountBound = 'true';
      countTo(counter, counter.dataset.countTo);
    });
  }

  function initRipple() {
    document.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !canAnimate()) return;

      const host = event.target.closest(
        '.btn, .clinic-book-btn, .clinics-contact-btn, .chip, .home-link-card, .admin-nav button'
      );

      if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') return;

      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const ripple = document.createElement('span');
      ripple.className = 'cp-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.width = size + 'px';
      ripple.style.height = size + 'px';
      ripple.style.left = event.clientX - rect.left - size / 2 + 'px';
      ripple.style.top = event.clientY - rect.top - size / 2 + 'px';

      host.classList.add('cp-ripple-host');
      host.appendChild(ripple);
      ripple.addEventListener('animationend', function () {
        ripple.remove();
      });
    });
  }

  function initPageTransitions() {
    document.documentElement.classList.add('cp-page-ready');

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!canAnimate()) return;

      const link = event.target.closest('a[href]');
      if (!link) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download') || link.hasAttribute('data-no-transition')) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      document.documentElement.classList.add('cp-is-leaving');

      window.setTimeout(function () {
        window.location.href = url.href;
      }, 170);
    });

    window.addEventListener('pageshow', function () {
      document.documentElement.classList.remove('cp-is-leaving');
    });
  }

  function boot() {
    initRevealObserver();
    initRipple();
    initPageTransitions();
    refresh(document);
    initCounters(document);
  }

  window.CarePointMotion = {
    refresh: refresh,
    countTo: countTo,
    initCounters: initCounters,
    reducedMotion: reducedMotion
  };

  reducedMotion.addEventListener('change', function () {
    if (reducedMotion.matches) {
      document.querySelectorAll('[data-reveal]').forEach(function (element) {
        element.style.opacity = '';
        element.style.transform = '';
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
