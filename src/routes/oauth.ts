import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { isDbConnected } from '../db.js';
import { ZapierConnection } from '../models/ZapierConnection.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';

const DEFAULT_REDIRECT_URI =
  'https://zapier.com/dashboard/auth/oauth/return/App237819CLIAPI/';

function getOAuthClientId(): string {
  return (
    process.env.ZAPIER_OAUTH_CLIENT_ID ||
    process.env.ZAPIER_CLIENT_ID ||
    ''
  ).trim();
}

function getOAuthClientSecret(): string {
  return (
    process.env.ZAPIER_OAUTH_CLIENT_SECRET ||
    process.env.ZAPIER_CLIENT_SECRET ||
    ''
  ).trim();
}

function getAllowedRedirectUris(): string[] {
  const configured = (process.env.ZAPIER_OAUTH_REDIRECT_URIS ?? DEFAULT_REDIRECT_URI).trim();
  return configured
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);
}

function getAccessTtlSeconds(): number {
  const n = Number(process.env.ZAPIER_OAUTH_ACCESS_TTL_SECONDS ?? 3600);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 3600;
}

function getRefreshTtlSeconds(): number {
  const n = Number(process.env.ZAPIER_OAUTH_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 60 * 60 * 24 * 30;
}

function getCodeTtlSeconds(): number {
  const n = Number(process.env.ZAPIER_OAUTH_CODE_TTL_SECONDS ?? 300);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 300;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  responseType: string;
  scope: string;
};

function normalizeAuthorizeParams(input: Record<string, unknown>): AuthorizeParams {
  return {
    clientId: String(input.client_id ?? '').trim(),
    redirectUri: String(input.redirect_uri ?? '').trim(),
    state: String(input.state ?? '').trim(),
    responseType: String(input.response_type ?? '').trim(),
    scope: String(input.scope ?? '').trim(),
  };
}

function validateAuthorizeParams(params: AuthorizeParams): string | null {
  if (!getOAuthClientId() || !getOAuthClientSecret()) {
    return 'OAuth is not configured. Set ZAPIER_OAUTH_CLIENT_ID and ZAPIER_OAUTH_CLIENT_SECRET.';
  }
  if (!params.clientId || !params.redirectUri || !params.state || !params.responseType) {
    return 'Missing required params: client_id, redirect_uri, state, response_type.';
  }
  if (params.responseType !== 'code') {
    return 'response_type must be "code".';
  }
  if (params.clientId !== getOAuthClientId()) {
    return 'Invalid client_id.';
  }
  if (!getAllowedRedirectUris().includes(params.redirectUri)) {
    return 'Invalid redirect_uri.';
  }
  return null;
}

function buildOAuthErrorRedirect(
  redirectUri: string,
  state: string,
  error: string,
  errorDescription?: string
): string {
  const location = new URL(redirectUri);
  location.searchParams.set('error', error);
  location.searchParams.set('state', state);
  if (errorDescription) location.searchParams.set('error_description', errorDescription);
  return location.toString();
}

function renderAuthorizePage(params: AuthorizeParams, message?: string): string {
  const defaultEmail = (
    process.env.ZAPIER_OAUTH_DEFAULT_EMAIL || process.env.ZAPIER_TEST_EMAIL || ''
  ).trim();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize BizHub</title>
    <style>
      body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0b1220; color: #e2e8f0; }
      .box { max-width: 460px; margin: 48px auto; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { color: #94a3b8; font-size: 14px; margin: 0 0 14px; line-height: 1.45; }
      label { display: block; margin: 12px 0 6px; font-size: 13px; color: #cbd5e1; }
      input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #475569; background: #020617; color: #e2e8f0; }
      button { margin-top: 16px; width: 100%; border: 0; border-radius: 8px; background: #4f46e5; color: #fff; padding: 11px; font-weight: 600; cursor: pointer; }
      .msg { margin-top: 12px; padding: 9px 10px; border-radius: 8px; font-size: 13px; color: #fda4af; border: 1px solid #7f1d1d; background: #450a0a; }
      .meta { margin-top: 10px; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Connect BizHub to Zapier</h1>
      <p>Sign in and approve access for Zapier.</p>
      <form method="POST" action="/oauth/authorize">
        <input type="hidden" name="client_id" value="${htmlEscape(params.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${htmlEscape(params.redirectUri)}" />
        <input type="hidden" name="state" value="${htmlEscape(params.state)}" />
        <input type="hidden" name="response_type" value="${htmlEscape(params.responseType)}" />
        <input type="hidden" name="scope" value="${htmlEscape(params.scope)}" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required value="${htmlEscape(defaultEmail)}" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Authorize</button>
      </form>
      ${message ? `<div class="msg">${htmlEscape(message)}</div>` : ''}
      <div class="meta">Scope: ${htmlEscape(params.scope || 'default')}</div>
    </div>
  </body>
</html>`;
}

async function validateUser(email: string, password: string): Promise<{ userId: string; email: string } | null> {
  if (isDbConnected()) {
    const user = await User.findOne({ email }).lean();
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return { userId: user._id.toString(), email: user.email };
  }

  const fallbackEmail = (process.env.ZAPIER_OAUTH_FALLBACK_EMAIL || '').trim().toLowerCase();
  const fallbackPassword = (process.env.ZAPIER_OAUTH_FALLBACK_PASSWORD || '').trim();
  if (!fallbackEmail || !fallbackPassword) return null;
  if (fallbackEmail === email && fallbackPassword === password) {
    return { userId: 'fallback-user', email };
  }
  return null;
}

function createAuthorizationCode(params: AuthorizeParams, identity: { userId: string; email: string }): string {
  return jwt.sign(
    {
      token_type: 'oauth_code',
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
      scope: params.scope,
      sub: identity.userId,
      email: identity.email,
      jti: crypto.randomBytes(12).toString('hex'),
    },
    JWT_SECRET,
    { expiresIn: getCodeTtlSeconds() }
  );
}

function createAccessToken(claims: {
  clientId: string;
  userId: string;
  email: string;
  scope: string;
}): string {
  return jwt.sign(
    {
      token_type: 'oauth_access',
      client_id: claims.clientId,
      sub: claims.userId,
      email: claims.email,
      scope: claims.scope,
    },
    JWT_SECRET,
    { expiresIn: getAccessTtlSeconds() }
  );
}

function createRefreshToken(claims: {
  clientId: string;
  userId: string;
  email: string;
  scope: string;
}): string {
  return jwt.sign(
    {
      token_type: 'oauth_refresh',
      client_id: claims.clientId,
      sub: claims.userId,
      email: claims.email,
      scope: claims.scope,
      jti: crypto.randomBytes(12).toString('hex'),
    },
    JWT_SECRET,
    { expiresIn: getRefreshTtlSeconds() }
  );
}

export function verifyOAuthAccessToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      token_type?: string;
      sub?: string;
      email?: string;
    };
    if (decoded.token_type !== 'oauth_access' || !decoded.sub || !decoded.email) {
      return null;
    }
    return { userId: decoded.sub, email: decoded.email };
  } catch {
    return null;
  }
}

function readClientCredentials(req: Request): { clientId: string; clientSecret: string } {
  let clientId = String((req.body as Record<string, unknown>)?.client_id ?? '').trim();
  let clientSecret = String((req.body as Record<string, unknown>)?.client_secret ?? '').trim();

  const authHeader = req.headers.authorization;
  if ((!clientId || !clientSecret) && authHeader?.startsWith('Basic ')) {
    try {
      const raw = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const sepIndex = raw.indexOf(':');
      if (sepIndex > -1) {
        clientId = raw.slice(0, sepIndex);
        clientSecret = raw.slice(sepIndex + 1);
      }
    } catch {
      // Ignore malformed Basic auth and allow normal validation below.
    }
  }
  return { clientId, clientSecret };
}

function issueTokenResponse(claims: {
  clientId: string;
  userId: string;
  email: string;
  scope: string;
}) {
  const expiresIn = getAccessTtlSeconds();
  const accessToken = createAccessToken(claims);
  const refreshToken = createRefreshToken(claims);
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    refresh_token: refreshToken,
    expires_in: expiresIn,
  };
}

export const oauthRouter = Router();

oauthRouter.get('/authorize', (req: Request, res: Response): void => {
  const params = normalizeAuthorizeParams(req.query as Record<string, unknown>);
  const error = validateAuthorizeParams(params);
  if (error) {
    if (params.redirectUri && params.state) {
      res.redirect(
        302,
        buildOAuthErrorRedirect(params.redirectUri, params.state, 'invalid_request', error)
      );
      return;
    }
    res.status(400).send(error);
    return;
  }
  res.status(200).send(renderAuthorizePage(params));
});

oauthRouter.post('/authorize', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const params = normalizeAuthorizeParams(body);
  const error = validateAuthorizeParams(params);
  if (error) {
    if (params.redirectUri && params.state) {
      res.redirect(
        302,
        buildOAuthErrorRedirect(params.redirectUri, params.state, 'invalid_request', error)
      );
      return;
    }
    res.status(400).send(renderAuthorizePage(params, error));
    return;
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) {
    res.status(400).send(renderAuthorizePage(params, 'Email and password are required.'));
    return;
  }

  const identity = await validateUser(email, password);
  if (!identity) {
    res.status(401).send(renderAuthorizePage(params, 'Invalid email or password.'));
    return;
  }

  const code = createAuthorizationCode(params, identity);
  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', params.state);
  res.redirect(302, redirect.toString());
});

oauthRouter.post('/token', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const grantType = String(body?.grant_type ?? '').trim();
  const code = String(body?.code ?? '').trim();
  const refreshToken = String(body?.refresh_token ?? '').trim();
  const redirectUri = String(body?.redirect_uri ?? '').trim();
  const { clientId, clientSecret } = readClientCredentials(req);

  if (!getOAuthClientId() || !getOAuthClientSecret()) {
    res.status(503).json({
      error: 'server_error',
      error_description: 'OAuth is not configured.',
    });
    return;
  }
  if (!clientId || !clientSecret) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Missing client credentials.',
    });
    return;
  }
  if (clientId !== getOAuthClientId() || clientSecret !== getOAuthClientSecret()) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials.',
    });
    return;
  }

  if (grantType === 'authorization_code') {
    if (!code || !redirectUri) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'grant_type=authorization_code requires code and redirect_uri.',
      });
      return;
    }

    try {
      const decoded = jwt.verify(code, JWT_SECRET) as {
        token_type?: string;
        client_id?: string;
        redirect_uri?: string;
        sub?: string;
        email?: string;
        scope?: string;
      };
      if (decoded.token_type !== 'oauth_code') {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code.',
        });
        return;
      }
      if (decoded.client_id !== clientId || decoded.redirect_uri !== redirectUri) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Code does not match client_id or redirect_uri.',
        });
        return;
      }
      if (!decoded.sub || !decoded.email) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code payload is incomplete.',
        });
        return;
      }

      const tokens = issueTokenResponse({
        clientId,
        userId: decoded.sub,
        email: decoded.email,
        scope: decoded.scope ?? '',
      });

      if (isDbConnected()) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        await ZapierConnection.updateMany(
          { userId: decoded.sub, provider: 'zapier' },
          { status: 'revoked' }
        );
        await ZapierConnection.create({
          userId: decoded.sub,
          provider: 'zapier',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: decoded.scope ?? '',
          status: 'active',
          expiresAt,
          externalAccountId: decoded.email,
        });
      }

      res.json(tokens);
      return;
    } catch {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code.',
      });
      return;
    }
  }

  if (grantType === 'refresh_token') {
    if (!refreshToken) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'grant_type=refresh_token requires refresh_token.',
      });
      return;
    }
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
        token_type?: string;
        client_id?: string;
        sub?: string;
        email?: string;
        scope?: string;
      };
      if (
        decoded.token_type !== 'oauth_refresh' ||
        decoded.client_id !== clientId ||
        !decoded.sub ||
        !decoded.email
      ) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token.',
        });
        return;
      }

      const tokens = issueTokenResponse({
        clientId,
        userId: decoded.sub,
        email: decoded.email,
        scope: decoded.scope ?? '',
      });

      if (isDbConnected()) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
        await ZapierConnection.findOneAndUpdate(
          { userId: decoded.sub, provider: 'zapier', status: 'active' },
          {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            scope: decoded.scope ?? '',
            externalAccountId: decoded.email,
          }
        );
      }

      res.json(tokens);
      return;
    } catch {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired refresh token.',
      });
      return;
    }
  }

  res.status(400).json({
    error: 'unsupported_grant_type',
    error_description: 'grant_type must be authorization_code or refresh_token.',
  });
});
