/* eslint @typescript-eslint/no-require-imports: "off" -- Explicit source-only/manual native experiment. */
/* global require, module, __dirname, process, console, Buffer, setTimeout, clearTimeout, structuredClone, TextEncoder, TARGET, CONTROL, NONCE */
const path = require('node:path');
/** Pure argument gate; native loading is reserved for the explicit live branch. */
function parseArguments(argv) {
    if (!argv.length || (argv.length === 1 && argv[0] === '--plan')) return { mode: 'plan' };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 3 && argv[0] === '--run-live' && argv[1] === '--config' && path.isAbsolute(argv[2])) return { mode: 'live', config: argv[2] };
    return undefined;
}
/** Default execution prints a plan only, without reading config or loading native adapters. */
async function main(argv) {
    const args = parseArguments(argv);
    if (!args) return 2;
    if (args.mode === 'plan') { console.log('Trial F source preparation: sdk-dispatch-pending/pre-next; real execution requires separate approval and --run-live --config ABSOLUTE_PATH. L/E and all 63 qualification gates remain pending.'); return 0; }
    if (args.mode === 'self-test') { const result = await selfTest(); console.log(JSON.stringify({ synthetic: result.synthetic, nativeExecuted: result.nativeExecuted, tests: result.tests })); return 0; }
    const { readBoundedJson } = require('./companionNative.smoke.cjs');
    const config = await readBoundedJson(args.config, 16384);
    const until = performance.now() + 300000;
    const receipt = await runWithBudget(() => runLive(config, until), 300000, () => {
        // Cleanup began ten seconds earlier; retain the last atomic checkpoint on a hard deadline.
        if (require.main === module) process.exit(1);
    });
    console.log('trial-f:' + receipt.status + ':' + receipt.reason);
    return validateReceipt(receipt) ? 0 : 1;
}

const assert = require('node:assert/strict');
const DECLARATION_PATH = 'C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/media/attention/.claude-plugin/types/claude-code/index.d.ts';
const DECLARATION_SHA256 = 'bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc';
const VERSION = '2.1.322';
const hashPattern = /^[a-f0-9]{64}$/;
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
/** Reject unknown config fields rather than accepting executable/environment overrides. */
function validateConfig(c) {
    assert.ok(closed(c, ['nativeExecutable', 'nativeSha256', 'declarationPath', 'declarationSha256', 'nativeVersion', 'sourceSha', 'ownedParent', 'hostProfile']), 'config');
    for (const key of ['nativeExecutable', 'declarationPath', 'ownedParent']) assert.ok(typeof c[key] === 'string' && /^[A-Za-z]:[\\/]/.test(c[key]) && !/[\0\r\n]/.test(c[key]) && !c[key].slice(2).includes(':'), 'absolute-local-path');
    assert.equal(path.resolve(c.declarationPath), path.resolve(DECLARATION_PATH), 'declaration-path');
    assert.equal(c.declarationSha256, DECLARATION_SHA256, 'declaration-hash');
    assert.equal(c.nativeVersion, VERSION, 'native-version');
    assert.match(c.nativeSha256, hashPattern); assert.match(c.sourceSha, /^[a-f0-9]{40}$/);
    const p = c.hostProfile;
    assert.ok(closed(p, ['platform', 'arch', 'node', 'uv', 'electron']) && p.platform === 'win32' && p.arch === 'x64' && p.electron === null, 'profile');
    for (const key of ['node', 'uv']) assert.ok(typeof p[key] === 'string' && /^\d+\.\d+\.\d+$/.test(p[key]) && p[key].length < 64, 'profile-version');
    return c;
}
/** Emitted native code uses only declared web globals and literal SDK methods. Never called in Node. */
function register(on) {
    let held = false;
    on('session.start', async ($, e, next) => {
        const version = await $.session.version();
        const turns = await $.session.turns();
        await $.fs.write(CONTROL + '/started.json', JSON.stringify({ nonce: NONCE, version: version.base === '2.1.322' && version.version === '2.1.322' ? '2.1.322' : 'unsupported', turns: turns === 0 ? 0 : 1 }));
        return next(e);
    });
    on('turn.start', async ($, e, next) => {
        await $.fs.write(CONTROL + '/unexpected.json', JSON.stringify({ nonce: NONCE, reason: 'unexpected-activity' }));
        return next(e);
    });
    on('model.complete', async ($) => {
        await $.fs.write(CONTROL + '/unexpected.json', JSON.stringify({ nonce: NONCE, reason: 'unexpected-activity' }));
        return { deny: 'trial-f-no-model' };
    }).catch(() => ({ deny: 'trial-f-no-model' }));
    on('fs.write', async ($, e, next) => {
        if (e.path !== TARGET || next.origin.plugin !== 'workspaces-attention' || next.origin.tier !== 'user') return next(e);
        if (held) throw new Error('duplicate');
        held = true;
        if (next.signal.aborted) throw new Error('abandoned');
        const data = new TextEncoder().encode(e.text);
        if (data.length < 1 || data.length > 4096) throw new Error('payload-bound');
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), v => v.toString(16).padStart(2, '0')).join('');
        await $.fs.write(CONTROL + '/entry.json', JSON.stringify({ nonce: NONCE, origin: 'workspaces-attention', tier: 'user', targetKind: 'epoch-request-upload', bytes: data.length, sha256, forwardCount: 0 }));
        const began = performance.now();
        while (!await $.fs.exists(CONTROL + '/release')) {
            if (next.signal.aborted || performance.now() - began > 7000 || next.budget.remainingMs < 500) throw new Error('abandoned');
            await $.clock.sleep(20, { signal: next.signal });
        }
        if (next.signal.aborted || next.budget.remainingMs < 500) throw new Error('abandoned');
        await $.fs.write(CONTROL + '/forward.json', JSON.stringify({ nonce: NONCE, forwardCount: 1 }));
        if (next.signal.aborted) throw new Error('abandoned');
        try {
            const result = await next(e);
            const core = next.trace.filter(t => t.plugin === 'engine' && t.tier === 'core' && t.event === 'fs.write');
            if (next.signal.aborted || core.length !== 1 || !['returned', 'passed'].includes(core[0].outcome) || core[0].received.path !== e.path || core[0].received.text !== e.text) throw new Error('dispatch-unverified');
            await $.fs.write(CONTROL + '/returned.json', JSON.stringify({ nonce: NONCE, dispatch: 'returned', forwardCount: 1, coreCalls: 1 }));
            return result;
        } catch {
            await $.fs.write(CONTROL + '/rejected.json', JSON.stringify({ nonce: NONCE, dispatch: 'rejected', forwardCount: 1 }));
            throw new Error('dispatch-rejected');
        }
    }).catch(async ($, e, next) => {
        // Do not replay next: failed hooks can otherwise be skipped by the engine.
        try { await $.fs.write(CONTROL + '/failed.json', JSON.stringify({ nonce: NONCE, reason: next.signal.aborted ? 'abandoned' : 'hook-failed' })); } catch { /* Controller detects absent/early effects. */ }
        return { deny: 'trial-f-hook-failed' };
    });
}
/** Generate all native plugin code from this committed module. */
function createControlPluginSource({ target, control, nonce }) {
    assert.ok(typeof target === 'string' && typeof control === 'string' && /^[a-f0-9]{32}$/.test(nonce));
    return 'const TARGET=' + JSON.stringify(target) + ',CONTROL=' + JSON.stringify(control) + ',NONCE=' + JSON.stringify(nonce) + ';\nexport ' + register.toString();
}


