const zapier = require('zapier-platform-core');
const { BASE_URL } = require('../constants');

const perform = async (z, bundle) => {
  const response = await z.request({
    method: 'POST',
    url: `${BASE_URL}/api/zaps`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
    body: {
      name: bundle.inputData.name,
      triggerConfig: bundle.inputData.triggerConfig ? (typeof bundle.inputData.triggerConfig === 'object' ? bundle.inputData.triggerConfig : {}) : {},
      actionConfig: bundle.inputData.actionConfig ? (typeof bundle.inputData.actionConfig === 'object' ? bundle.inputData.actionConfig : {}) : {},
    },
  });
  return response.json;
};

module.exports = zapier.defineCreate({
  key: 'create_zap',
  noun: 'Zap',
  display: {
    label: 'Create Zap',
    description: 'Creates a new Zap and its Hub.',
  },
  operation: {
    perform,
    inputFields: [
      { key: 'name', label: 'Zap Name', required: true },
      { key: 'triggerConfig', label: 'Trigger Config (JSON)', required: false },
      { key: 'actionConfig', label: 'Action Config (JSON)', required: false },
    ],
    sample: { id: '1', name: 'My Zap', status: 'active' },
  },
});
