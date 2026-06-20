// api/future-george.js
// Read / write the "Future George" profile for the Axis AI assistant.
// Stored in Supabase: app_state table, row key = 'future-george', JSON in `data`.
//
//   GET  /api/future-george           -> { profile: {...} | null }
//   POST /api/future-george  { profile } -> { ok: true, profile }
//
// The profile shape is documented in .claude/future-george.md. This endpoint is
// schema-agnostic — it stores whatever object the client sends, stamping updatedAt.

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://oyylbiscxnymnmetyrho.supabase.co';

// Prefer a service-role key (server-side, full access). Fall back to the anon key
// that already ships publicly in topbar.js so the endpoint works without extra config.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95eWxiaXNjeG55bW5tZXR5cmhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzQ1MDgsImV4cCI6MjA5NTcxMDUwOH0.3xxHcp3Z4vJWHEGFV_iUW_YeJ2gdUPqYiNAQkYnR-qU';

const ROW_KEY  = 'future-george';
const REST_URL = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/app_state';

function supaHeaders(extra) {
  return Object.assign({
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
  }, extra || {});
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[future-george] Supabase not configured');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  // ── READ ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const url = REST_URL + '?key=eq.' + encodeURIComponent(ROW_KEY) + '&select=data';
      const r   = await fetch(url, { headers: supaHeaders() });
      if (!r.ok) {
        console.error('[future-george] read failed:', r.status);
        return res.status(502).json({ error: 'read_failed', status: r.status });
      }
      const rows = await r.json();
      const profile = Array.isArray(rows) && rows[0] && rows[0].data ? rows[0].data : null;
      return res.status(200).json({ profile });
    } catch (err) {
      console.error('[future-george] read error:', err.message);
      return res.status(500).json({ error: 'read_error' });
    }
  }

  // ── WRITE ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let bodyText = '';
    try {
      bodyText = await new Promise((resolve, reject) => {
        let d = '';
        req.on('data', chunk => { d += chunk; });
        req.on('end',  () => resolve(d));
        req.on('error', reject);
      });
    } catch (_) {
      return res.status(400).json({ error: 'Failed to read request body' });
    }

    let profile;
    try {
      const parsed = JSON.parse(bodyText || '{}');
      // Accept either { profile: {...} } or a bare profile object.
      profile = parsed && parsed.profile ? parsed.profile : parsed;
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return res.status(400).json({ error: 'profile object required' });
    }

    profile.updatedAt = new Date().toISOString();

    try {
      // Upsert on the primary key `key` (merge-duplicates so this row is replaced).
      const r = await fetch(REST_URL + '?on_conflict=key', {
        method:  'POST',
        headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify([{ key: ROW_KEY, data: profile, updated_at: profile.updatedAt }]),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[future-george] write failed:', r.status, detail.slice(0, 200));
        return res.status(502).json({ error: 'write_failed', status: r.status });
      }
      return res.status(200).json({ ok: true, profile });
    } catch (err) {
      console.error('[future-george] write error:', err.message);
      return res.status(500).json({ error: 'write_error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
