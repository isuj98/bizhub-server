import { Router } from 'express';
import { getBusinessById } from '../store.js';
import { probeWebsite, probeServer } from '../lib/fetchSite.js';
import { analyzeWithGemini } from '../lib/analyzeWithGemini.js';
import { analyzeWithOpenAI } from '../lib/analyzeWithOpenAI.js';
import { validateUrl } from '../lib/urlUtils.js';
import { assessContentQuality } from '../lib/contentQuality.js';
export const analyzeRouter = Router();
/**
 * 1. Fetch page, 2. Use cleaned extracted content, 3. Run content-quality checks.
 * Returns null if fetch fails. Never returns raw URL for Gemini.
 */
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
analyzeRouter.post('/', async (req, res) => {
    try {
        const body = req.body;
        const businessId = body?.businessId?.trim();
        if (!businessId) {
            res.status(400).json({ error: 'businessId is required' });
            return;
        }
        const business = getBusinessById(businessId);
        if (!business) {
            res.status(404).json({ error: 'Business not found' });
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
        const websiteUrlRaw = business.website_url?.trim();
        let websiteExtraction = null;
        if (websiteUrlRaw) {
            const validation = validateUrl(websiteUrlRaw);
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
        const apiEndpoint = business.api_endpoint?.trim();
        if (apiEndpoint) {
            const apiValidation = validateUrl(apiEndpoint);
            const websiteValidation = websiteUrlRaw ? validateUrl(websiteUrlRaw) : null;
            const websiteNorm = websiteValidation && websiteValidation.valid ? websiteValidation.normalized : '';
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
                businessName: business.name,
                businessType: body.businessType?.trim(),
                website: websiteExtraction,
                serverProbe,
            })
            : await analyzeWithGemini(apiKey, {
                businessName: business.name,
                businessType: body.businessType?.trim(),
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
