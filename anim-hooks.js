/* ================================================================
   George's Dashboard — anim-hooks.js
   Wires all dynamic animation classes. Add AFTER main page JS.
   ================================================================ */
(function () {
  'use strict';

  /* ── Util: force reflow so animation restarts cleanly ─────────── */
  function reflow(el) { void el.offsetWidth; }

  /* ── 1. WATER BUTTON RIPPLE (topbar) ─────────────────────────── */
  function bindRipple() {
    const btn = document.getElementById('topbarWaterAdd');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.classList.remove('ripple');
      reflow(btn);
      btn.classList.add('ripple');
      setTimeout(function () { btn.classList.remove('ripple'); }, 550);
    }, { passive: true });
  }

  /* ── 2. GOAL ROW CHECKBOX — pop + strikethrough ──────────────── */
  function bindCheckboxPop() {
    document.addEventListener('change', function (e) {
      const cb = e.target;
      if (!cb.matches('.gm-check')) return;
      const row = cb.closest('.gm-row');
      if (!row) return;

      cb.classList.remove('checked');
      reflow(cb);
      if (cb.checked) cb.classList.add('checked');
      row.classList.toggle('done', cb.checked);
    }, { passive: true });
  }

  /* ── 3. SUPPLEMENT CHECK — flash row + check block completion ── */
  function bindStackCheck() {
    document.addEventListener('click', function (e) {
      const check = e.target.closest('.stack-check');
      if (!check) return;
      const item = check.closest('.stack-item');
      if (!item) return;

      // Toggle done class for animation
      const isDone = item.classList.contains('done');
      check.classList.remove('checked');
      reflow(check);
      if (!isDone) check.classList.add('checked');
      item.classList.toggle('done', !isDone);

      // Green flash on the row (works even after DOM rebuild via overlay)
      flashSupplementRow(item);

      // Check if the whole time-block is now complete
      setTimeout(function () { checkBlockComplete(item); }, 80);
    }, { passive: true });
  }

  function flashSupplementRow(item) {
    item.classList.remove('gd-check-flash');
    reflow(item);
    item.classList.add('gd-check-flash');
    item.addEventListener('animationend', function h() {
      item.classList.remove('gd-check-flash');
      item.removeEventListener('animationend', h);
    });
  }

  function checkBlockComplete(anyItemInBlock) {
    // Re-query from fresh DOM (render() may have rebuilt it)
    const win = document.querySelector(
      '.stack-window:has(.stack-item.taken), .stack-window'
    );
    // Walk up using the original parent if still in DOM, else skip
    const block = anyItemInBlock.closest
      ? anyItemInBlock.closest('.stack-window')
      : null;

    const targetBlock = (block && document.body.contains(block))
      ? block
      : null;

    if (!targetBlock) return;

    const allItems = targetBlock.querySelectorAll('.stack-item');
    if (!allItems.length) return;
    const allTaken = Array.from(allItems).every(function (i) {
      return i.classList.contains('taken') || i.classList.contains('done');
    });

    if (allTaken) {
      const title = targetBlock.querySelector('.stack-window-title');
      if (!title) return;
      title.classList.remove('gd-celebrate');
      reflow(title);
      title.classList.add('gd-celebrate');
      title.addEventListener('animationend', function h() {
        title.classList.remove('gd-celebrate');
        title.removeEventListener('animationend', h);
      });
    }
  }

  /* ── 4. STREAK COUNTER — number roll ─────────────────────────── */
  function bindStreakBump() {
    const el = document.querySelector('.gm-streak-num');
    if (!el) return;
    let lastVal = el.textContent.trim();

    const obs = new MutationObserver(function () {
      const newVal = el.textContent.trim();
      if (newVal === lastVal) return;

      const oldVal = lastVal;
      lastVal = newVal;

      // Create ghost for old value that exits upward
      const ghost = document.createElement('span');
      ghost.className = 'gd-roll-ghost';
      ghost.textContent = oldVal;
      ghost.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;';

      // Wrap current text in an animated span
      const text = el.textContent;
      el.textContent = '';

      const current = document.createElement('span');
      current.className = 'gd-roll-current';
      current.textContent = text;

      el.appendChild(ghost);
      el.appendChild(current);

      // Clean up after animations finish
      ghost.addEventListener('animationend', function () {
        ghost.remove();
      }, { once: true });
      current.addEventListener('animationend', function () {
        // Unwrap: set text directly
        el.textContent = text;
      }, { once: true });
    });

    obs.observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ── 5. TAB ICON BOUNCE ON SWITCH ────────────────────────────── */
  function bindTabTransition() {
    document.addEventListener('click', function (e) {
      const tab = e.target.closest('.bottombar-tab');
      if (!tab) return;
      const icon = tab.querySelector('.bottombar-tab-icon');
      if (!icon) return;
      icon.style.animation = 'none';
      reflow(icon);
      icon.style.animation = '';
    }, { passive: true });
  }

  /* ── 6. PAGE CROSSFADE — fade out before navigating ─────────── */
  function bindPageTransition() {
    document.addEventListener('click', function (e) {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;
      // Skip external, hash, and mailto links
      if (href.startsWith('http') || href.startsWith('//') ||
          href.startsWith('#') || href.startsWith('mailto')) return;
      if (link.target === '_blank') return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;

      e.preventDefault();
      document.body.classList.add('gd-page-out');
      setTimeout(function () { window.location.href = href; }, 140);
    });
  }

  /* ── 7. GYM — Log Set ripple + new row slide-in ─────────────── */
  function bindLogBtnRipple() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('#wlLogBtn');
      if (!btn || btn.disabled) return;

      btn.classList.remove('gd-ripple');
      reflow(btn);
      btn.classList.add('gd-ripple');
      setTimeout(function () { btn.classList.remove('gd-ripple'); }, 480);

      // Animate the last set row after the render cycle completes
      setTimeout(function () {
        const list = document.getElementById('wlSetsList');
        if (!list) return;
        const rows = list.querySelectorAll('.wl-set-row');
        if (!rows.length) return;
        const last = rows[rows.length - 1];
        last.style.animation = 'none';
        reflow(last);
        last.style.animation =
          'gd-set-row-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both';
      }, 25);
    }, { passive: true });
  }

  /* ── 8. GYM — Workout complete celebration overlay ───────────── */
  function bindWorkoutCelebration() {
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('#wlDoneBtn');
      if (!btn || btn.disabled) return;
      // Wait a tick for the button's own handler to validate
      setTimeout(function () {
        // Only show if we have sets to complete (button wasn't blocked)
        const list = document.getElementById('wlSetsList');
        if (!list) return; // no sets panel = wrong page
        showWorkoutOverlay();
      }, 30);
    }, { passive: true });
  }

  function showWorkoutOverlay() {
    if (document.querySelector('.gd-workout-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'gd-workout-overlay';
    overlay.innerHTML =
      '<div class="gd-workout-check">✓</div>' +
      '<div class="gd-workout-label">Workout Complete</div>';
    document.body.appendChild(overlay);

    setTimeout(function () {
      overlay.classList.add('gd-out');
      overlay.addEventListener('animationend', function () {
        overlay.remove();
      }, { once: true });
    }, 1500);
  }

  /* ── 9. WATER ML COUNT-UP ────────────────────────────────────── */
  function bindWaterCountUp() {
    const el = document.getElementById('wMlBig');
    if (!el) return;

    let ownWrite = false;
    let animFrame = null;

    function parseNum(text) {
      const m = text.replace(/,/g, '').match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }

    function getSuffix(text) {
      return text.replace(/[\d,]+/, '').trim();
    }

    let currentVal = parseNum(el.textContent) || 0;

    const obs = new MutationObserver(function () {
      if (ownWrite) return;

      const text = el.textContent.trim();
      const target = parseNum(text);
      if (target === null || target === currentVal) return;

      const suffix = getSuffix(text);
      const from = currentVal;
      currentVal = target;

      if (animFrame) cancelAnimationFrame(animFrame);

      let start = null;
      const duration = 420;

      function step(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        const eased = 1 - (1 - p) * (1 - p); // ease-out quad
        const cur = Math.round(from + (target - from) * eased);

        ownWrite = true;
        el.textContent = cur.toLocaleString() + (suffix ? ' ' + suffix : '');
        ownWrite = false;

        if (p < 1) {
          animFrame = requestAnimationFrame(step);
        } else {
          animFrame = null;
        }
      }

      animFrame = requestAnimationFrame(step);
    });

    obs.observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ── 10. DAY RING PERCENT COUNT-UP on load ───────────────────── */
  function bindDayRingCountUp() {
    const el = document.getElementById('dayRingPercent') ||
               document.querySelector('.day-ring-percent');
    if (!el) return;

    let triggered = false;

    function tryCountUp() {
      if (triggered) return;
      const text = el.textContent.trim();
      if (text === '—' || text === '' || text === 'Loading…') return;

      const m = text.match(/^(\d+)(.*)/);
      if (!m) return;

      triggered = true;
      const target = parseInt(m[1], 10);
      const suffix = m[2]; // e.g. '%'

      let start = null;
      const duration = 900;

      function step(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.textContent = Math.floor(eased * target) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }

      // Delay to sync with the scale-in animation delay (0.55s)
      setTimeout(function () { requestAnimationFrame(step); }, 560);
    }

    // Try immediately (if JS already ran) or wait for first update
    tryCountUp();
    if (!triggered) {
      const obs = new MutationObserver(function () {
        tryCountUp();
        if (triggered) obs.disconnect();
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ── 11. NEW GOAL ROWS — slide up from bottom ────────────────── */
  function observeNewRows() {
    const lists = document.querySelectorAll('.gm-list, .goal-list');
    lists.forEach(function (list) {
      const obs = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.classList.contains('gm-row') ||
                node.classList.contains('stack-item')) {
              node.style.animation = 'none';
              reflow(node);
              node.style.animation =
                'gd-goal-slide-up 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both';
            }
          });
        });
      });
      obs.observe(list, { childList: true });
    });
  }

  /* ── 12. SAVE FLASH — global utility for settings pages ──────── */
  window.gdSaveFlash = function (el) {
    if (!el) return;
    el.classList.remove('gd-save-flash');
    reflow(el);
    el.classList.add('gd-save-flash');
    el.addEventListener('animationend', function h() {
      el.classList.remove('gd-save-flash');
      el.removeEventListener('animationend', h);
    });
  };

  /* ── BOOT ─────────────────────────────────────────────────────── */
  function boot() {
    bindRipple();
    bindCheckboxPop();
    bindStackCheck();
    bindStreakBump();
    bindTabTransition();
    bindPageTransition();
    bindLogBtnRipple();
    bindWorkoutCelebration();
    bindWaterCountUp();
    bindDayRingCountUp();
    observeNewRows();

    // Re-bind water ripple if topbar injects late
    setTimeout(bindRipple, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
