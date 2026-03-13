/**
 * Content quality assessment for extracted page content.
 * Used to produce confidence and warnings for the analysis pipeline.
 */

export interface ContentQualityResult {
  /** 0–1; higher = more reliable for analysis */
  score: number;
  /** Human-readable warnings to show in the UI */
  warnings: string[];
}

const MIN_USEFUL_LENGTH = 100;
const GOOD_LENGTH = 2000;

/**
 * Assesses quality of extracted page content for AI analysis.
 * Does not receive or use the raw URL; only the extracted content and fetch metadata.
 */
export function assessContentQuality(
  extractedText: string,
  status: number,
  contentType: string
): ContentQualityResult {
  const warnings: string[] = [];
  let score = 1;

  if (status <= 0) {
    warnings.push('Page could not be fetched (network or timeout).');
    score = 0;
    return { score, warnings };
  }
  if (status >= 400) {
    warnings.push(`Page returned HTTP ${status}; content may be an error page.`);
    score = Math.max(0, 0.5 - (status - 400) / 1000);
  }
  if (!contentType.toLowerCase().includes('text/html') && !contentType.toLowerCase().includes('text/plain')) {
    warnings.push('Response is not HTML or plain text; analysis may be less accurate.');
    score = Math.min(score, 0.7);
  }
  const len = (extractedText || '').trim().length;
  if (len < MIN_USEFUL_LENGTH) {
    warnings.push('Extracted content is very short; analysis will rely more on business name and type.');
    score = Math.min(score, 0.5);
  } else if (len < GOOD_LENGTH) {
    warnings.push('Limited content extracted; consider a page with more readable text.');
    score = Math.min(score, 0.85);
  }

  return { score: Math.max(0, Math.min(1, score)), warnings };
}
