import { consumeOAuthState, setZapierIntegration } from '../store.js';
function getAppOrigin() {
    return process.env.APP_ORIGIN || 'http://localhost:3000';
}
export async function zapierOAuthCallback(req, res) {
    try {
        const { code, state } = req.query;
        if (!code || !state || typeof state !== 'string') {
            res.redirect(`${getAppOrigin()}/?zapier=error&message=missing_code_or_state`);
            return;
        }
        const businessId = consumeOAuthState(state);
        if (!businessId) {
            res.redirect(`${getAppOrigin()}/?zapier=error&message=invalid_state`);
            return;
        }
        const clientId = process.env.ZAPIER_CLIENT_ID;
        const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
        const base = (process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
        const redirectUri = process.env.ZAPIER_REDIRECT_URI || `${base}/api/integrations/zapier/oauth/callback`;
        if (!clientId || !clientSecret) {
            res.redirect(`${getAppOrigin()}/?zapier=error&message=server_not_configured`);
            return;
        }
        const tokenRes = await fetch('https://api.zapier.com/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: String(code),
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
            }),
        });
        if (!tokenRes.ok) {
            res.redirect(`${getAppOrigin()}/?zapier=error&message=token_exchange_failed`);
            return;
        }
        const tokenData = (await tokenRes.json());
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        if (!accessToken) {
            res.redirect(`${getAppOrigin()}/?zapier=error&message=no_access_token`);
            return;
        }
        setZapierIntegration(businessId, {
            accessToken,
            refreshToken,
            label: 'OAuth',
            webhookBaseUrl: base,
        });
        res.redirect(`${getAppOrigin()}/?zapier=connected&business_id=${encodeURIComponent(businessId)}`);
    }
    catch {
        res.redirect(`${getAppOrigin()}/?zapier=error&message=callback_failed`);
    }
}
