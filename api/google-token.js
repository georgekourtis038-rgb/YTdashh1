// api/google-token.js
// Handles two operations:
//   POST { code }           → exchange auth code for access_token + refresh_token
//   POST { refresh_token }  → exchange refresh token for a new access_token
//
// Requires GOOGLE_CLIENT_SECRET in Vercel environment variables.
// GOOGLE_CLIENT_ID can also live there or defaults to the hardcoded value.
//
// IMPORTANT: Add 'postmessage' to Authorized Redirect URIs in Google Cloud Console.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId     = process.env.GOOGLE_CLIENT_ID
    || '199459906303-10ecosetgbh9tucisnoufu942dkoj13k.apps.googleusercontent.com';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('[google-token] GOOGLE_CLIENT_SECRET is not set');
    return res.status(500).json({ error: 'GOOGLE_CLIENT_SECRET not configured on server' });
  }

  // Read body
  let bodyText = '';
  try {
    bodyText = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  let payload;
  try { payload = JSON.parse(bodyText); }
  catch (_) { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { code, refresh_token } = payload;

  if (!code && !refresh_token) {
    return res.status(400).json({ error: 'Provide either code or refresh_token' });
  }

  let params;
  if (code) {
    // First auth: exchange authorization code for tokens
    params = new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  'postmessage',
      grant_type:    'authorization_code',
    });
  } else {
    // Silent refresh: exchange refresh token for a new access token
    params = new URLSearchParams({
      refresh_token,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    });
  }

  try {
    const upstream = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    const data = await upstream.json();
    if (!upstream.ok || data.error) {
      console.error('[google-token] Google error:', JSON.stringify(data));
      return res.status(upstream.ok ? 400 : upstream.status).json({
        error: data.error || 'token_error',
        error_description: data.error_description || '',
      });
    }
    // Return only the fields clients need
    return res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || null,   // only present on first auth
      expires_in:    data.expires_in    || 3600,
      scope:         data.scope         || '',
    });
  } catch (err) {
    console.error('[google-token] fetch error:', err.message);
    return res.status(500).json({ error: 'proxy_error', error_description: err.message });
  }
};
