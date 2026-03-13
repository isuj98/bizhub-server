import { Router } from 'express';
import { getBusinessById } from '../store.js';
import { Business } from '../models/Business.js';
import { getHubById } from '../services/hubService.js';
import { probeWebsite, probeServer } from '../lib/fetchSite.js';
import { analyzeWithGemini } from '../lib/analyzeWithGemini.js';
import { analyzeWithOpenAI } from '../lib/analyzeWithOpenAI.js';
import { validateUrl } from '../lib/urlUtils.js';
import { assessContentQuality } from '../lib/contentQuality.js';
import { authOptionalWhenNoDb } from '../middleware/auth.js';
import { isDbConnected } from '../db.js';
export const analyzeRouter = Router();
const requireAuthWhenDb = authOptionalWhenNoDb(isDbConnected);
async function buildWebsiteExtraction(normalizedUrl) {
    const probe = await probeWebsite(normalizedUrl);
    const quality = assessContentQuality(probe.extractedContent, probe.status, probe.contentType);
    return {
        extractedContent: probe.extractedContent,
        status: probe.status,
        contentType: probe.contentType,
        quality,
    };
}
analyzeRouter.post('/', requireAuthWhenDb, async (req, res) => {
    try {
        const body = req.body;
        const businessId = body?.businessId?.trim();
        const hubId = body?.hubId?.trim();
        if (!businessId && !hubId) {
            res.status(400).json({ error: 'businessId or hubId is required' });
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
                    ? 'Analysis with OpenAI requires OPENAI_API_KEY. Set it in bizhub-server/.env and restart the server.'
                    : 'Analysis requires GEMINI_API_KEY. Set it in bizhub-server/.env and restart the server.',
            });
            return;
        }
        let businessName;
        let businessType;
        let websiteUrlRaw;
        let apiEndpoint;
        if (hubId && isDbConnected() && req.user) {
            const hubData = await getHubById(hubId, req.user._id);
            if (!hubData) {
                res.status(404).json({ error: 'Hub not found' });
                return;
            }
            const nd = hubData.normalizedData;
            businessName = nd.title ?? nd.name ?? 'Unknown';
            businessType = nd.businessType;
            websiteUrlRaw = nd.website_url;
            apiEndpoint = nd.api_endpoint;
        }
        else if (businessId) {
            if (isDbConnected() && req.user) {
                const business = await Business.findOne({ _id: businessId, userId: req.user._id }).lean();
                if (!business) {
                    res.status(404).json({ error: 'Business not found' });
                    return;
                }
                businessName = business.name;
                businessType = business.business_type;
                websiteUrlRaw = business.website_url;
                apiEndpoint = business.api_endpoint;
            }
            else {
                const business = getBusinessById(businessId);
                if (!business) {
                    res.status(404).json({ error: 'Business not found' });
                    return;
                }
                businessName = business.name;
                businessType = business.business_type;
                websiteUrlRaw = business.website_url;
                apiEndpoint = business.api_endpoint;
            }
        }
        else {
            res.status(400).json({ error: 'businessId or hubId is required' });
            return;
        }
        let websiteExtraction = null;
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
            }
            catch {
                websiteExtraction = null;
            }
        }
        let serverProbe = null;
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
                }
                catch {
                    serverProbe = null;
                }
            }
        }
        const { tasks, recommendations, extractionMetadata } = model === 'openai'
            ? await analyzeWithOpenAI(apiKey, {
                businessName,
                businessType: businessType ?? body.businessType?.trim(),
                website: websiteExtraction,
                serverProbe,
            })
            : await analyzeWithGemini(apiKey, {
                businessName,
                businessType: businessType ?? body.businessType?.trim(),
                website: websiteExtraction,
                serverProbe,
            });
        res.json({ tasks, recommendations, extractionMetadata });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        res.status(500).json({ error: message });
    }
});
