/**
 * Image Moderation with Google Vertex AI Vision (Gemini)
 *
 * This module analyzes an image and returns whether it should be filtered
 * based on explicit/adult/violent/racy content using Vertex AI.
 * 
 * Requirements:
 * - @google-cloud/aiplatform
 * - dotenv (for .env config)
 * 
 * .env file must include:
 *   GOOGLE_CLOUD_PROJECT=your-project-id
 *   GOOGLE_CLOUD_LOCATION=us-central1
 *   VERTEX_IMAGE_FILTER_ENDPOINT_ID=gemini-2.0-flash-001
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * 
 * Optional thresholds:
 *   ADULT_THRESHOLD=0.7
 *   VIOLENCE_THRESHOLD=0.7
 *   RACY_THRESHOLD=0.8
 *   SAFE_THRESHOLD=0.5
 */

require('dotenv').config();
const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');

/**
 * Load config and thresholds from environment
 */
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const ENDPOINT_ID = process.env.VERTEX_IMAGE_FILTER_ENDPOINT_ID; // e.g., gemini-2.0-flash-001
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const ADULT_THRESHOLD = parseFloat(process.env.ADULT_THRESHOLD || '0.7');
const VIOLENCE_THRESHOLD = parseFloat(process.env.VIOLENCE_THRESHOLD || '0.7');
const RACY_THRESHOLD = parseFloat(process.env.RACY_THRESHOLD || '0.8');
const SAFE_THRESHOLD = parseFloat(process.env.SAFE_THRESHOLD || '0.5');

if (!PROJECT || !ENDPOINT_ID || !KEY_FILE) {
  throw new Error(
    'Missing required environment configuration. Check GOOGLE_CLOUD_PROJECT, VERTEX_IMAGE_FILTER_ENDPOINT_ID, GOOGLE_APPLICATION_CREDENTIALS in your .env file.'
  );
}

/**
 * Main function to filter an image using Vertex AI Vision API.
 * @param {Buffer} imageBuffer - The raw image data as a Buffer.
 * @returns {Promise<Object>} - Filtering results.
 *
 * Example result:
 * {
 *   shouldFilter: true,
 *   confidence: 0.82,
 *   categories: [ 'adult', 'violence' ],
 *   safeScore: 0.43,
 *   scores: { adult: 0.81, violence: 0.79, racy: 0.4, medical: 0.2 },
 *   error: null
 * }
 */
async function filterImage(imageBuffer) {
  try {
    // Encode image to base64 string
    const base64Image = imageBuffer.toString('base64');
    // Run the prediction
    const result = await analyzeImageWithVertexAI(base64Image);
    // Return result
    return result;
  } catch (error) {
    console.error("Image filtering error:", error);
    return {
      shouldFilter: false,
      confidence: 0,
      categories: [],
      safeScore: 0,
      scores: {},
      error: error.message
    };
  }
}

/**
 * Internal: analyze image via Vertex AI
 * @param {string} base64Image - Base64-encoded image.
 * @returns {Promise<Object>} - Analysis result.
 */
async function analyzeImageWithVertexAI(base64Image) {
  const predictionClient = new PredictionServiceClient({
    keyFilename: KEY_FILE,
  });

  // Build the full endpoint resource name
  const endpoint = `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${ENDPOINT_ID}`;

  // Build the instance payload as required by Vertex AI
  const instanceValue = new google.protobuf.Value();
  instanceValue.structValue = {
    fields: {
      image: { stringValue: base64Image }
    }
  };

  // Make the API call
  const [response] = await predictionClient.predict({
    endpoint,
    instances: [instanceValue]
  });

  const prediction = response.predictions[0]?.structValue?.fields || {};

  // Extract scores, fallback to 0 if not present
  const safeScore = prediction.safe?.numberValue ?? 1.0;
  const adultScore = prediction.adult?.numberValue ?? 0;
  const violenceScore = prediction.violence?.numberValue ?? 0;
  const medicalScore = prediction.medical?.numberValue ?? 0;
  const racyScore = prediction.racy?.numberValue ?? 0;

  // Determine if image is explicit based on thresholds
  const shouldFilter = (
    adultScore > ADULT_THRESHOLD ||
    violenceScore > VIOLENCE_THRESHOLD ||
    racyScore > RACY_THRESHOLD ||
    safeScore < SAFE_THRESHOLD
  );

  // Collect categories that exceeded threshold
  const categories = [];
  if (adultScore > ADULT_THRESHOLD) categories.push('adult');
  if (violenceScore > VIOLENCE_THRESHOLD) categories.push('violence');
  if (medicalScore > 0.7) categories.push('medical');
  if (racyScore > RACY_THRESHOLD) categories.push('racy');

  // Highest problematic score used as confidence
  const confidence = Math.max(adultScore, violenceScore, racyScore);

  return {
    shouldFilter,
    confidence,
    categories,
    safeScore,
    scores: {
      adult: adultScore,
      violence: violenceScore,
      medical: medicalScore,
      racy: racyScore,
      safe: safeScore
    },
    error: null
  };
}

module.exports = { filterImage };