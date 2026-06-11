module.exports = async function handler(req, res) {
  console.log('[chat] method:', req.method);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('[chat] apiKey present:', !!apiKey);
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Read body manually — req.body is not auto-parsed in Vercel Node runtime
  let bodyText = '';
  try {
    bodyText = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    console.log('[chat] raw body:', bodyText.slice(0, 200));
  } catch (err) {
    console.error('[chat] body read error:', err.message);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  let messages, system, max_tokens;
  try {
    ({ messages, system, max_tokens } = JSON.parse(bodyText));
  } catch (err) {
    console.error('[chat] JSON parse error:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const resolvedMaxTokens = (typeof max_tokens === 'number' && max_tokens > 0) ? max_tokens : 1000;
  console.log('[chat] messages count:', Array.isArray(messages) ? messages.length : 'not array', '| max_tokens:', resolvedMaxTokens);

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    console.log('[chat] calling Anthropic (stream)...');
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: resolvedMaxTokens,
        system: system || '',
        messages,
        stream: true,
      }),
    });

    console.log('[chat] Anthropic status:', upstream.status);

    if (!upstream.ok) {
      const errData = await upstream.json();
      console.error('[chat] Anthropic error:', JSON.stringify(errData));
      return res.status(upstream.status).json(errData);
    }

    // Stream SSE back to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[chat] fetch error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Proxy error: ' + err.message });
    }
    res.end();
  }
};
