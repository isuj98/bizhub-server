import { GoogleGenAI } from '@google/genai';
const MODEL = 'gemini-2.5-flash';
/**
 * Builds the analysis prompt. Only includes website when we have extracted content.
 * Never asks Gemini to analyze a raw URL.
 */
export function buildAnalysisPrompt(input) {
    const { businessName, businessType, website, serverProbe } = input;
    let context = `Business/Product: ${businessName}.`;
    if (businessType)
        context += ` Type of business: ${businessType}.`;
    if (website && website.extractedContent.trim().length > 0) {
        context += `

--- EXTRACTED WEBSITE CONTENT (use this for analysis; do not fetch any URL) ---
HTTP status: ${website.status}, Content-Type: ${website.contentType}
Content quality score: ${website.quality.score.toFixed(2)}${website.quality.warnings.length ? `. Warnings: ${website.quality.warnings.join(' ')}` : ''}

Extracted text (cleaned, plain text):
---
${website.extractedContent.slice(0, 8_000)}
---
Analyze the above extracted content for structure, messaging, and opportunities.`;
    }
    else {
        context += `

No website content was available (page could not be fetched or had no extractable text). Base your analysis on the business name and type only; do not attempt to access or analyze any URL.`;
    }
    if (serverProbe) {
        context += `

--- API/SERVER PROBE (already fetched; use snippets only) ---
Base: ${serverProbe.baseUrl}
Main: HTTP ${serverProbe.mainPage.status}, ${serverProbe.mainPage.contentType}
Snippet: ${serverProbe.mainPage.snippet.slice(0, 1500)}
`;
        const different = serverProbe.endpoints.filter((e) => e.status !== 404 && e.status > 0);
        if (different.length > 0) {
            context += 'Other endpoints that responded:\n';
            for (const e of different) {
                context += `- ${e.path}: HTTP ${e.status}, ${e.contentType}${e.isJson ? ', JSON' : ''}. ${e.snippet.slice(0, 200).replace(/\s+/g, ' ')}\n`;
            }
        }
    }
    context += `

You are a business and product analyst. Use only the EXTRACTED WEBSITE CONTENT and API/SERVER PROBE data above (already fetched). Do not fetch or analyze any URL.

Respond with ONLY a single JSON object, no markdown or code fences, no extra text before or after. Use this exact structure:
{"tasks":[{"title":"string","priority":"low|medium|high","dueDate":"YYYY-MM-DD","category":"improve|good"}],"recommendations":["string"]}

Requirements:
- Include at least 10 tasks. Mix "category":"improve" and "category":"good" based on evidence from the extracted content and server probes.
- Each task must be specific to this business/product.
- dueDate: use realistic dates (e.g. 2-4 weeks from today). Today's date is 2026-03-06.
- priority: high for critical improvements, medium for important, low for nice-to-have.
- recommendations: 4-8 short, actionable recommendations.
- If no website content was provided, give tasks and recommendations based on business name and type only.`;
    return context;
}
/**
 * Safe JSON parsing for Gemini analysis response. Handles code fences and trailing text.
 */
export function safeParseAnalysisResponse(text) {
    const trimmed = text.trim();
    let jsonStr = trimmed;
    const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock)
        jsonStr = codeBlock[1].trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    try {
        const parsed = JSON.parse(jsonStr);
        if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.recommendations))
            return null;
        return { tasks: parsed.tasks, recommendations: parsed.recommendations };
    }
    catch {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}') + 1;
        if (start >= 0 && end > start) {
            try {
                const parsed = JSON.parse(trimmed.slice(start, end));
                if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.recommendations)) {
                    return { tasks: parsed.tasks, recommendations: parsed.recommendations };
                }
            }
            catch {
                // ignore
            }
        }
    }
    return null;
}
function toTask(raw, index) {
    return {
        id: `ai-${index + 1}`,
        title: raw.title,
        status: 'todo',
        priority: ['low', 'medium', 'high'].includes(String(raw.priority)) ? raw.priority : 'medium',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.dueDate ?? '')) ? String(raw.dueDate) : '2026-03-31',
    };
}
export async function analyzeWithGemini(apiKey, input) {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildAnalysisPrompt(input);
    const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
        },
    });
    const text = response.text?.trim();
    if (!text)
        throw new Error('Empty response from AI');
    const parsed = safeParseAnalysisResponse(text);
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.recommendations)) {
        throw new Error('AI did not return valid JSON with tasks and recommendations');
    }
    const tasks = parsed.tasks
        .filter((t) => t != null &&
        typeof t.title === 'string' &&
        String(t.title).length > 0)
        .slice(0, 20)
        .map((t, i) => toTask({
        title: String(t.title),
        priority: t.priority ?? 'medium',
        dueDate: t.dueDate ?? '2026-03-31',
        category: t.category,
    }, i));
    const recommendations = parsed.recommendations
        .filter((r) => typeof r === 'string' && r.length > 0)
        .slice(0, 12)
        .map((r) => String(r).trim());
    const extractionMetadata = input.website
        ? { confidence: input.website.quality.score, warnings: input.website.quality.warnings }
        : { confidence: 0, warnings: ['No website content was available for analysis.'] };
    if (tasks.length < 10) {
        console.warn(`[analyze] AI returned ${tasks.length} tasks; prompt asked for at least 10.`);
    }
    return { tasks, recommendations, extractionMetadata };
}
