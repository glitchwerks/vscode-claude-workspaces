/* eslint @typescript-eslint/no-require-imports: "off" -- Standalone CommonJS control for compiled modules. */
/* global require, module, __dirname, process, console, setTimeout */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { NodePtyFactory } = require('../../out/src/launch/nodePtyAdapter.js');
const { createAttentionSignalProcessor, startAttentionChannelWatcher } = require('../../out/src/attention/attentionSignalWatcher.js');

const COUNTERS = ['batches', 'initialPublications', 'retryPublications', 'controllerTimerCalls', 'activeControllerTimers',
  'peakControllerTimers', 'activeRetryPublications', 'peakRetryPublications', 'failures'];
const METRIC_KEYS = ['mode', ...COUNTERS, 'initialMs', 'retryMs', 'durationMs'];
function parseSoakMetrics(value, mode) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.equal(value.mode, mode);
  assert(Object.keys(value).every(key => METRIC_KEYS.includes(key)));
  for (const key of COUNTERS) assert(Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 1024);
  assert(Number.isFinite(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 180000);
  for (const key of ['initialMs', 'retryMs']) assert(Array.isArray(value[key]) && value[key].length <= 64 &&
    value[key].every(sample => Number.isFinite(sample) && sample >= 0 && sample <= 180000));
  return Object.fromEntries(METRIC_KEYS.map(key => [key, Array.isArray(value[key]) ? [...value[key]] : value[key]]));
}
async function withOwnedPty(factory, spec, consume) {
  const pty = await factory.spawn(spec);
  try { return await consume(pty); }
  finally { try { await pty.terminate(); } finally { pty.dispose(); } }
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runCase(executable, mode, directory, version, executableHash) {
  const root = path.resolve(__dirname, '../..'), plugin = path.join(directory, 'plugin'), channel = path.join(directory, 'channel');
  const workspace = path.join(directory, 'workspace');
  for (const folder of [path.join(plugin, '.claude-plugin'), path.join(plugin, 'hooks'), channel, workspace]) await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'workspaces-recovery-soak', version: '0.0.1',
    description: 'Owned synthetic metadata transport control.', author: { name: 'Claude Workspaces' } }));
  await fs.writeFile(path.join(plugin, 'hooks/hooks.json'), JSON.stringify({ modules: ['./completionRecoverySoak.mod.js'] }));
  await fs.copyFile(path.join(__dirname, 'completionRecoverySoak.mod.js'), path.join(plugin, 'hooks/completionRecoverySoak.mod.js'));
  await fs.copyFile(path.join(root, 'media/attention/hooks/completionRetry.js'), path.join(plugin, 'hooks/completionRetry.js'));
  await fs.copyFile(path.join(root, 'media/attention/report-activity.ps1'), path.join(plugin, 'report-activity.ps1'));
  const managedId = crypto.randomUUID(), sessionId = crypto.randomUUID();
  const env = { ...process.env, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
    CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel, CLAUDE_WORKSPACES_SESSION_ID: managedId, CLAUDE_WORKSPACES_RECOVERY_PROBE_MODE: mode };
  const validation = await promisify(execFile)(executable, ['plugin', 'validate', plugin, '--json'], { env, cwd: workspace,
    timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
  assert.equal(JSON.parse(validation.stdout).success, true, 'Owned fixture validation failed');
  const session = { id: managedId, claudeSessionId: sessionId, state: 'running', activity: 'idle', hasUnreadResponse: false };
  const signals = { starts: 0, completions: 0, duplicates: 0, unexpected: 0, stages: 0, watcherErrors: 0, diagnostics: 0 };
  const active = new Set();
  const processor = createAttentionSignalProcessor({ sessions: [session], onDidChangeSessions: () => ({ dispose() {} }),
    setAttention(_id, attention) { Object.assign(session, attention); } }, () => signals.stages++, undefined, undefined,
    () => signals.diagnostics++, () => false);
  let watcher, outputCharacters = 0, exitCode = null, metrics, failed = false;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const started = performance.now();
  try {
    watcher = await startAttentionChannelWatcher(channel, { process(value) {
      if (!value || value.managedSessionId !== managedId || value.claudeSessionId !== sessionId) { signals.unexpected++; return 'ignored'; }
      const result = processor.process(value);
      if (value.hookEventName === 'SubagentStart' && result === 'applied') { signals.starts++; active.add(value.agentId); }
      else if (value.hookEventName === 'TurnComplete' && result === 'applied') { signals.completions++; active.delete(value.agentId); }
      else if (value.hookEventName === 'TurnComplete' && result === 'ignored' && !active.has(value.agentId)) signals.duplicates++;
      else signals.unexpected++;
      return result;
    }, promptSubmitted() { return 'ignored'; }, dispose() {} }, () => signals.watcherErrors++);
    await withOwnedPty(new NodePtyFactory(), { executable,
      args: ['--plugin-dir', plugin, '--permission-mode', 'plan', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--session-id', sessionId],
      cwd: workspace, env, importedRoots: [], skippedImportIds: [] }, async pty => {
      const output = pty.onData(data => { outputCharacters += data.length; });
      const exit = pty.onExit(event => { exitCode = event.exitCode; });
      try {
        let admitted = false;
        while (performance.now() - started < 115000 && exitCode === null) {
          if (!admitted) {
            const ready = await fs.readFile(path.join(plugin, 'probe-ready.json'), 'utf8').catch(error => {
              if (error.code === 'ENOENT') return undefined;
              throw error;
            });
            if (ready !== undefined) { const value = JSON.parse(ready); admitted = value.mode === mode && value.ready === true; }
            assert(admitted || performance.now() - started < 20000, 'Owned fixture was not admitted');
          }
          const file = path.join(plugin, 'probe-metrics.json');
          const stat = await fs.stat(file).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
          if (stat !== undefined) {
            assert(stat.size <= 64 * 1024, 'Oversized numeric metrics');
            metrics = parseSoakMetrics(JSON.parse(await fs.readFile(file, 'utf8')), mode); break;
          }
          await delay(250);
        }
        assert(metrics, 'Owned SDK soak did not finalize');
        await delay(500);
      } finally { output.dispose(); exit.dispose(); }
    });
  } catch { failed = true; }
  finally { watcher?.dispose(); processor.dispose(); loop.disable(); }
  const pendingSignals = (await fs.readdir(channel)).filter(name => name.endsWith('.signal.json')).length;
  const unchanged = executableHash === await sha256(executable);
  const expectedRetries = mode === 'candidate' ? 12 : 0;
  const passed = !failed && unchanged && metrics?.batches === 3 && metrics.initialPublications === 24 &&
    metrics.retryPublications === expectedRetries && metrics.initialMs.length === 24 && metrics.retryMs.length === expectedRetries &&
    metrics.failures === 0 && metrics.activeControllerTimers === 0 && metrics.activeRetryPublications === 0 &&
    metrics.peakControllerTimers <= 1 && metrics.peakRetryPublications <= 1 && signals.starts === 12 && signals.completions === 12 &&
    signals.duplicates === expectedRetries && signals.unexpected === 0 && signals.stages === 0 && signals.watcherErrors === 0 &&
    signals.diagnostics === 0 && active.size === 0 && session.activity === 'idle' && session.hasUnreadResponse === false && pendingSignals === 0;
  const result = { measuredAt: new Date().toISOString(), mode, passed, version, executableSha256: executableHash, executableUnchanged: unchanged,
    scope: 'synthetic-sdk-transport-with-and-without-retry-controller', diagnosticsEnabled: false,
    modelPromptsProvided: 0, terminalInputWrites: 0, supportReplies: 0, ownedTerminationRequested: true,
    elapsedMs: performance.now() - started, outputCharacters, exitBeforeCleanup: exitCode,
    metrics, signals, pendingSignals, finalActivity: session.activity, finalUnread: session.hasUnreadResponse,
    eventLoopDelayMs: { mean: Number(loop.mean) / 1e6, p95: loop.percentile(95) / 1e6, max: Number(loop.max) / 1e6 },
    sourceHashes: { fixture: await sha256(path.join(plugin, 'hooks/completionRecoverySoak.mod.js')),
      controller: await sha256(path.join(plugin, 'hooks/completionRetry.js')), writer: await sha256(path.join(plugin, 'report-activity.ps1')),
      processor: await sha256(path.join(root, 'out/src/attention/attentionSignalWatcher.js')) } };
  await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ measuredAt: result.measuredAt, mode, passed, elapsedMs: result.elapsedMs }));
  assert(passed, 'Owned SDK soak failed; inspect the numeric result');
}
async function main() {
  assert.equal(process.platform, 'win32', 'This controlled SDK fixture requires Windows');
  const args = process.argv.slice(2), index = args.indexOf('--claude');
  assert(index >= 0 && args[index + 1], 'Pass --claude with an existing Claude executable');
  const executable = path.resolve(args[index + 1]);
  const outputIndex = args.indexOf('--output-dir');
  const output = path.resolve(outputIndex < 0 ? '.tmp/completion-recovery-soak' : args[outputIndex + 1]);
  const env = { ...process.env, DISABLE_AUTOUPDATER: '1' };
  const versionResult = await promisify(execFile)(executable, ['--version'], { env, windowsHide: true, timeout: 10000 });
  const match = /^(\d+\.\d+\.\d+) \(Claude Code\)\s*$/u.exec(versionResult.stdout);
  assert(match, 'Unexpected Claude version response');
  await fs.mkdir(output, { recursive: true });
  const directory = await fs.mkdtemp(path.join(output, 'sdk-soak-'));
  const executableHash = await sha256(executable);
  for (const mode of ['baseline', 'candidate']) await runCase(executable, mode, path.join(directory, mode), match[1], executableHash);
}
module.exports = { parseSoakMetrics, withOwnedPty };
if (require.main === module) main().catch(() => { console.error('Owned SDK soak failed; no terminal content was retained.'); process.exitCode = 1; });
