import { Router, Request, Response } from 'express';
import { Zap } from '../models/Zap.js';
import { ZapierConnection } from '../models/ZapierConnection.js';
import { authMiddleware, type AuthReq } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import { createHubFromZap } from '../services/hubService.js';

export const zapsRouter = Router();

zapsRouter.use((req: Request, res: Response, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  authMiddleware(req, res, next);
});

zapsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthReq).user._id;
    const list = await Zap.find({ userId }).lean();
    res.json(
      list.map((z) => ({
        id: (z as { _id: unknown })._id?.toString?.() ?? (z as { _id: unknown })._id,
        name: (z as { name: string }).name,
        zapierZapId: (z as { zapierZapId?: string }).zapierZapId,
        triggerConfig: (z as { triggerConfig?: unknown }).triggerConfig,
        actionConfig: (z as { actionConfig?: unknown }).actionConfig,
        hubId: (z as { hubId?: unknown }).hubId?.toString?.() ?? (z as { hubId?: unknown }).hubId,
        status: (z as { status?: string }).status,
        createdAt:
          (z as { createdAt?: Date | string }).createdAt?.toString?.() ??
          (z as { createdAt?: unknown }).createdAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to list zaps' });
  }
});

zapsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = (req.params.id as string)?.trim();
    const userId = (req as AuthReq).user._id;
    const zap = await Zap.findOne({ _id: id, userId }).lean();
    if (!zap) {
      res.status(404).json({ error: 'Zap not found' });
      return;
    }
    const z = zap as Record<string, unknown>;
    res.json({
      id: z._id?.toString?.() ?? z._id,
      name: z.name,
      zapierConnectionId: z.zapierConnectionId?.toString?.() ?? z.zapierConnectionId,
      zapierZapId: z.zapierZapId,
      triggerConfig: z.triggerConfig,
      actionConfig: z.actionConfig,
      hubId: z.hubId?.toString?.() ?? z.hubId,
      status: z.status,
      createdAt: z.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get zap' });
  }
});

zapsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = (body?.name as string)?.trim();
    const zapierConnectionId = (body?.zapierConnectionId as string)?.trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const userId = (req as AuthReq).user._id;
    let connectionId = zapierConnectionId;
    if (!connectionId) {
      const conn = await ZapierConnection.findOne({ userId, status: 'active' }).lean();
      if (!conn) {
        res.status(400).json({
          error: 'Zapier not connected. Connect Zapier first before creating a Zap.',
        });
        return;
      }
      connectionId = (conn as { _id: unknown })._id?.toString?.() ?? String((conn as { _id: unknown })._id);
    } else {
      const conn = await ZapierConnection.findOne({ _id: connectionId, userId, status: 'active' });
      if (!conn) {
        res.status(400).json({ error: 'Invalid or inactive Zapier connection' });
        return;
      }
    }
    const zap = await Zap.create({
      userId,
      zapierConnectionId: connectionId,
      name,
      zapierZapId: (body.zapierZapId as string)?.trim() || undefined,
      triggerConfig: (body.triggerConfig as Record<string, unknown>) ?? {},
      actionConfig: (body.actionConfig as Record<string, unknown>) ?? {},
      status: 'active',
    });
    const hub = await createHubFromZap(zap.userId, zap._id, {
      name: zap.name,
      triggerConfig: zap.triggerConfig,
      actionConfig: zap.actionConfig,
    });
    await Zap.updateOne({ _id: zap._id }, { hubId: hub._id });
    const created = await Zap.findById(zap._id).lean();
    const c = created as Record<string, unknown>;
    res.status(201).json({
      id: c._id?.toString?.() ?? c._id,
      name: c.name,
      zapierConnectionId: c.zapierConnectionId?.toString?.() ?? c.zapierConnectionId,
      zapierZapId: c.zapierZapId,
      triggerConfig: c.triggerConfig,
      actionConfig: c.actionConfig,
      hubId: hub._id.toString(),
      status: c.status,
      createdAt: c.createdAt,
    });
  } catch (err) {
    console.error('Create zap:', err);
    res.status(500).json({ error: 'Failed to create zap' });
  }
});
