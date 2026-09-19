import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { DEFAULT_SETTINGS, type Job } from '../src/lib/types';
import { jobDir, readJob, saveJob } from '../src/lib/storage';

test('concurrent job saves leave one valid manifest and no shared temporary file', async t => {
  const id = randomUUID();
  t.after(() => rm(jobDir(id), { recursive: true, force: true }));
  const base: Job = {
    id,
    created: new Date().toISOString(),
    prompt: 'initial',
    model: 'local',
    quality: 'local',
    settings: DEFAULT_SETTINGS,
    status: 'processing',
    variants: [],
  };
  await Promise.all(Array.from({ length: 20 }, (_, index) => saveJob({ ...base, prompt: `save-${index}` })));
  assert.equal((await readJob(id)).prompt, 'save-19');
  assert.deepEqual((await readdir(jobDir(id))).filter(name => name.endsWith('.tmp')), []);
});