const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const repo = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reasons = ['none', 'rendezvous-timeout', 'producer-lost', 'host-lost', 'unexpected-activity', 'early-file', 'early-forward', 'abandoned', 'hook-failed', 'invalid-evidence', 'dispatch-rejected', 'file-mismatch', 'checkpoint-failed', 'io-failed', 'identity-mismatch', 'auth-unverified', 'startup-interaction', 'output-limit', 'teardown-unsettled', 'controller-deadline'];
/** Strict native acknowledgments: never copy unknown fields or payloads into durable receipts. */
function validEntry(v, nonce) {
    return closed(v, ['nonce', 'origin', 'tier', 'targetKind', 'bytes', 'sha256', 'forwardCount']) && v.nonce === nonce &&
        v.origin === 'workspaces-attention' && v.tier === 'user' && v.targetKind === 'epoch-request-upload' &&
        Number.isSafeInteger(v.bytes) && v.bytes > 0 && v.bytes <= 4096 && hashPattern.test(v.sha256) && v.forwardCount === 0;
}
/** Check a completed observation independently; this never grants product qualification. */
function validateTrial(v) {
    if (!closed(v, ['status', 'reason', 'nonce', 'requestedHoldMs', 'holdMs', 'targetKind', 'bytes', 'originalSha256', 'actualSha256', 'forwardCount', 'events', 'watchdog', 'evidenceLevel']) ||
        v.status !== 'observed' || v.reason !== 'none' || !/^[a-f0-9]{32}$/.test(v.nonce) || ![100, 3000].includes(v.requestedHoldMs) ||
        !Number.isFinite(v.holdMs) || v.holdMs < v.requestedHoldMs || v.holdMs > 7000 || v.forwardCount !== 1 ||
        v.targetKind !== 'epoch-request-upload' || !Number.isSafeInteger(v.bytes) || v.bytes < 1 || v.bytes > 4096 ||
        !hashPattern.test(v.originalSha256) || v.actualSha256 !== v.originalSha256 || v.watchdog !== 'unobserved' ||
        v.evidenceLevel !== 'sdk-dispatch-pending/pre-next' || !Array.isArray(v.events) || v.events.length !== 6) return false;
    const names = ['entry', 'pending-alive-absent', 'release', 'forward', 'file-created', 'dispatch-returned'];
    let last = -1;
    for (let i = 0; i < v.events.length; i++) {
        const e = v.events[i];
        if (!closed(e, ['stage', 'atMs']) || !names.includes(e.stage) || !Number.isFinite(e.atMs) || e.atMs < last || e.atMs > 60000) return false;
        last = e.atMs;
    }
    const actual = v.events.map(e => e.stage);
    return actual.slice(0, 4).join() === names.slice(0, 4).join() && new Set(actual).size === 6 &&
        actual.includes('file-created') && actual.includes('dispatch-returned') && v.events[2].atMs - v.events[1].atMs === v.holdMs;
}
/** Pure injectable state machine. Synthetic operations test ordering, never native feasibility. */
async function observeTrial(ops, options) {
    const timeoutMs = options.timeoutMs ?? 60000;
    assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
    let active = true;
    const guarded = { ...ops,
        read: async () => { const state = await ops.read(); if (!active) throw new Error('rendezvous-timeout'); return state; },
        release: async () => { if (!active) throw new Error('rendezvous-timeout'); return ops.release(); },
        checkpoint: async value => { if (!active) throw new Error('rendezvous-timeout'); return ops.checkpoint(value); } };
    try { return await runWithBudget(() => observeTrialBody(guarded, options), timeoutMs, () => { active = false; }); }
    catch {
        const failed = { status: 'unestablished', reason: 'rendezvous-timeout', nonce: options.nonce,
            requestedHoldMs: options.holdMs, holdMs: 0, targetKind: 'epoch-request-upload', bytes: 0,
            originalSha256: null, actualSha256: null, forwardCount: 0, events: [], watchdog: 'unobserved', evidenceLevel: 'sdk-dispatch-pending/pre-next' };
        try { await runWithBudget(() => ops.checkpoint(failed), 1000, () => {}); }
        catch { failed.status = 'failed'; failed.reason = 'checkpoint-failed'; }
        return failed;
    } finally { active = false; }
}
/** The poll loop records monotonic causal acknowledgments under the enclosing hard deadline. */
async function observeTrialBody(ops, { nonce, holdMs }) {
    assert.ok([100, 3000].includes(holdMs));
    const began = ops.now();
    const result = { status: 'pending', reason: 'none', nonce, requestedHoldMs: holdMs, holdMs: 0,
        targetKind: 'epoch-request-upload', bytes: 0, originalSha256: null, actualSha256: null, forwardCount: 0,
        events: [], watchdog: 'unobserved', evidenceLevel: 'sdk-dispatch-pending/pre-next' };
    const event = stage => result.events.push({ stage, atMs: ops.now() - began });
    let acknowledged, released = false, forwarded = false, returned = false, created = false;
    const fail = (reason, status = 'failed') => { result.status = status; result.reason = reason; };
    try {
        while (ops.now() - began < 60000) {
            const s = await ops.read();
            if (!s.producerAlive) { fail('producer-lost', 'unestablished'); break; }
            if (!s.hostAlive) { fail('host-lost', 'unestablished'); break; }
            if (s.unexpected) { fail('unexpected-activity'); break; }
            if (s.failed) { fail(s.failed.reason === 'abandoned' ? 'abandoned' : 'hook-failed', 'unestablished'); break; }
            if (s.rejected) { fail('dispatch-rejected', 'unestablished'); break; }
            if (!released && s.file) { fail('early-file'); break; }
            if (!released && (s.forward || s.returned)) { fail('early-forward'); break; }
            if (s.started && (!closed(s.started, ['nonce', 'version', 'turns']) || s.started.nonce !== nonce || s.started.version !== VERSION || s.started.turns !== 0)) { fail('invalid-evidence'); break; }
            if (s.entry && !validEntry(s.entry, nonce)) { fail('invalid-evidence'); break; }
            if (s.entry && s.started && acknowledged === undefined) {
                result.bytes = s.entry.bytes; result.originalSha256 = s.entry.sha256;
                event('entry'); event('pending-alive-absent'); acknowledged = ops.now();
                await ops.checkpoint(result);
            }
            if (acknowledged !== undefined && !released && ops.now() - acknowledged >= holdMs) {
                // s was freshly checked above: P and H1 alive, target absent, no forward.
                await ops.release(); released = true; event('release');
                result.holdMs = result.events[2].atMs - result.events[1].atMs;
                await ops.checkpoint(result);
            }
            if (released && s.forward && !forwarded) {
                if (!closed(s.forward, ['nonce', 'forwardCount']) || s.forward.nonce !== nonce || s.forward.forwardCount !== 1) { fail('invalid-evidence'); break; }
                forwarded = true; result.forwardCount = 1; event('forward');
            }
            if (released && s.file && !created) {
                if (!forwarded || !closed(s.file, ['bytes', 'sha256']) || s.file.bytes !== result.bytes || s.file.sha256 !== result.originalSha256) { fail('file-mismatch'); break; }
                created = true; result.actualSha256 = s.file.sha256; event('file-created');
            }
            if (released && s.returned && !returned) {
                if (!forwarded || !closed(s.returned, ['nonce', 'dispatch', 'forwardCount', 'coreCalls']) || s.returned.coreCalls !== 1 || s.returned.nonce !== nonce || s.returned.dispatch !== 'returned' || s.returned.forwardCount !== 1) { fail('invalid-evidence'); break; }
                returned = true; event('dispatch-returned');
            }
            if (returned && created) { result.status = 'observed'; break; }
            await ops.sleep(20);
        }
        if (result.status === 'pending') fail('rendezvous-timeout', 'unestablished');
    } catch { fail('io-failed'); }
    try { await ops.checkpoint(result); } catch { fail('checkpoint-failed'); }
    return result;
}
/** Separate H1 owns genuine resources/coordinator and offer; never manufactures producer bytes. */
function hostMain(CompanionCapture, createCaptureQualificationProbe) {
    let resources, binding, protocol;
    process.on('message', async m => {
        try {
            if (m.kind === 'prepare' && !resources) {
                resources = new CompanionCapture({ storageRoot: m.storageRoot, coordinator: createCaptureQualificationProbe(m.profile),
                    currentTarget: id => id === m.target.sessionId ? m.target : undefined });
                const prepared = await resources.prepare(m.target.sessionId);
                if (!prepared.ok) throw new Error('prepare');
                binding = prepared.value;
                // Observation-only scheduling injection keeps the SDK-created upload available for read-back.
                const started = await resources.startProtocol(binding, { autoPoll: false });
                if (!started.ok) throw new Error('offer');
                protocol = started.value;
                const control = JSON.parse((await require('node:fs/promises').readFile(require('node:path').join(binding.directory, 'control.json'))).toString());
                process.send({ kind: 'prepared', environment: resources.environment({}, binding),
                    target: binding.directory.replace(/[\\/]$/, '') + '/request.' + control.offerId + '.upload' });
            } else if (m.kind === 'expose' && resources && binding) {
                if (!resources.markProducerExposed(binding)) throw new Error('exposure');
                process.send({ kind: 'exposed' });
            } else if (m.kind === 'stop') {
                protocol?.stop(); process.exit(0);
            } else throw new Error('message');
        } catch { process.send({ kind: 'failed' }); }
    });
}
/** The host bundle derives exclusively from committed capture source and this generator. */
function createHostSource(captureSource) {
    return 'const {CompanionCapture,createCaptureQualificationProbe}=require(' + JSON.stringify(captureSource) + ');\n(' + hostMain.toString() + ')(CompanionCapture,createCaptureQualificationProbe);';
}


