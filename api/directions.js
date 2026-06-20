// api/directions.js
// Distance + travel time between two places for the Axis AI assistant.
//
// Primary backend: Google Routes API (v2:computeRoutes) — traffic-aware drive
// times plus walking / cycling / transit, when a Google key is set.
// Fallback: OpenStreetMap Nominatim geocoding + OSRM routing (driving only,
// free, no key) when the key is absent or Google errors.
//
// GET /api/directions?from=<place>&to=<place>&mode=driving|walking|cycling|transit
//   → { from, to, mode, distance_km, duration_min, summary }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving/';
const ROUTES    = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const UA = 'AxisDashboard/1.0 (https://y-tdashh1-puce.vercel.app)';

const MODE = {
  driving: 'DRIVE', drive: 'DRIVE', car: 'DRIVE',
  walking: 'WALK', walk: 'WALK',
  cycling: 'BICYCLE', bike: 'BICYCLE', bicycle: 'BICYCLE',
  transit: 'TRANSIT', train: 'TRANSIT', bus: 'TRANSIT',
};
const MODE_LABEL = { DRIVE: 'Driving', WALK: 'Walking', BICYCLE: 'Cycling', TRANSIT: 'Transit' };

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function fmtDuration(min) {
  const h = Math.floor(min / 60);
  return h > 0 ? (h + 'h ' + (min % 60) + 'min') : (min + ' min');
}

// ── Google Routes API ─────────────────────────────────────────────────
async function googleRoutes(from, to, modeRaw, key) {
  const travelMode = MODE[(modeRaw || '').toLowerCase()] || 'DRIVE';
  const body = { origin: { address: from }, destination: { address: to }, travelMode: travelMode };
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_AWARE';

  const r = await fetch(ROUTES, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error('routes_' + r.status);
    err.detail = txt.slice(0, 300);
    throw err;
  }
  const data  = await r.json();
  const route = data.routes && data.routes[0];
  if (!route) return null;
  const meters = route.distanceMeters || 0;
  const secs   = parseInt(String(route.duration || '0').replace('s', ''), 10) || 0;
  return { meters: meters, secs: secs, travelMode: travelMode };
}

// ── OSM / OSRM fallback (driving only) ────────────────────────────────
async function geocode(place) {
  const url = NOMINATIM + '?format=jsonv2&limit=1&q=' + encodeURIComponent(place);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) return null;
  const rows = await r.json();
  const hit = Array.isArray(rows) && rows[0];
  return hit ? { lat: hit.lat, lon: hit.lon, name: hit.display_name || place } : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const from = (req.query && req.query.from ? String(req.query.from) : '').trim();
  const to   = (req.query && req.query.to   ? String(req.query.to)   : '').trim();
  const mode = (req.query && req.query.mode ? String(req.query.mode) : '').trim();
  if (!from || !to) return res.status(400).json({ error: 'Both "from" and "to" are required' });

  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

  // ── Google Routes (preferred) ───────────────────────────────────────
  if (key) {
    try {
      const g = await googleRoutes(from, to, mode, key);
      if (g) {
        const km    = Math.round(g.meters / 100) / 10;
        const min   = Math.round(g.secs / 60);
        const label = MODE_LABEL[g.travelMode] || 'Travel';
        return res.status(200).json({
          from: from, to: to, mode: g.travelMode.toLowerCase(),
          distance_km: km, duration_min: min,
          summary: label + ' from ' + from + ' to ' + to + ': about ' + km + ' km, ~' + fmtDuration(min) + '.',
        });
      }
      // no route → fall through to OSM
    } catch (gerr) {
      console.error('[directions] Google failed, falling back:', gerr.message, gerr.detail || '');
    }
  }

  // ── OSM / OSRM fallback (driving only) ──────────────────────────────
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

    const km  = Math.round(route.distance / 100) / 10;
    const min = Math.round(route.duration / 60);
    return res.status(200).json({
      from: origin.name, to: dest.name, mode: 'driving',
      distance_km: km, duration_min: min,
      summary: 'Driving from ' + origin.name + ' to ' + dest.name + ': about ' + km + ' km, ~' + fmtDuration(min) + '.',
    });
  } catch (err) {
    console.error('[directions] error:', err.message);
    return res.status(500).json({ error: 'directions_failed' });
  }
};
