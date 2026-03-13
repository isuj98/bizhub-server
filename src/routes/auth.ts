import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { isEmailDomainAllowed } from '../lib/allowedDomains.js';
import { signToken } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';

export const authRouter = Router();

authRouter.post('/signup', async (req: Request, res: Response): Promise<void> => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  try {
    const body = req.body as Record<string, unknown>;
    const email = (body?.email as string)?.trim()?.toLowerCase();
    const password = body?.password as string;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    if (!isEmailDomainAllowed(email)) {
      res.status(400).json({
        error: 'Signup is only allowed for emails from these domains: gamemybiz.com, johnnytsunami.com',
      });
      return;
    }
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role: 'user' });
    const token = signToken({ userId: user._id.toString(), email: user.email });
    res.status(201).json({ token, user: { id: user._id.toString(), email: user.email } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  try {
    const body = req.body as Record<string, unknown>;
    const email = (body?.email as string)?.trim()?.toLowerCase();
    const password = body?.password as string;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    if (!isEmailDomainAllowed(email)) {
      res.status(403).json({
        error: 'Login is only allowed for emails from these domains: gamemybiz.com, johnnytsunami.com',
      });
      return;
    }
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    const token = signToken({ userId: user._id.toString(), email: user.email });
    res.json({ token, user: { id: user._id.toString(), email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});
