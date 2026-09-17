import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFromHistory, jobCost, tokenCost, usageCost, type CostRequest } from '../src/lib/pricing';
import { DEFAULT_SETTINGS, type Job } from '../src/lib/types';
import { motionApiSize } from '../src/lib/animation-types';

const model = 'gpt-image-2.5-flare';
const usage = { input_tokens: 300, input_tokens_details: { text_tokens: 100, image_tokens: 200 }, output_tokens: 1000 };
const request: CostRequest = { model, quality: 'medium', apiSize: '1024x1024', kind: 'reference', referenceCount: 1 };
function job(id = 'a'): Job { return { id, created: '', model, quality: 'medium', apiSize: '1024x1024', kind: 'reference', references: [{ file: 'reference-1.png', name: 'ref' }], status: 'complete', prompt: '', settings: DEFAULT_SETTINGS, variants: [], usage }; }

test('2.5 rates account for text input, reference input and image output exactly once', () => {
  for (const m of [model, 'gpt-image-2.5-sunburst']) {
    const cost = usageCost(m, usage)!;
    assert.equal(cost.textInputUsd, .0005); assert.equal(cost.imageInputUsd, .0016); assert.equal(cost.imageOutputUsd, .03);
    assert.ok(Math.abs(cost.usd - .0321) < 1e-12);
    assert.equal(cost.basis, 'standard-uncached');
  }
  assert.equal(usageCost(model, { ...usage, output_tokens: 1100, output_tokens_details: { image_tokens: 1000, text_tokens: 100 } })!.usd, usageCost(model, usage)!.usd);
  assert.equal(usageCost(model, { ...usage, input_tokens_details: { ...usage.input_tokens_details, cached_tokens: 200 } })!.usd, usageCost(model, usage)!.usd);
});
test('missing usage, unknown model and malformed counts remain unpriced instead of free', () => {
  for (const value of [undefined, {}, { total_tokens: 1200 }, { ...usage, input_tokens: 20 }, { ...usage, output_tokens: -1 }, { ...usage, output_tokens: NaN }, { ...usage, output_tokens_details: {} }]) assert.equal(usageCost(model, value), undefined);
  assert.equal(usageCost('gpt-image-2', usage), undefined);
  assert.equal(tokenCost(model, -1, 0, 1), undefined); assert.equal(tokenCost(model, 1.5, 0, 1), undefined);
  assert.equal(tokenCost(model, 0, 0, 0)!.usd, 0);
  assert.equal(jobCost({ ...job(), model: 'local', usage }), undefined);
});
test('historical estimates require matching model, quality, size, operation and reference count', () => {
  const first = job(), second = { ...job('b'), usage: { ...usage, output_tokens: 2000 } };
  const mismatches: Job[] = [
    { ...job('c'), quality: 'high' }, { ...job('d'), model: 'gpt-image-2.5-sunburst' },
    { ...job('e'), apiSize: '1536x1024' }, { ...job('f'), references: [] },
    { ...job('g'), kind: 'edit' }, { ...job('h'), status: 'failed' }, { ...job('i'), usage: undefined },
  ];
  const estimate = estimateFromHistory([first, second, ...mismatches], [request, request]);
  assert.equal(estimate.covered, 2); assert.equal(estimate.samples, 2);
  assert.ok(Math.abs(estimate.usd - .0942) < 1e-12);
  assert.ok(Math.abs(estimate.minUsd - .0642) < 1e-12); assert.ok(Math.abs(estimate.maxUsd - .1242) < 1e-12);
  const partial = estimateFromHistory([first], [request, { ...request, referenceCount: 2 }]);
  assert.equal(partial.covered, 1); assert.equal(partial.requested, 2);
  assert.equal(estimateFromHistory([], [request]).covered, 0);
  assert.equal(jobCost({ ...job(), cost: { ...usageCost(model, usage)!, usd: .01, pricingDate: '2026-09-01' } })!.usd, .01);
});
test('motion estimates use the same API sheet dimensions as the request and reject invalid UI input', () => {
  assert.equal(motionApiSize(96, 96, 6), '1536x1024');
  assert.equal(motionApiSize(96, 96, 1), '816x816');
  for (const value of [0, NaN, Infinity, -1, 4097]) assert.equal(motionApiSize(value, 96, 6), '');
  assert.equal(motionApiSize(96, 96, 0), '');
});
