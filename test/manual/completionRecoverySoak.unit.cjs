/* eslint @typescript-eslint/no-require-imports: "off" -- Unit checks for the standalone CommonJS control. */
/* global require, __dirname, Buffer */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');

function runner() {
  let module;
  try { module = require('./completionRecoverySoak.smoke.cjs'); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  assert.equal(typeof module?.parseSoakMetrics, 'function', 'soak runner is not implemented');
  return module;
}
test('soak metrics reject private extras, malformed counters and oversized samples', () => {
  const { parseSoakMetrics } = runner();
  const valid = { mode: 'baseline', batches: 3, initialPublications: 24, retryPublications: 0, controllerTimerCalls: 0,
    activeControllerTimers: 0, peakControllerTimers: 0, activeRetryPublications: 0, peakRetryPublications: 0,
    failures: 0, initialMs: [1], retryMs: [], durationMs: 105000 };
  assert.deepEqual(parseSoakMetrics(valid, 'baseline'), valid);
  for (const value of [null, { ...valid, secret: 'private answer' }, { ...valid, mode: 'private mode' },
    { ...valid, batches: -1 }, { ...valid, batches: 1.5 }, { ...valid, durationMs: Infinity },
    { ...valid, initialMs: ['private answer'] }, { ...valid, initialMs: Array(65).fill(1) }]) {
    assert.throws(() => parseSoakMetrics(value, 'baseline'));
  }
});
test('consumer and termination failures still dispose the owned PTY', async () => {
  const { withOwnedPty } = runner();
  const events = [], failure = new Error('consumer failed');
  const factory = { spawn: async () => ({ terminate: async () => { events.push('terminate'); }, dispose() { events.push('dispose'); } }) };
  await assert.rejects(withOwnedPty(factory, {}, async () => { throw failure; }), error => error === failure);
  assert.deepEqual(events, ['terminate', 'dispose']);
  events.length = 0;
  factory.spawn = async () => ({ terminate: async () => { events.push('terminate'); throw failure; }, dispose() { events.push('dispose'); } });
  await assert.rejects(withOwnedPty(factory, {}, async () => true), error => error === failure);
  assert.deepEqual(events, ['terminate', 'dispose']);
});

for (const mode of ['baseline', 'candidate']) {
  test('bounded SDK soak emits only numeric aggregates in ' + mode + ' mode', async () => {
    const probe = await fs.readFile(path.join(__dirname, 'completionRecoverySoak.mod.js'), 'utf8').catch(e => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    const helper = await fs.readFile(path.resolve(__dirname, '../../media/attention/hooks/completionRetry.js'), 'utf8');
    const source = probe.replace('import { createCompletionRetry } from "./completionRetry.js";', helper);
    const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + mode);
    assert.equal(typeof module.register, 'function', 'SDK soak module is not implemented');
    const handlers = {}, timers = [], signals = [];
    let time = 0, metrics;
    const realNow = Date.now;
    const api = { plugin: { root: 'private-root' }, env: { get: async () => mode },
      session: { id: async () => 'private-session' },
      clock: { after(ms, fn) { const t = { at: time + ms, fn, cancelled: false }; timers.push(t);
        return { cancel() { t.cancelled = true; } }; } },
      process: { run: async (_args, options) => { time++; signals.push(JSON.parse(options.stdin)); return { exitCode: 0 }; } },
      fs: { write: async (_file, json) => { metrics = JSON.parse(json); } } };
    try {
      Date.now = () => time;
      module.register((event, fn) => { handlers[event] = fn; });
      await handlers['session.start'](api, {}, async () => ({}));
      for (let steps = 0; steps < 100; steps++) {
        const next = timers.filter(t => !t.cancelled).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        time = next.at; next.cancelled = true; await next.fn();
      }
      assert(metrics, 'bounded probe must finalize');
      assert.equal(metrics.mode, mode); assert.equal(metrics.batches, 3);
      assert.equal(metrics.initialPublications, 24);
      assert.equal(metrics.retryPublications, mode === 'candidate' ? 12 : 0);
      assert.equal(metrics.activeControllerTimers, 0);
      assert.equal(metrics.peakControllerTimers, mode === 'candidate' ? 1 : 0);
      assert.equal(metrics.activeRetryPublications, 0);
      assert.equal(metrics.peakRetryPublications, mode === 'candidate' ? 1 : 0);
      assert.equal(metrics.failures, 0);
      assert.equal(signals.length, mode === 'candidate' ? 36 : 24);
      assert.doesNotMatch(JSON.stringify(metrics), /private-root|private-session|synthetic-agent/);
      await handlers['session.end'](api, {}, async () => ({}));
      assert(timers.every(t => t.cancelled));
    } finally { Date.now = realNow; }
  });
}
