// api/google-callback.js
// Handles the OAuth 2.0 authorization code redirect from Google.
// Flow: Google → GET /api/google-callback?code=XXX&state=YYY
//        → exchange code for tokens
//        → store in Supabase app_state key='google_oauth'
//        → redirect back to originating page (encoded in state)

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL     = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REDIRECT_URI     = 'https://y-tdashh1-puce.vercel.app/api/google-callback';

const SUPA_URL = process.env.SUPABASE_URL     || 'https://oyylbiscxnymnmetyrho.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eWxiaXNjeG55bW5tZXR5cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzQ1MDgsImV4cCI6MjA5NTcxMDUwOH0.3xxHcp3Z4vJWHEGFV_iUW_YeJ2gdUPqYiNAQkYnR-qU';

async function supaUpsert(key, data) {
  const res = await fetch(SUPA_URL + '/rest/v1/app_state?on_conflict=key', {
    method:  'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[google-callback] Supabase upsert error', res.status, txt);
  }
}

module.exports = async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const query    = req.query || {};
  const code     = query.code;
  const state    = query.state || '';
  const oauthErr = query.error;

  // Decode the return-to path from state (set by signIn() in google-auth.js)
  let returnTo = '/calendar.html';
  try {
    const decoded = decodeURIComponent(state);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) returnTo = decoded;
  } catch (_) {}

  if (oauthErr) {
    console.error('[google-callback] OAuth error from Google:', oauthErr);
    return res.redirect(302, returnTo + '?auth_error=' + encodeURIComponent(oauthErr));
  }

  if (!code) {
    return res.status(400).send('Missing code parameter');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
    || '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('[google-callback] GOOGLE_CLIENT_SECRET not set');
    return res.status(500).send('Server misconfigured: GOOGLE_CLIENT_SECRET not set');
  }

  // ── Exchange authorization code for tokens ────────────────────────
  let tokens;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }).toString(),
    });
    tokens = await tokenRes.json();
  } catch (err) {
    console.error('[google-callback] Token exchange fetch error:', err.message);
    return res.redirect(302, returnTo + '?auth_error=token_exchange_failed');
  }

  if (tokens.error) {
    console.error('[google-callback] Token exchange error:', tokens.error, tokens.error_description);
    return res.redirect(302, returnTo + '?auth_error=' + encodeURIComponent(tokens.error));
  }

  if (!tokens.refresh_token) {
    console.warn('[google-callback] No refresh_token in response — user may need to revoke access and re-auth');
  }

  // ── Fetch user email ──────────────────────────────────────────────
  let email = '';
  try {
    const userRes = await fetch(USERINFO_URL, {
      headers: { 'Authorization': 'Bearer ' + tokens.access_token },
    });
    if (userRes.ok) {
      const user = await userRes.json();
      email = user.email || '';
    }
  } catch (_) {}

  // ── Store in Supabase ─────────────────────────────────────────────
  const expiry = Date.now() + ((tokens.expires_in || 3600) * 1000) - 60000;
  await supaUpsert('google_oauth', {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expiry,
    scope:         tokens.scope || '',
    email,
  });

  console.log('[google-callback] Stored tokens for', email, '— redirecting to', returnTo);

  // ── Redirect back to the page the user came from ──────────────────
  return res.redirect(302, returnTo);
};
