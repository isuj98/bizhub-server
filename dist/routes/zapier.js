import { Router } from 'express';
import { ZapierConnection } from '../models/ZapierConnection.js';
import { authMiddleware } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
export const zapierRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';
/** Zapier OAuth v2 authorize URL compatibility (configured as /zapier). */
zapierRouter.get('/', (req, res) => {
    const params = new URLSearchParams(req.query);
    const location = `/oauth/authorize${params.toString() ? `?${params.toString()}` : ''}`;
    res.redirect(302, location);
});
/** Zapier OAuth 2.0 (Powered by Zapier / User Access Token) */
const ZAPIER_AUTH_URL = 'https://api.zapier.com/v2/authorize';
const ZAPIER_TOKEN_URL = 'https://zapier.com/oauth/token/';
/** Default OAuth scopes for Zapier Workflow API (zap, zap:write, authentication) */
const ZAPIER_DEFAULT_SCOPE = 'zap zap:write authentication';
function buildZapierState(userId) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = { userId, nonce, purpose: 'zapier_connect' };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '600s' }); // 10 min
}
function verifyZapierState(state) {
    try {
        const decoded = jwt.verify(state, JWT_SECRET);
        if (decoded.purpose !== 'zapier_connect' || !decoded.userId)
            return null;
        return decoded;
    }
    catch {
        return null;
    }
}
/** Build the real Zapier OAuth 2.0 authorization URL. Redirect URI must be this backend's callback. */
function buildZapierConnectUrl(userId) {
    const clientId = process.env.ZAPIER_CLIENT_ID;
    const baseUrl = (process.env.BASE_URL ?? 'http://localhost:5001').replace(/\/$/, '');
    const redirectUri = `${baseUrl}/zapier/callback`;
    if (!clientId) {
        throw new Error('ZAPIER_CLIENT_ID is not configured. Set it in .env to enable Zapier OAuth.');
    }
    const state = buildZapierState(userId);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: process.env.ZAPIER_OAUTH_SCOPE ?? ZAPIER_DEFAULT_SCOPE,
        response_mode: 'query',
        state,
    });
    return `${ZAPIER_AUTH_URL}?${params.toString()}`;
}
/** Exchange authorization code for access and refresh token at Zapier. */
async function exchangeCodeForToken(code, redirectUri) {
    const clientId = process.env.ZAPIER_CLIENT_ID;
    const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('ZAPIER_CLIENT_ID and ZAPIER_CLIENT_SECRET must be set.');
    }
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
    });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(ZAPIER_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
        },
        body: body.toString(),
    });
    const data = (await res.json());
    if (!res.ok) {
        const msg = data.error_description ?? data.error ?? res.statusText;
        throw new Error(`Zapier token exchange failed: ${msg}`);
    }
    if (!data.access_token) {
        throw new Error('Zapier did not return an access_token.');
    }
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        scope: data.scope,
    };
}
zapierRouter.get('/status', authMiddleware, async (req, res) => {
    if (!isDbConnected()) {
        res.status(503).json({ error: 'Database not available' });
        return;
    }
    try {
        const userId = req.user._id;
        const conn = await ZapierConnection.findOne({ userId, status: 'active' }).lean();
        res.json({
            connected: !!conn,
            connectionId: conn?._id?.toString(),
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to get Zapier status' });
    }
});
zapierRouter.get('/connect', authMiddleware, async (req, res) => {
    if (!isDbConnected()) {
        res.status(503).json({ error: 'Database not available' });
        return;
    }
    try {
        const userId = req.user._id;
        const url = buildZapierConnectUrl(userId);
        res.redirect(302, url);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to build Zapier connect URL';
        res.status(500).json({ error: message });
    }
});
zapierRouter.get('/connect-url', authMiddleware, async (req, res) => {
    if (!isDbConnected()) {
        res.status(503).json({ error: 'Database not available' });
        return;
    }
    try {
        const userId = req.user._id;
        const url = buildZapierConnectUrl(userId);
        res.json({ url });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to build Zapier connect URL';
        res.status(500).json({ error: message });
    }
});
/** OAuth callback: Zapier redirects here with ?code=...&state=... (no auth header). */
zapierRouter.get('/callback', async (req, res) => {
    const appOrigin = (process.env.APP_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
    const baseUrl = (process.env.BASE_URL ?? 'http://localhost:5001').replace(/\/$/, '');
    const frontendCallback = `${appOrigin}/zapier-callback`;
    const code = req.query.code?.trim();
    const state = req.query.state?.trim();
    const errorParam = req.query.error?.trim();
    if (errorParam) {
        const errorDesc = req.query.error_description?.trim();
        const errMsg = errorDesc || errorParam;
        res.redirect(302, `${frontendCallback}?error=${encodeURIComponent(errMsg)}`);
        return;
    }
    if (!code) {
        res.redirect(302, `${frontendCallback}?error=${encodeURIComponent('missing_code')}`);
        return;
    }
    const statePayload = state ? verifyZapierState(state) : null;
    if (!statePayload) {
        res.redirect(302, `${frontendCallback}?error=${encodeURIComponent('invalid_state')}`);
        return;
    }
    const redirectUri = `${baseUrl}/zapier/callback`;
    if (!isDbConnected()) {
        res.redirect(302, `${frontendCallback}?error=${encodeURIComponent('Database not available')}`);
        return;
    }
    try {
        const tokenResponse = await exchangeCodeForToken(code, redirectUri);
        const expiresAt = tokenResponse.expires_in
            ? new Date(Date.now() + tokenResponse.expires_in * 1000)
            : undefined;
        await ZapierConnection.updateMany({ userId: statePayload.userId, provider: 'zapier' }, { status: 'revoked' });
        await ZapierConnection.create({
            userId: statePayload.userId,
            provider: 'zapier',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            scope: tokenResponse.scope,
            status: 'active',
            expiresAt,
        });
        res.redirect(302, `${frontendCallback}?success=1`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Token exchange failed';
        console.error('Zapier OAuth callback error:', err);
        res.redirect(302, `${frontendCallback}?error=${encodeURIComponent(message)}`);
    }
});
zapierRouter.post('/disconnect', authMiddleware, async (req, res) => {
    if (!isDbConnected()) {
        res.status(503).json({ error: 'Database not available' });
        return;
    }
    const userId = req.user._id;
    await ZapierConnection.updateMany({ userId }, { status: 'revoked' });
    res.json({ connected: false });
});
