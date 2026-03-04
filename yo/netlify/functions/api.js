module.exports = require('../../../netlify/functions/api');
const express = require('express');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());

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

module.exports.handler = serverless(app);
