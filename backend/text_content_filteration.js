// Text content filtering using Google Vertex AI
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');

// Import profanity words from JSON file
const profanityWords = require('./profanity_words.json');

// Create a comprehensive list of explicit words from the profanity_words.json file
const explicitWords = [
  // Include original basic words
  'explicit', 'offensive', 'profane', 'vulgar', 'obscene',
  
  // Add words from profanity_words.json
  ...profanityWords.sexual_vulgar.hindi,
  ...profanityWords.sexual_vulgar.english,
  ...profanityWords.violence_crime.hindi,
  ...profanityWords.violence_crime.english,
  ...profanityWords.abusive_insults.hindi,
  ...profanityWords.abusive_insults.english,
  ...profanityWords.obfuscated_variants
];

/**
 * Filter text content using Vertex AI Content API
 * @param {string} text - The text to filter
 * @returns {Object} - Filtered text and metadata
 */
async function filterText(text) {
  try {
    // First check with our basic filter
    let filteredText = applyBasicTextFilter(text);
    let hasExplicitContent = filteredText !== text;
    
    // Then analyze with Vertex AI for more sophisticated detection
    const vertexResult = await analyzeTextWithVertexAI(text);
    
    // Combine results
    if (vertexResult.isExplicit) {
      hasExplicitContent = true;
      // Apply more thorough filtering based on Vertex AI results
      filteredText = applyAdvancedTextFilter(text, vertexResult.detectedTerms);
    }
    
    return {
      original: text,
      filtered: filteredText,
      hasExplicitContent,
      confidence: vertexResult.confidence,
      categories: vertexResult.categories
    };
  } catch (error) {
    console.error("Error in text filtering:", error);
    // Fallback to basic filtering if Vertex AI fails
    const filteredText = applyBasicTextFilter(text);
    return {
      original: text,
      filtered: filteredText,
      hasExplicitContent: filteredText !== text,
      confidence: 0,
      categories: [],
      error: error.message
    };
  }
}

/**
 * Basic text filtering function that replaces explicit words with asterisks
 * @param {string} text - The text to filter
 * @returns {string} - Filtered text
 */
function applyBasicTextFilter(text) {
  let filteredText = text;
  
  explicitWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });
  
  return filteredText;
}

/**
 * Advanced text filtering based on Vertex AI results
 * @param {string} text - Original text
 * @param {Array} detectedTerms - Terms detected by Vertex AI
 * @returns {string} - Filtered text
 */
function applyAdvancedTextFilter(text, detectedTerms) {
  let filteredText = text;
  
  detectedTerms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(term.length));
  });
  
  return filteredText;
}

/**
 * Analyze text using Vertex AI Content API
 * @param {string} text - The text to analyze
 * @returns {Object} - Analysis results
 */
async function analyzeTextWithVertexAI(text) {
  try {
    // Initialize Vertex AI client
    const predictionClient = new PredictionServiceClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    // Get project and location details from env vars
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const endpointId = process.env.VERTEX_CONTENT_FILTER_ENDPOINT_ID;
    
    // Full resource name for the endpoint
    const endpoint = `projects/${project}/locations/${location}/endpoints/${endpointId}`;
    
    // Create the request instance
    const instanceValue = new google.protobuf.Value({
      struct_value: {
        fields: {
          content: { string_value: text }
        }
      }
    });
    
    // Make prediction request
    const [response] = await predictionClient.predict({
      endpoint,
      instances: [instanceValue],
      parameters: {
        struct_value: {
          fields: {
            confidenceThreshold: { number_value: 0.5 }
          }
        }
      }
    });
    
    // Process the results
    const prediction = response.predictions[0];
    const structValue = prediction.struct_value;
    const fields = structValue.fields;
    
    // Extract relevant information
    const confidence = fields.confidence?.number_value || 0;
    const categories = fields.categories?.list_value?.values?.map(v => v.string_value) || [];
    const isExplicit = confidence > 0.7 || categories.some(cat => 
      ['adult', 'violence', 'hate_speech', 'harassment'].includes(cat.toLowerCase())
    );
    
    // Extract detected terms (if available)
    const detectedTerms = fields.detectedTerms?.list_value?.values?.map(v => v.string_value) || [];
    
    return {
      isExplicit,
      confidence,
      categories,
      detectedTerms
    };
  } catch (error) {
    console.error('Error analyzing text with Vertex AI:', error);
    return {
      isExplicit: false,
      confidence: 0,
      categories: [],
      detectedTerms: [],
      error: error.message
    };
  }
}

module.exports = {
  filterText,
  applyBasicTextFilter
};