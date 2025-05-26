// Application routes and middleware
const express = require('express');
const router = express.Router();
const textFilteration = require('./text_content_filteration');
const imageFilteration = require('./image_filteration');
const multer = require('multer');

// Configure multer for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware to check if Vertex API is properly set up
router.use((req, res, next) => {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return res.status(500).json({ 
      error: "Google Cloud credentials not configured" 
    });
  }
  next();
});

// Welcome route
router.get('/', (req, res) => {
  res.json({ 
    message: "Welcome to Socio.io Content Filter API",
    version: "1.0.0",
    endpoints: [
      "/filter/text - Filter text content",
      "/filter/image - Filter image content",
      "/health - Server health check"
    ]
  });
});

// Text content filtering endpoint
router.post('/filter/text', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }
    
    const result = await textFilteration.filterText(text);
    res.json(result);
  } catch (error) {
    console.error('Text filtering error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Image content filtering endpoint
router.post('/filter/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image provided" });
    }
    
    const result = await imageFilteration.filterImage(req.file.buffer);
    res.json(result);
  } catch (error) {
    console.error('Image filtering error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      imageFiltering: {
        available: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        method: 'vertex'
      },
      textFiltering: {
        available: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    }
  });
});

module.exports = router;