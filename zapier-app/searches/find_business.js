const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const id = bundle.inputData.id;
  if (id) {
    const response = await z.request({
      url: `${BASE_URL}/api/businesses/${encodeURIComponent(id)}`,
      headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    });
    return [response.json];
  }
  const listRes = await z.request({
    url: `${BASE_URL}/api/businesses`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });
  const list = Array.isArray(listRes.json) ? listRes.json : [];
  return list;
};

module.exports = zapier.defineSearch({
  key: 'find_business',
  noun: 'Business',
  display: {
    label: 'Find Business',
    description: 'Finds a Business by ID or lists Businesses.',
  },
  operation: {
    perform,
    inputFields: [{ key: 'id', label: 'Business ID', required: false }],
    sample: { id: '1', name: 'Sample Business' },
  },
});
