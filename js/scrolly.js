/**
 * scrolly.js - Scrollama Integration for Step Tracking
 * Manages sticky container updates and activates corresponding chart states.
 */

(function () {
  'use strict';

  // Wait for DOM or run immediately if ready
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initScrolly);
  } else {
    initScrolly();
  }

  function initScrolly() {
    // Check if scrollama is available
    if (typeof scrollama !== 'function') {
      console.warn('Scrollama not loaded, relying on native IntersectionObserver.');
      setupNativeObserver();
      return;
    }

    const scroller = scrollama();

    scroller
      .setup({
        step: '.scrolly-steps .step',
        offset: 0.55,
        debug: false
      })
      .onStepEnter((response) => {
        // response = { element, index, direction }
        const stepIndex = response.index;
        
        // Update active class on steps
        document.querySelectorAll('.scrolly-steps .step').forEach((el, idx) => {
          if (idx === stepIndex) {
            el.classList.add('is-active');
            el.setAttribute('aria-current', 'step');
          } else {
            el.classList.remove('is-active');
            el.removeAttribute('aria-current');
          }
        });

        // Trigger sticky chart update
        if (window.StickyVisualizer && typeof window.StickyVisualizer.goToStep === 'function') {
          window.StickyVisualizer.goToStep(stepIndex);
        }
      });

    // Handle window resize
    window.addEventListener('resize', scroller.resize);
  }

  // Native IntersectionObserver fallback in case Scrollama script is delayed
  function setupNativeObserver() {
    const steps = document.querySelectorAll('.scrolly-steps .step');
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const stepIndex = parseInt(entry.target.getAttribute('data-step'), 10);
            steps.forEach((el, idx) => {
              el.classList.toggle('is-active', idx === stepIndex);
            });
            if (window.StickyVisualizer) {
              window.StickyVisualizer.goToStep(stepIndex);
            }
          }
        });
      },
      { threshold: 0.55 }
    );

    steps.forEach((step) => observer.observe(step));
  }
})();
