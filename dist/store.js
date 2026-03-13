const businesses = new Map();
let nextId = 1;
export function getAllBusinesses() {
    return Array.from(businesses.values());
}
export function getAllBusinessesForApi() {
    return Array.from(businesses.values());
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
    };
    businesses.set(id, business);
    return business;
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
