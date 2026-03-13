const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const businessId = bundle.inputData.businessId;
  const zapId = bundle.inputData.zapId;
  if (businessId) {
    const response = await z.request({
      method: 'POST',
      url: `${BASE_URL}/api/hubs/from-business/${encodeURIComponent(businessId)}`,
      headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    });
    return response.json;
  }
  if (zapId) {
    const response = await z.request({
      method: 'POST',
      url: `${BASE_URL}/api/hubs/from-zap/${encodeURIComponent(zapId)}`,
      headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    });
    return response.json;
  }
  throw new z.errors.Error('Provide either businessId or zapId.');
};

module.exports = zapier.defineCreate({
  key: 'create_hub',
  noun: 'Hub',
  display: {
    label: 'Create Hub',
    description: 'Creates a Hub from an existing Business or Zap.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'businessId', label: 'Business ID', required: false },
      { key: 'zapId', label: 'Zap ID', required: false },
    ],
    sample: { id: '1', title: 'My Hub', sourceType: 'business' },
  },
});
