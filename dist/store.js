const businesses = new Map();
let nextId = 1;
const ZAPIER_OAUTH_STATE = new Map();
const webhookPayloads = new Map();
export function getAllBusinesses() {
    return Array.from(businesses.values());
}
/** Returns a copy of the business safe for API response (no integration secrets). */
function sanitizeBusinessForApi(b) {
    const out = { ...b };
    const integrations = out.integrations;
    if (integrations?.zapier) {
        const { _apiKey: _, accessToken: __, refreshToken: ___, ...rest } = integrations.zapier;
        out.integrations = { ...integrations, zapier: rest };
    }
    return out;
}
export function getAllBusinessesForApi() {
    return Array.from(businesses.values()).map(sanitizeBusinessForApi);
}
export function getBusinessById(id) {
    return businesses.get(id);
}
export function createBusiness(name, websiteUrl, apiEndpoint, businessType) {
    const id = String(nextId++);
    const business = {
        id,
        name,
        status: 'pending',
        tasks: [],
        ...(websiteUrl && { website_url: websiteUrl }),
        ...(apiEndpoint && { api_endpoint: apiEndpoint }),
        ...(businessType && { business_type: businessType }),
        integrations: {},
    };
    businesses.set(id, business);
    return business;
}
export function getZapierIntegration(businessId) {
    const business = businesses.get(businessId);
    if (!business)
        return null;
    const integrations = business.integrations;
    const zapier = integrations?.zapier;
    if (!zapier)
        return null;
    return {
        status: zapier.status,
        connectedAt: zapier.connectedAt,
        label: zapier.label,
        webhookUrl: zapier.webhookUrl,
    };
}
export function setZapierIntegration(businessId, payload) {
    const business = businesses.get(businessId);
    if (!business)
        return null;
    let integrations = business.integrations;
    if (!integrations) {
        integrations = {};
        business.integrations = integrations;
    }
    const connectedAt = new Date().toISOString();
    const baseUrl = payload.webhookBaseUrl?.replace(/\/$/, '') ?? '';
    const webhookUrl = baseUrl ? `${baseUrl}/api/webhooks/zapier/${businessId}` : undefined;
    integrations.zapier = {
        status: payload.accessToken || payload.apiKey ? 'connected' : 'pending',
        connectedAt,
        label: payload.label ?? (payload.accessToken ? 'OAuth' : 'API Key'),
        webhookUrl,
        ...(payload.apiKey && { _apiKey: payload.apiKey }),
        ...(payload.accessToken && { accessToken: payload.accessToken }),
        ...(payload.refreshToken && { refreshToken: payload.refreshToken }),
    };
    return {
        status: integrations.zapier.status,
        connectedAt: integrations.zapier.connectedAt,
        label: integrations.zapier.label,
        webhookUrl: integrations.zapier.webhookUrl,
    };
}
export function disconnectZapier(businessId) {
    const business = businesses.get(businessId);
    if (!business)
        return false;
    const integrations = business.integrations;
    if (!integrations?.zapier)
        return true;
    integrations.zapier = {
        status: 'disconnected',
        label: integrations.zapier.label,
    };
    return true;
}
export function setOAuthState(state, businessId) {
    ZAPIER_OAUTH_STATE.set(state, { businessId, createdAt: Date.now() });
}
export function consumeOAuthState(state) {
    const entry = ZAPIER_OAUTH_STATE.get(state);
    if (!entry)
        return null;
    ZAPIER_OAUTH_STATE.delete(state);
    if (Date.now() - entry.createdAt > 10 * 60 * 1000)
        return null;
    return entry.businessId;
}
export function appendZapierWebhookPayload(businessId, payload) {
    const list = webhookPayloads.get(businessId) ?? [];
    list.push({ receivedAt: new Date().toISOString(), payload });
    if (list.length > 500)
        list.splice(0, list.length - 500);
    webhookPayloads.set(businessId, list);
}
export function getZapierWebhookPayloads(businessId) {
    return webhookPayloads.get(businessId) ?? [];
}
export function addTaskToBusiness(businessId, task) {
    const business = businesses.get(businessId);
    if (!business)
        return null;
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const tasks = business.tasks ?? [];
    const newTask = {
        id,
        title: task.title,
        status: 'todo',
        priority: task.priority || 'medium',
        dueDate: task.dueDate,
    };
    tasks.push(newTask);
    business.tasks = tasks;
    return newTask;
}
export function updateTaskStatus(businessId, taskId, status) {
    const business = businesses.get(businessId);
    if (!business)
        return null;
    const tasks = business.tasks ?? [];
    const task = tasks.find((t) => t.id === taskId);
    if (!task)
        return null;
    task.status = status;
    return task;
}
