// api/weather.js
// Current conditions + short forecast for the Axis AI assistant.
// Backed by Open-Meteo (free, no API key). Geocodes a place name, then
// fetches current weather + a 3-day forecast and returns a ready-to-read
// summary string.
//
// GET /api/weather?q=<place name>

const WMO = {
  0:'clear sky',1:'mainly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'rime fog',
  51:'light drizzle',53:'drizzle',55:'dense drizzle',56:'freezing drizzle',57:'freezing drizzle',
  61:'light rain',63:'rain',65:'heavy rain',66:'freezing rain',67:'freezing rain',
  71:'light snow',73:'snow',75:'heavy snow',77:'snow grains',
  80:'rain showers',81:'rain showers',82:'violent rain showers',85:'snow showers',86:'snow showers',
  95:'thunderstorm',96:'thunderstorm w/ hail',99:'thunderstorm w/ hail'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  try {
    // 1. Geocode the place name
    const geoRes = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(q));
    const geo    = await geoRes.json();
    const loc    = geo && geo.results && geo.results[0];
    if (!loc) return res.status(200).json({ error: 'Location not found: ' + q });

    // 2. Fetch current + 3-day forecast
    const params = new URLSearchParams({
      latitude:  loc.latitude,
      longitude: loc.longitude,
      current:   'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      daily:     'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
      timezone:  'auto',
      forecast_days: '3',
    });
    const wRes = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString());
    if (!wRes.ok) return res.status(502).json({ error: 'forecast_failed' });
    const w = await wRes.json();

    const place = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
    let summary = 'Weather for ' + place + ':';
    if (w.current) {
      summary += ' currently ' + Math.round(w.current.temperature_2m) + '°C'
        + ' (feels like ' + Math.round(w.current.apparent_temperature) + '°C), '
        + (WMO[w.current.weather_code] || 'unknown')
        + ', humidity ' + w.current.relative_humidity_2m + '%'
        + ', wind ' + Math.round(w.current.wind_speed_10m) + ' km/h.';
    }
    if (w.daily && Array.isArray(w.daily.time)) {
      summary += ' Forecast —';
      for (let i = 0; i < w.daily.time.length; i++) {
        summary += ' ' + w.daily.time[i] + ': '
          + Math.round(w.daily.temperature_2m_min[i]) + '–' + Math.round(w.daily.temperature_2m_max[i]) + '°C '
          + (WMO[w.daily.weather_code[i]] || '')
          + ' (precip ' + (w.daily.precipitation_probability_max[i] || 0) + '%);';
      }
    }

    return res.status(200).json({ location: place, summary });
  } catch (err) {
    console.error('[weather] error:', err.message);
    return res.status(500).json({ error: 'weather_failed' });
  }
};
