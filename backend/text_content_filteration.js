const { PredictionServiceClient } = require('@google-cloud/aiplatform');
const { google } = require('@google-cloud/aiplatform/build/protos/protos');

const explicitWords = [
  'explicit', 'offensive', 'profane', 'vulgar', 'obscene',
  // Add more words as needed
];

function applyBasicTextFilter(text) {
  let filteredText = text;
  let found = [];
  explicitWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(filteredText)) found.push(word);
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });
  return { filteredText, found };
}

async function analyzeTextWithVertexAI(text) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      !process.env.GOOGLE_CLOUD_PROJECT ||
      !process.env.VERTEX_CONTENT_FILTER_ENDPOINT_ID) {
    // If not configured, skip AI
    return { isExplicit: false, confidence: 0, categories: [], detectedTerms: [] };
  }

  const predictionClient = new PredictionServiceClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const endpointId = process.env.VERTEX_CONTENT_FILTER_ENDPOINT_ID;
  const endpoint = `projects/${project}/locations/${location}/endpoints/${endpointId}`;

  const instanceValue = new google.protobuf.Value({
    struct_value: { fields: { content: { string_value: text } } }
  });

  const [response] = await predictionClient.predict({
    endpoint,
    instances: [instanceValue],
    parameters: {
      struct_value: { fields: { confidenceThreshold: { number_value: 0.5 } } }
    }
  });

  const prediction = response.predictions[0];
  const fields = prediction.struct_value.fields;
  const confidence = fields.confidence?.number_value || 0;
  const categories = fields.categories?.list_value?.values?.map(v => v.string_value) || [];
  const detectedTerms = fields.detectedTerms?.list_value?.values?.map(v => v.string_value) || [];
  const isExplicit = confidence > 0.7 || categories.some(cat => ['adult', 'violence', 'hate_speech', 'harassment'].includes(cat.toLowerCase()));
  return { isExplicit, confidence, categories, detectedTerms };
}

async function filterText(text) {
  // 1. Always apply your own basic filter first
  let { filteredText, found } = applyBasicTextFilter(text);
  let hasExplicitContent = found.length > 0;

  // 2. Try Vertex AI if configured
  let vertexResult = { isExplicit: false, confidence: 0, categories: [], detectedTerms: [] };
  try {
    vertexResult = await analyzeTextWithVertexAI(text);
  } catch (e) {
    // AI failed, fallback to basic only
    vertexResult = { isExplicit: false, confidence: 0, categories: [], detectedTerms: [] };
  }

  // 3. If Vertex AI finds explicit terms, mask them too.
  if (vertexResult.isExplicit && vertexResult.detectedTerms.length) {
    vertexResult.detectedTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      filteredText = filteredText.replace(regex, '*'.repeat(term.length));
    });
    hasExplicitContent = true;
  }

  return {
    original: text,
    filtered: filteredText,
    hasExplicitContent,
    ai: vertexResult
  };
}

module.exports = { filterText };