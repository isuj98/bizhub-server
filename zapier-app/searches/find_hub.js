const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const id = bundle.inputData.id;
  if (id) {
    const response = await z.request({
      url: `${BASE_URL}/api/hubs/${encodeURIComponent(id)}`,
      headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    });
    return [response.json];
  }
  const listRes = await z.request({
    url: `${BASE_URL}/api/hubs`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(listRes.json) ? listRes.json : [];
  return list;
};

module.exports = zapier.defineSearch({
  key: 'find_hub',
  noun: 'Hub',
  display: {
    label: 'Find Hub',
    description: 'Finds a Hub by ID or lists Hubs.',
  },
  operation: {
    perform,
    inputFields: [{ key: 'id', label: 'Hub ID', required: false }],
    sample: { id: '1', title: 'Sample Hub' },
  },
});
