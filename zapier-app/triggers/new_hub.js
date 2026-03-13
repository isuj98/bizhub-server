const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/hubs`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(response.json) ? response.json : (response.json && response.json.data) ? response.json.data : [];
  return list;
};

module.exports = zapier.defineTrigger({
  key: 'new_hub',
  noun: 'Hub',
  display: {
    label: 'New Hub',
    description: 'Triggers when a new Hub is created.',
  },
  operation: {
    type: 'polling',
    perform,
    sample: { id: '1', title: 'Sample Hub', sourceType: 'business' },
    outputFields: [
      { key: 'id', label: 'Hub ID' },
      { key: 'title', label: 'Title' },
      { key: 'sourceType', label: 'Source Type' },
    ],
  },
});
