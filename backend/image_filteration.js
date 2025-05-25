const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');
const sharp = require('sharp'); // npm install sharp

/**
 * Filter image content using Vertex AI. If explicit, blur the image.
 * @param {Buffer} imageBuffer - The image buffer to analyze
 * @param {string} method - Only 'vertex' supported in this version
 * @returns {Object} - { isExplicit, filteredImage (Buffer), scores }
 */
async function filterImage(imageBuffer, method = 'vertex') {
  if (method !== 'vertex') throw new Error('Only vertex supported in this example');

  const base64Image = imageBuffer.toString('base64');
  const analysisResult = await analyzeImageWithVertexAI(base64Image);

  let filteredImageBuffer = imageBuffer;
  if (analysisResult.isExplicit) {
    // Blur the entire image if explicit
    filteredImageBuffer = await sharp(imageBuffer)
      .blur(30) // Adjust blur as needed
      .toBuffer();
  }

  return {
    isExplicit: analysisResult.isExplicit,
    filteredImage: filteredImageBuffer,
    scores: analysisResult.scores || {},
    categories: analysisResult.categories || [],
    safeScore: analysisResult.safeScore,
    method: 'vertex'
  };
}

async function analyzeImageWithVertexAI(base64Image) {
  const predictionClient = new PredictionServiceClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const endpointId = process.env.VERTEX_IMAGE_FILTER_ENDPOINT_ID;
  const endpoint = `projects/${project}/locations/${location}/endpoints/${endpointId}`;

  const instanceValue = new google.protobuf.Value({
    struct_value: { fields: { image: { string_value: base64Image } } }
  });

  const [response] = await predictionClient.predict({
    endpoint,
    instances: [instanceValue]
  });

  const prediction = response.predictions[0];
  const fields = prediction.struct_value.fields;

  const safeScore = fields.safe?.number_value || 1.0;
  const adultScore = fields.adult?.number_value || 0;
  const violenceScore = fields.violence?.number_value || 0;
  const racyScore = fields.racy?.number_value || 0;

  const isExplicit = adultScore > 0.7 || violenceScore > 0.7 || racyScore > 0.8 || safeScore < 0.5;
  const categories = [];
  if (adultScore > 0.7) categories.push('adult');
  if (violenceScore > 0.7) categories.push('violence');
  if (racyScore > 0.8) categories.push('racy');

  return {
    isExplicit,
    categories,
    safeScore,
    scores: { adult: adultScore, violence: violenceScore, racy: racyScore }
  };
}

module.exports = { filterImage };