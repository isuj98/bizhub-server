const { BASE_URL } = require('./constants');

const test = (z, bundle) =>
  z.request({
    url: `${BASE_URL}/api/me`,
    headers: { Authorization: `Bearer ${bundle.authData.access_token}` },
  });

module.exports = {
  type: 'oauth2',
  oauth2Config: {
    authorizeUrl: {
      url: `${BASE_URL}/oauth/authorize`,
      params: {
        response_type: 'code',
        state: '{{bundle.inputData.state}}',
        redirect_uri: '{{bundle.inputData.redirect_uri}}',
      },
    },
    getAccessToken: {
      url: `${BASE_URL}/oauth/token`,
      method: 'POST',
      body: {
        code: '{{bundle.inputData.code}}',
        grant_type: 'authorization_code',
        redirect_uri: '{{bundle.inputData.redirect_uri}}',
      },
    },
    refreshAccessToken: {
      url: `${BASE_URL}/oauth/token`,
      method: 'POST',
      body: {
        refresh_token: '{{bundle.authData.refresh_token}}',
        grant_type: 'refresh_token',
      },
    },
  },
  test,
  connectionLabel: '{{json.email}}',
};
