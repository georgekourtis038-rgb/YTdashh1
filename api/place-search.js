// api/place-search.js
// Find places / businesses for the Axis AI assistant.
//
// Primary backend: Google Places API (New) Text Search — rich data
// (ratings, open-now, hours, phone, website) when GOOGLE_PLACES_API_KEY is set.
// Fallback: OpenStreetMap Nominatim (free, no key) when the key is absent or
// Google errors — so the tool always works.
//
// GET /api/place-search?q=<what>&near=<where>
//   → { query, source, results: [{ name, address, category?, rating?,
//        ratingCount?, openNow?, hoursToday?, phone?, website?, priceLevel?,
//        status?, lat?, lon? }] }

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const GPLACES    = 'https://places.googleapis.com/v1/places:searchText';
const UA = 'AxisDashboard/1.0 (https://y-tdashh1-puce.vercel.app)';

const PRICE = {
  PRICE_LEVEL_FREE: 'free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};
const STATUS = {
  CLOSED_TEMPORARILY: 'temporarily closed', CLOSED_PERMANENTLY: 'permanently closed',
};

// ── Google Places (New) Text Search ───────────────────────────────────
async function googlePlaces(query, key) {
  const fieldMask = [
    'places.displayName', 'places.formattedAddress', 'places.rating',
    'places.userRatingCount', 'places.currentOpeningHours.openNow',
    'places.regularOpeningHours.weekdayDescriptions', 'places.nationalPhoneNumber',
    'places.websiteUri', 'places.priceLevel', 'places.businessStatus', 'places.location',
  ].join(',');

  const r = await fetch(GPLACES, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 6 }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error('google_places_' + r.status);
    err.detail = txt.slice(0, 300);
    throw err;
  }
  const data    = await r.json();
  const todayNm = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (data.places || []).map(function (p) {
    let hoursToday = '';
    const wd = p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions;
    if (Array.isArray(wd)) {
      const line = wd.find(function (s) { return s.indexOf(todayNm) === 0; });
      if (line) hoursToday = line;
    }
    return {
      name:        (p.displayName && p.displayName.text) || (p.formattedAddress || '').split(',')[0],
      address:     p.formattedAddress || '',
      rating:      p.rating,
      ratingCount: p.userRatingCount,
      openNow:     p.currentOpeningHours ? p.currentOpeningHours.openNow : undefined,
      hoursToday:  hoursToday,
      phone:       p.nationalPhoneNumber || '',
      website:     p.websiteUri || '',
      priceLevel:  PRICE[p.priceLevel] || '',
      status:      (p.businessStatus && p.businessStatus !== 'OPERATIONAL') ? (STATUS[p.businessStatus] || p.businessStatus) : '',
      lat:         p.location ? p.location.latitude : undefined,
      lon:         p.location ? p.location.longitude : undefined,
    };
  });
}

// ── Nominatim fallback ─────────────────────────────────────────────────
async function nominatim(query) {
  const url = NOMINATIM + '?format=jsonv2&addressdetails=1&limit=6&q=' + encodeURIComponent(query);
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error('nominatim_' + r.status);
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return {
      name:     row.name || (row.display_name || '').split(',')[0],
      address:  row.display_name || '',
      category: row.type || row.category || '',
      lat:      row.lat,
      lon:      row.lon,
    };
  });
}

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
  const key   = process.env.GOOGLE_PLACES_API_KEY;

  try {
    if (key) {
      try {
        const results = await googlePlaces(query, key);
        return res.status(200).json({ query: query, source: 'google', results: results });
      } catch (gerr) {
        console.error('[place-search] Google failed, falling back:', gerr.message, gerr.detail || '');
        // fall through to Nominatim
      }
    }
    const results = await nominatim(query);
    return res.status(200).json({ query: query, source: 'osm', results: results });
  } catch (err) {
    console.error('[place-search] error:', err.message);
    return res.status(500).json({ error: 'place_search_failed' });
  }
};
