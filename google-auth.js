// google-auth.js — Google OAuth helper for Axis (server-side token flow)
//
// How it works:
//   • signIn()    → full-page redirect to Google OAuth with access_type=offline&prompt=consent
//   • Google      → redirects to /api/google-callback (Vercel function)
//   • Callback    → exchanges code for access_token + refresh_token, stores both in Supabase
//   • getToken()  → POST /api/google-token { action:'refresh' }
//                   Server checks Supabase; refreshes via Google if expired; returns access_token
//
// The refresh token NEVER touches the browser. No localStorage, no GIS library.
//
// INTERFACE (same callbacks as before so pages need minimal changes):
//   GoogleAuth.init({ onReady(tok), onNeedAuth(), onSignIn(tok,err), onSignOut() })
//   GoogleAuth.signIn()           — redirects to Google sign-in
//   GoogleAuth.signOut()          — clears Supabase token, fires onSignOut
//   GoogleAuth.getToken()         — async; returns access_token or null
//   GoogleAuth.isAuthenticated()  — async; returns boolean

(function (global) {
  'use strict';

  const CLIENT_ID   = '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const REDIRECT_URI = 'https://y-tdashh1-puce.vercel.app/api/google-callback';
  const SCOPES      = 'https://www.googleapis.com/auth/calendar '
                    + 'https://www.googleapis.com/auth/gmail.readonly '
                    + 'https://www.googleapis.com/auth/gmail.modify '
                    + 'https://www.googleapis.com/auth/gmail.send';

  let _callbacks    = {};
  // In-memory cache so we don't hit the server on every single API call within a page load
  let _cachedToken  = null;
  let _cacheExpiry  = 0;
  let _inflight     = null; // deduplicates concurrent getToken() calls

  // ── Public: getToken ──────────────────────────────────────────────
  // Returns a valid access token or null if not authenticated.
  // Hits /api/google-token which reads from Supabase and refreshes if needed.
  async function getToken() {
    // Return in-memory cached value if still fresh (refresh 5 min before server expiry)
    if (_cachedToken && Date.now() < _cacheExpiry) {
      return _cachedToken;
    }

    // Deduplicate: multiple callers waiting for the same request share one fetch
    if (_inflight) return _inflight;

    _inflight = (async () => {
      try {
        const res = await fetch('/api/google-token', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'refresh' }),
        });

        if (res.status === 401) {
          // No stored token or refresh token revoked
          _cachedToken = null;
          _cacheExpiry = 0;
          return null;
        }
        if (!res.ok) {
          console.warn('[GoogleAuth] /api/google-token returned', res.status);
          return null;
        }

        const data = await res.json();
        if (!data.access_token) return null;

        _cachedToken = data.access_token;
        // Cache until 5 minutes before server-reported expiry to ensure freshness
        _cacheExpiry = (data.expiry || (Date.now() + 3540 * 1000)) - 300000;
        return _cachedToken;
      } catch (err) {
        console.warn('[GoogleAuth] getToken fetch failed:', err.message);
        return null;
      } finally {
        _inflight = null;
      }
    })();

    return _inflight;
  }

  // ── Public: signIn ────────────────────────────────────────────────
  // Redirects the page to Google's OAuth consent screen.
  // The originating page path is encoded in state so the callback can
  // redirect back to the right page after auth.
  function signIn() {
    const state = encodeURIComponent(global.location.pathname);
    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',
      prompt:        'consent',   // ensures Google always returns a refresh_token
      state,
    });
    global.location.href =
      'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  // ── Public: signOut ───────────────────────────────────────────────
  // Clears stored tokens from Supabase and fires the onSignOut callback.
  async function signOut() {
    _cachedToken = null;
    _cacheExpiry = 0;
    try {
      await fetch('/api/google-token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'revoke' }),
      });
    } catch (_) {}
    if (_callbacks.onSignOut) _callbacks.onSignOut();
  }

  // ── Public: init ──────────────────────────────────────────────────
  // Register page callbacks and check auth state immediately.
  // Callbacks:
  //   onReady(token)     — a valid token was obtained on page load
  //   onNeedAuth()       — no token (first time or after revocation)
  //   onSignIn(tok, err) — kept for API compat; not fired by init() in this flow
  //   onSignOut()        — called by signOut()
  function init(callbacks) {
    _callbacks = callbacks || {};
    _boot();
  }

  async function _boot() {
    // Handle ?auth_error= query param set by the callback on failure
    try {
      const params = new URLSearchParams(global.location.search);
      const authErr = params.get('auth_error');
      if (authErr) {
        console.error('[GoogleAuth] Auth error from redirect:', authErr);
        // Clean up the URL
        params.delete('auth_error');
        const newUrl = global.location.pathname + (params.toString() ? '?' + params.toString() : '');
        global.history.replaceState({}, '', newUrl);
        if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
        return;
      }
    } catch (_) {}

    const tok = await getToken();
    if (tok) {
      if (_callbacks.onReady) _callbacks.onReady(tok);
    } else {
      if (_callbacks.onNeedAuth) _callbacks.onNeedAuth();
    }
  }

  // ── Public: isAuthenticated ───────────────────────────────────────
  async function isAuthenticated() {
    return !!(await getToken());
  }

  // ── Backwards-compat stubs ────────────────────────────────────────
  // These were used by the old implicit flow; kept so any page that calls them
  // doesn't throw, but they're no-ops in the server-side flow.
  function _onGISReady() {}  // GIS script tag can be safely removed

  global.GoogleAuth = {
    init,
    signIn,
    signOut,
    getToken,
    isAuthenticated,
    _onGISReady,
  };

})(window);
