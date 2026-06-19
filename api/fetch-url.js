// api/fetch-url.js
// Fetch a single web page and return its readable text for the Axis AI
// assistant (so it can read a specific link in depth, not just a snippet).
//
// GET /api/fetch-url?url=<page url>
//   → { url, title, content }   (HTML stripped to ~6k chars of text)
//
// Basic SSRF guard: only http/https, and private/loopback hosts are blocked.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  let url = (req.query && req.query.url ? String(req.query.url) : '').trim();
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // ── SSRF guard ────────────────────────────────────────────────────
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: 'invalid_protocol' });
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')
      || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)
      || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
      || host === '::1' || host === '[::1]') {
      return res.status(400).json({ error: 'blocked_host' });
    }
  } catch (_) {
    return res.status(400).json({ error: 'invalid_url' });
  }

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AxisBot/1.0; +https://axis.app)' },
      redirect: 'follow',
    });
    if (!r.ok) return res.status(502).json({ error: 'fetch_failed', status: r.status });

    const ct = r.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ct)) {
      return res.status(415).json({ error: 'unsupported_content_type', contentType: ct });
    }

    let html = (await r.text()).slice(0, 200000); // cap input size
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    return res.status(200).json({ url: r.url || url, title: title, content: text });
  } catch (err) {
    console.error('[fetch-url] error:', err.message);
    return res.status(500).json({ error: 'fetch_failed' });
  }
};
