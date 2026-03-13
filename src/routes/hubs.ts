import { Router, Request, Response } from 'express';
import { authMiddleware, type AuthReq } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import { Hub } from '../models/Hub.js';
import { Business } from '../models/Business.js';
import { Zap } from '../models/Zap.js';
import { createHubFromBusiness, createHubFromZap, getHubById } from '../services/hubService.js';

export const hubsRouter = Router();

hubsRouter.use((req: Request, res: Response, next) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  authMiddleware(req, res, next);
});

hubsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthReq).user._id;
    const list = await Hub.find({ userId }).lean();
    res.json(list.map((h) => ({ id: (h as { _id: unknown })._id?.toString?.(), title: (h as { title: string }).title, sourceType: (h as { sourceType: string }).sourceType })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list hubs' });
  }
});

hubsRouter.post('/from-business/:businessId', async (req: Request, res: Response): Promise<void> => {
  try {
    const businessId = (req.params.businessId as string)?.trim();
    const userId = (req as AuthReq).user._id;
    const business = await Business.findOne({ _id: businessId, userId });
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    const existingHub = await Hub.findOne({ sourceType: 'business', sourceId: business._id });
    if (existingHub) {
      res.status(200).json({ id: existingHub._id.toString(), title: existingHub.title });
      return;
    }
    const hub = await createHubFromBusiness(business.userId, business._id, {
      name: business.name,
      website_url: business.website_url,
      api_endpoint: business.api_endpoint,
      business_type: business.business_type,
      tasks: business.tasks,
    });
    await Business.updateOne({ _id: businessId }, { hubId: hub._id });
    const created = await Hub.findById(hub._id).lean();
    res.status(201).json({
      id: created!._id.toString(),
      title: created!.title,
      sourceType: created!.sourceType,
      sourceId: created!.sourceId,
    });
  } catch (err) {
    console.error('Create hub from business:', err);
    res.status(500).json({ error: 'Failed to create hub' });
  }
});

hubsRouter.post('/from-zap/:zapId', async (req: Request, res: Response): Promise<void> => {
  try {
    const zapId = (req.params.zapId as string)?.trim();
    const userId = (req as AuthReq).user._id;
    const zap = await Zap.findOne({ _id: zapId, userId });
    if (!zap) {
      res.status(404).json({ error: 'Zap not found' });
      return;
    }
    const existingHub = await Hub.findOne({ sourceType: 'zap', sourceId: zap._id });
    if (existingHub) {
      res.status(200).json({ id: existingHub._id.toString(), title: existingHub.title });
      return;
    }
    const hub = await createHubFromZap(zap.userId, zap._id, {
      name: zap.name,
      triggerConfig: zap.triggerConfig,
      actionConfig: zap.actionConfig,
    });
    await Zap.updateOne({ _id: zapId }, { hubId: hub._id });
    const created = await Hub.findById(hub._id).lean();
    res.status(201).json({
      id: created!._id.toString(),
      title: created!.title,
      sourceType: created!.sourceType,
      sourceId: created!.sourceId,
    });
  } catch (err) {
    console.error('Create hub from zap:', err);
    res.status(500).json({ error: 'Failed to create hub' });
  }
});

hubsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = (req.params.id as string)?.trim();
    const userId = (req as AuthReq).user._id;
    const hub = await getHubById(id, userId);
    if (!hub) {
      res.status(404).json({ error: 'Hub not found' });
      return;
    }
    res.json(hub);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get hub' });
  }
});

hubsRouter.get('/:id/analyze-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = (req.params.id as string)?.trim();
    const userId = (req as AuthReq).user._id;
    const hubData = await getHubById(id, userId);
    if (!hubData) {
      res.status(404).json({ error: 'Hub not found' });
      return;
    }
    res.json({
      id: req.params.id,
      title: hubData.title,
      normalizedData: hubData.normalizedData,
      rawData: hubData.rawData,
      analyzeReady: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get hub analyze data' });
  }
});
