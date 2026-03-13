import { Router } from 'express';
import crypto from 'crypto';
import { getBusinessById, getZapierIntegration, setZapierIntegration, disconnectZapier, setOAuthState, } from '../store.js';
export const integrationsRouter = Router({ mergeParams: true });
/** GET /api/businesses/:id/integrations/zapier — get connection status (no secrets). */
integrationsRouter.get('/zapier', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        const zapier = getZapierIntegration(businessId);
        res.json({ zapier: zapier ?? { status: 'disconnected' } });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to get Zapier integration' });
    }
});
/** GET /api/businesses/:id/integrations/zapier/webhook-url — get webhook URL for creating a Zap. */
integrationsRouter.get('/zapier/webhook-url', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        const zapier = getZapierIntegration(businessId);
        const baseUrl = process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || 'http://localhost:5001';
        const webhookUrl = zapier?.webhookUrl ?? `${baseUrl.replace(/\/$/, '')}/api/webhooks/zapier/${businessId}`;
        res.json({ webhookUrl });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to get webhook URL' });
    }
});
/** POST /api/businesses/:id/integrations/zapier — connect via API key or OAuth. */
integrationsRouter.post('/zapier', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        const body = req.body;
        const apiKey = body?.api_key?.trim();
        const label = body?.label?.trim() || 'API Key';
        const baseUrl = process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || 'http://localhost:5001';
        const result = setZapierIntegration(businessId, {
            apiKey: apiKey || undefined,
            label,
            webhookBaseUrl: baseUrl,
        });
        if (!result) {
            res.status(500).json({ error: 'Failed to save Zapier integration' });
            return;
        }
        res.status(200).json({ zapier: result });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to connect Zapier integration' });
    }
});
/** DELETE /api/businesses/:id/integrations/zapier — disconnect. */
integrationsRouter.delete('/zapier', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        disconnectZapier(businessId);
        res.status(200).json({ zapier: { status: 'disconnected' } });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to disconnect Zapier integration' });
    }
});
/** GET /api/businesses/:id/integrations/zapier/oauth/start — redirect to Zapier OAuth. */
integrationsRouter.get('/zapier/oauth/start', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).send('Missing business ID');
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).send('Business not found');
            return;
        }
        const clientId = process.env.ZAPIER_CLIENT_ID;
        const base = (process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
        const redirectUri = process.env.ZAPIER_REDIRECT_URI || `${base}/api/integrations/zapier/oauth/callback`;
        if (!clientId) {
            res.status(503).json({
                error: 'Zapier OAuth is not configured. Set ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET in bizhub-server/.env.',
                fallback: 'Use the API key option below to connect instead.',
            });
            return;
        }
        const state = crypto.randomBytes(24).toString('hex');
        setOAuthState(state, businessId);
        const authUrl = new URL('https://api.zapier.com/v2/authorize');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', 'zap:write zap:read');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('response_mode', 'query');
        res.redirect(authUrl.toString());
    }
    catch (err) {
        res.status(500).json({ error: 'OAuth start failed' });
    }
});
