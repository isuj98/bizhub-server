const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    method: 'POST',
    url: `${BASE_URL}/api/businesses`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    body: {
      business_name: bundle.inputData.business_name || bundle.inputData.name,
      business_type: bundle.inputData.business_type,
      website_url: bundle.inputData.website_url,
      api_endpoint: bundle.inputData.api_endpoint,
    },
  });
  return response.json;
};

module.exports = zapier.defineCreate({
  key: 'create_business',
  noun: 'Business',
  display: {
    label: 'Create Business',
    description: 'Creates a new Business and its Hub.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'business_name', label: 'Business Name', required: true },
      { key: 'business_type', label: 'Business Type', required: false },
      { key: 'website_url', label: 'Website URL', required: false },
      { key: 'api_endpoint', label: 'API Endpoint', required: false },
    ],
    sample: { id: '1', name: 'Acme Corp', status: 'pending' },
  },
});
