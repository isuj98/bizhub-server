const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/api/zaps`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(response.json) ? response.json : (response.json && response.json.data) ? response.json.data : [];
  return list;
};

module.exports = zapier.defineTrigger({
  key: 'new_zap',
  noun: 'Zap',
  display: {
    label: 'New Zap',
    description: 'Triggers when a new Zap is created.',
  },
  operation: {
    type: 'polling',
    perform,
    sample: { id: '1', name: 'Sample Zap', status: 'active' },
    outputFields: [
      { key: 'id', label: 'Zap ID' },
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
  },
});
