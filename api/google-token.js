// api/google-token.js
// Server-side token manager for Google OAuth.
// Keeps the refresh token in Supabase — it never touches the browser.
//
// POST { action: 'refresh' }  → returns { access_token, expiry }
//                               (reads from Supabase, refreshes if expired)
// POST { action: 'revoke'  }  → clears the stored tokens from Supabase

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SUPA_URL = process.env.SUPABASE_URL     || 'https://oyylbiscxnymnmetyrho.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eWxiaXNjeG55bW5tZXR5cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzQ1MDgsImV4cCI6MjA5NTcxMDUwOH0.3xxHcp3Z4vJWHEGFV_iUW_YeJ2gdUPqYiNAQkYnR-qU';

// ── Supabase helpers ─────────────────────────────────────────────────
async function supaRead(key) {
  const res = await fetch(
    SUPA_URL + '/rest/v1/app_state?key=eq.' + encodeURIComponent(key) + '&select=data&limit=1',
    {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows && rows[0] && rows[0].data) || null;
}

async function supaUpsert(key, data) {
  await fetch(SUPA_URL + '/rest/v1/app_state?on_conflict=key', {
    method:  'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
  });
}

async function supaDelete(key) {
  await fetch(SUPA_URL + '/rest/v1/app_state?key=eq.' + encodeURIComponent(key), {
    method:  'DELETE',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
    },
  });
}

// ── Body reader helper ────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

// ── Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  let action = 'refresh';
  try {
    const body = await readBody(req);
    if (body) ({ action = 'refresh' } = JSON.parse(body));
  } catch (_) {}

  // ── Revoke: clear stored tokens ───────────────────────────────────
  if (action === 'revoke') {
    await supaDelete('google_oauth');
    return res.json({ ok: true });
  }

  // ── Refresh: return a valid access token ──────────────────────────
  const stored = await supaRead('google_oauth');
  if (!stored || !stored.refresh_token) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  // Return cached token if still valid (with 60s safety margin)
  if (stored.access_token && stored.expiry && Date.now() < stored.expiry - 60000) {
    return res.json({ access_token: stored.access_token, expiry: stored.expiry });
  }

  // Token expired — call Google to refresh it
  const clientId     = process.env.GOOGLE_CLIENT_ID
    || '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('[google-token] GOOGLE_CLIENT_SECRET not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  let refreshed;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        refresh_token: stored.refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }).toString(),
    });
    refreshed = await tokenRes.json();
  } catch (err) {
    console.error('[google-token] Refresh fetch error:', err.message);
    return res.status(502).json({ error: 'refresh_fetch_failed' });
  }

  if (refreshed.error) {
    console.error('[google-token] Google refresh error:', refreshed.error, refreshed.error_description);
    // If the refresh token itself is invalid/revoked, delete stored data
    if (refreshed.error === 'invalid_grant') {
      await supaDelete('google_oauth');
    }
    return res.status(401).json({ error: refreshed.error, error_description: refreshed.error_description });
  }

  const expiry = Date.now() + ((refreshed.expires_in || 3600) * 1000) - 60000;

  // Persist updated access token (keep existing refresh_token and other fields)
  await supaUpsert('google_oauth', Object.assign({}, stored, {
    access_token: refreshed.access_token,
    expiry,
  }));

  console.log('[google-token] Token refreshed successfully');
  return res.json({ access_token: refreshed.access_token, expiry });
};
