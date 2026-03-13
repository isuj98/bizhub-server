const businesses = new Map<string, Record<string, unknown>>();
let nextId = 1;

export function getAllBusinesses(): Record<string, unknown>[] {
  return Array.from(businesses.values());
}

export function getAllBusinessesForApi(): Record<string, unknown>[] {
  return Array.from(businesses.values());
}

export function getBusinessById(id: string): Record<string, unknown> | undefined {
  return businesses.get(id);
}

export function createBusiness(
  name: string,
  websiteUrl?: string,
  apiEndpoint?: string,
  businessType?: string
): Record<string, unknown> {
  const id = String(nextId++);
  const business: Record<string, unknown> = {
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

export function addTaskToBusiness(
  businessId: string,
  task: { title: string; priority?: string; dueDate?: string }
): Record<string, unknown> | null {
  const business = businesses.get(businessId);
  if (!business) return null;
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const tasks = (business.tasks as Record<string, unknown>[]) ?? [];
  const newTask: Record<string, unknown> = {
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

export function updateTaskStatus(
  businessId: string,
  taskId: string,
  status: string
): Record<string, unknown> | null {
  const business = businesses.get(businessId);
  if (!business) return null;
  const tasks = (business.tasks as Record<string, unknown>[]) ?? [];
  const task = tasks.find((t: Record<string, unknown>) => t.id === taskId);
  if (!task) return null;
  task.status = status;
  return task;
}
