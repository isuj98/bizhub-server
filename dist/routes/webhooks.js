import { Router } from 'express';
import { getBusinessById, appendZapierWebhookPayload } from '../store.js';
export const webhooksRouter = Router();
webhooksRouter.post('/zapier/:businessId', (req, res) => {
    try {
        const businessId = req.params.businessId?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'Missing business ID' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
            return;
        }
        const payload = req.body ?? req.query ?? {};
        appendZapierWebhookPayload(businessId, payload);
        res.status(200).json({ ok: true, received: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
