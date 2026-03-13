import { Hub } from '../models/Hub.js';
import { Business } from '../models/Business.js';
import { Zap } from '../models/Zap.js';
import type { Types } from 'mongoose';

export interface NormalizedHubData {
  title: string;
  name?: string;
  businessType?: string;
  website_url?: string;
  api_endpoint?: string;
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueDate: string }>;
  triggerConfig?: Record<string, unknown>;
  actionConfig?: Record<string, unknown>;
  sourceType: 'business' | 'zap';
}

function normalizeBusinessToHub(business: { name: string; website_url?: string; api_endpoint?: string; business_type?: string; tasks?: unknown[] }): NormalizedHubData {
  const tasks = Array.isArray(business.tasks)
    ? (business.tasks as Array<{ id?: string; title?: string; status?: string; priority?: string; dueDate?: string }>).map((t, i) => ({
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

function normalizeZapToHub(zap: { name: string; triggerConfig?: Record<string, unknown>; actionConfig?: Record<string, unknown> }): NormalizedHubData {
  return {
    title: zap.name,
    name: zap.name,
    tasks: [],
    triggerConfig: zap.triggerConfig ?? {},
    actionConfig: zap.actionConfig ?? {},
    sourceType: 'zap',
  };
}

export async function createHubFromBusiness(
  userId: Types.ObjectId,
  businessId: Types.ObjectId,
  business: { name: string; website_url?: string; api_endpoint?: string; business_type?: string; tasks?: unknown[] }
): Promise<{ _id: Types.ObjectId }> {
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

export async function createHubFromZap(
  userId: Types.ObjectId,
  zapId: Types.ObjectId,
  zap: { name: string; triggerConfig?: Record<string, unknown>; actionConfig?: Record<string, unknown> }
): Promise<{ _id: Types.ObjectId }> {
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

export async function getHubById(hubId: string, userId?: string): Promise<{ normalizedData: NormalizedHubData; rawData: unknown; title: string } | null> {
  const hub = await Hub.findById(hubId);
  if (!hub) return null;
  if (userId && hub.userId.toString() !== userId) return null;
  return {
    normalizedData: hub.normalizedData as NormalizedHubData,
    rawData: hub.rawData,
    title: hub.title,
  };
}
