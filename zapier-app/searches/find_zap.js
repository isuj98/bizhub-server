const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const id = bundle.inputData.id;
  if (id) {
    const response = await z.request({
      url: `${BASE_URL}/api/zaps/${encodeURIComponent(id)}`,
      headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    });
    return [response.json];
  }
  const listRes = await z.request({
    url: `${BASE_URL}/api/zaps`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(listRes.json) ? listRes.json : [];
  return list;
};

module.exports = zapier.defineSearch({
  key: 'find_zap',
  noun: 'Zap',
  display: {
    label: 'Find Zap',
    description: 'Finds a Zap by ID or lists Zaps.',
  },
  operation: {
    perform,
    inputFields: [{ key: 'id', label: 'Zap ID', required: false }],
    sample: { id: '1', name: 'Sample Zap' },
  },
});
