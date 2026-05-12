const express = require('express');
const fetch = require('node-fetch');
const app = express();

const SHOP = process.env.SHOPIFY_STORE || 'braids-and-wigs.myshopify.com';
// New app: Inventory Transfer Manager (Client ID updated May 2026)
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || 'c49475c85d3133d1d755dad8ce2d096e';
const CLIENT_SECRET = process.env.SHOPIFY_SECRET;
const PROXY_URL = 'https://shopify-proxy-production-515f.up.railway.app';
const SCOPES = 'read_products,read_inventory,read_locations,read_orders';

let ACCESS_TOKEN = process.env.SHOPIFY_TOKEN || null;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Token, X-Shopify-Store');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// ─── OAuth ────────────────────────────────────────────────────────────────────

app.get('/install', (req, res) => {
  const installUrl =
    'https://' + SHOP +
    '/admin/oauth/authorize?client_id=' + CLIENT_ID +
    '&scope=' + SCOPES +
    '&redirect_uri=' + PROXY_URL + '/auth/callback' +
    '&state=secure123';
  console.log('Redirecting to Shopify OAuth:', installUrl);
  res.redirect(installUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, shop, error, error_description } = req.query;

  if (error) {
    return res.status(400).send('<h2>OAuth Error: ' + error + '</h2><p>' + (error_description || '') + '</p>');
  }

  if (!code || !shop) {
    return res.status(400).send('<h2>Missing code or shop parameter</h2><p>Query: ' + JSON.stringify(req.query) + '</p>');
  }

  console.log('OAuth callback received for shop:', shop);

  try {
    const tokenResponse = await fetch('https://' + shop + '/admin/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });

    const responseText = await tokenResponse.text();
    console.log('Token response status:', tokenResponse.status);
    console.log('Token response body:', responseText.substring(0, 200));

    let tokenData;
    try {
      tokenData = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).send(
        '<h2>Token Exchange Failed</h2>' +
        '<p>Status: ' + tokenResponse.status + '</p>' +
        '<p>Response: ' + responseText.substring(0, 500) + '</p>' +
        '<p><a href="' + PROXY_URL + '/install">Try again</a></p>'
      );
    }

    if (tokenData.access_token) {
      ACCESS_TOKEN = tokenData.access_token;
      console.log('Access token obtained:', ACCESS_TOKEN.substring(0, 15) + '...');
      console.log('Scopes granted:', tokenData.scope);

      res.send(
        '<html><head><style>' +
        'body{font-family:Arial,sans-serif;max-width:700px;margin:50px auto;padding:20px;background:#f9f9f9}' +
        '.token{background:#e8f5e9;border:2px solid #4caf50;padding:20px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:16px;font-weight:bold}' +
        'h1{color:#2e7d32}.note{background:#fff3e0;border-left:4px solid #ff9800;padding:15px;margin-top:20px}' +
        '.btn{display:inline-block;background:#0070f3;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:15px;margin-right:10px}' +
        '.scope{background:#e3f2fd;padding:8px 12px;border-radius:4px;font-family:monospace;font-size:13px}' +
        '</style></head><body>' +
        '<h1>&#x2705; App Installed Successfully!</h1>' +
        '<p>Your Admin API access token:</p>' +
        '<div class="token">' + ACCESS_TOKEN + '</div>' +
        '<p style="margin-top:15px">Scopes granted: <span class="scope">' + (tokenData.scope || SCOPES) + '</span></p>' +
        '<div class="note"><strong>IMPORTANT:</strong> Copy this token and save it. Add it as <code>SHOPIFY_TOKEN</code> in your Railway environment variables to persist it across restarts.</div>' +
        '<p style="margin-top:20px">' +
        '<a class="btn" href="/products">Test Products</a>' +
        '<a class="btn" href="/locations">Test Locations</a>' +
        '<a class="btn" href="/token-status">Token Status</a>' +
        '</p>' +
        '</body></html>'
      );
    } else {
      res.status(400).send('<h2>Error getting token</h2><pre>' + JSON.stringify(tokenData, null, 2) + '</pre>');
    }
  } catch (err) {
    console.error('Error in OAuth callback:', err);
    res.status(500).send('<h2>Server Error</h2><p>' + err.message + '</p>');
  }
});

app.get('/token-status', (req, res) => {
  if (ACCESS_TOKEN) {
    res.json({
      status: 'configured',
      token_preview: ACCESS_TOKEN.substring(0, 15) + '...',
      message: 'Proxy is ready.',
      endpoints: ['/products', '/locations', '/inventory_levels', '/inventory_items', '/orders']
    });
  } else {
    res.json({
      status: 'not_configured',
      message: 'No token. Visit /install to authorize.',
      install_url: PROXY_URL + '/install'
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(req) {
  return ACCESS_TOKEN || req.headers['x-shopify-token'] || null;
}

async function shopifyGet(path, token) {
  const response = await fetch(
    'https://' + SHOP + '/admin/api/2024-01' + path,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  return response.json();
}

// ─── API Endpoints ────────────────────────────────────────────────────────────

app.get('/products', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  try {
    const data = await shopifyGet('/products.json?limit=250&fields=id,title,variants,product_type,status,images,vendor', token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/locations', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  try {
    const data = await shopifyGet('/locations.json', token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/inventory_levels', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = '/inventory_levels.json' + (qs ? '?' + qs : '?limit=250');
    const data = await shopifyGet(path, token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/inventory_items', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = '/inventory_items.json' + (qs ? '?' + qs : '?limit=250');
    const data = await shopifyGet(path, token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/orders', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const path = '/orders.json' + (qs ? '?' + qs : '?limit=250&status=any');
    const data = await shopifyGet(path, token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Legacy endpoint
app.get('/inventory', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'No access token configured.' });
  try {
    const data = await shopifyGet('/inventory_levels.json?limit=250', token);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    token_configured: !!ACCESS_TOKEN,
    shop: SHOP,
    endpoints: ['/', '/install', '/auth/callback', '/token-status', '/products', '/locations', '/inventory_levels', '/inventory_items', '/orders']
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Shopify proxy running on port ' + (process.env.PORT || 3000));
  console.log('Token configured:', !!ACCESS_TOKEN);
  console.log('Client ID:', CLIENT_ID.substring(0, 8) + '...');
});
