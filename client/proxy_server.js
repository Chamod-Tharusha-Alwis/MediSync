const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Proxy API requests
app.use('/api', createProxyMiddleware({ target: 'http://localhost:5000', changeOrigin: true }));
app.use('/auth', createProxyMiddleware({ target: 'http://localhost:5000', changeOrigin: true }));
app.use('/lk_districts.json', express.static(path.join(__dirname, 'public/lk_districts.json')));

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'build')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(3000, () => {
  console.log('Production server running on http://localhost:3000');
});
