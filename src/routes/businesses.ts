import { Router, Request, Response } from 'express';
import {
  createBusiness,
  getAllBusinessesForApi,
  addTaskToBusiness,
  getBusinessById as getBusinessByIdStore,
  updateTaskStatus as updateTaskStatusStore,
} from '../store.js';
import { runTaskWithGemini } from '../lib/runTaskWithGemini.js';
import { runTaskWithOpenAI } from '../lib/runTaskWithOpenAI.js';
import { authOptionalWhenNoDb } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import { Business } from '../models/Business.js';
import { createHubFromBusiness } from '../services/hubService.js';
import type { AuthReq } from '../middleware/auth.js';

export const businessesRouter = Router();
const requireAuthWhenDb = authOptionalWhenNoDb(isDbConnected);

function toApiBusiness(b: { _id: unknown; name: string; status?: string; tasks?: unknown[]; website_url?: string | null; api_endpoint?: string | null; business_type?: string | null }) {
  const id = typeof b._id === 'object' && b._id && 'toString' in b._id ? (b._id as { toString(): string }).toString() : String(b._id);
  return {
    id,
    name: b.name,
    status: b.status ?? 'pending',
    tasks: Array.isArray(b.tasks) ? b.tasks : [],
    ...(b.website_url && { website_url: b.website_url }),
    ...(b.api_endpoint && { api_endpoint: b.api_endpoint }),
    ...(b.business_type && { business_type: b.business_type }),
  };
}

businessesRouter.get('/', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    if (isDbConnected() && (req as AuthReq).user) {
      const userId = (req as AuthReq).user._id;
      const list = await Business.find({ userId }).lean();
      res.json(list.map(toApiBusiness));
      return;
    }
    const list = getAllBusinessesForApi();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list businesses' });
  }
});

businessesRouter.get('/:id', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = (req.params.id as string)?.trim();
    if (!id) {
      res.status(400).json({ error: 'Business ID is required' });
      return;
    }
    if (isDbConnected() && (req as AuthReq).user) {
      const business = await Business.findOne({ _id: id, userId: (req as AuthReq).user._id }).lean();
      if (!business) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }
      res.json(toApiBusiness(business));
      return;
    }
    const business = getBusinessByIdStore(id);
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    res.json(business);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get business' });
  }
});

businessesRouter.post('/', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const business_name = (body?.business_name as string)?.trim();
    if (!business_name) {
      res.status(400).json({ error: 'business_name is required' });
      return;
    }
    if (isDbConnected() && (req as AuthReq).user) {
      const userId = (req as AuthReq).user._id;
      const website_url = (body.website_url as string)?.trim();
      const api_endpoint = (body.api_endpoint as string)?.trim();
      const business_type = (body.business_type as string)?.trim();
      const business = await Business.create({
        userId,
        name: business_name,
        metadata: {},
        website_url: website_url || undefined,
        api_endpoint: api_endpoint || undefined,
        business_type: business_type || undefined,
        status: 'pending',
        tasks: [],
      });
      const hub = await createHubFromBusiness(
        business.userId,
        business._id,
        {
          name: business.name,
          website_url: business.website_url ?? undefined,
          api_endpoint: business.api_endpoint ?? undefined,
          business_type: business.business_type ?? undefined,
          tasks: business.tasks,
        }
      );
      await Business.updateOne({ _id: business._id }, { hubId: hub._id });
      const created = await Business.findById(business._id).lean();
      res.status(201).json(toApiBusiness(created!));
      return;
    }
    const business = createBusiness(
      business_name,
      (body.website_url as string)?.trim(),
      (body.api_endpoint as string)?.trim(),
      (body.business_type as string)?.trim()
    );
    res.status(201).json(business);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create business' });
  }
});

