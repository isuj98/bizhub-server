const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    method: 'POST',
    url: `${BASE_URL}/api/analyze`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    body: {
      businessId: bundle.inputData.businessId,
      hubId: bundle.inputData.hubId,
      businessType: bundle.inputData.businessType,
      model: bundle.inputData.model || 'gemini',
    },
  });
  return response.json;
};

module.exports = zapier.defineCreate({
  key: 'run_analyze',
  noun: 'Analysis',
  display: {
    label: 'Run Analyze',
    description: 'Runs AI analysis on a Business or Hub.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'businessId', label: 'Business ID', required: false },
      { key: 'hubId', label: 'Hub ID', required: false },
      { key: 'businessType', label: 'Business Type', required: false },
      { key: 'model', label: 'Model (gemini or openai)', required: false },
    ],
    sample: { tasks: [], recommendations: [] },
  },
});