/** Stream fingerprints without retaining binary contents or paths in receipts. */
async function hashFile(file) {
    const stream = require('node:fs').createReadStream(file); const digest = crypto.createHash('sha256'); let bytes = 0;
    for await (const chunk of stream) { bytes += chunk.length; if (bytes > 512 * 1024 * 1024) { stream.destroy(); throw new Error('identity-mismatch'); } digest.update(chunk); }
    return digest.digest('hex');
}
/** Bounded transient CLI output for version/auth only; errors never include raw stdout/stderr. */
async function inspectCli(executable, argv, cwd, env) {
    return new Promise(resolve => {
        const child = require('node:child_process').spawn(executable, argv, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', bytes = 0, settled = false;
        const finish = code => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, output: code === 0 ? output : '' }); };
        const timer = setTimeout(() => { child.kill(); finish(null); }, 10000);
        child.stdout.on('data', b => { bytes += b.length; if (bytes > 65536) { child.kill(); finish(null); } else output += b.toString(); });
        child.stderr.on('data', b => { bytes += b.length; if (bytes > 65536) { child.kill(); finish(null); } });
        child.once('error', () => finish(null)); child.once('close', finish);
    });
}
/** Signal zero checks the exact owned PID; an uncertain result is never alive evidence. */
function processAlive(pid, probe = process.kill) {
    if (!Number.isSafeInteger(pid) || pid < 1) return false;
    try { probe(pid, 0); return true; } catch { return false; }
}
/** Only direct owned handles are terminated; settlement is never storage-cleanup authority. */
async function stopOwned(owned, budgetMs = 5000) {
    assert.ok(Number.isFinite(budgetMs) && budgetMs > 0 && budgetMs <= 5000);
    if (owned.teardownPromise) return owned.teardownPromise;
    owned.teardownPromise = (async () => {
        const until = performance.now() + budgetMs;
        const producerUntil = performance.now() + Math.max(0, budgetMs - Math.min(1000, budgetMs / 5));
        owned.teardownEvents = [];
        let okay = true, timer;
        if (owned.pty) {
            const pending = Promise.resolve().then(() => owned.pty.terminate()).catch(() => { okay = false; });
            await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => { okay = false; resolve(); }, Math.max(1, producerUntil - performance.now())); })]);
            clearTimeout(timer);
            while (!owned.producerExited && performance.now() < producerUntil) await new Promise(r => setTimeout(r, Math.min(20, budgetMs)));
            if (!owned.producerExited) { okay = false; owned.teardownEvents.push('producer-exit-unobserved'); }
        }
        if (owned.host) {
            // Failed-trial emergency exception: never qualifies as F or an intentional L schedule.
            if (owned.pty && !owned.producerExited) owned.teardownEvents.push('emergency-host-stop');
            try { owned.host.kill(); } catch { okay = false; }
        }
        while (owned.host && !owned.hostExited && performance.now() < until) await new Promise(r => setTimeout(r, Math.min(20, budgetMs)));
        if (owned.host && !owned.hostExited) okay = false;
        if (!okay) owned.teardownEvents.push('owned-process-cleanup-unresolved');
        // No exit/termination/host-death observation confers storage cleanup authority here.
        return okay;
    })();
    return owned.teardownPromise;
}
/** Hash the original upload through a bounded stable file handle; never write target bytes. */
async function readUpload(file) {
    const before = await fs.lstat(file);
    assert.ok(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= 4096, 'invalid-evidence');
    const handle = await fs.open(file, 'r');
    try {
        const after = await handle.stat();
        assert.ok(after.isFile() && after.nlink === 1 && after.ino === before.ino && after.dev === before.dev && after.size <= 4096, 'invalid-evidence');
        const buffer = Buffer.alloc(4097); let count = 0;
        while (count < buffer.length) { const read = await handle.read(buffer, count, buffer.length - count, null); if (!read.bytesRead) break; count += read.bytesRead; }
        assert.ok(count <= 4096 && count === before.size, 'invalid-evidence');
        return { bytes: count, sha256: hash(buffer.subarray(0, count)) };
    } finally { await handle.close(); }
}
/** Bound a fresh H1 message exchange; all binding secrets stay transient on the owned IPC channel. */
function exchange(host, message, expected) {
    return new Promise((resolve, reject) => {
        let timer;
        const done = (error, value) => { clearTimeout(timer); host.off('message', receive); host.off('exit', exit); if (error) reject(new Error('io-failed')); else resolve(value); };
        const receive = value => { if (value?.kind === expected) done(false, value); else done(true); };
        const exit = () => done(true);
        host.on('message', receive); host.once('exit', exit);
        timer = setTimeout(() => done(true), 10000); host.send(message, error => { if (error) done(true); });
    });
}
/** Required safe flags disable automatic updates only; preserve the existing auth/settings profile. */
function liveEnvironment(inherited) {
    for (const [key, value] of Object.entries(inherited)) {
        if (value && (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CONFIG_DIR)$/i.test(key) || /^CLAUDE_CODE_USE_/i.test(key))) throw new Error('auth-unverified');
    }
    return { ...inherited, DISABLE_AUTOUPDATER: '1' };
}
/** Launch only after the explicit mode gate, pinned identity check, fresh ownership and read-only auth check. */
async function runLive(config, deadlineAt = performance.now() + 300000) {
    const c = validateConfig(config);
    const { execFileSync, fork } = require('node:child_process');
    const { readBoundedJson, createReceiptWriter } = require('./companionNative.smoke.cjs');
    const { build } = require('esbuild');
    const profile = { platform: process.platform, arch: process.arch, node: process.versions.node, uv: process.versions.uv, electron: process.versions.electron ?? null };
    assert.deepEqual(profile, c.hostProfile, 'identity-mismatch');
    const git = argv => execFileSync('git', ['-C', repo, ...argv], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), c.sourceSha, 'identity-mismatch');
    assert.equal(git(['status', '--porcelain', '--untracked-files=no']).toString().trim(), '', 'identity-mismatch');
    const parent = await fs.realpath(c.ownedParent), scratch = await fs.realpath(path.join(repo, '.tmp'));
    assert.equal(parent, path.resolve(c.ownedParent), 'identity-mismatch');
    assert.ok(parent === scratch || parent.startsWith(scratch + path.sep), 'identity-mismatch');
    for (const file of [c.nativeExecutable, c.declarationPath]) {
        const stat = await fs.lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'identity-mismatch');
        assert.equal(await fs.realpath(file), path.resolve(file), 'identity-mismatch');
    }
    const before = { native: await hashFile(c.nativeExecutable), declaration: await hashFile(c.declarationPath), node: await hashFile(process.execPath) };
    assert.equal(before.native, c.nativeSha256, 'identity-mismatch'); assert.equal(before.declaration, DECLARATION_SHA256, 'identity-mismatch');
    const environment = liveEnvironment(process.env);
    const directory = await fs.mkdtemp(path.join(parent, 'native-trial-f-'));
    const save = createReceiptWriter(path.join(directory, 'receipt.json'));
    const receipt = { format: 'native-trial-f-v1', status: 'pending', reason: 'none', sourceSha: c.sourceSha,
        sourceFingerprint: hash(git(['ls-files', '--stage', '-z'])), before, after: null, runtime: profile,
        authentication: 'unverified', version: 'unverified',
        injections: ['development-product-copy', 'independent-controller-owned-pty', 'qualification-profile', 'host-protocol-autoPoll-false', 'control-plugin-first', 'auto-updater-disabled'],
        evidenceLevel: 'sdk-dispatch-pending/pre-next', productionAdmission: false, qualificationGates: 'all-63-pending',
        lifetimeTrials: 'L/E-pending', cleanup: 'storage-and-intents-preserved', sources: [], trials: [], teardown: [] };
    let active = {}, expired = false;
    // Reserve ten seconds within the five-minute cap for bounded teardown and final checkpoint.
    const controllerUntil = deadlineAt;
    const deadline = setTimeout(() => { expired = true; void stopOwned(active); }, Math.max(0, controllerUntil - performance.now() - 10000));
    const check = () => { if (expired || performance.now() >= controllerUntil - 10000) throw new Error('controller-deadline'); };
    const fail = (reason, status = 'failed') => { receipt.status = status; receipt.reason = reasons.includes(reason) ? reason : 'io-failed'; };
    try {
        await save(receipt);
        // The same cwd and inherited auth environment are used for both inspection and the no-prompt PTY.
        const authWorkspace = path.join(directory, 'identity-workspace'); await fs.mkdir(authWorkspace);
        check();
        const version = await inspectCli(c.nativeExecutable, ['--version'], authWorkspace, environment); check();
        if (version.code !== 0 || !/^2\.1\.322(?: \(Claude Code\))?\s*$/.test(version.output)) throw new Error('identity-mismatch');
        receipt.version = VERSION;
        check();
        const auth = await inspectCli(c.nativeExecutable, ['auth', 'status'], authWorkspace, environment); check();
        let method;
        try { method = JSON.parse(auth.output).authMethod; } catch { /* Unsupported builds remain unestablished. */ }
        if (auth.code !== 0 || method !== 'claude.ai') { fail('auth-unverified', 'unestablished'); return receipt; }
        receipt.authentication = 'claude.ai'; await save(receipt);
        const sourceNames = git(['ls-files', '-z', '--', 'media/attention', 'src/companion/companionCapture.ts', 'src/companion/companionTypes.ts', 'src/launch', 'test/manual/companionNativeRendezvous.smoke.cjs', 'test/manual/companionNative.smoke.cjs', 'test/fixtures/companion/qualification.json']).toString().split('\0').filter(Boolean);
        for (const name of sourceNames) receipt.sources.push({ path: name, sha256: await hashFile(path.join(repo, name)) });
        const hostSource = createHostSource(path.join(repo, 'src/companion/companionCapture.ts'));
        const hostFile = path.join(directory, 'host.cjs'), adapterFile = path.join(directory, 'adapter.cjs');
        const hostBundle = await build({ stdin: { contents: hostSource, resolveDir: repo, sourcefile: 'trial-f-host.cjs' }, bundle: true, platform: 'node', format: 'cjs', write: false }); check();
        await fs.writeFile(hostFile, hostBundle.outputFiles[0].contents);
        await build({ entryPoints: [path.join(repo, 'src/launch/nodePtyAdapter.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['node-pty'], outfile: adapterFile }); check();
        const { NodePtyFactory } = require(adapterFile);
        for (const holdMs of [100, 3000]) {
            check();
            const trialRoot = await fs.mkdtemp(path.join(directory, 'trial-'));
            const workspace = path.join(trialRoot, 'workspace'), capture = path.join(trialRoot, 'capture'), control = path.join(trialRoot, 'control');
            for (const dir of [workspace, capture, control]) await fs.mkdir(dir);
            // Recheck auth using the actual fresh trial cwd before creating its single producer.
            check();
            const trialAuth = await inspectCli(c.nativeExecutable, ['auth', 'status'], workspace, environment); check();
            let trialMethod; try { trialMethod = JSON.parse(trialAuth.output).authMethod; } catch { /* Fail closed. */ }
            if (trialAuth.code !== 0 || trialMethod !== 'claude.ai') { fail('auth-unverified', 'unestablished'); break; }
            active = { producerExited: false, hostExited: false };
            const owned = active;
            owned.host = fork(hostFile, [], { cwd: workspace, env: environment, silent: true, windowsHide: true });
            owned.host.once('exit', () => { owned.hostExited = true; });
            let outputBytes = 0, outputReason;
            owned.host.once('error', () => { outputReason = 'host-lost'; });
            const discard = data => { outputBytes += Buffer.byteLength(data); if (outputBytes > 65536) { outputReason = 'output-limit'; void stopOwned(owned); } };
            owned.host.stdout.on('data', discard); owned.host.stderr.on('data', discard);
            const target = { sessionId: 'trial-f', claudeSessionId: crypto.randomUUID(), generation: crypto.randomUUID() };
            const prepared = await exchange(owned.host, { kind: 'prepare', storageRoot: capture, target, profile: c.hostProfile }, 'prepared'); check();
            const targetFile = path.resolve(prepared.target);
            assert.ok(targetFile.startsWith(capture + path.sep) && /^request\.[a-f0-9]{32}\.upload$/.test(path.basename(targetFile)), 'invalid-evidence');
            const product = path.join(trialRoot, 'product'), plugin = path.join(trialRoot, 'control-plugin');
            for (const name of sourceNames.filter(n => n.startsWith('media/attention/'))) {
                const output = path.join(product, name.slice('media/attention/'.length)); await fs.mkdir(path.dirname(output), { recursive: true });
                const bytes = await fs.readFile(path.join(repo, name)); assert.equal(hash(bytes), receipt.sources.find(s => s.path === name).sha256); await fs.writeFile(output, bytes);
            }
            await fs.mkdir(path.join(plugin, '.claude-plugin'), { recursive: true }); await fs.mkdir(path.join(plugin, 'hooks'));
            const nonce = crypto.randomBytes(16).toString('hex');
            const pluginSource = createControlPluginSource({ target: prepared.target, control: control.replace(/\\/g, '/'), nonce });
            const manifest = JSON.stringify({ name: 'trial-f-rendezvous', version: '0.0.1', description: 'Owned no-model dispatch feasibility control' });
            const hooks = JSON.stringify({ modules: ['./control.js'] });
            await fs.writeFile(path.join(plugin, '.claude-plugin/plugin.json'), manifest);
            await fs.writeFile(path.join(plugin, 'hooks/hooks.json'), hooks); await fs.writeFile(path.join(plugin, 'hooks/control.js'), pluginSource);
            const generated = { hostSha256: await hashFile(hostFile), adapterSha256: await hashFile(adapterFile), pluginSha256: hash(pluginSource), manifestSha256: hash(manifest), hooksSha256: hash(hooks) };
            await exchange(owned.host, { kind: 'expose' }, 'exposed'); check();
            const nativePty = require('node-pty');
            const factory = new NodePtyFactory({ spawn: (executable, args, options) => {
                const native = nativePty.spawn(executable, args, options); owned.producerPid = native.pid; return native;
            } });
            owned.pty = await factory.spawn({ executable: c.nativeExecutable,
                args: ['--session-id', target.claudeSessionId, '--plugin-dir', plugin, '--plugin-dir', product, '--permission-mode', 'default', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'],
                cwd: workspace, env: { ...environment, ...prepared.environment }, importedRoots: [], skippedImportIds: [] });
            owned.pty.onExit(() => { owned.producerExited = true; });
            let startupTail = '';
            owned.pty.onData(data => {
                discard(data); startupTail = (startupTail + data).slice(-2048);
                if (/trust this folder|sign in|log in|login required|accept.*terms/i.test(startupTail)) { outputReason = 'startup-interaction'; void stopOwned(owned); }
            });
            const record = { generated, observation: null }; receipt.trials.push(record); await save(receipt);
            const optional = async name => {
                try { return await readBoundedJson(path.join(control, name + '.json'), 4096); }
                catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw new Error('invalid-evidence', { cause: e }); }
            };
            const observation = await observeTrial({ now: () => performance.now(), sleep: ms => new Promise(r => setTimeout(r, ms)),
                checkpoint: async value => { record.observation = structuredClone(value); await save(receipt); },
                release: async () => { check(); await fs.writeFile(path.join(control, 'release'), '', { flag: 'wx' }); },
                read: async () => {
                    check(); if (outputReason) throw new Error(outputReason);
                    const result = {};
                    for (const name of ['started', 'entry', 'forward', 'returned', 'rejected', 'failed', 'unexpected']) result[name] = await optional(name);
                    let file = null;
                    try { file = await readUpload(targetFile);
                    } catch (e) { if (e.code !== 'ENOENT') throw new Error('invalid-evidence', { cause: e }); }
                    return { ...result, file, producerAlive: !owned.producerExited && processAlive(owned.producerPid), hostAlive: !owned.hostExited && processAlive(owned.host.pid) };
                } }, { nonce, holdMs });
            if (outputReason) { observation.status = 'unestablished'; observation.reason = outputReason; }
            record.observation = observation;
            for (const [file, expected] of [[hostFile, generated.hostSha256], [adapterFile, generated.adapterSha256],
                [path.join(plugin, 'hooks/control.js'), generated.pluginSha256], [path.join(plugin, '.claude-plugin/plugin.json'), generated.manifestSha256], [path.join(plugin, 'hooks/hooks.json'), generated.hooksSha256]]) {
                if (await hashFile(file) !== expected) throw new Error('identity-mismatch');
            }
            for (const source of receipt.sources.filter(s => s.path.startsWith('media/attention/'))) {
                if (await hashFile(path.join(product, source.path.slice('media/attention/'.length))) !== source.sha256) throw new Error('identity-mismatch');
            }
            const settled = await stopOwned(owned);
            receipt.teardown.push(...(settled ? ['owned-exits-observed-no-cleanup-authority'] : owned.teardownEvents));
            active = {};
            if (!settled) { fail('teardown-unsettled', 'unestablished'); break; }
            if (!validateTrial(observation)) { fail(observation.reason, observation.status); break; }
            await save(receipt);
        }
        if (receipt.trials.length === 2 && receipt.trials.every(t => validateTrial(t.observation)) && receipt.teardown.length === 2) receipt.status = 'observed';
    } catch (error) { fail(reasons.includes(error?.message) ? error.message : 'io-failed'); }
    finally {
        // Checkpoint before bounded teardown, including failures. Preserve uncertain resources forever here.
        try { await save(receipt); } catch { fail('checkpoint-failed'); }
        if (active.host || active.pty) {
            if (!await stopOwned(active)) { receipt.teardown.push(...active.teardownEvents); fail('teardown-unsettled', 'unestablished'); }
        }
        clearTimeout(deadline);
        try {
            receipt.after = { native: await hashFile(c.nativeExecutable), declaration: await hashFile(c.declarationPath), node: await hashFile(process.execPath) };
            if (JSON.stringify(before) !== JSON.stringify(receipt.after)) fail('identity-mismatch');
            for (const source of receipt.sources) if (await hashFile(path.join(repo, source.path)) !== source.sha256) fail('identity-mismatch');
            if (performance.now() >= controllerUntil || expired) fail('controller-deadline');
            await save(receipt);
        } catch { fail('checkpoint-failed'); }
    }
    return receipt;
}



const injections = ['development-product-copy', 'independent-controller-owned-pty', 'qualification-profile', 'host-protocol-autoPoll-false', 'control-plugin-first', 'auto-updater-disabled'];
const mandatorySources = ['src/companion/companionCapture.ts', 'src/companion/companionTypes.ts', 'media/attention/hooks/register.js', 'media/attention/hooks/companion/filePublisher.js', 'test/manual/companionNativeRendezvous.smoke.cjs'];
/** Closed content-free receipt gate for feasibility only; never a capability/admission record. */
function validateReceipt(r) {
    try {
        if (!closed(r, ['format', 'status', 'reason', 'sourceSha', 'sourceFingerprint', 'before', 'after', 'runtime', 'authentication', 'version', 'injections', 'evidenceLevel', 'productionAdmission', 'qualificationGates', 'lifetimeTrials', 'cleanup', 'sources', 'trials', 'teardown']) ||
            Buffer.byteLength(JSON.stringify(r)) > 1048576 || r.format !== 'native-trial-f-v1' || r.status !== 'observed' || r.reason !== 'none' ||
            !/^[a-f0-9]{40}$/.test(r.sourceSha) || !hashPattern.test(r.sourceFingerprint) || r.authentication !== 'claude.ai' || r.version !== VERSION ||
            r.productionAdmission !== false || r.qualificationGates !== 'all-63-pending' || r.lifetimeTrials !== 'L/E-pending' || r.cleanup !== 'storage-and-intents-preserved' ||
            r.evidenceLevel !== 'sdk-dispatch-pending/pre-next' || JSON.stringify(r.injections) !== JSON.stringify(injections)) return false;
        for (const identity of [r.before, r.after]) if (!closed(identity, ['native', 'declaration', 'node']) || !Object.values(identity).every(v => typeof v === 'string' && hashPattern.test(v)) || identity.declaration !== DECLARATION_SHA256) return false;
        if (JSON.stringify(r.before) !== JSON.stringify(r.after)) return false;
        const p = r.runtime;
        if (!closed(p, ['platform', 'arch', 'node', 'uv', 'electron']) || p.platform !== 'win32' || p.arch !== 'x64' || p.electron !== null ||
            ![p.node, p.uv].every(v => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) && v.length < 64)) return false;
        if (!Array.isArray(r.sources) || r.sources.length < mandatorySources.length || r.sources.length > 100 || new Set(r.sources.map(s => s?.path)).size !== r.sources.length ||
            !mandatorySources.every(name => r.sources.some(s => s.path === name)) || Array.from(r.sources).some(s => !closed(s, ['path', 'sha256']) || !hashPattern.test(s.sha256) ||
                typeof s.path !== 'string' || s.path.length > 200 || !new RegExp('^(media/attention/|src/companion/|src/launch/|test/manual/|test/fixtures/companion/)[a-zA-Z0-9._/-]+$').test(s.path) || s.path.split('/').includes('..'))) return false;
        if (!Array.isArray(r.trials) || r.trials.length !== 2 || !Array.isArray(r.teardown) || r.teardown.length !== 2 || Array.from(r.teardown).some(v => v !== 'owned-exits-observed-no-cleanup-authority')) return false;
        for (let i = 0; i < 2; i++) {
            const t = r.trials[i];
            if (!closed(t, ['generated', 'observation']) || !closed(t.generated, ['hostSha256', 'adapterSha256', 'pluginSha256', 'manifestSha256', 'hooksSha256']) ||
                !Object.values(t.generated).every(v => typeof v === 'string' && hashPattern.test(v)) || !validateTrial(t.observation) || t.observation.requestedHoldMs !== [100, 3000][i]) return false;
        }
        return r.trials[0].observation.nonce !== r.trials[1].observation.nonce;
    } catch { return false; }
}
/** In-memory simulated acknowledgments exercise both holds without reading files or loading native code. */
async function selfTest() {
    const sha256 = 'a'.repeat(64);
    const trials = [];
    for (const holdMs of [100, 3000]) {
        let time = 0, released = false;
        const nonce = (holdMs === 100 ? 'a' : 'b').repeat(32);
        const observation = await observeTrial({ now: () => time, sleep: async ms => { time += ms; }, checkpoint: async () => {}, release: async () => { released = true; },
            read: async () => ({ producerAlive: true, hostAlive: true, started: { nonce, version: VERSION, turns: 0 },
                entry: { nonce, origin: 'workspaces-attention', tier: 'user', targetKind: 'epoch-request-upload', bytes: 10, sha256, forwardCount: 0 },
                forward: released ? { nonce, forwardCount: 1 } : null, returned: released ? { nonce, dispatch: 'returned', forwardCount: 1, coreCalls: 1 } : null,
                file: released ? { bytes: 10, sha256 } : null }) }, { nonce, holdMs });
        assert.ok(validateTrial(observation));
        trials.push({ generated: Object.fromEntries(['hostSha256', 'adapterSha256', 'pluginSha256', 'manifestSha256', 'hooksSha256'].map(k => [k, sha256])), observation });
    }
    const identity = { native: sha256, declaration: DECLARATION_SHA256, node: sha256 };
    const receipt = { format: 'native-trial-f-v1', status: 'observed', reason: 'none', sourceSha: 'a'.repeat(40), sourceFingerprint: sha256,
        before: identity, after: identity, runtime: { platform: 'win32', arch: 'x64', node: '24.14.0', uv: '1.51.0', electron: null }, authentication: 'claude.ai', version: VERSION,
        injections, evidenceLevel: 'sdk-dispatch-pending/pre-next', productionAdmission: false, qualificationGates: 'all-63-pending', lifetimeTrials: 'L/E-pending', cleanup: 'storage-and-intents-preserved',
        sources: mandatorySources.map(p => ({ path: p, sha256 })), trials, teardown: ['owned-exits-observed-no-cleanup-authority', 'owned-exits-observed-no-cleanup-authority'] };
    assert.ok(validateReceipt(receipt));
    assert.equal(validateReceipt({ ...receipt, productionAdmission: true }), false);
    return { synthetic: true, nativeExecuted: false, tests: 2, receipt };
}

/** A never-settling operation still fails the launcher; no success is inferred from process exit. */
async function runWithBudget(operation, milliseconds, expire) {
    assert.ok(Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= 300000);
    let timer;
    try {
        return await Promise.race([Promise.resolve().then(operation), new Promise((resolve, reject) => {
            timer = setTimeout(() => { try { expire(); } finally { reject(new Error('controller-deadline')); } }, milliseconds);
        })]);
    } finally { clearTimeout(timer); }
}
module.exports = { runWithBudget, processAlive, readUpload, stopOwned, selfTest, validateReceipt, observeTrial, validateTrial, createHostSource, runLive, parseArguments, main, validateConfig, createControlPluginSource, DECLARATION_PATH, DECLARATION_SHA256 };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { console.error('trial-f:failed'); process.exitCode = 1; });
