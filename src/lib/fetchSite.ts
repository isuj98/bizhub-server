/**
 * Fetches a URL with timeout and returns text or a short error message.
 */
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Strips HTML to plain text and normalizes whitespace for AI consumption.
 * Cap at maxLength to avoid token overflow.
 */
export function extractTextFromHtml(html: string, maxLength: number = 12_000): string {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '\n...[truncated]' : text;
}

export async function fetchUrl(url: string): Promise<{ ok: boolean; status: number; contentType: string; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BizHub-Analyzer/1.0' },
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') ?? '';
    let text = '';
    try {
      text = await res.text();
    } catch {
      text = '[unable to read body]';
    }
    if (text.length > 12000) text = text.slice(0, 12000) + '\n...[truncated]';
    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status, contentType, text };
  } catch (e) {
    clearTimeout(timeoutId);
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, status: 0, contentType: '', text: `Fetch failed: ${message}` };
  }
}

/**
 * Fetches a single URL and returns cleaned extracted content (HTML stripped) plus metadata.
 * Used for analysis pipeline; never pass raw URL to AI—only this extracted content.
 */
export async function probeWebsite(url: string): Promise<{
  url: string;
  status: number;
  contentType: string;
  /** Raw snippet for backward compatibility */
  snippet: string;
  /** Cleaned plain text for Gemini (HTML stripped, length capped) */
  extractedContent: string;
}> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const r = await fetchUrl(normalized);
  const extractedContent = extractTextFromHtml(r.text, 10_000);
  return {
    url: normalized,
    status: r.status,
    contentType: r.contentType,
    snippet: r.text.slice(0, 4000),
    extractedContent,
  };
}

export interface EndpointProbeResult {
  path: string;
  url: string;
  status: number;
  contentType: string;
  snippet: string;
  isJson: boolean;
}

/**
 * Probes a base URL and several common API/docs paths.
 */
export async function probeServer(baseUrl: string): Promise<{
  baseUrl: string;
  mainPage: { status: number; contentType: string; snippet: string };
  endpoints: EndpointProbeResult[];
}> {
  const base = baseUrl.replace(/\/$/, '');
  const paths = ['/', '/api', '/health', '/api/health', '/status', '/api/docs', '/api/v1', '/docs', '/swagger', '/openapi.json', '/api/openapi.json'];
  const main = await fetchUrl(base);
  const mainPage = {
    status: main.status,
    contentType: main.contentType,
    snippet: main.text.slice(0, 2000),
  };

  const endpoints: EndpointProbeResult[] = [];
  for (const path of paths) {
    const url = path === '/' ? base : `${base}${path.startsWith('/') ? path : '/' + path}`;
    const r = await fetchUrl(url);
    const isJson = r.contentType.includes('json');
    endpoints.push({
      path: path || '/',
      url,
      status: r.status,
      contentType: r.contentType,
      snippet: r.text.slice(0, 800),
      isJson,
    });
  }

  return { baseUrl: base, mainPage, endpoints };
}
