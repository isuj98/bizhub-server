import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { businessesRouter } from './routes/businesses.js';
import { analyzeRouter } from './routes/analyze.js';
import { integrationsRouter } from './routes/integrations.js';
import { webhooksRouter } from './routes/webhooks.js';
import { zapierOAuthCallback } from './routes/zapier-oauth-callback.js';
const app = express();
const PORT = process.env.PORT ?? 5001;
app.use(cors());
app.use(express.json());
app.use('/api/businesses', businessesRouter);
app.use('/api/businesses/:id/integrations', integrationsRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/webhooks', webhooksRouter);
app.get('/api/integrations/zapier/oauth/callback', zapierOAuthCallback);
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
app.listen(PORT, () => {
    console.log(`bizhub-server running at http://localhost:${PORT}`);
});
