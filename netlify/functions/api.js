const express = require('express');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());

// Netlify may pass one of several path variants depending on rewrite/base config.
// Normalize all of them so Express routes like `/health` consistently match.
app.use((req, _res, next) => {
  req.url = req.url
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString()
  });
});

// Placeholder route so frontend/API wiring can be validated immediately.
app.get('/students', (_req, res) => {
  res.json([]);
});

app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    hint: 'Try GET /api/health'
  });
});

module.exports.handler = serverless(app);
