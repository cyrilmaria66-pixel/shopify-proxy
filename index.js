const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Store credentials from environment variables only
const SHOP = process.env.SHOPIFY_STORE || 'braids-and-wigs.myshopify.com';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || 'c6e0ec30bf2f3b8ff42b1fde963eb2eb';
const CLIENT_SECRET = process.env.SHOPIFY_SECRET;

// In-memory token store (persists as long as server is running)
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
  const { code, shop } = req.query;

  if (!code || !shop) {
    return res.status(400).send('Missing code or shop parameter');
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
      ACCESS_TOKEN = tokenData.access_token;
      console.log('Access token obtained successfully');

      res.send(`
        <html>
        <head><style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f9f9f9; }
          .token { background: #e8f5e9; border: 2px solid #4caf50; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 14px; }
          h1 { color: #2e7d32; }
          .note { background: #fff3e0; border-left: 4px solid #ff9800; padding: 10px; margin-top: 15px; }
        </style></head>
        <body>
          <h1>App Installed Successfully!</h1>
          <p>Your Shopify Admin API access token:</p>
          <div class="token">${ACCESS_TOKEN}</div>
          <div class="note"><strong>Important:</strong> Copy this token now and add it as the SHOPIFY_TOKEN environment variable in Railway. It will not be shown again after you leave this page.</div>
          <p style="margin-top:20px">Test your proxy: <a href="/products">/products</a></p>
        </body>
        </html>
      `);
    } else {
      res.status(400).send('Error getting token: ' + JSON.stringify(tokenData));
    }
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Token status endpoint
app.get('/token-status', (req, res) => {
  if (ACCESS_TOKEN) {
    res.json({
      status: 'configured',
      token_preview: ACCESS_TOKEN.substring(0, 10) + '...',
      message: 'Proxy is ready'
    });
  } else {
    const installUrl = 'https://' + SHOP + '/admin/oauth/authorize?client_id=' + CLIENT_ID + '&scope=read_products,read_inventory&redirect_uri=https://shopify-proxy-production-515f.up.railway.app/auth/callback&state=abc123';
    res.json({
      status: 'not_configured',
      message: 'No token. Visit install_url to install the app.',
      install_url: installUrl
    });
  }
});

// Products endpoint
app.get('/products', async (req, res) => {
  const token = ACCESS_TOKEN || req.headers['x-shopify-token'];
  const store = SHOP || req.headers['x-shopify-store'];

  if (!token) {
    return res.status(401).json({ error: 'No access token. Visit /token-status for setup.' });
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

// Inventory levels endpoint
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
    endpoints: ['/products', '/inventory', '/token-status', '/auth/callback']
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Shopify proxy running on port ' + (process.env.PORT || 3000)));