businessesRouter.post('/:id/tasks', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const businessId = (req.params.id as string)?.trim();
    if (!businessId) {
      res.status(400).json({ error: 'Business ID is required' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const title = (body?.title as string)?.trim();
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (isDbConnected() && (req as AuthReq).user) {
      const business = await Business.findOne({ _id: businessId, userId: (req as AuthReq).user._id });
      if (!business) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }
      const taskId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const task = {
        id: taskId,
        title,
        status: 'todo',
        priority: (body.priority as string) ?? 'medium',
        dueDate: (body.dueDate as string) ?? new Date().toISOString().slice(0, 10),
      };
      business.tasks.push(task);
      await business.save();
      res.status(201).json(task);
      return;
    }
    const task = addTaskToBusiness(businessId, {
      title,
      priority: (body.priority as string) ?? 'medium',
      dueDate: (body.dueDate as string) ?? new Date().toISOString().slice(0, 10),
    });
    if (!task) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add task' });
  }
});

businessesRouter.patch('/:id/tasks/:taskId', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const businessId = (req.params.id as string)?.trim();
    const taskId = (req.params.taskId as string)?.trim();
    if (!businessId || !taskId) {
      res.status(400).json({ error: 'Business ID and Task ID are required' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const status = (body?.status as string)?.trim();
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    if (isDbConnected() && (req as AuthReq).user) {
      const business = await Business.findOne({ _id: businessId, userId: (req as AuthReq).user._id });
      if (!business) {
        res.status(404).json({ error: 'Business or task not found' });
        return;
      }
      const task = business.tasks.find((t: { id: string }) => t.id === taskId);
      if (!task) {
        res.status(404).json({ error: 'Business or task not found' });
        return;
      }
      task.status = status;
      await business.save();
      res.json(task);
      return;
    }
    const task = updateTaskStatusStore(businessId, taskId, status);
    if (!task) {
      res.status(404).json({ error: 'Business or task not found' });
      return;
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

businessesRouter.post('/:id/tasks/:taskId/run-ai', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const businessId = (req.params.id as string)?.trim();
    const taskId = (req.params.taskId as string)?.trim();
    if (!businessId || !taskId) {
      res.status(400).json({ error: 'Business ID and Task ID are required' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const taskTitle = (body?.taskTitle as string)?.trim();
    if (!taskTitle) {
      res.status(400).json({ error: 'taskTitle is required' });
      return;
    }
    const model = ((body?.model as string)?.trim() || 'gemini').toLowerCase();
    if (model !== 'gemini' && model !== 'openai') {
      res.status(400).json({ error: 'model must be "gemini" or "openai".' });
      return;
    }
    const apiKey =
      model === 'openai'
        ? process.env.OPENAI_API_KEY?.trim()
        : process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          model === 'openai'
            ? 'AI task with OpenAI requires OPENAI_API_KEY. Set it in bizhub-server/.env and restart the server.'
            : 'AI task requires GEMINI_API_KEY. Set it in bizhub-server/.env and restart the server.',
      });
      return;
    }
    if (isDbConnected() && (req as AuthReq).user) {
      const business = await Business.findOne({ _id: businessId, userId: (req as AuthReq).user._id }).lean();
      if (!business) {
        res.status(404).json({ error: 'Business not found' });
        return;
      }
      const tasks = business.tasks ?? [];
      const task = tasks.find((t: { id: string }) => t.id === taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      const result =
        model === 'openai'
          ? await runTaskWithOpenAI(apiKey, taskTitle)
          : await runTaskWithGemini(apiKey, taskTitle);
      res.json({ ...result, completedAt: new Date().toISOString() });
      return;
    }
    const business = getBusinessByIdStore(businessId);
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    const tasks = (business.tasks as Record<string, unknown>[]) ?? [];
    const task = tasks.find((t: Record<string, unknown>) => t.id === taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const result =
      model === 'openai'
        ? await runTaskWithOpenAI(apiKey, taskTitle)
        : await runTaskWithGemini(apiKey, taskTitle);
    res.json({ ...result, completedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI task failed';
    res.status(500).json({ error: message });
  }
});
