const express = require('express');
const fetch = require('node-fetch');
const app = express();

const SHOP = process.env.SHOPIFY_STORE || 'braids-and-wigs.myshopify.com';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || 'c6e0ec30bf2f3b8ff42b1fde963eb2eb';
const CLIENT_SECRET = process.env.SHOPIFY_SECRET;
const PROXY_URL = 'https://shopify-proxy-production-515f.up.railway.app';

let ACCESS_TOKEN = process.env.SHOPIFY_TOKEN || null;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Token, X-Shopify-Store');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// OAuth callback - captures the access token
app.get('/auth/callback', async (req, res) => {
  const { code, shop, error, error_description } = req.query;

  if (error) {
    return res.status(400).send('<h2>OAuth Error: ' + error + '</h2><p>' + (error_description || '') + '</p>');
  }

  if (!code || !shop) {
    return res.status(400).send('<h2>Missing code or shop parameter</h2><p>Query: ' + JSON.stringify(req.query) + '</p>');
  }

  console.log('OAuth callback received for shop:', shop);
  console.log('Code:', code.substring(0, 10) + '...');
  console.log('Client Secret available:', !!CLIENT_SECRET);

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
        '<p>This usually means the authorization code expired. Please try installing the app again.</p>' +
        '<p><a href="' + PROXY_URL + '/install">Click here to install again</a></p>'
      );
    }

    if (tokenData.access_token) {
      ACCESS_TOKEN = tokenData.access_token;
      console.log('Access token obtained successfully:', ACCESS_TOKEN.substring(0, 15) + '...');

      res.send(
        '<html><head><style>' +
        'body{font-family:Arial,sans-serif;max-width:700px;margin:50px auto;padding:20px;background:#f9f9f9}' +
        '.token{background:#e8f5e9;border:2px solid #4caf50;padding:20px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:16px;font-weight:bold}' +
        'h1{color:#2e7d32}.note{background:#fff3e0;border-left:4px solid #ff9800;padding:15px;margin-top:20px}' +
        '.btn{display:inline-block;background:#0070f3;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:15px}' +
        '</style></head><body>' +
        '<h1>App Installed Successfully!</h1>' +
        '<p>Your Shopify Admin API access token:</p>' +
        '<div class="token">' + ACCESS_TOKEN + '</div>' +
        '<div class="note"><strong>IMPORTANT:</strong> Copy this token now! Add it as <code>SHOPIFY_TOKEN</code> in your Railway environment variables. It will not be shown again after you leave this page.</div>' +
        '<p style="margin-top:20px">Test your proxy: <a class="btn" href="/products">View Products</a></p>' +
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

// Install redirect helper
app.get('/install', (req, res) => {
  const installUrl = 'https://' + SHOP + '/admin/oauth/authorize?client_id=' + CLIENT_ID + '&scope=read_products,read_inventory&redirect_uri=' + PROXY_URL + '/auth/callback&state=abc123';
  res.redirect(installUrl);
});

// Token status
app.get('/token-status', (req, res) => {
  if (ACCESS_TOKEN) {
    res.json({ status: 'configured', token_preview: ACCESS_TOKEN.substring(0, 10) + '...', message: 'Proxy is ready' });
  } else {
    res.json({
      status: 'not_configured',
      message: 'No token. Visit /install to install the app.',
      install_url: PROXY_URL + '/install'
    });
  }
});

// Products endpoint
app.get('/products', async (req, res) => {
  const token = ACCESS_TOKEN || req.headers['x-shopify-token'];
  const store = SHOP || req.headers['x-shopify-store'];

  if (!token) {
    return res.status(401).json({ error: 'No access token. Visit /install to set up.', install: PROXY_URL + '/install' });
  }

  try {
    const response = await fetch(
      'https://' + store + '/admin/api/2024-01/products.json?limit=250&fields=id,title,variants,product_type,status,images',
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inventory levels
app.get('/inventory', async (req, res) => {
  const token = ACCESS_TOKEN || req.headers['x-shopify-token'];
  const store = SHOP || req.headers['x-shopify-store'];

  if (!token) {
    return res.status(401).json({ error: 'No access token configured.' });
  }

  try {
    const response = await fetch(
      'https://' + store + '/admin/api/2024-01/inventory_levels.json?limit=250',
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    token_configured: !!ACCESS_TOKEN,
    endpoints: ['/products', '/inventory', '/token-status', '/install', '/auth/callback']
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Shopify proxy running on port ' + (process.env.PORT || 3000)));
