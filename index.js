const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Token, X-Shopify-Store');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get('/products', async (req, res) => {
  const store = req.headers['x-shopify-store'];
  const token = req.headers['x-shopify-token'];
  if (!store || !token) return res.status(400).json({ error: 'Missing store or token' });
  try {
    const response = await fetch(`https://${store}/admin/api/2024-01/products.json?limit=250&fields=id,title,variants,product_type,status`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy running'));
