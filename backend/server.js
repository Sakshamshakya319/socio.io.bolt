// Main server entry point for the content filtering backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const appRoutes = require('./app'); // Renamed for clarity

// Set up port from environment or default
const PORT = process.env.PORT || 3000;

// Create Express server
const server = express();

// Apply middleware
server.use(cors());
server.use(helmet());
server.use(compression());
server.use(morgan('combined'));
server.use(bodyParser.json({ limit: '10mb' }));
server.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Home route (to show welcome/info message)
server.get('/', (req, res) => {
  // You can put a simple welcome info here, or delegate to app if you want the detailed message
  res.json({
    message: "Welcome to Socio.io Content Filter API",
    version: "1.0.0",
    endpoints: [
      "/filter/text - Filter text content",
      "/filter/image - Filter image content (POST with 'image' file and optional 'method' parameter)",
      "/health - Server health check"
    ]
  });
});

// Mount the app routes (for /filter/*, /health, etc.)
server.use('/', appRoutes);

// Health check endpoint (already covered in app but kept here for redundancy)
server.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
server.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Home: http://localhost:${PORT}/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = server;