import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

/**
 * MODEL: Website-aware AI task completion
 * ---------------------------------------
 * 1. Run-AI endpoint receives businessId, taskId, taskTitle.
 * 2. If the business has a website_url:
 *    - Server fetches the URL (probeWebsite) and gets current page content (snippet).
 *    - HTML is stripped to plain text and passed to the AI as context.
 * 3. AI prompt includes either:
 *    - "We have fetched the business's actual website..." + the text content → suggestions are based on real site content.
 *    - "No website URL was provided or we could not fetch it" → AI produces general output and can suggest adding a URL.
 * 4. AI returns suggestedContent (and summary/outcome) based on the task and, when available, the actual site.
 * 5. Analysis (POST /api/analyze) already uses the same pattern: fetches website_url + optional api_endpoint, passes probes to Gemini for accurate analysis.
 */

/** Optional context from fetching the business's website URL for accurate, site-based suggestions */
export interface WebsiteContext {
  websiteUrl: string;
  websiteSnippet: string;
  websiteStatus: number;
}

/** Result shape: actionable content for the user (we cannot access client sites to apply changes). */
export interface RunTaskResult {
  summary: string;
  suggestedContent: string[];
  outcome: string;
}

/** Strip HTML tags and normalize whitespace for AI-readable text */
function stripHtmlToText(html: string, maxLength: number = 8000): string {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '\n...[truncated]' : text;
}

function buildPrompt(taskTitle: string, websiteContext?: WebsiteContext | null): string {
  let context = `The user has a task: "${taskTitle}".`;
  if (websiteContext && websiteContext.websiteSnippet) {
    const textSnippet = stripHtmlToText(websiteContext.websiteSnippet, 6000);
    context += `

We have fetched the business's actual website to base suggestions on real content.
- Website URL: ${websiteContext.websiteUrl}
- HTTP status: ${websiteContext.websiteStatus}
- Current page content (text extracted, for reference):

---
${textSnippet}
---

Use this content to make your suggestedContent accurate and specific: reference or improve on what is actually there, suggest concrete replacements or additions, and align tone/messaging with the existing site.`;
  } else {
    context += `

No website URL was provided or we could not fetch it. Produce generally useful output for the task; you may mention that adding a website URL in the business profile would allow more accurate, site-specific suggestions next time.`;
  }

  context += `

We do NOT have access to update the client's website, systems, or files. So do NOT claim you "executed" steps on their infrastructure. PRODUCE actionable output the user can use themselves (draft copy, checklist items, suggested changes to paste in).

Respond with ONLY a single JSON object, no markdown or code fences:
{"summary":"One sentence: what you produced (e.g. draft sections or suggested copy, based on their site when available).","suggestedContent":["First item: actual content or instruction","Second item","Third item", "..."],"outcome":"One or two sentences: how to use this output and any next step."}

Make suggestedContent concrete and usable. Minimum 3 items. Output only valid JSON.`;

  return context;
}

function parseJsonFromResponse(text: string): RunTaskResult | null {
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!parsed || typeof parsed.summary !== 'string' || typeof parsed.outcome !== 'string') return null;
    const suggestedContent = Array.isArray(parsed.suggestedContent)
      ? parsed.suggestedContent.filter((s): s is string => typeof s === 'string')
      : [];
    return {
      summary: String(parsed.summary),
      suggestedContent,
      outcome: String(parsed.outcome),
    };
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}') + 1;
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end)) as Record<string, unknown>;
        const suggestedContent = Array.isArray(parsed.suggestedContent)
          ? parsed.suggestedContent.filter((s): s is string => typeof s === 'string')
          : [];
        return {
          summary: typeof parsed.summary === 'string' ? parsed.summary : 'Task output produced.',
          suggestedContent,
          outcome: typeof parsed.outcome === 'string' ? parsed.outcome : 'Use the content above as needed.',
        };
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export async function runTaskWithGemini(
  apiKey: string,
  taskTitle: string,
  websiteContext?: WebsiteContext | null
): Promise<RunTaskResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(taskTitle, websiteContext),
    config: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Empty response from AI');

  const result = parseJsonFromResponse(text);
  if (!result) throw new Error('AI did not return valid JSON');

  if (!result.summary || result.suggestedContent.length === 0) {
    throw new Error('AI must return summary and at least one suggestedContent item');
  }

  return result;
}
