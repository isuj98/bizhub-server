const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/businesses`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(response.json) ? response.json : (response.json && response.json.data) ? response.json.data : [];
  return list;
};

module.exports = zapier.defineTrigger({
  key: 'new_business',
  noun: 'Business',
  display: {
    label: 'New Business',
    description: 'Triggers when a new Business is created.',
  },
  operation: {
    type: 'polling',
    perform,
    sample: { id: '1', name: 'Sample Business', status: 'pending' },
    outputFields: [
      { key: 'id', label: 'Business ID' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
  },
});
