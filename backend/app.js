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

// Middleware to check if any image filtering API is properly set up
router.use((req, res, next) => {
  // Check if either Google Vertex AI or DeepAI is configured
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.DEEPAI_API_KEY) {
    return res.status(500).json({ 
      error: "No image filtering API configured. Please set up either Google Cloud credentials or DeepAI API key." 
    });
  }
  next();
});

// Welcome route
router.get('/', (req, res) => {
  // Determine which image filtering methods are available
  const availableMethods = [];
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) availableMethods.push('vertex');
  if (process.env.DEEPAI_API_KEY) availableMethods.push('deepai');
  
  res.json({ 
    message: "Welcome to Socio.io Content Filter API",
    version: "1.0.0",
    endpoints: [
      "/filter/text - Filter text content",
      "/filter/image - Filter image content (POST with 'image' file and optional 'method' parameter)",
      "/health - Server health check"
    ],
    imageFilteringMethods: {
      available: availableMethods,
      default: availableMethods.length > 0 ? 'auto' : 'none'
    }
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
    
    // Get the filtering method from the request (default to 'auto')
    const method = req.body.method || 'auto';
    
    // Validate the method
    if (!['auto', 'vertex', 'deepai'].includes(method)) {
      return res.status(400).json({ 
        error: "Invalid method. Use 'auto', 'vertex', or 'deepai'." 
      });
    }
    
    // Check if the requested method is available
    if (method === 'vertex' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(400).json({ 
        error: "Google Vertex AI is not configured. Use 'deepai' or 'auto' instead." 
      });
    }
    
    if (method === 'deepai' && !process.env.DEEPAI_API_KEY) {
      return res.status(400).json({ 
        error: "DeepAI is not configured. Use 'vertex' or 'auto' instead." 
      });
    }
    
    // Process the image with the specified method
    const result = await imageFilteration.filterImage(req.file.buffer, method);
    res.json(result);
  } catch (error) {
    console.error('Image filtering error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  // Determine which image filtering methods are available
  const availableMethods = [];
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) availableMethods.push('vertex');
  if (process.env.DEEPAI_API_KEY) availableMethods.push('deepai');
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      imageFiltering: {
        available: availableMethods.length > 0,
        methods: availableMethods
      },
      textFiltering: {
        available: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    }
  });
});

module.exports = router;