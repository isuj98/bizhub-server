import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ZapierConnection } from '../models/ZapierConnection.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000';

export const oauthRouter = Router();

/** Local in-memory store for legacy/mock OAuth codes (no longer used by real Zapier flow). */
const pendingCodes = new Map<string, { userId: string; createdAt: number }>();

function addPendingCode(code: string, userId: string): void {
  pendingCodes.set(code, { userId, createdAt: Date.now() });
}

function safeHost(urlStr: string | undefined): string | null {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).host;
  } catch {
    return 'invalid_url';
  }
}

oauthRouter.get('/authorize', (req: Request, res: Response): void => {
  const ott = (req.query.ott as string)?.trim();
  const redirectUri = (req.query.redirect_uri as string)?.trim();
  const state = (req.query.state as string) ?? '';
  const responseType = (req.query.response_type as string) ?? 'code';
  // #region agent log
  fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H1',location:'routes/oauth.ts:/authorize:entry',message:'Authorize request received',data:{hasOtt:!!ott,hasRedirectUri:!!redirectUri,responseType,hasClientId:typeof req.query.client_id==='string',redirectHost:safeHost(redirectUri)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!redirectUri) {
    // #region agent log
    fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H4',location:'routes/oauth.ts:/authorize:missing_redirect',message:'Authorize rejected missing redirect_uri',data:{stateLength:state.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(400).send('redirect_uri is required');
    return;
  }
  if (responseType !== 'code') {
    res.status(400).send('response_type=code is required');
    return;
  }
  let userId: string;
  try {
    const decoded = jwt.verify(ott, JWT_SECRET) as { userId: string; email: string };
    userId = decoded.userId;
  } catch {
    // #region agent log
    fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H1',location:'routes/oauth.ts:/authorize:ott_invalid',message:'Authorize rejected due to invalid/missing ott JWT',data:{hasOtt:!!ott},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(400).send('Invalid or expired authorization request. Please try "Connect Zapier" again.');
    return;
  }
  const code = `bizhub_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  addPendingCode(code, userId);
  const sep = redirectUri.includes('?') ? '&' : '?';
  const location = `${redirectUri}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  // #region agent log
  fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H2',location:'routes/oauth.ts:/authorize:success',message:'Authorization code issued',data:{codePrefix:code.slice(0,12),redirectHost:safeHost(redirectUri)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  res.redirect(302, location);
});

oauthRouter.post('/token', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const grantType = (body?.grant_type as string)?.trim();
  const code = (body?.code as string)?.trim();
  const refreshToken = (body?.refresh_token as string)?.trim();
  // #region agent log
  fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H3',location:'routes/oauth.ts:/token:entry',message:'Token endpoint called',data:{grantType:grantType??null,contentType:req.headers['content-type']??null,hasCode:!!code,hasRefreshToken:!!refreshToken,hasBodyClientId:typeof body?.client_id==='string',hasBasicAuth:typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('Basic ')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (grantType === 'authorization_code' && code) {
    const pending = pendingCodes.get(code);
    if (!pending) {
      // #region agent log
      fetch('http://127.0.0.1:7727/ingest/0e857ef2-7b55-4cae-bc3c-ddc8e8541315',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0c1830'},body:JSON.stringify({sessionId:'0c1830',runId:'initial',hypothesisId:'H2',location:'routes/oauth.ts:/token:invalid_code',message:'Token exchange failed due to missing pending code',data:{codePrefix:code.slice(0,12)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired code' });
      return;
    }
    pendingCodes.delete(code);
    const accessToken = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    try {
      await ZapierConnection.create({
        userId: pending.userId,
        provider: 'zapier',
        accessToken,
        refreshToken: newRefreshToken,
        status: 'active',
      });
      res.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    } catch (err) {
      console.error('OAuth token create connection:', err);
      res.status(500).json({ error: 'server_error' });
    }
    return;
  }
  if (grantType === 'refresh_token' && refreshToken) {
    const accessToken = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    try {
      const conn = await ZapierConnection.findOneAndUpdate(
        { refreshToken, status: 'active' },
        { accessToken, refreshToken: newRefreshToken }
      );
      if (!conn) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
        return;
      }
      res.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    } catch (err) {
      console.error('OAuth refresh:', err);
      res.status(500).json({ error: 'server_error' });
    }
    return;
  }
  res.status(400).json({ error: 'unsupported_grant_type', error_description: 'grant_type must be authorization_code or refresh_token' });
});
