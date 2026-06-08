(function () {
  'use strict';

  // Inject the pull-down hint pill at top-center
  const pill = document.createElement('div');
  pill.id = 'swipe-hint-pill';
  Object.assign(pill.style, {
    position: 'fixed',
    top: '6px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    background: '#6BE3A4',
    opacity: '0.5',
    zIndex: '9999',
    pointerEvents: 'none',
    animation: 'swipe-pill-pulse 2.4s ease-in-out infinite',
  });
  document.body.appendChild(pill);

  // Keyframe animation injected once
  const style = document.createElement('style');
  style.textContent = `
    @keyframes swipe-pill-pulse {
      0%, 100% { opacity: 0.25; transform: translateX(-50%) scaleX(1); }
      50%       { opacity: 0.65; transform: translateX(-50%) scaleX(1.18); }
    }
  `;
  document.head.appendChild(style);

  let startY = 0;
  let startX = 0;
  let startTime = 0;
  let tracking = false;

  document.addEventListener('touchstart', function (e) {
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    startTime = Date.now();
    // Only arm if at top of page and touch starts in the top 15% of the viewport
    tracking = window.scrollY === 0 && startY <= window.innerHeight * 0.15;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!tracking) return;

    const touch = e.touches[0];
    const dy = touch.clientY - startY;   // positive = downward
    const dx = Math.abs(touch.clientX - startX);
    const elapsed = Date.now() - startTime;

    // Must be fast (< 400ms), far enough (> 150px), and not diagonal
    if (dy < 150 || dx > 40 || elapsed > 400) return;

    tracking = false; // fire once per gesture

    // Slide current page down then navigate
    document.body.style.transition = 'transform 350ms ease-in';
    document.body.style.transform = 'translateY(100vh)';

    setTimeout(function () {
      window.location.href = 'landing.html';
    }, 400);
  }, { passive: true });
})();
