// =============================================================
// Persistent dashboard top bar + bottom tab bar.
// Drop this on any page with:
//     <script src="topbar.js" defer></script>
// It self-injects HTML + CSS, reads progress from localStorage,
// and renders the water +1 button in the top bar plus the
// Main/Health/Fitness bottom tabs. Skips chrome on finance.html
// and inside iframes (so the water tracker can embed cleanly).
// Bottom tabs are suppressed on ai.html (topbar logo is the nav).
// =============================================================
(function() {
  if (window.__lsOrigSet) return;
  var _orig = localStorage.setItem.bind(localStorage);
  window.__lsOrigSet = _orig;
  localStorage.setItem = function(k, v) {
    _orig(k, v);
    try { if (typeof window._pcTriggerSync === 'function') window._pcTriggerSync(k); } catch(e) {}
  };
})();
(function () {
  'use strict';

  // -------- Supabase config (replace with your own project URL + publishable key) --------
  const TOPBAR_SUPABASE_URL = 'https://oyylbiscxnymnmetyrho.supabase.co';
  const TOPBAR_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eWxiaXNjeG55bW5tZXR5cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzQ1MDgsImV4cCI6MjA5NTcxMDUwOH0.3xxHcp3Z4vJWHEGFV_iUW_YeJ2gdUPqYiNAQkYnR-qU';

  // -------- CSS --------
  const css = `
html {
  background: radial-gradient(ellipse at 20% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 60% 80%, rgba(245, 158, 11, 0.08) 0%, transparent 50%),
              #0a0a0b;
}
body { background: transparent; }
.topbar {
  position: fixed;
  top: 0; left: 0; right: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  padding: calc(max(10px, env(safe-area-inset-top)) + 8px) calc(14px + env(safe-area-inset-right)) 10px calc(14px + env(safe-area-inset-left));
  background: linear-gradient(180deg, rgba(10,10,11,0.94) 0%, rgba(10,10,11,0.0) 100%);
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
}
.topbar > * { pointer-events: auto; }
.topbar-logo-link {
  display: flex; align-items: center; gap: 8px;
  text-decoration: none; flex: 1; min-width: 0;
  padding: 2px;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.2s;
}
.topbar-logo-link:active { opacity: 0.65; }
.topbar-logo-svg { flex-shrink: 0; display: block; }
.topbar-right {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.topbar-water-wrap { display: flex; align-items: stretch; }
.topbar-water-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px;
  background: linear-gradient(135deg, rgba(125,211,252,0.25), rgba(125,211,252,0.10));
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(125,211,252,0.40);
  border-right: none;
  border-radius: 999px 0 0 999px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.50), 0 4px 16px rgba(125,211,252,0.15);
  text-decoration: none; color: #FAFAFA;
  -webkit-tap-highlight-color: transparent;
}
.topbar-water-pill .topbar-pill-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #7DD3FC; flex-shrink: 0;
}
.topbar-water-pill.good .topbar-pill-dot { background: #6ee7b7; }
.topbar-water-pill.warn .topbar-pill-dot { background: #fbbf24; }
.topbar-water-pill.miss .topbar-pill-dot {
  background: #ff8a8a;
  animation: topbar-miss-pulse 1.6s ease-in-out infinite;
}
@keyframes topbar-miss-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  50%      { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
}
.topbar-pill-count {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px; font-weight: 700; color: #FAFAFA;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.topbar-water-add {
  width: 44px;
  border: 1px solid rgba(125,211,252,0.40);
  background: linear-gradient(180deg, rgba(125,211,252,0.35), rgba(110,231,183,0.25));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-left: none;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.50);
  color: #FFFFFF; font-family: inherit;
  font-size: 20px; font-weight: 700; line-height: 1;
  cursor: pointer; border-radius: 0 999px 999px 0;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, transform 0.10s;
}
.topbar-water-add:active { transform: scale(0.94); }
.topbar-water-add.flash {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.7), rgba(110, 231, 183, 0.7));
}
.topbar-finance-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 42px;
  border: 1px solid rgba(255,255,255,0.30);
  background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.50), 0 4px 12px rgba(0,0,0,0.2);
  border-radius: 999px; text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}
.topbar-finance-btn:hover { background: rgba(255, 255, 255, 0.08); }
.topbar-finance-icon {
  font-size: 20px; line-height: 1;
  filter: grayscale(100%) brightness(1.4); opacity: 0.85;
}
.bottombar {
  position: fixed !important;
  bottom: calc(12px + env(safe-area-inset-bottom)) !important;
  left: 0 !important;
  right: 0 !important;
  margin: 0 auto !important;
  width: calc(100% - 32px) !important;
  max-width: 420px !important;
  border-radius: 999px !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)) !important;
  -webkit-backdrop-filter: blur(20px) saturate(160%) brightness(1.08) !important;
  backdrop-filter: blur(20px) saturate(160%) brightness(1.08) !important;
  border: 1px solid rgba(255,255,255,0.20) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.08) !important;
  display: flex !important;
  justify-content: space-around !important;
  align-items: stretch !important;
  padding: 4px 12px !important;
  z-index: 40 !important;
}
.bottombar::before {
  content: '' !important;
  position: absolute !important;
  top: 0 !important; left: 10% !important; right: 10% !important; height: 1px !important;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent) !important;
  pointer-events: none !important;
}
.bottombar::after {
  content: '' !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: 999px !important;
  background: linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 40%, rgba(255,255,255,0.03) 100%) !important;
  pointer-events: none !important;
}
.bottombar-tab {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; padding: 4px 8px !important; text-decoration: none;
  color: rgba(255, 255, 255, 0.45); border-radius: 999px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bottombar-tab-icon {
  font-size: 24px; line-height: 1;
  filter: grayscale(100%) brightness(1.2); opacity: 0.55;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bottombar-tab.active {
  color: #FAFAFA;
  background: rgba(255,255,255,0.18);
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.2);
}
.bottombar-tab.active .bottombar-tab-icon {
  filter: grayscale(100%) brightness(1.6); opacity: 1;
}
.bottombar-tab:active .bottombar-tab-icon { transform: scale(0.92); }
body.has-bottombar {
  padding-bottom: calc(90px + env(safe-area-inset-bottom)) !important;
}
@media (max-width: 480px) {
  .topbar { gap: 6px; }
  .topbar-water-pill { padding: 8px 11px; gap: 6px; }
  .topbar-pill-count { font-size: 12px; }
  .topbar-water-add { width: 40px; font-size: 18px; }
  .topbar-finance-btn { width: 40px; height: 38px; }
  .topbar-finance-icon { font-size: 18px; }
  .bottombar-tab-icon { font-size: 22px !important; }
  .bottombar-tab { font-size: 10px; }
}
html, body { -webkit-text-size-adjust: 100%; }
@media (max-width: 768px) {
  html { touch-action: pan-y; }
  ::-webkit-scrollbar { width: 0; height: 0; display: none; }
  html, body { scrollbar-width: none; -ms-overflow-style: none; }
}
.modal-bg, .modal, .po-modal-bg, .po-modal, .wt-overlay, .wt-viewer {
  overscroll-behavior: contain;
}
body.topbar-modal-open { overflow: hidden; touch-action: none; }
@media (max-width: 480px) {
  .modal-bg, .po-modal-bg {
    padding: 0 !important;
    align-items: stretch !important;
    justify-content: stretch !important;
  }
  .modal, .po-modal {
    width: 100% !important; max-width: 100% !important;
    max-height: 100vh !important; height: 100vh !important;
    border-radius: 0 !important;
    padding-top: max(20px, env(safe-area-inset-top)) !important;
    padding-bottom: max(28px, env(safe-area-inset-bottom)) !important;
    overflow-y: auto !important; overscroll-behavior: contain;
  }
}
`;

  const topbarHtml = `
<header class="topbar" id="topbar" role="navigation" aria-label="Quick actions">
  <a href="landing.html" class="topbar-logo-link" id="topbarLogoLink" aria-label="Home">
    <svg class="topbar-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="36" height="36" aria-hidden="true">
      <defs>
        <filter id="tbAxisGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="24" cy="24" r="22" fill="#111820" stroke="#2de8a2" stroke-width="0.5" stroke-opacity="0.25"/>
      <g stroke="#2de8a2" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-dasharray="3,2" filter="url(#tbAxisGlow)">
        <line x1="24" y1="24" x2="24" y2="12"/>
        <line x1="24" y1="24" x2="34.4" y2="30"/>
        <line x1="24" y1="24" x2="13.6" y2="30"/>
      </g>
      <g fill="#2de8a2" filter="url(#tbAxisGlow)">
        <polygon points="24,9.5 22.5,12 25.5,12"/>
        <polygon points="36.6,31.3 35.15,28.7 33.65,31.3"/>
        <polygon points="11.4,31.3 14.35,31.3 12.85,28.7"/>
      </g>
      <circle cx="24" cy="24" r="1.5" fill="#2de8a2" filter="url(#tbAxisGlow)"/>
    </svg>
  </a>
  <div class="topbar-right">
    <div class="topbar-water-wrap">
      <a href="health.html#water" class="topbar-water-pill" id="topbarWater" aria-label="Water progress">
        <span class="topbar-pill-dot"></span>
        <span class="topbar-pill-count" id="topbarWaterCount">0/0</span>
      </a>
      <button class="topbar-water-add" id="topbarWaterAdd" aria-label="Log one drink" type="button">+</button>
    </div>
    <a href="settings.html" class="topbar-finance-btn" id="topbarFinance" aria-label="Settings">
      <span class="topbar-finance-icon">⚙️</span>
    </a>
  </div>
</header>`;

  const bottombarHtml = `
<nav class="bottombar" id="bottombar" role="navigation" aria-label="Main tabs">
  <a href="index.html" class="bottombar-tab" data-page="main">
    <span class="bottombar-tab-icon">🏠</span><span>Main</span>
  </a>
  <a href="health.html" class="bottombar-tab" data-page="health">
    <span class="bottombar-tab-icon">💊</span><span>Health</span>
  </a>
  <a href="gym.html" class="bottombar-tab" data-page="fitness">
    <span class="bottombar-tab-icon">💪</span><span>Fitness</span>
  </a>
</nav>`;

  function pageIs(name) {
    const p = (window.location.pathname || '').toLowerCase().replace(/\.html$/, '');
    return p === '/' + name || p.endsWith('/' + name) || p === name;
  }
  function isFinancePage() { return pageIs('finance'); }
  function isSettingsPage() { return pageIs('settings'); }
  function isAIPage() { return pageIs('ai'); }
  function isEmbedded() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }
  function shouldShowChrome() { return !isFinancePage() && !isEmbedded(); }
  function currentPageKey() {
    const p = (window.location.pathname || '').toLowerCase().replace(/\.html$/, '');
    if (p.endsWith('health')) return 'health';
    if (p.endsWith('gym')) return 'fitness';
    return 'main';
  }

  function injectStyleAndHTML() {
    if (!document.getElementById('topbar-style')) {
      const style = document.createElement('style');
      style.id = 'topbar-style';
      style.textContent = css;
      document.head.appendChild(style);
    }
    if (document.getElementById('topbar') || document.getElementById('bottombar')) return;
    if (!shouldShowChrome()) return;
    const topWrap = document.createElement('div');
    topWrap.innerHTML = topbarHtml.trim();
    document.body.insertBefore(topWrap.firstChild, document.body.firstChild);
    if (!isAIPage()) {
      const bottomWrap = document.createElement('div');
      bottomWrap.innerHTML = bottombarHtml.trim();
      document.body.appendChild(bottomWrap.firstChild);
      const active = currentPageKey();
      document.querySelectorAll('.bottombar-tab').forEach((t) => {
        t.classList.toggle('active', t.getAttribute('data-page') === active);
      });
      document.body.classList.add('has-bottombar');
    }
    if (isSettingsPage()) {
      const finBtn = document.getElementById('topbarFinance');
      if (finBtn) finBtn.href = sessionStorage.getItem('dash_prev_page') || 'index.html';
    }
  }

  function calendarDateKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function getWaterProgress() {
    try {
      let state = null;
      try { state = JSON.parse(localStorage.getItem('po_water_v1')); } catch (e) {}
      if (!state) return { doneMl: 0, targetMl: 0 };

      const todayKey = calendarDateKey();
      const doneMl = ((state.history || {})[todayKey]) || 0;

      // Identical to wTarget() in health.html
      let targetMl = 2500;
      try {
        const raw = localStorage.getItem('dash_weight');
        if (raw !== null) {
          const lbs = parseFloat(JSON.parse(raw));
          if (!isNaN(lbs) && lbs > 0) {
            const weightKg = lbs / 2.205;
            let sex = 'm'; try { const _s = localStorage.getItem('dash_sex') || ''; sex = (_s === 'female' || _s === 'f') ? 'f' : 'm'; } catch(e) {}
            targetMl = Math.round(((weightKg * 35) + (sex === 'm' ? 200 : 0)) / 50) * 50;
            targetMl = Math.max(2000, Math.min(6000, targetMl));
          }
        }
      } catch (e) {}

      return { doneMl, targetMl };
    } catch (e) {
      return { doneMl: 0, targetMl: 0 };
    }
  }
  function fmtL(ml) {
    if (ml >= 1000) return (ml / 1000).toFixed(1) + 'L';
    return ml + 'ml';
  }
  function classifyStatus(doneMl, targetMl) {
    if (targetMl === 0) return 'idle';
    const pct = doneMl / targetMl;
    if (pct >= 0.8) return 'good';
    if (pct >= 0.4) return 'warn';
    return 'miss';
  }
  function setPillStatus(pillEl, status) {
    pillEl.classList.remove('good', 'warn', 'miss');
    if (status === 'good' || status === 'warn' || status === 'miss') pillEl.classList.add(status);
  }
  function render() {
    const waterEl = document.getElementById('topbarWater');
    if (!waterEl) return;
    const w = getWaterProgress();
    const countEl = document.getElementById('topbarWaterCount');
    if (countEl) {
      countEl.textContent = w.targetMl > 0
        ? fmtL(w.doneMl) + ' / ' + fmtL(w.targetMl)
        : '0ml / 0ml';
    }
    setPillStatus(waterEl, classifyStatus(w.doneMl, w.targetMl));
  }

  function defaultWaterState() {
    return {
      unit: 'bottle', bottleMl: 500, glassMl: 250, weightUnit: 'kg',
      profile: { weightKg: 75, age: 25, sex: 'm', activityHrsPerWeek: 5 },
      caffeineMgPerDay: 200, substances: [], logs: {}
    };
  }
  async function pushWaterMergedToSupabase(localWater) {
    if (window.location.pathname.endsWith('/health.html') ||
        window.location.pathname.endsWith('health.html')) return;
    if (!window.supabase || !TOPBAR_SUPABASE_URL || !TOPBAR_SUPABASE_KEY) return;
    if (TOPBAR_SUPABASE_URL.indexOf('PASTE-') === 0) return;
    try {
      const supa = window.supabase.createClient(TOPBAR_SUPABASE_URL, TOPBAR_SUPABASE_KEY);
      const { data } = await supa
        .from('app_state').select('data').eq('key', 'health').maybeSingle();
      const current = (data && data.data) || {};
      const merged = Object.assign({}, current, { po_water_v1: localWater });
      await supa.from('app_state').upsert(
        { key: 'health', data: merged, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    } catch (e) {}
  }
  function addWater() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem('po_water_v1')); } catch (e) {}
    if (!state || typeof state !== 'object') state = {};
    const k = calendarDateKey();
    const bottleMl = ((state.settings || {}).bottleMl) || 500;
    if (!state.history) state.history = {};
    state.history[k] = (typeof state.history[k] === 'number' ? state.history[k] : 0) + bottleMl;
    if (!state.logs) state.logs = {};
    if (!Array.isArray(state.logs[k])) state.logs[k] = [];
    state.logs[k].push(bottleMl);
    try { localStorage.setItem('po_water_v1', JSON.stringify(state)); } catch (e) {}
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'po_water_v1' })); } catch(e) {}
    render();
    const btn = document.getElementById('topbarWaterAdd');
    if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 220); }
    pushWaterMergedToSupabase(state);
  }

  function blockGesture(e) { e.preventDefault(); }
  function lockGestures() {
    document.addEventListener('gesturestart', blockGesture, { passive: false });
    document.addEventListener('gesturechange', blockGesture, { passive: false });
    document.addEventListener('gestureend', blockGesture, { passive: false });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }
  function startModalLock() {
    const MODAL_SELECTORS = ['.modal-bg', '.po-modal-bg', '.wt-overlay', '.wt-viewer', '.wt-cam'];
    function anyOpen() {
      for (const sel of MODAL_SELECTORS) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el.classList.contains('show') || el.classList.contains('is-open')) return true;
        }
      }
      return false;
    }
    function sync() { document.body.classList.toggle('topbar-modal-open', anyOpen()); }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    sync();
  }

  function boot() {
    if (!isSettingsPage()) {
      try { sessionStorage.setItem('dash_prev_page', window.location.href); } catch(e) {}
    }
    injectStyleAndHTML();
    const btn = document.getElementById('topbarWaterAdd');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); addWater(); });
    render();
    lockGestures();
    startModalLock();
    window.addEventListener('storage', render);
    window.addEventListener('focus', render);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    setInterval(render, 30 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
