import type { Job } from './types';

// Verified against both official model pages on 2026-09-17. Do not use the
// GPT Image 2 output-token calculator for GPT Image 2.5.
export const PRICING_DATE = '2026-09-17';
export const PRICING_SOURCES = [
  'https://developers.openai.com/api/docs/models/gpt-image-2.5-flare',
  'https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst',
] as const;
export const TOKEN_RATES = { textInput: 5, imageInput: 8, imageOutput: 30 } as const;
export type Cost = {
  currency: 'USD'; pricingDate: string; basis: 'standard-uncached';
  textInputTokens: number; imageInputTokens: number; imageOutputTokens: number;
  textInputUsd: number; imageInputUsd: number; imageOutputUsd: number; usd: number;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const tokens = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const pricedModel = (model: string) => /^gpt-image-2\.5-(flare|sunburst)(-2026-09-08)?$/.test(model);
export function tokenCost(model: string, textInput: number, imageInput: number, imageOutput: number): Cost | undefined {
  if (!pricedModel(model) || ![textInput, imageInput, imageOutput].every(tokens)) return;
  const textInputUsd = textInput * TOKEN_RATES.textInput / 1e6;
  const imageInputUsd = imageInput * TOKEN_RATES.imageInput / 1e6;
  const imageOutputUsd = imageOutput * TOKEN_RATES.imageOutput / 1e6;
  return { currency: 'USD', pricingDate: PRICING_DATE, basis: 'standard-uncached', textInputTokens: textInput, imageInputTokens: imageInput, imageOutputTokens: imageOutput, textInputUsd, imageInputUsd, imageOutputUsd, usd: textInputUsd + imageInputUsd + imageOutputUsd };
}
export function usageCost(model: string, usage: unknown): Cost | undefined {
  const u = record(usage), input = record(u.input_tokens_details), output = record(u.output_tokens_details);
  const text = input.text_tokens, image = input.image_tokens;
  // A missing breakdown is unknown, not zero. Text output is not billed by 2.5.
  const rendered = u.output_tokens_details == null ? u.output_tokens : output.image_tokens;
  if (!tokens(text) || !tokens(image) || !tokens(rendered)) return;
  if (u.input_tokens !== undefined && (!tokens(u.input_tokens) || u.input_tokens !== text + image)) return;
  if (u.output_tokens !== undefined && (!tokens(u.output_tokens) || u.output_tokens < rendered)) return;
  return tokenCost(model, text, image, rendered);
}
export function jobCost(job: Job): Cost | undefined {
  if (job.model === 'local') return;
  return job.cost ?? usageCost(job.model, job.usage);
}
export type CostRequest = { model: string; quality: string; apiSize: string; kind: 'image' | 'reference' | 'edit' | 'motion'; referenceCount: number };
export function referenceCount(job: Job) { return job.references?.length ?? (job.kind === 'edit' || job.kind === 'motion' ? 1 : 0); }
export function estimateFromHistory(jobs: Job[], requests: CostRequest[]) {
  let usd = 0, minUsd = 0, maxUsd = 0, covered = 0;
  const sampleIds = new Set<string>();
  for (const request of requests) {
    const matches = jobs.filter(j => j.status === 'complete' && j.model === request.model && j.quality === request.quality && j.apiSize === request.apiSize && (j.kind ?? 'image') === request.kind && referenceCount(j) === request.referenceCount)
      .map(j => ({ job: j, cost: usageCost(j.model, j.usage) })).filter(m => m.cost !== undefined);
    if (!matches.length) continue;
    const amounts = matches.map(m => m.cost!.usd);
    usd += amounts.reduce((a, b) => a + b, 0) / amounts.length;
    minUsd += Math.min(...amounts); maxUsd += Math.max(...amounts); covered++;
    matches.forEach(m => sampleIds.add(m.job.id));
  }
  return { usd, minUsd, maxUsd, covered, requested: requests.length, samples: sampleIds.size };
}
export function usd(value: number) { return `$${value.toFixed(6)}`; }
