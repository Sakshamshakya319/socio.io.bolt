// Image content filtering using Google Vertex AI and DeepAI
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');
const deepai = require('deepai');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Set DeepAI API key
deepai.setApiKey(process.env.DEEPAI_API_KEY || '');

/**
 * Filter image content using available APIs
 * @param {Buffer} imageBuffer - The image buffer to analyze
 * @param {string} method - The method to use ('vertex', 'deepai', or 'auto')
 * @returns {Object} - Analysis results and filtering decision
 */
async function filterImage(imageBuffer, method = 'auto') {
  try {
    let analysisResult;
    
    // Determine which method to use
    if (method === 'vertex' || (method === 'auto' && isVertexConfigured())) {
      console.log('Using Google Vertex AI for image analysis');
      const base64Image = imageBuffer.toString('base64');
      analysisResult = await analyzeImageWithVertexAI(base64Image);
    } else if (method === 'deepai' || method === 'auto') {
      console.log('Using DeepAI for image analysis');
      analysisResult = await analyzeImageWithDeepAI(imageBuffer);
    } else {
      throw new Error('Invalid filtering method specified');
    }
    
    return {
      shouldFilter: analysisResult.isExplicit,
      confidence: analysisResult.confidence,
      categories: analysisResult.categories,
      safeScore: analysisResult.safeScore,
      method: analysisResult.method
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
 * Check if Vertex AI is properly configured
 * @returns {boolean} - Whether Vertex AI is configured
 */
function isVertexConfigured() {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.VERTEX_IMAGE_FILTER_ENDPOINT_ID
  );
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

/**
 * Analyze image using DeepAI's NSFW detection API
 * @param {Buffer} imageBuffer - The image buffer to analyze
 * @returns {Object} - Analysis results
 */
async function analyzeImageWithDeepAI(imageBuffer) {
  try {
    // Create a temporary file to send to DeepAI
    const tempFilePath = path.join(os.tmpdir(), `image-${Date.now()}.jpg`);
    fs.writeFileSync(tempFilePath, imageBuffer);
    
    // Call DeepAI API
    const result = await deepai.callStandardApi("nsfw-detector", {
      image: fs.createReadStream(tempFilePath),
    });
    
    // Clean up the temporary file
    fs.unlinkSync(tempFilePath);
    
    // Process the results
    console.log('DeepAI result:', result);
    
    // Extract NSFW score
    const nsfwScore = result.output?.nsfw_score || 0;
    
    // Determine if the image contains explicit content
    // DeepAI scores range from 0 to 1, where higher values indicate more NSFW content
    const isExplicit = nsfwScore > 0.7;
    
    // Calculate safe score (inverse of NSFW score)
    const safeScore = 1 - nsfwScore;
    
    // Determine categories based on NSFW score
    const categories = [];
    if (nsfwScore > 0.7) categories.push('adult');
    
    return {
      isExplicit,
      confidence: nsfwScore,
      categories,
      safeScore,
      scores: {
        nsfw: nsfwScore
      },
      method: 'deepai'
    };
  } catch (error) {
    console.error('Error analyzing image with DeepAI:', error);
    
    // If DeepAI fails, return a safe default
    return {
      isExplicit: false,
      confidence: 0,
      categories: [],
      safeScore: 1.0,
      scores: {
        nsfw: 0
      },
      error: error.message,
      method: 'deepai'
    };
  }
}

module.exports = {
  filterImage
};