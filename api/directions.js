// api/directions.js
// Driving distance + travel time between two places for the Axis AI assistant.
// Free stack: OpenStreetMap Nominatim (geocoding) + OSRM demo server (routing).
// No API key required.
//
// GET /api/directions?from=<place>&to=<place>
//   → { from, to, distance_km, duration_min, summary }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving/';
const UA = 'AxisDashboard/1.0 (https://y-tdashh1-puce.vercel.app)';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function geocode(place) {
  const url = NOMINATIM + '?format=jsonv2&limit=1&q=' + encodeURIComponent(place);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const rows = await r.json();
  const hit = Array.isArray(rows) && rows[0];
  if (!hit) return null;
  return { lat: hit.lat, lon: hit.lon, name: hit.display_name || place };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const from = (req.query && req.query.from ? String(req.query.from) : '').trim();
  const to   = (req.query && req.query.to   ? String(req.query.to)   : '').trim();
  if (!from || !to) return res.status(400).json({ error: 'Both "from" and "to" are required' });

  try {
    const origin = await geocode(from);
    await sleep(1100); // Nominatim asks for <= 1 request/second
    const dest   = await geocode(to);

    if (!origin) return res.status(200).json({ error: 'Could not find a location for "' + from + '"' });
    if (!dest)   return res.status(200).json({ error: 'Could not find a location for "' + to + '"' });

    const path = OSRM + origin.lon + ',' + origin.lat + ';' + dest.lon + ',' + dest.lat + '?overview=false';
    const r = await fetch(path);
    if (!r.ok) return res.status(502).json({ error: 'routing_failed', status: r.status });
    const data  = await r.json();
    const route = data && data.routes && data.routes[0];
    if (!route) return res.status(200).json({ error: 'No driving route found between those places.' });

    const km  = Math.round(route.distance / 100) / 10;     // 1 decimal
    const min = Math.round(route.duration / 60);
    const hrs = Math.floor(min / 60);
    const dur = hrs > 0 ? (hrs + 'h ' + (min % 60) + 'min') : (min + ' min');

    return res.status(200).json({
      from:         origin.name,
      to:           dest.name,
      distance_km:  km,
      duration_min: min,
      summary:      'Driving from ' + origin.name + ' to ' + dest.name + ': about ' + km + ' km, ~' + dur + '.',
    });
  } catch (err) {
    console.error('[directions] error:', err.message);
    return res.status(500).json({ error: 'directions_failed' });
  }
};
