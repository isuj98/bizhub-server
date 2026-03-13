import { Hub } from '../models/Hub.js';
function normalizeBusinessToHub(business) {
    const tasks = Array.isArray(business.tasks)
        ? business.tasks.map((t, i) => ({
            id: t.id ?? `t-${i}`,
            title: String(t.title ?? ''),
            status: String(t.status ?? 'todo'),
            priority: ['low', 'medium', 'high'].includes(String(t.priority)) ? String(t.priority) : 'medium',
            dueDate: t.dueDate ? String(t.dueDate) : new Date().toISOString().slice(0, 10),
        }))
        : [];
    return {
        title: business.name,
        name: business.name,
        businessType: business.business_type,
        website_url: business.website_url,
        api_endpoint: business.api_endpoint,
        tasks,
        sourceType: 'business',
    };
}
function normalizeZapToHub(zap) {
    return {
        title: zap.name,
        name: zap.name,
        tasks: [],
        triggerConfig: zap.triggerConfig ?? {},
        actionConfig: zap.actionConfig ?? {},
        sourceType: 'zap',
    };
}
export async function createHubFromBusiness(userId, businessId, business) {
    const normalizedData = normalizeBusinessToHub(business);
    const hub = await Hub.create({
        userId,
        sourceType: 'business',
        sourceId: businessId,
        title: business.name,
        rawData: business,
        normalizedData,
        analyzeReady: true,
    });
    return { _id: hub._id };
}
export async function createHubFromZap(userId, zapId, zap) {
    const normalizedData = normalizeZapToHub(zap);
    const hub = await Hub.create({
        userId,
        sourceType: 'zap',
        sourceId: zapId,
        title: zap.name,
        rawData: zap,
        normalizedData,
        analyzeReady: true,
    });
    return { _id: hub._id };
}
export async function getHubById(hubId, userId) {
    const hub = await Hub.findById(hubId);
    if (!hub)
        return null;
    if (userId && hub.userId.toString() !== userId)
        return null;
    return {
        normalizedData: hub.normalizedData,
        rawData: hub.rawData,
        title: hub.title,
    };
}
