/**
 * Claude API Service
 *
 * Used ONLY for:
 * - Generating human-readable recommendation summaries in reports
 * - Identifying duplicate/variant workflow patterns (natural language)
 * - Drafting migration wave rationale
 *
 * NOT used for: classification decisions, API calls to Jira/Confluence,
 * or any deterministic logic (use rules engine for that).
 */

import type { Env } from './env';

export interface SummarizationRequest {
  sectionTitle: string;
  structuredData: unknown;
  focusAreas?: string[];
}

export interface SummarizationResult {
  summary: string;
  keyRecommendations: string[];
  estimatedEffort?: 'low' | 'medium' | 'high';
}

export async function summarizeReportSection(
  request: SummarizationRequest,
  env: Env
): Promise<SummarizationResult> {
  const prompt = buildSummarizationPrompt(request);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are an expert Atlassian migration consultant producing concise, actionable 
pre-migration assessment summaries. Be specific, prioritized, and opinionated. 
Respond ONLY with valid JSON matching the SummarizationResult schema.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    // Degrade gracefully — reports render without AI summaries
    return {
      summary: `[AI summary unavailable: ${response.status}]`,
      keyRecommendations: [],
    };
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(b => b.type === 'text')?.text ?? '{}';

  try {
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(clean) as SummarizationResult;
  } catch {
    return { summary: text, keyRecommendations: [] };
  }
}

function buildSummarizationPrompt(request: SummarizationRequest): string {
  return `Summarize this Atlassian migration assessment section: "${request.sectionTitle}"

Structured data:
${JSON.stringify(request.structuredData, null, 2)}

${request.focusAreas ? `Focus on: ${request.focusAreas.join(', ')}` : ''}

Return JSON: { "summary": "2-3 sentence overview", "keyRecommendations": ["action 1", "action 2", ...], "estimatedEffort": "low|medium|high" }`;
}
