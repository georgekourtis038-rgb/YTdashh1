// api/web-search.js
// Live web search for the Axis AI assistant, backed by Tavily.
//
// GET /api/web-search?q=<query>
//   → runs a Tavily search (LLM-optimized: returns a synthesized answer plus
//     ranked source results)
//   → returns { query, answer, results: [{ title, url, content }] }
//
// Requires the TAVILY_API_KEY environment variable (set in Vercel).
// The key is never exposed to the browser — the page calls this endpoint.

const TAVILY_URL = 'https://api.tavily.com/search';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error('[web-search] TAVILY_API_KEY not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    const upstream = await fetch(TAVILY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:        apiKey,
        query:          q,
        search_depth:   'basic',
        include_answer: true,
        max_results:    6,
      }),
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      console.error('[web-search] Tavily error', upstream.status, txt.slice(0, 300));
      return res.status(502).json({ error: 'search_failed', status: upstream.status });
    }

    const data    = await upstream.json();
    const results = (Array.isArray(data.results) ? data.results : []).map(function (r) {
      return {
        title:   r.title || '',
        url:     r.url || '',
        content: (r.content || '').slice(0, 500),
      };
    });

    return res.status(200).json({
      query:   q,
      answer:  data.answer || '',
      results: results,
    });
  } catch (err) {
    console.error('[web-search] error:', err.message);
    return res.status(500).json({ error: 'web_search_failed' });
  }
};
