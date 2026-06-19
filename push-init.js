/* ================================================================
   George's Dashboard — push-init.js
   Drop <script src="/push-init.js" defer></script> on every page.

   Responsibilities:
     1. Register the service worker
     2. Show a friendly in-app card before triggering the browser
        permission prompt
     3. Run smart notification checks (water pace + weight log)
        on page load and every 5 minutes via setInterval
     4. Post current state to the SW every minute so the SW-side
        setInterval can fire checks even without a DOM
   ================================================================ */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

  // ── Helpers ────────────────────────────────────────────────────
  function lsGet(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; }
  }
  function lsRaw(k) {
    try { return localStorage.getItem(k); } catch (_) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }

  // ── Notification preferences (mirrors notification_prefs in localStorage) ─
  function getNotifPrefs() {
    var raw = lsGet('notification_prefs');
    if (!raw) return {
      enabled: true,
      water:  { enabled: true, noon: true, evening: true, noonThreshold: 30, eveningThreshold: 70 },
      weight: { enabled: true, offsetMins: 30 }
    };
    var w  = raw.water  || {};
    var wt = raw.weight || {};
    return {
      enabled: raw.enabled !== false,
      water: {
        enabled:          w.enabled          !== false,
        noon:             w.noon             !== false,
        evening:          w.evening          !== false,
        noonThreshold:    typeof w.noonThreshold    === 'number' ? w.noonThreshold    : 30,
        eveningThreshold: typeof w.eveningThreshold === 'number' ? w.eveningThreshold : 70,
      },
      weight: {
        enabled:    wt.enabled    !== false,
        offsetMins: typeof wt.offsetMins === 'number' ? wt.offsetMins : 30,
      }
    };
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ── Water data ──────────────────────────────────────────────────
  function getWaterData() {
    var state    = lsGet('po_water_v1') || {};
    var today    = todayKey();
    var doneMl   = ((state.history || {})[today]) || 0;
    var targetMl = 2500;

    // Base target from topbar / health.html style (weight in lbs → kg)
    try {
      var lbs = parseFloat(JSON.parse(lsRaw('dash_weight') || '0'));
      if (!isNaN(lbs) && lbs > 0) {
        var kg  = lbs / 2.205;
        var sex = lsRaw('dash_sex') || 'm';
        var adj = (sex === 'female' || sex === 'f') ? 0 : 200;
        targetMl = Math.max(2000, Math.min(6000,
          Math.round(((kg * 35) + adj) / 50) * 50));
      }
    } catch (_) {}

    // po-water.html stores a richer profile; prefer it when present
    if (state.profile && state.profile.weightKg) {
      try {
        var p  = state.profile;
        var wKg = state.weightUnit === 'lb' ? p.weightKg / 2.20462 : (p.weightKg || 0);
        var base = wKg * 35;
        var ex   = (p.activityHrsPerWeek || 0) / 7 * 500;
        var caf  = Math.max(0, (state.caffeineMgPerDay || 0) - 200) * 1.5;
        var subs = (state.substances || []).reduce(function (s, x) {
          var dose = (x.dose != null ? x.dose : x.defaultDose) || 0;
          return s + Math.max(0, dose * (x.mlPerUnit || 0));
        }, 0);
        var pa = 0;
        if (p.sex === 'm') pa += 200;
        if ((p.age || 0) >= 50) pa += 100;
        var t = Math.round(base + ex + caf + subs + pa);
        if (t > 0) targetMl = t;
      } catch (_) {}
    }

    return { doneMl: doneMl, targetMl: targetMl };
  }

  // ── Wake time (minutes since midnight) ─────────────────────────
  function getWakeMins() {
    var raw   = lsRaw('dash_wake_time') || '08:00';
    var parts = raw.split(':');
    return (parseInt(parts[0], 10) || 8) * 60 + (parseInt(parts[1], 10) || 0);
  }

  // ── Sent-today tracking ─────────────────────────────────────────
  function wasSentToday(key) {
    var s = lsGet('dash_notif_sent') || {};
    return s[key] === todayKey();
  }
  function markSent(key) {
    var s = lsGet('dash_notif_sent') || {};
    s[key] = todayKey();
    lsSet('dash_notif_sent', s);
  }

  // ── Show notification (via SW registration) ─────────────────────
  function notify(title, body, tag, url) {
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification(title, {
        body:  body,
        icon:  '/icon.svg',
        badge: '/badge.svg',
        tag:   tag,
        renotify: false,
        data: { url: url },
      });
    }).catch(function () {});
  }

  // ── Custom reminders (scheduled by Axis AI) ─────────────────────
  function getReminders()      { return lsGet('axis_reminders') || []; }
  function saveReminders(arr)  { lsSet('axis_reminders', arr); }

  function checkReminders() {
    if (Notification.permission !== 'granted') return;
    if (!getNotifPrefs().enabled) return;
    var arr = getReminders();
    if (!arr.length) return;
    var now    = Date.now();
    var cutoff = now - 2 * 86400000; // prune fired reminders older than 2 days
    var changed = false;
    arr.forEach(function (r) {
      if (!r.fired && r.at && now >= r.at) {
        r.fired  = true;
        changed  = true;
        notify('Reminder ⏰', r.text || 'Reminder', 'reminder-' + r.id, '/index.html');
      }
    });
    var pruned = arr.filter(function (r) { return !(r.fired && r.at < cutoff); });
    if (pruned.length !== arr.length) changed = true;
    if (changed) saveReminders(pruned);
  }

  // ── Notification check logic ────────────────────────────────────
  function check() {
    if (Notification.permission !== 'granted') return;

    var prefs   = getNotifPrefs();
    if (!prefs.enabled) return;

    var now     = new Date();
    var h       = now.getHours();
    var nowMins = h * 60 + now.getMinutes();
    var water   = getWaterData();
    var doneMl  = water.doneMl;
    var tgtMl   = water.targetMl;
    var pct     = tgtMl > 0 ? doneMl / tgtMl : 0;

    // Noon water: past 12:00, under noon threshold
    if (prefs.water.enabled && prefs.water.noon &&
        h >= 12 && pct < prefs.water.noonThreshold / 100 && !wasSentToday('noon_water')) {
      markSent('noon_water');
      notify(
        'Water reminder',
        doneMl === 0
          ? "You haven't had any water today — time to start! 💧"
          : "You're only at " + doneMl + "ml — time to catch up! 💧",
        'water-noon',
        '/health.html'
      );
    }

    // 6pm water: past 18:00, under evening threshold
    if (prefs.water.enabled && prefs.water.evening &&
        h >= 18 && pct < prefs.water.eveningThreshold / 100 && !wasSentToday('sixpm_water')) {
      markSent('sixpm_water');
      notify(
        'Water check-in',
        pct >= 0.40
          ? 'Halfway through the day, halfway to your goal 💧'
          : 'Only ' + doneMl + 'ml so far — still time to catch up! 💧',
        'water-sixpm',
        '/health.html'
      );
    }

    // Morning briefing: fires at wake time, opens ai.html
    var wakeAt = getWakeMins();
    if (nowMins >= wakeAt && nowMins < wakeAt + 10 && !wasSentToday('morning_briefing')) {
      markSent('morning_briefing');
      notify('Good morning ⚡', 'Your daily briefing is ready.', 'morning-briefing', '/ai.html');
    }

    // Weight reminder: offsetMins after wake, within 90-min window
    if (prefs.weight.enabled) {
      var wAt = getWakeMins() + prefs.weight.offsetMins;
      if (nowMins >= wAt && nowMins < wAt + 90 && !wasSentToday('weight')) {
        markSent('weight');
        notify(
          'Morning weigh-in',
          'Did you weigh yourself yet? Log it in the app! ⚖️',
          'weight',
          '/gym.html'
        );
      }
    }
  }

  // ── In-app permission card ──────────────────────────────────────
  function shouldShowCard() {
    if (Notification.permission !== 'default') return false;
    // Don't show if the user explicitly disabled notifications in Settings
    var raw = lsGet('notification_prefs');
    if (raw && raw.enabled === false) return false;
    var ts = lsGet('dash_notif_dismissed_at');
    // Don't show again within 14 days of a dismissal
    if (ts && Date.now() - ts < 14 * 86400000) return false;
    return true;
  }

  function injectCard() {
    if (!shouldShowCard()) return;
    if (document.getElementById('dash-notif-card')) return;

    var style = document.createElement('style');
    style.textContent = [
      '#dash-notif-card{',
        'position:fixed;',
        'bottom:calc(90px + env(safe-area-inset-bottom));',
        'left:50%;transform:translateX(-50%);',
        'width:calc(100% - 32px);max-width:440px;',
        'z-index:9998;',
        'animation:dnc-up .4s cubic-bezier(.34,1.56,.64,1) both;',
      '}',
      '@keyframes dnc-up{',
        'from{opacity:0;transform:translateX(-50%) translateY(20px)}',
        'to{opacity:1;transform:translateX(-50%) translateY(0)}',
      '}',
      '#dash-notif-card .dnc-inner{',
        'background:rgba(16,16,20,.97);',
        'border:1px solid rgba(125,211,252,.22);',
        'border-radius:18px;padding:16px 18px;',
        'box-shadow:0 8px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);',
        'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);',
        'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      '}',
      '#dash-notif-card .dnc-row{display:flex;gap:12px;align-items:flex-start}',
      '#dash-notif-card .dnc-icon{font-size:26px;flex-shrink:0;margin-top:2px}',
      '#dash-notif-card .dnc-text{flex:1}',
      '#dash-notif-card .dnc-title{margin:0 0 4px;font-size:13px;font-weight:700;color:#FAFAFA}',
      '#dash-notif-card .dnc-desc{margin:0;font-size:12px;color:rgba(255,255,255,.5);line-height:1.45}',
      '#dash-notif-card .dnc-btns{display:flex;gap:8px;margin-top:14px}',
      '#dash-notif-card .dnc-allow{',
        'flex:1;padding:11px;border:none;border-radius:11px;cursor:pointer;',
        'background:linear-gradient(180deg,#fff 0%,#e8e5dd 100%);',
        'color:#0a0a0b;font-size:13px;font-weight:700;font-family:inherit;',
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 3px 10px rgba(0,0,0,.4);',
        '-webkit-tap-highlight-color:transparent;',
      '}',
      '#dash-notif-card .dnc-skip{',
        'padding:11px 16px;border:1px solid rgba(255,255,255,.10);border-radius:11px;',
        'background:transparent;color:rgba(255,255,255,.45);font-size:13px;',
        'font-weight:600;cursor:pointer;font-family:inherit;',
        '-webkit-tap-highlight-color:transparent;',
      '}',
    ].join('');
    document.head.appendChild(style);

    var card = document.createElement('div');
    card.id = 'dash-notif-card';
    card.innerHTML =
      '<div class="dnc-inner">' +
        '<div class="dnc-row">' +
          '<span class="dnc-icon">💧</span>' +
          '<div class="dnc-text">' +
            '<p class="dnc-title">Stay on top of your day</p>' +
            '<p class="dnc-desc">Smart water reminders when you fall behind, plus a morning weigh-in nudge — only when you actually need them.</p>' +
          '</div>' +
        '</div>' +
        '<div class="dnc-btns">' +
          '<button class="dnc-allow" id="dncAllow">Allow notifications</button>' +
          '<button class="dnc-skip" id="dncSkip">Not now</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(card);

    document.getElementById('dncAllow').addEventListener('click', function () {
      Notification.requestPermission().then(function (result) {
        card.remove();
        if (result === 'granted') {
          lsSet('dash_notif_dismissed_at', null);
          check();
        } else {
          lsSet('dash_notif_dismissed_at', Date.now());
        }
      });
    });
    document.getElementById('dncSkip').addEventListener('click', function () {
      card.remove();
      lsSet('dash_notif_dismissed_at', Date.now());
    });
  }

  // ── SW message handler (SW tells us which notifications it sent) ─
  function listenToSW() {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data) return;
      if (e.data.type === 'NOTIF_SENT') {
        markSent(e.data.key);
      } else if (e.data.type === 'REMINDER_FIRED') {
        var arr = getReminders(), hit = false;
        arr.forEach(function (r) { if (r.id === e.data.id && !r.fired) { r.fired = true; hit = true; } });
        if (hit) saveReminders(arr);
      }
    });
  }

  // ── Push current state to SW (SW cannot read localStorage) ──────
  function postStateToSW() {
    navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.active) return;
      var w = getWaterData();
      reg.active.postMessage({
        type:      'STATE_UPDATE',
        doneMl:    w.doneMl,
        targetMl:  w.targetMl,
        wakeMins:  getWakeMins(),
        today:     todayKey(),
        sent:      lsGet('dash_notif_sent') || {},
        prefs:     getNotifPrefs(),
        reminders: getReminders(),
      });
    }).catch(function () {});
  }

  // ── Register service worker ─────────────────────────────────────
  function register() {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(function (reg) {
        listenToSW();
        postStateToSW();

        // Periodic Background Sync (Chrome with site engagement)
        if ('periodicSync' in reg) {
          navigator.permissions.query({ name: 'periodic-background-sync' })
            .then(function (s) {
              if (s.state === 'granted') {
                reg.periodicSync.register('notif-check', { minInterval: 60 * 60 * 1000 });
              }
            }).catch(function () {});
        }
      })
      .catch(function () {});
  }

  // ── Boot ────────────────────────────────────────────────────────
  function boot() {
    register();

    // Show card 2 s after page load — not instantly
    setTimeout(injectCard, 2000);

    // Immediate check, then every 5 minutes
    check();
    checkReminders();
    setInterval(function () {
      check();
      postStateToSW();
    }, 5 * 60 * 1000);

    // Keep SW state fresh + fire any due reminders every minute while open
    setInterval(function () {
      postStateToSW();
      checkReminders();
    }, 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
