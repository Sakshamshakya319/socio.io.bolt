// Image content filtering using Google Vertex AI
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');

/**
 * Filter image content using Vertex AI Vision API
 * @param {Buffer} imageBuffer - The image buffer to analyze
 * @returns {Object} - Analysis results and filtering decision
 */
async function filterImage(imageBuffer) {
  try {
    const base64Image = imageBuffer.toString('base64');
    const analysisResult = await analyzeImageWithVertexAI(base64Image);
    
    return {
      shouldFilter: analysisResult.isExplicit,
      confidence: analysisResult.confidence,
      categories: analysisResult.categories,
      safeScore: analysisResult.safeScore
    };
  } catch (error) {
    console.error("Error in image filtering:", error);
    return {
      shouldFilter: false, // Conservative approach if analysis fails
      confidence: 0,
      categories: [],
      safeScore: 0,
      error: error.message
    };
  }
}

/**
 * Analyze image using Vertex AI Vision API
 * @param {string} base64Image - Base64 encoded image
 * @returns {Object} - Analysis results
 */
async function analyzeImageWithVertexAI(base64Image) {
  try {
    // Initialize Vertex AI client
    const predictionClient = new PredictionServiceClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    // Get project and location details from env vars
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const endpointId = process.env.VERTEX_IMAGE_FILTER_ENDPOINT_ID;
    
    // Full resource name for the endpoint
    const endpoint = `projects/${project}/locations/${location}/endpoints/${endpointId}`;
    
    // Create the request instance
    const instanceValue = new google.protobuf.Value({
      struct_value: {
        fields: {
          image: { string_value: base64Image }
        }
      }
    });
    
    // Make prediction request
    const [response] = await predictionClient.predict({
      endpoint,
      instances: [instanceValue]
    });
    
    // Process the results
    const prediction = response.predictions[0];
    const structValue = prediction.struct_value;
    const fields = structValue.fields;
    
    // Extract content categories and scores
    const safeScore = fields.safe?.number_value || 1.0;
    const adultScore = fields.adult?.number_value || 0;
    const violenceScore = fields.violence?.number_value || 0;
    const medicalScore = fields.medical?.number_value || 0;
    const racyScore = fields.racy?.number_value || 0;
    
    // Determine if the image contains explicit content
    const isExplicit = (
      adultScore > 0.7 || 
      violenceScore > 0.7 || 
      racyScore > 0.8 || 
      safeScore < 0.5
    );
    
    // Collect categories that exceeded threshold
    const categories = [];
    if (adultScore > 0.7) categories.push('adult');
    if (violenceScore > 0.7) categories.push('violence');
    if (medicalScore > 0.7) categories.push('medical');
    if (racyScore > 0.8) categories.push('racy');
    
    // Calculate overall confidence (highest problematic score)
    const confidence = Math.max(adultScore, violenceScore, racyScore);
    
    return {
      isExplicit,
      confidence,
      categories,
      safeScore,
      scores: {
        adult: adultScore,
        violence: violenceScore,
        medical: medicalScore,
        racy: racyScore
      }
    };
  } catch (error) {
    console.error('Error analyzing image with Vertex AI:', error);
    return {
      isExplicit: false,
      confidence: 0,
      categories: [],
      safeScore: 1.0,
      scores: {
        adult: 0,
        violence: 0,
        medical: 0,
        racy: 0
      },
      error: error.message
    };
  }
}

module.exports = {
  filterImage
};