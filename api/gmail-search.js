// api/gmail-search.js
// Full-text Gmail search for the Axis AI assistant.
//
// GET /api/gmail-search?q=<gmail search query>
//   → searches the user's mailbox with the Gmail query syntax
//   → returns up to 10 matches as { results: [{ id, sender, subject, date, snippet }] }
//
// The Gmail access token is read from Supabase (app_state key='google_oauth')
// using the same storage pattern as api/google-token.js, and refreshed via
// Google if it has expired. The refresh token never touches the browser.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SUPA_URL = process.env.SUPABASE_URL     || 'https://oyylbiscxnymnmetyrho.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eWxiaXNjeG55bW5tZXR5cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzQ1MDgsImV4cCI6MjA5NTcxMDUwOH0.3xxHcp3Z4vJWHEGFV_iUW_YeJ2gdUPqYiNAQkYnR-qU';

// ── Supabase helpers (mirror api/google-token.js) ────────────────────
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

// ── Token: return a valid Gmail access token (refresh if expired) ─────
// Returns { access_token } on success, or { error, status } on failure.
async function getAccessToken() {
  const stored = await supaRead('google_oauth');
  if (!stored || !stored.refresh_token) {
    return { error: 'not_authenticated', status: 401 };
  }

  // Cached token still valid (60s safety margin)
  if (stored.access_token && stored.expiry && Date.now() < stored.expiry - 60000) {
    return { access_token: stored.access_token };
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID
    || '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('[gmail-search] GOOGLE_CLIENT_SECRET not set');
    return { error: 'server_misconfigured', status: 500 };
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
    console.error('[gmail-search] Refresh fetch error:', err.message);
    return { error: 'refresh_fetch_failed', status: 502 };
  }

  if (refreshed.error) {
    console.error('[gmail-search] Google refresh error:', refreshed.error, refreshed.error_description);
    if (refreshed.error === 'invalid_grant') await supaDelete('google_oauth');
    return { error: refreshed.error, status: 401 };
  }

  const expiry = Date.now() + ((refreshed.expires_in || 3600) * 1000) - 60000;
  await supaUpsert('google_oauth', Object.assign({}, stored, {
    access_token: refreshed.access_token,
    expiry,
  }));

  return { access_token: refreshed.access_token };
}

// ── Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  // ── Resolve a valid access token ──────────────────────────────────
  const tok = await getAccessToken();
  if (tok.error) {
    return res.status(tok.status || 401).json({ error: tok.error });
  }
  const accessToken = tok.access_token;
  const authHeader  = { 'Authorization': 'Bearer ' + accessToken };

  try {
    // ── 1. List matching message IDs ────────────────────────────────
    const listUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
      + '?q=' + encodeURIComponent(q) + '&maxResults=10';
    const listRes = await fetch(listUrl, { headers: authHeader });
    if (!listRes.ok) {
      const txt = await listRes.text().catch(() => '');
      console.error('[gmail-search] list error', listRes.status, txt.slice(0, 300));
      return res.status(502).json({ error: 'gmail_list_failed', status: listRes.status });
    }
    const msgs = (await listRes.json()).messages || [];

    if (!msgs.length) return res.status(200).json({ query: q, results: [] });

    // ── 2. Fetch metadata + snippet for each match ──────────────────
    const details = await Promise.all(msgs.map(function (m) {
      const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id
        + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
      return fetch(url, { headers: authHeader })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }));

    const results = details.filter(Boolean).map(function (msg) {
      const hdrs    = (msg.payload && msg.payload.headers) || [];
      const getHdr  = function (n) { return (hdrs.find(function (h) { return h.name === n; }) || {}).value || ''; };
      const from    = getHdr('From');
      const subject = getHdr('Subject') || '(No subject)';
      const date    = getHdr('Date');
      const m2      = from.match(/^(.+?)\s*<[^>]+>$/);
      const sender  = m2 ? m2[1].replace(/^"|"$/g, '').trim() : (from.split('@')[0] || from);
      return {
        id:      msg.id,
        sender:  sender,
        subject: subject,
        date:    date,
        snippet: (msg.snippet || '').slice(0, 200),
      };
    });

    return res.status(200).json({ query: q, results });
  } catch (err) {
    console.error('[gmail-search] error:', err.message);
    return res.status(500).json({ error: 'gmail_search_failed' });
  }
};
