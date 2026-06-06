/* ================================================================
   George's Dashboard — service-worker.js
   Handles push delivery, notification clicks, and scheduled checks
   while any page is open (setInterval) or when the browser wakes
   the SW via Periodic Background Sync.
   ================================================================ */
'use strict';

const SW_VERSION = 'v1';

// ── Install: skip waiting so the new SW takes over immediately ────
self.addEventListener('install', function (e) {
  self.skipWaiting();
});

// ── Activate: claim all open clients right away ───────────────────
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

// ── Push (requires a push server with VAPID keys) ─────────────────
self.addEventListener('push', function (e) {
  let payload = { title: "George's Dashboard", body: '', tag: 'dashboard', url: '/' };
  try { if (e.data) Object.assign(payload, e.data.json()); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body:   payload.body,
      icon:   '/icon.svg',
      badge:  '/badge.svg',
      tag:    payload.tag,
      data:   { url: payload.url },
      requireInteraction: false,
    })
  );
});

// ── Notification click: focus or open the relevant page ───────────
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        for (const c of list) {
          if (c.url.startsWith(self.location.origin) && 'focus' in c) {
            c.navigate(target);
            return c.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

// ── In-memory state (populated by pages via postMessage) ──────────
// SW cannot access localStorage; pages push state here every minute.
var swState = null;

self.addEventListener('message', function (e) {
  if (!e.data) return;
  if (e.data.type === 'STATE_UPDATE') {
    swState = e.data;
    // Start the interval on first state receipt
    startCheckInterval();
  }
});

// ── setInterval-based check (runs while SW is alive) ─────────────
// The SW stays alive while any client page is open. This is a
// best-effort fallback; the primary scheduler lives in push-init.js.
var _checkStarted = false;
function startCheckInterval() {
  if (_checkStarted) return;
  _checkStarted = true;
  setInterval(runCheck, 5 * 60 * 1000); // every 5 minutes
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function runCheck() {
  if (!swState) return;

  var prefs = swState.prefs || {
    enabled: true,
    water:  { enabled: true, noon: true, evening: true, noonThreshold: 30, eveningThreshold: 70 },
    weight: { enabled: true, offsetMins: 30 }
  };
  if (!prefs.enabled) return Promise.resolve();

  var waterP  = prefs.water  || {};
  var weightP = prefs.weight || {};

  var now      = new Date();
  var h        = now.getHours();
  var nowMins  = h * 60 + now.getMinutes();
  var today    = todayStr();
  var doneMl   = swState.doneMl   || 0;
  var targetMl = swState.targetMl || 2500;
  var wakeMins = swState.wakeMins || 8 * 60;
  var sent     = swState.sent     || {};
  var pct      = targetMl > 0 ? doneMl / targetMl : 0;

  var promises = [];

  // Noon water: past 12:00, under noon threshold
  if (waterP.enabled !== false && waterP.noon !== false &&
      h >= 12 && pct < (waterP.noonThreshold || 30) / 100 && sent.noon_water !== today) {
    sent.noon_water = today;
    promises.push(
      self.registration.showNotification('Water reminder', {
        body:  doneMl === 0
                 ? "You haven't had any water today — time to start! 💧"
                 : "You're only at " + doneMl + "ml — time to catch up! 💧",
        icon:  '/icon.svg',
        badge: '/badge.svg',
        tag:   'water-noon',
        data:  { url: '/health.html' },
      })
    );
    broadcastSent('noon_water', today);
  }

  // 6pm water: past 18:00, under evening threshold
  if (waterP.enabled !== false && waterP.evening !== false &&
      h >= 18 && pct < (waterP.eveningThreshold || 70) / 100 && sent.sixpm_water !== today) {
    sent.sixpm_water = today;
    promises.push(
      self.registration.showNotification('Water check-in', {
        body:  pct >= 0.40
                 ? 'Halfway through the day, halfway to your goal 💧'
                 : 'Only ' + doneMl + 'ml so far — still time to catch up! 💧',
        icon:  '/icon.svg',
        badge: '/badge.svg',
        tag:   'water-sixpm',
        data:  { url: '/health.html' },
      })
    );
    broadcastSent('sixpm_water', today);
  }

  // Weight reminder: offsetMins after wake, within 90-min window
  if (weightP.enabled !== false) {
    var weightAt = wakeMins + (typeof weightP.offsetMins === 'number' ? weightP.offsetMins : 30);
    if (nowMins >= weightAt && nowMins < weightAt + 90 && sent.weight !== today) {
      sent.weight = today;
      promises.push(
        self.registration.showNotification('Morning weigh-in ⚖️', {
          body:  'Did you weigh yourself yet? Log it in the app!',
          icon:  '/icon.svg',
          badge: '/badge.svg',
          tag:   'weight',
          data:  { url: '/gym.html' },
        })
      );
      broadcastSent('weight', today);
    }
  }

  swState.sent = sent;
  return Promise.all(promises);
}

function broadcastSent(key, value) {
  self.clients.matchAll().then(function (clients) {
    clients.forEach(function (c) {
      c.postMessage({ type: 'NOTIF_SENT', key: key, value: value });
    });
  });
}

// ── Periodic Background Sync (Chrome only, requires site engagement) ─
self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'notif-check') {
    e.waitUntil(runCheck());
  }
});
