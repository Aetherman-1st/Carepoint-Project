(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canAnimate = typeof Element.prototype.animate === 'function' && !reducedMotion.matches;

  function initScroll() {
    const header = document.querySelector('.site-header');
    let progress = document.querySelector('.cp-scroll-progress');
    let frame = 0;

    if (!progress) {
      progress = document.createElement('div');
      progress.className = 'cp-scroll-progress';
      progress.setAttribute('aria-hidden', 'true');
      document.body.appendChild(progress);
    }

    function update() {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      document.documentElement.style.setProperty('--cp-scroll', String(Math.min(1, Math.max(0, ratio))));

      if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
    }

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
  }

  function initMarquee() {
    const marquee = document.querySelector('.cp-marquee');
    if (!marquee) return;

    function sync() {
      marquee.classList.toggle('is-paused', document.hidden);
    }

    document.addEventListener('visibilitychange', sync);
    sync();
  }

  function initFaq() {
    const items = document.querySelectorAll('details.faq-item');
    if (!items.length) return;

    items.forEach(function (details) {
      const summary = details.querySelector('summary');
      const panel = Array.from(details.children).find((child) => child.tagName !== 'SUMMARY');
      if (!summary || !panel) return;

      summary.addEventListener('click', function (event) {
        if (!canAnimate || details.dataset.cpAnimating === 'true') return;
        event.preventDefault();

        if (details.open) {
          details.dataset.cpAnimating = 'true';
          const height = panel.getBoundingClientRect().height;
          panel.style.overflow = 'hidden';
          const animation = panel.animate(
            [
              { height: height + 'px', opacity: 1 },
              { height: '0px', opacity: 0 }
            ],
            { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );

          animation.addEventListener('finish', function () {
            details.open = false;
            panel.style.height = '';
            panel.style.overflow = '';
            delete details.dataset.cpAnimating;
          });
          return;
        }

        details.dataset.cpAnimating = 'true';
        details.open = true;
        const height = panel.getBoundingClientRect().height;
        panel.style.overflow = 'hidden';
        panel.style.height = '0px';
        const animation = panel.animate(
          [
            { height: '0px', opacity: 0 },
            { height: height + 'px', opacity: 1 }
          ],
          { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );

        animation.addEventListener('finish', function () {
          panel.style.height = '';
          panel.style.overflow = '';
          delete details.dataset.cpAnimating;
        });
      });
    });
  }

  function initStats() {
    const root = document.getElementById('homeStats');
    if (!root) return;

    const clinicValue = document.getElementById('statClinics');
    const specialtyValue = document.getElementById('statSpecialties');

    function put(element, value) {
      if (!element) return;
      if (window.CarePointMotion) {
        window.CarePointMotion.countTo(element, value, { duration: 900 });
      } else {
        element.textContent = String(value);
      }
    }

    fetch('/api/clinics')
      .then(function (response) {
        if (!response.ok) throw new Error('Could not load clinic stats');
        return response.json();
      })
      .then(function (clinics) {
        const list = Array.isArray(clinics) ? clinics : [];
        const specialties = new Set(list.map((clinic) => clinic.specialty).filter(Boolean));
        root.classList.remove('cp-stats-loading');
        put(clinicValue, list.length);
        put(specialtyValue, specialties.size);
      })
      .catch(function () {
        root.classList.remove('cp-stats-loading');
        if (clinicValue) clinicValue.textContent = '—';
        if (specialtyValue) specialtyValue.textContent = '—';
      });
  }

  function initRevealZoom() {
    const elements = document.querySelectorAll('.cp-reveal-zoom');
    if (!elements.length || !('IntersectionObserver' in window) || !canAnimate) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' }
    );

    elements.forEach((element) => observer.observe(element));
  }

  function init() {
    initScroll();
    initMarquee();
    initFaq();
    initStats();
    initRevealZoom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
