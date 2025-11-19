const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import routes - FIXED PATH
const webhookRoutes = require('./routes/webhook');

// Routes
app.use('/webhook', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'GHL Webhook Bot is running',
    status: 'OK', 
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook/ghl',
      health: '/health',
      test: '/webhook/test',
      search: '/webhook/search'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'GHL Webhook Bot'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.originalUrl,
    availableEndpoints: ['/webhook/ghl', '/health', '/webhook/test', '/webhook/search']
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GHL Webhook Bot running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Webhook endpoint: http://localhost:${PORT}/webhook/ghl`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/webhook/test`);
  console.log(`🔍 Search endpoint: http://localhost:${PORT}/webhook/search`);
});

module.exports = app;