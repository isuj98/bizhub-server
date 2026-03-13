import { Router } from 'express';
import { createBusiness, getAllBusinessesForApi, addTaskToBusiness, getBusinessById, updateTaskStatus, } from '../store.js';
import { runTaskWithGemini } from '../lib/runTaskWithGemini.js';
import { runTaskWithOpenAI } from '../lib/runTaskWithOpenAI.js';
export const businessesRouter = Router();
businessesRouter.get('/', (_req, res) => {
    try {
        const list = getAllBusinessesForApi();
        res.json(list);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to list businesses' });
    }
});
businessesRouter.post('/', (req, res) => {
    try {
        const body = req.body;
        const business_name = body?.business_name?.trim();
        if (!business_name) {
            res.status(400).json({ error: 'business_name is required' });
            return;
        }
        const business = createBusiness(business_name, body.website_url?.trim(), body.api_endpoint?.trim(), body.business_type?.trim());
        res.status(201).json(business);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create business' });
    }
});
businessesRouter.post('/:id/tasks', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }
        const body = req.body;
        const title = body?.title?.trim();
        if (!title) {
            res.status(400).json({ error: 'title is required' });
            return;
        }
        const task = addTaskToBusiness(businessId, {
            title,
            priority: body.priority ?? 'medium',
            dueDate: body.dueDate ?? new Date().toISOString().slice(0, 10),
        });
        if (!task) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        res.status(201).json(task);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to add task' });
    }
});
businessesRouter.patch('/:id/tasks/:taskId', (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        const taskId = req.params.taskId?.trim();
        if (!businessId || !taskId) {
            res.status(400).json({ error: 'Business ID and Task ID are required' });
            return;
        }
        const body = req.body;
        const status = body?.status?.trim();
        if (!status) {
            res.status(400).json({ error: 'status is required' });
            return;
        }
        const task = updateTaskStatus(businessId, taskId, status);
        if (!task) {
            res.status(404).json({ error: 'Business or task not found' });
            return;
        }
        res.json(task);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update task status' });
    }
});
businessesRouter.post('/:id/tasks/:taskId/run-ai', async (req, res) => {
    try {
        const businessId = req.params.id?.trim();
        const taskId = req.params.taskId?.trim();
        if (!businessId || !taskId) {
            res.status(400).json({ error: 'Business ID and Task ID are required' });
            return;
        }
        const body = req.body;
        const taskTitle = body?.taskTitle?.trim();
        if (!taskTitle) {
            res.status(400).json({ error: 'taskTitle is required' });
            return;
        }
        const model = (body?.model?.trim() || 'gemini').toLowerCase();
        if (model !== 'gemini' && model !== 'openai') {
            res.status(400).json({ error: 'model must be "gemini" or "openai".' });
            return;
        }
        const apiKey = model === 'openai'
            ? process.env.OPENAI_API_KEY?.trim()
            : process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
            res.status(503).json({
                error: model === 'openai'
                    ? 'AI task with OpenAI requires OPENAI_API_KEY. Set it in bizhub-server/.env and restart the server.'
                    : 'AI task requires GEMINI_API_KEY. Set it in bizhub-server/.env and restart the server.',
            });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        const tasks = business.tasks ?? [];
        const task = tasks.find((t) => t.id === taskId);
        if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }
        const result = model === 'openai'
            ? await runTaskWithOpenAI(apiKey, taskTitle)
            : await runTaskWithGemini(apiKey, taskTitle);
        const response = {
            ...result,
            completedAt: new Date().toISOString(),
        };
        res.json(response);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'AI task failed';
        res.status(500).json({ error: message });
    }
});
