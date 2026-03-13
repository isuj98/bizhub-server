import OpenAI from 'openai';
import { buildAnalysisPrompt, safeParseAnalysisResponse, } from './analyzeWithGemini.js';
const MODEL = 'gpt-4o';
function toTask(raw, index) {
    return {
        id: `ai-${index + 1}`,
        title: raw.title,
        status: 'todo',
        priority: ['low', 'medium', 'high'].includes(String(raw.priority)) ? raw.priority : 'medium',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.dueDate ?? '')) ? String(raw.dueDate) : '2026-03-31',
    };
}
export async function analyzeWithOpenAI(apiKey, input) {
    const client = new OpenAI({ apiKey });
    const prompt = buildAnalysisPrompt(input);
    const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content?.trim();
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
