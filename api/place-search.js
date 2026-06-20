// api/place-search.js
// Find places / businesses by name or category for the Axis AI assistant.
// Backed by OpenStreetMap Nominatim (free, no API key).
//
// GET /api/place-search?q=<what>&near=<where>
//   → { query, results: [{ name, address, category, lat, lon }] }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'AxisDashboard/1.0 (https://y-tdashh1-puce.vercel.app)';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const q    = (req.query && req.query.q    ? String(req.query.q)    : '').trim();
  const near = (req.query && req.query.near ? String(req.query.near) : '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  const query = near ? (q + ', ' + near) : q;

  try {
    const url = NOMINATIM + '?format=jsonv2&addressdetails=1&limit=6&q=' + encodeURIComponent(query);
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    if (!r.ok) return res.status(502).json({ error: 'place_search_failed', status: r.status });

    const rows = await r.json();
    const results = (Array.isArray(rows) ? rows : []).map(function (row) {
      return {
        name:     row.name || (row.display_name || '').split(',')[0],
        address:  row.display_name || '',
        category: row.type || row.category || '',
        lat:      row.lat,
        lon:      row.lon,
      };
    });

    return res.status(200).json({ query: query, results: results });
  } catch (err) {
    console.error('[place-search] error:', err.message);
    return res.status(500).json({ error: 'place_search_failed' });
  }
};
