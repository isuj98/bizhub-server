import { Router, Request, Response } from 'express';
import { getBusinessById } from '../store.js';
import { Business } from '../models/Business.js';
import { getHubById } from '../services/hubService.js';
import { probeWebsite, probeServer } from '../lib/fetchSite.js';
import { analyzeWithGemini, type WebsiteExtraction } from '../lib/analyzeWithGemini.js';
import { analyzeWithOpenAI } from '../lib/analyzeWithOpenAI.js';
import { validateUrl } from '../lib/urlUtils.js';
import { assessContentQuality } from '../lib/contentQuality.js';
import { authOptionalWhenNoDb } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
import type { AuthReq } from '../middleware/auth.js';

export const analyzeRouter = Router();
const requireAuthWhenDb = authOptionalWhenNoDb(isDbConnected);

export type AIModel = 'gemini' | 'openai';

async function buildWebsiteExtraction(normalizedUrl: string): Promise<WebsiteExtraction | null> {
  const probe = await probeWebsite(normalizedUrl);
  const quality = assessContentQuality(
    probe.extractedContent,
    probe.status,
    probe.contentType
  );
  return {
    extractedContent: probe.extractedContent,
    status: probe.status,
    contentType: probe.contentType,
    quality,
  };
}

analyzeRouter.post('/', requireAuthWhenDb, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const businessId = (body?.businessId as string)?.trim();
    const hubId = (body?.hubId as string)?.trim();
    if (!businessId && !hubId) {
      res.status(400).json({ error: 'businessId or hubId is required' });
      return;
    }
    const model = ((body?.model as string)?.trim() || 'gemini').toLowerCase() as AIModel;
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
            ? 'Analysis with OpenAI requires OPENAI_API_KEY. Set it in bizhub-server/.env and restart the server.'
            : 'Analysis requires GEMINI_API_KEY. Set it in bizhub-server/.env and restart the server.',
      });
      return;
    }

    let businessName: string;
    let businessType: string | undefined;
    let websiteUrlRaw: string | undefined;
    let apiEndpoint: string | undefined;

    if (hubId && isDbConnected() && (req as AuthReq).user) {
      const hubData = await getHubById(hubId, (req as AuthReq).user._id);
      if (!hubData) {
        res.status(404).json({ error: 'Hub not found' });
        return;
      }
      const nd = hubData.normalizedData;
      businessName = nd.title ?? nd.name ?? 'Unknown';
      businessType = nd.businessType;
      websiteUrlRaw = nd.website_url;
      apiEndpoint = nd.api_endpoint;
    } else if (businessId) {
      if (isDbConnected() && (req as AuthReq).user) {
        const business = await Business.findOne({ _id: businessId, userId: (req as AuthReq).user._id }).lean();
        if (!business) {
          res.status(404).json({ error: 'Business not found' });
          return;
        }
        businessName = business.name;
        businessType = business.business_type;
        websiteUrlRaw = business.website_url;
        apiEndpoint = business.api_endpoint;
      } else {
        const business = getBusinessById(businessId) as { name: string; website_url?: string; api_endpoint?: string; business_type?: string } | undefined;
        if (!business) {
          res.status(404).json({ error: 'Business not found' });
          return;
        }
        businessName = business.name as string;
        businessType = business.business_type;
        websiteUrlRaw = business.website_url;
        apiEndpoint = business.api_endpoint;
      }
    } else {
      res.status(400).json({ error: 'businessId or hubId is required' });
      return;
    }

    let websiteExtraction: WebsiteExtraction | null = null;
    if (websiteUrlRaw?.trim()) {
      const validation = validateUrl(websiteUrlRaw.trim());
      if (!validation.valid) {
        res.status(400).json({
          error: `Invalid website URL: ${validation.reason}. Analysis uses extracted content only, not raw URLs.`,
        });
        return;
      }
      try {
        websiteExtraction = await buildWebsiteExtraction(validation.normalized);
      } catch {
        websiteExtraction = null;
      }
    }

    let serverProbe: {
      baseUrl: string;
      mainPage: { status: number; contentType: string; snippet: string };
      endpoints: Array<{ path: string; status: number; contentType: string; snippet: string; isJson?: boolean }>;
    } | null = null;
    if (apiEndpoint?.trim()) {
      const apiValidation = validateUrl(apiEndpoint.trim());
      const websiteValidation = websiteUrlRaw ? validateUrl(websiteUrlRaw) : null;
      const websiteNorm = websiteValidation?.valid ? websiteValidation.normalized : '';
      if (apiValidation.valid && apiValidation.normalized !== websiteNorm) {
        try {
          const probe = await probeServer(apiValidation.normalized);
          serverProbe = {
            baseUrl: probe.baseUrl,
            mainPage: probe.mainPage,
            endpoints: probe.endpoints,
          };
        } catch {
          serverProbe = null;
        }
      }
    }

    const { tasks, recommendations, extractionMetadata } =
      model === 'openai'
        ? await analyzeWithOpenAI(apiKey, {
            businessName,
            businessType: businessType ?? (body.businessType as string)?.trim(),
            website: websiteExtraction,
            serverProbe,
          })
        : await analyzeWithGemini(apiKey, {
            businessName,
            businessType: businessType ?? (body.businessType as string)?.trim(),
            website: websiteExtraction,
            serverProbe,
          });
    res.json({ tasks, recommendations, extractionMetadata });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    res.status(500).json({ error: message });
  }
});
