/* eslint @typescript-eslint/no-require-imports: "off" -- Unit checks for the standalone CommonJS control. */
/* global require, queueMicrotask */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { control, verifyRows } = require('./programStatusTransport.smoke.cjs');

function fixture({ resizeFailure = false, writeFailure = false, timeoutReport = false } = {}) {
  const calls = []; let onExit;
  const pty = {
    resize() { calls.push('resize'); if (resizeFailure) throw new Error('resize failed'); },
    onExit(listener) { onExit = listener; return { dispose() { calls.push('exit-dispose'); } }; },
    onData(listener) {
      queueMicrotask(() => {
        listener('\x1b]7501;?\x07');
        if (timeoutReport) listener('\x1b]7501;state=error:app=transport-timeout\x07');
        onExit?.({ exitCode: 0 });
      });
      return { dispose() { calls.push('data-dispose'); } };
    },
    write() { calls.push('write'); if (writeFailure) throw new Error('write failed'); },
    async terminate() { calls.push('terminate'); onExit?.({ exitCode: 0 }); },
    dispose() { calls.push('pty-dispose'); }
  };
  return { calls, factory: { async spawn() { return pty; } } };
}

test('child deadline is distinct from a complete unequal stream and cannot pass raw controls', async () => {
  const f = fixture({ timeoutReport: true });
  const row = await control(f.factory, 'plain-bel', 'raw');
  assert.equal(row.outcome, 'child-timeout');
  assert.throws(() => verifyRows([row]));
});

test('resize failure still terminates and disposes the owned PTY', async () => {
  const f = fixture({ resizeFailure: true });
  await assert.rejects(control(f.factory, 'plain-bel', 'raw'), /resize failed/);
  assert(f.calls.includes('terminate')); assert(f.calls.includes('pty-dispose'));
});

test('asynchronous reply write failure rejects the control and disposes subscriptions', async () => {
  const f = fixture({ writeFailure: true });
  await assert.rejects(control(f.factory, 'plain-bel', 'raw'), /write failed/);
  assert(f.calls.includes('data-dispose')); assert(f.calls.includes('exit-dispose')); assert(f.calls.includes('pty-dispose'));
});
