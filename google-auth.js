// google-auth.js — Shared Google OAuth helper for Axis
// Manages persistent Google auth using the authorization code flow so that
// access tokens can be silently refreshed without prompting the user again.
//
// Storage: 'google_auth' → { access_token, refresh_token, expiry, scope }
// Legacy:  'google_calendar_token' is mirrored for backwards compatibility.
//
// SETUP REQUIREMENTS:
//  1. Add GOOGLE_CLIENT_SECRET to Vercel environment variables.
//  2. Add 'postmessage' to Authorized Redirect URIs in Google Cloud Console
//     (APIs & Services → Credentials → your OAuth 2.0 Client ID → Edit).
//
// USAGE (in each page):
//  1. <script src="google-auth.js"> before the GIS script.
//  2. Change the GIS <script> onload to: onload="GoogleAuth._onGISReady()"
//  3. Call GoogleAuth.init({ onReady, onNeedAuth, onSignIn, onSignOut })
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
  const TOKEN_API   = '/api/google-token';

  let _codeClient = null;
  let _callbacks  = {};
  let _gisReady   = false;
  let _refreshing = null; // in-flight Promise — deduplicates concurrent refresh calls

  // ── Storage ───────────────────────────────────────────────────────
  function _load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored) return stored;
      // Migrate from legacy key so the current session stays live after first deploy
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && legacy.token && Date.now() < (legacy.expiry || 0)) {
        return { access_token: legacy.token, refresh_token: null, expiry: legacy.expiry, scope: '' };
      }
    } catch (_) {}
    return null;
  }

  function _save(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (_) {}
    // Mirror to legacy key so any page that still reads google_calendar_token keeps working
    if (obj && obj.access_token) {
      try {
        localStorage.setItem(LEGACY_KEY, JSON.stringify({ token: obj.access_token, expiry: obj.expiry }));
      } catch (_) {}
    }
  }

  function _clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(LEGACY_KEY); }  catch (_) {}
  }

  // ── Token API calls ───────────────────────────────────────────────
  async function _post(body) {
    const res  = await fetch(TOKEN_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error_description || data.error || ('HTTP ' + res.status));
    }
    return data;
  }

  // ── Public: getToken ──────────────────────────────────────────────
  // Returns a valid access token, silently refreshing if expired.
  // Returns null when not authenticated — caller should show sign-in UI.
  async function getToken() {
    const stored = _load();
    if (!stored) return null;

    // Token still valid (with a 60 s safety margin built in at save time)
    if (stored.access_token && Date.now() < (stored.expiry || 0)) {
      return stored.access_token;
    }

    // Expired — try silent refresh
    if (!stored.refresh_token) {
      // No refresh token means the user used the old implicit flow; clear and re-auth
      _clear();
      if (_callbacks.onSignOut) _callbacks.onSignOut();
      return null;
    }

    // Deduplicate: if another caller is already refreshing, wait for the same promise
    if (_refreshing) return _refreshing;

    _refreshing = (async () => {
      try {
        const refreshed = await _post({ refresh_token: stored.refresh_token });
        const expiry    = Date.now() + ((refreshed.expires_in || 3600) * 1000) - 60000;
        _save(Object.assign({}, stored, { access_token: refreshed.access_token, expiry }));
        console.log('[GoogleAuth] Token refreshed silently');
        return refreshed.access_token;
      } catch (err) {
        console.warn('[GoogleAuth] Silent refresh failed:', err.message);
        _clear();
        if (_callbacks.onSignOut) _callbacks.onSignOut();
        return null;
      } finally {
        _refreshing = null;
      }
    })();

    return _refreshing;
  }

  // ── GIS authorization code callback ──────────────────────────────
  async function _onCode(resp) {
    if (resp.error) {
      const msg = resp.error + (resp.error_description ? ': ' + resp.error_description : '');
      console.error('[GoogleAuth] Code flow error:', msg);
      if (_callbacks.onSignIn) _callbacks.onSignIn(null, msg);
      return;
    }
    try {
      const tokens = await _post({ code: resp.code });
      const expiry  = Date.now() + ((tokens.expires_in || 3600) * 1000) - 60000;
      _save({
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiry,
        scope: tokens.scope || SCOPES,
      });
      if (!tokens.refresh_token) {
        console.warn('[GoogleAuth] No refresh_token in response — ensure prompt=consent and access_type=offline are set');
      }
      console.log('[GoogleAuth] Signed in. Refresh token:', tokens.refresh_token ? 'received' : 'NOT received');
      if (_callbacks.onSignIn) _callbacks.onSignIn(tokens.access_token, null);
    } catch (err) {
      console.error('[GoogleAuth] Code exchange failed:', err.message);
      if (_callbacks.onSignIn) _callbacks.onSignIn(null, err.message);
    }
  }

  // ── Public: _onGISReady ───────────────────────────────────────────
  // Called by the GIS <script onload="GoogleAuth._onGISReady()"> attribute.
  function _onGISReady() {
    if (_gisReady) return;
    _gisReady = true;

    // Authorization code flow — returns a code, not a token.
    // The code is exchanged server-side via /api/google-token for access + refresh tokens.
    _codeClient = global.google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope:     SCOPES,
      ux_mode:   'popup',
      callback:  _onCode,
    });

    // Check if we have a stored (possibly expired-but-refreshable) token
    getToken().then(function (tok) {
      if (tok) {
        if (_callbacks.onReady) _callbacks.onReady(tok);
      } else {
        if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
      }
    });
  }

  // ── Public: init ──────────────────────────────────────────────────
  // Register callbacks. Call this anywhere in your page's <script>.
  // Callbacks:
  //   onReady(token)     — called when a valid token is already stored
  //   onNeedAuth()       — called when user must sign in
  //   onSignIn(tok, err) — called after user completes sign-in (err=null on success)
  //   onSignOut()        — called when token is cleared (expired + no refresh, or explicit sign-out)
  function init(callbacks) {
    _callbacks = callbacks || {};
    // If GIS fired before init() was called (unlikely but possible with fast connections)
    if (_gisReady) {
      getToken().then(function (tok) {
        if (tok) { if (_callbacks.onReady) _callbacks.onReady(tok); }
        else      { if (_callbacks.onNeedAuth) _callbacks.onNeedAuth(); }
      });
    }
  }

  // ── Public: signIn ────────────────────────────────────────────────
  // Triggers the Google sign-in popup (authorization code flow).
  // prompt='consent' ensures Google always returns a refresh token.
  function signIn() {
    if (!_codeClient) { console.error('[GoogleAuth] GIS not ready yet'); return; }
    _codeClient.requestCode({ prompt: 'consent', access_type: 'offline' });
  }

  // ── Public: signOut ───────────────────────────────────────────────
  function signOut() {
    _clear();
    if (_callbacks.onSignOut) _callbacks.onSignOut();
  }

  function isAuthenticated() {
    const s = _load();
    return !!(s && (s.access_token || s.refresh_token));
  }

  global.GoogleAuth = { init, signIn, signOut, getToken, isAuthenticated, _onGISReady };

})(window);
