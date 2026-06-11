// google-auth.js — Shared Google OAuth helper for Axis (implicit / token flow)
// Uses GIS initTokenClient — no redirect URI or client secret required.
//
// Storage: 'google_auth' → { access_token, expiry, scope }
// Legacy:  'google_calendar_token' is mirrored for backwards compatibility.
//
// Token lifetime: ~1 hour. When expired:
//   • On page load  → onNeedAuth() fires if never authed before,
//                      onExpired() fires if a previous session existed.
//   • Mid-session   → getToken() returns null; a small floating
//                      "Re-authenticate" banner is shown automatically.
//
// USAGE (in each page):
//  1. <script src="google-auth.js"> before the GIS script.
//  2. Keep the GIS <script> tag as: onload="GoogleAuth._onGISReady()"
//  3. Call GoogleAuth.init({ onReady, onNeedAuth, onExpired, onSignIn, onSignOut })
//     anywhere in your page's <script> block.
//  4. Call GoogleAuth.signIn() on button click.
//  5. const tok = await GoogleAuth.getToken() before every API call.

(function (global) {
  'use strict';

  const CLIENT_ID   = '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const SCOPES      = 'https://www.googleapis.com/auth/calendar '
                    + 'https://www.googleapis.com/auth/gmail.readonly '
                    + 'https://www.googleapis.com/auth/gmail.modify';
  const STORAGE_KEY = 'google_auth';
  const LEGACY_KEY  = 'google_calendar_token';

  let _tokenClient = null;
  let _callbacks   = {};
  let _gisReady    = false;
  let _bannerEl    = null; // the floating re-auth banner element, if visible

  // ── Storage ───────────────────────────────────────────────────────
  function _load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored) return stored;
      // Migrate from legacy key so the current session stays live after first deploy
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && legacy.token) {
        return { access_token: legacy.token, expiry: legacy.expiry || 0, scope: '' };
      }
    } catch (_) {}
    return null;
  }

  function _save(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {}
    // Mirror to legacy key so older code paths still work
    if (obj && obj.access_token) {
      try {
        localStorage.setItem(LEGACY_KEY, JSON.stringify({ token: obj.access_token, expiry: obj.expiry }));
      } catch (_) {}
    }
  }

  function _clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(LEGACY_KEY);  } catch (_) {}
  }

  // ── Re-auth banner ────────────────────────────────────────────────
  // A small floating chip shown when the token expires mid-session.
  // Injected into the page body automatically — no HTML changes needed.
  function _showBanner() {
    if (_bannerEl && _bannerEl.parentNode) return; // already visible
    _bannerEl = document.createElement('div');
    _bannerEl.id = 'ga-reauth-banner';
    _bannerEl.style.cssText = [
      'position:fixed',
      'bottom:calc(80px + env(safe-area-inset-bottom, 0px))',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:9999',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 16px',
      'background:rgba(10,15,14,0.95)',
      'border:1px solid rgba(45,232,162,0.35)',
      'border-radius:12px',
      '-webkit-backdrop-filter:blur(16px)',
      'backdrop-filter:blur(16px)',
      'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif',
      'font-size:13px',
      'color:rgba(255,255,255,0.75)',
      'white-space:nowrap',
      'animation:gaSlideUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
    ].join(';');

    // Inject keyframe once
    if (!document.getElementById('ga-reauth-styles')) {
      const style = document.createElement('style');
      style.id = 'ga-reauth-styles';
      style.textContent = '@keyframes gaSlideUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
      document.head.appendChild(style);
    }

    const label = document.createElement('span');
    label.textContent = 'Session expired';

    const btn = document.createElement('button');
    btn.textContent = '⟳ Re-authenticate';
    btn.style.cssText = [
      'padding:5px 12px',
      'border-radius:8px',
      'background:rgba(45,232,162,0.1)',
      'border:1px solid rgba(45,232,162,0.4)',
      'color:#2de8a2',
      'font-size:12px',
      'font-weight:600',
      'font-family:inherit',
      'cursor:pointer',
      '-webkit-tap-highlight-color:transparent',
      'transition:background 0.15s',
    ].join(';');
    btn.addEventListener('click', function () { signIn(); });

    _bannerEl.appendChild(label);
    _bannerEl.appendChild(btn);

    // Wait for body if called very early
    if (document.body) {
      document.body.appendChild(_bannerEl);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(_bannerEl);
      }, { once: true });
    }
  }

  function _hideBanner() {
    if (_bannerEl && _bannerEl.parentNode) {
      _bannerEl.parentNode.removeChild(_bannerEl);
    }
    _bannerEl = null;
  }

  // ── Public: getToken ──────────────────────────────────────────────
  // Returns the stored access token if still valid, otherwise null.
  // When null is returned mid-session the re-auth banner is shown.
  async function getToken() {
    const stored = _load();
    if (!stored) return null;
    if (stored.access_token && Date.now() < (stored.expiry || 0)) {
      return stored.access_token;
    }
    // Token found but expired — show the non-blocking banner
    _showBanner();
    return null;
  }

  // ── GIS token callback ────────────────────────────────────────────
  function _onToken(resp) {
    if (resp.error) {
      console.error('[GoogleAuth] Token error:', resp.error, resp.error_description || '');
      if (_callbacks.onSignIn) _callbacks.onSignIn(null, resp.error + (resp.error_description ? ': ' + resp.error_description : ''));
      return;
    }
    const expiry = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000; // 60s safety margin
    _save({ access_token: resp.access_token, expiry, scope: resp.scope || SCOPES });
    _hideBanner();
    console.log('[GoogleAuth] Token received, valid for', resp.expires_in || 3600, 's');
    if (_callbacks.onSignIn) _callbacks.onSignIn(resp.access_token, null);
  }

  // ── Public: _onGISReady ───────────────────────────────────────────
  // Called by the GIS <script onload="GoogleAuth._onGISReady()"> attribute.
  function _onGISReady() {
    if (_gisReady) return;
    _gisReady = true;

    _tokenClient = global.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPES,
      callback:  _onToken,
    });

    const stored = _load();
    if (stored && stored.access_token && Date.now() < (stored.expiry || 0)) {
      // Valid token — ready immediately
      console.log('[GoogleAuth] Valid stored token found');
      if (_callbacks.onReady) _callbacks.onReady(stored.access_token);
    } else if (stored) {
      // Had a session before, token just expired — show re-auth prompt
      console.log('[GoogleAuth] Stored token expired');
      if (_callbacks.onExpired) _callbacks.onExpired();
      else if (_callbacks.onNeedAuth) _callbacks.onNeedAuth(); // fallback
    } else {
      // No stored token — first time or cleared
      console.log('[GoogleAuth] No stored token');
      if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
    }
  }

  // ── Public: init ──────────────────────────────────────────────────
  // Register page callbacks. Call this anywhere in your page's <script>.
  // Callbacks:
  //   onReady(token)     — valid token already in storage on page load
  //   onNeedAuth()       — no token at all (first-time sign-in)
  //   onExpired()        — had a previous session but token has expired
  //   onSignIn(tok, err) — user completed sign-in (err=null on success)
  //   onSignOut()        — explicit sign-out called
  function init(callbacks) {
    _callbacks = callbacks || {};
    // Handle the case where GIS loaded before init() was called
    if (_gisReady) {
      const stored = _load();
      if (stored && stored.access_token && Date.now() < (stored.expiry || 0)) {
        if (_callbacks.onReady) _callbacks.onReady(stored.access_token);
      } else if (stored) {
        if (_callbacks.onExpired) _callbacks.onExpired();
        else if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
      } else {
        if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
      }
    }
  }

  // ── Public: signIn ────────────────────────────────────────────────
  // Triggers the Google token popup. Uses prompt:'' for silent re-auth
  // when a previous session exists (avoids showing the account picker).
  function signIn() {
    if (!_tokenClient) { console.error('[GoogleAuth] GIS not ready yet'); return; }
    const stored = _load();
    const hadSession = !!(stored); // had a session before (even if expired)
    _tokenClient.requestAccessToken({ prompt: hadSession ? '' : 'consent' });
  }

  // ── Public: signOut ───────────────────────────────────────────────
  function signOut() {
    _clear();
    _hideBanner();
    if (_callbacks.onSignOut) _callbacks.onSignOut();
  }

  function isAuthenticated() {
    const s = _load();
    return !!(s && s.access_token && Date.now() < (s.expiry || 0));
  }

  global.GoogleAuth = { init, signIn, signOut, getToken, isAuthenticated, _onGISReady };

})(window);
