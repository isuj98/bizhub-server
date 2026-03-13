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
import { authMiddleware } from './middleware/auth.js';
import { isDbConnected } from './db.js';
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
app.get('/api/me', authMiddleware, (req, res) => {
    if (!isDbConnected()) {
        res.status(503).json({ error: 'Database not available' });
        return;
    }
    const user = req.user;
    res.json({ id: user._id, email: user.email });
});
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
(async () => {
    try {
        await connectDb();
    }
    catch (err) {
        console.error('MongoDB connection error:', err);
    }
    app.listen(PORT, () => {
        console.log(`bizhub-server running at http://localhost:${PORT}`);
    });
})();
