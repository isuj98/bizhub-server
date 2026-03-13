import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import { businessesRouter } from './routes/businesses.js';
import { analyzeRouter } from './routes/analyze.js';
import { authRouter } from './routes/auth.js';
import { zapierRouter } from './routes/zapier.js';
import { oauthRouter } from './routes/oauth.js';
import { zapsRouter } from './routes/zaps.js';
import { hubsRouter } from './routes/hubs.js';
import { type AuthReq } from './middleware/auth.js';
import { isDbConnected } from './db.js';
import { verifyOAuthAccessToken } from './routes/oauth.js';
import jwt from 'jsonwebtoken';
import { User } from './models/User.js';

const app = express();
const PORT = process.env.PORT ?? 5001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/businesses', businessesRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/auth', authRouter);
app.use('/zapier', zapierRouter);
app.use('/oauth', oauthRouter);
app.use('/api/zaps', zapsRouter);
app.use('/api/hubs', hubsRouter);

const JWT_SECRET = process.env.JWT_SECRET ?? 'bizhub-dev-secret-change-in-production';

function extractApiToken(req: express.Request): string {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearerToken) return bearerToken;

  const queryToken =
    typeof req.query.access_token === 'string' ? req.query.access_token.trim() : '';
  if (queryToken) return queryToken;

  const body = req.body as Record<string, unknown> | undefined;
  const bodyToken =
    body && typeof body.access_token === 'string' ? body.access_token.trim() : '';
  if (bodyToken) return bodyToken;

  return '';
}

async function handleApiMe(req: express.Request, res: express.Response): Promise<void> {
  const token = extractApiToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const oauthIdentity = verifyOAuthAccessToken(token);
  if (oauthIdentity) {
    res.json({ id: oauthIdentity.userId, email: oauthIdentity.email });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; email?: string };
    if (!decoded.userId || !decoded.email) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    if (!isDbConnected()) {
      res.json({ id: decoded.userId, email: decoded.email });
      return;
    }
    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const authReq = req as AuthReq;
    authReq.user = { _id: user._id.toString(), email: user.email };
    res.json({ id: authReq.user._id, email: authReq.user.email });
    return;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/me', handleApiMe);
app.post('/api/me', handleApiMe);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

(async () => {
  try {
    await connectDb();
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
  app.listen(PORT, () => {
    console.log(`bizhub-server running at http://localhost:${PORT}`);
  });
})();
