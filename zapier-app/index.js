const zapier = require('zapier-platform-core');
const authentication = require('./authentication');
const triggerNewHub = require('./triggers/new_hub');
const triggerNewZap = require('./triggers/new_zap');
const triggerNewBusiness = require('./triggers/new_business');
const createBusiness = require('./creates/create_business');
const createZap = require('./creates/create_zap');
const createHub = require('./creates/create_hub');
const runAnalyze = require('./creates/run_analyze');
const searchHub = require('./searches/find_hub');
const searchBusiness = require('./searches/find_business');
const searchZap = require('./searches/find_zap');

module.exports = zapier.defineApp({
  version: '1.0.0',
  platformVersion: zapier.version,
  authentication,
  triggers: {
    [triggerNewHub.key]: triggerNewHub,
    [triggerNewZap.key]: triggerNewZap,
    [triggerNewBusiness.key]: triggerNewBusiness,
  },
  creates: {
    [createBusiness.key]: createBusiness,
    [createZap.key]: createZap,
    [createHub.key]: createHub,
    [runAnalyze.key]: runAnalyze,
  },
  searches: {
    [searchHub.key]: searchHub,
    [searchBusiness.key]: searchBusiness,
    [searchZap.key]: searchZap,
  },
});
