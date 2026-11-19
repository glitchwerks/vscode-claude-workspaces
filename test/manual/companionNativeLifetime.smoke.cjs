/* eslint @typescript-eslint/no-require-imports: "off" -- Explicit opt-in manual qualification controller. */
/* global require, module, __dirname, process, console, Buffer, performance, setTimeout, clearTimeout, structuredClone */
'use strict';
const path = require('node:path');
/** Parse before loading a config, mutating files or creating a process. */
function parseArguments(argv) {
    if (!argv.length || argv.length === 1 && argv[0] === '--plan') return { mode: 'plan' };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 3 && argv[0] === '--run-live' && argv[1] === '--config' && path.isAbsolute(argv[2])) return { mode: 'live', config: argv[2] };
    return undefined;
}
/** Preserve inherited login/settings; this exact preference is not a provider selector. */
function liveEnvironment(inherited) {
    for (const [key, value] of Object.entries(inherited)) {
        if (key.toLowerCase() === 'claude_code_use_powershell_tool') continue;
        if (value && (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CONFIG_DIR)$/i.test(key) || /^CLAUDE_CODE_USE_/i.test(key))) throw new Error('auth-unverified');
    }
    return { ...inherited, DISABLE_AUTOUPDATER: '1' };
}
const F = require('./companionNativeRendezvous.smoke.cjs');
const support = require('./companionNativeLifetimeSupport.cjs');
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const closed = (v, keys) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v, max = 33554432) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const equal = require('node:util').isDeepStrictEqual;
const requireFact = (v, reason = 'invalid-evidence') => { if (!v) throw new Error(reason); };
const reasons = ['none', 'invalid-evidence', 'phase-deadline', 'rendezvous-deadline', 'ipc-uncertain', 'host-lost', 'producer-lost', 'native-failed', 'early-effect', 'intent-changed', 'parent-retained', 'binding-invalid', 'capacity-invalid', 'unexpected-admission', 'exit-unobserved', 'checkpoint-failed', 'identity-mismatch', 'auth-unverified', 'output-limit', 'startup-interaction', 'teardown-unsettled', 'controller-deadline', 'io-failed'];
const profileValid = p => closed(p, ['platform', 'arch', 'node', 'uv', 'electron']) && p.platform === 'win32' && p.arch === 'x64' && p.node === '24.14.0' && p.uv === '1.51.0' && p.electron === null;
const bindingValid = b => closed(b, ['bindingLabel', 'targetLabel', 'generationLabel', 'exposed']) && [b.bindingLabel, b.targetLabel, b.generationLabel].every(digest) && b.exposed === false;
const fileValid = f => closed(f, ['bytes', 'sha256']) && integer(f.bytes, 4096) && f.bytes > 0 && digest(f.sha256);
const exitValid = e => closed(e, ['observed', 'atMs', 'code', 'signal']) && e.observed === true && integer(e.atMs, 300000) && (e.code === null || Number.isSafeInteger(e.code)) && [null, 'SIGTERM', 'SIGKILL', 'SIGINT', 'other'].includes(e.signal);

/** Independently recompute L1's closed physical/future accounting; scans are non-atomic. */
function validInventory(v) {
    try {
        if (!closed(v, ['format', 'observation', 'method', 'physical', 'future', 'unknownRoot', 'slots', 'channels', 'violations', 'bindings', 'watch']) ||
            v.format !== 'lifetime-inventory-v1' || v.observation !== 'bounded-stable-scan/non-atomic' || v.method !== 'companionCapture.ts@108f14b:590-639/no-host-transaction-reservations' ||
            !Array.isArray(v.slots) || v.slots.length > 11 || !Array.isArray(v.channels) || v.channels.length > 256 ||
            !Array.isArray(v.violations) || v.violations.length !== 0 || !closed(v.bindings, ['retained', 'exposed']) || !integer(v.bindings.retained, 11) || !integer(v.bindings.exposed, 1) || v.bindings.exposed > v.bindings.retained ||
            !closed(v.unknownRoot, ['files', 'bytes', 'chargedByProduction']) || v.unknownRoot.chargedByProduction !== false || !integer(v.unknownRoot.files, 256) || !integer(v.unknownRoot.bytes)) return false;
        if (new Set(v.slots.map(s => s.slot)).size !== v.slots.length || new Set(v.channels.map(c => c.label)).size !== v.channels.length) return false;
        let physicalBytes = v.unknownRoot.bytes, physicalFiles = v.unknownRoot.files, extraBytes = 0, extraFiles = 0, missing = 0;
        const claims = new Set();
        for (const s of v.slots) {
            if (!closed(s, ['slot', 'bytes', 'sha256', 'identity', 'channelLabel']) || !integer(s.slot, 10) || !integer(s.bytes, 1024) || !digest(s.sha256) || !digest(s.identity) || s.channelLabel !== null && !digest(s.channelLabel)) return false;
            physicalBytes += s.bytes; physicalFiles++;
            if (s.channelLabel === null || !v.channels.some(c => c.label === s.channelLabel)) missing++;
            if (s.channelLabel !== null) { if (claims.has(s.channelLabel)) return false; claims.add(s.channelLabel); }
        }
        for (const c of v.channels) {
            if (!closed(c, ['label', 'identity', 'claimed', 'bytes', 'files', 'staging', 'unknown']) || !digest(c.label) || !digest(c.identity) || c.claimed !== claims.has(c.label) || !integer(c.bytes) || !integer(c.files, 256) ||
                !closed(c.staging, ['transactions', 'files', 'bytes', 'withinLimits']) || !integer(c.staging.transactions, 8) || !integer(c.staging.files, 16) || !integer(c.staging.bytes, 2097152) || c.staging.withinLimits !== true || c.staging.transactions > c.staging.files ||
                !closed(c.unknown, ['files', 'bytes']) || !integer(c.unknown.files, 256) || !integer(c.unknown.bytes) || c.staging.files + c.unknown.files > c.files || c.staging.bytes + c.unknown.bytes > c.bytes) return false;
            physicalBytes += c.bytes; physicalFiles += c.files;
            extraBytes += c.unknown.bytes + (c.claimed ? 0 : 2114560); extraFiles += c.unknown.files + (c.claimed ? 0 : 21);
        }
        const p = v.physical, f = v.future, n = f.nextPrepare;
        const bytes = 11264 + v.slots.length * 2114560 + extraBytes, files = 11 + v.slots.length * 21 + extraFiles;
        const rootEntries = v.channels.length + v.unknownRoot.files + 11 + missing;
        if (!closed(p, ['bytes', 'files', 'directories', 'withinLimits']) || p.bytes !== physicalBytes || p.files !== physicalFiles || p.directories !== v.channels.length || p.withinLimits !== true || physicalBytes > 33554432 || physicalFiles > 256 ||
            !closed(f, ['bytes', 'files', 'rootEntries', 'withinLimits', 'nextPrepare']) || f.bytes !== bytes || f.files !== files || f.rootEntries !== rootEntries || f.withinLimits !== true || bytes > 33554432 || files > 256 || rootEntries > 256 ||
            !closed(n, ['bytes', 'files', 'rootEntries', 'slotAvailable', 'withinLimits']) || n.bytes !== bytes + 2114560 || n.files !== files + 21 || n.rootEntries !== rootEntries + 1 || n.slotAvailable !== (v.slots.length < 11) ||
            n.withinLimits !== (v.slots.length < 11 && n.bytes <= 33554432 && n.files <= 256 && n.rootEntries <= 256)) return false;
        if (!closed(v.watch, ['parent', 'intent'])) return false;
        const parent = v.watch.parent, intent = v.watch.intent;
        if (!(closed(parent, ['state']) && parent.state === 'absent' || closed(parent, ['state', 'identity']) && parent.state === 'present' && digest(parent.identity))) return false;
        return closed(intent, ['state', 'bytes', 'sha256', 'identity']) && intent.state === 'present' && integer(intent.bytes, 1024) && digest(intent.sha256) && digest(intent.identity) &&
            v.slots.some(s => s.bytes === intent.bytes && s.sha256 === intent.sha256 && s.identity === intent.identity);
    } catch { return false; }
}

/** Success responses have a closed data union; private launch material is not this union. */
function validReply(kind, r) {
    if (!closed(r, ['v', 'id', 'phase', 'late', 'outcome', 'reason', 'data']) || r.v !== 1 || typeof r.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(r.id) || r.phase !== 'settled' || r.late !== false) return false;
    const d = r.data;
    if (kind === 'refuse') return r.outcome === 'refused' && r.reason === 'cleanup-capacity' && closed(d, ['exposed']) && d.exposed === false;
    if (r.outcome !== 'ok' || r.reason !== 'none') return false;
    if (kind === 'init') return closed(d, ['topology', 'runtime', 'rootLabel']) && d.topology === 'injected-qualification-probe-only/development' && profileValid(d.runtime) && digest(d.rootLabel);
    if (kind === 'prepare-primary' || kind === 'prepare-additional') return bindingValid(d);
    if (kind === 'expose-primary') return closed(d, ['bindingLabel', 'exposed']) && digest(d.bindingLabel) && d.exposed === true;
    if (kind === 'snapshot') return validInventory(d);
    if (kind === 'sweep') return closed(d, []);
    if (kind === 'stop') return closed(d, ['storage', 'managedExit']) && d.storage === 'preserved' && d.managedExit === 'not-asserted';
    return false;
}
/** Check exact Native markers without admitting arbitrary fields or output. */
function validNative(v, nonce, phase) {
    if (!closed(v, ['producerAlive', 'h1Alive', 'h2Alive', 'started', 'entry', 'forward', 'returned', 'file', 'rejected', 'failed', 'unexpected']) ||
        ![v.producerAlive, v.h1Alive, v.h2Alive].every(x => typeof x === 'boolean') || !v.producerAlive || !v.h2Alive || v.rejected !== null || v.failed !== null || v.unexpected !== null) return false;
    const s = v.started, e = v.entry;
    if (!closed(s, ['nonce', 'version', 'turns']) || s.nonce !== nonce || s.version !== '2.1.322' || s.turns !== 0 ||
        !closed(e, ['nonce', 'origin', 'tier', 'targetKind', 'bytes', 'sha256', 'forwardCount']) || e.nonce !== nonce || e.origin !== 'workspaces-attention' || e.tier !== 'user' || e.targetKind !== 'epoch-request-upload' || e.forwardCount !== 0 || !fileValid({ bytes: e.bytes, sha256: e.sha256 })) return false;
    if (phase === 'pending') return v.forward === null && v.returned === null && v.file === null;
    return closed(v.forward, ['nonce', 'forwardCount']) && v.forward.nonce === nonce && v.forward.forwardCount === 1 &&
        closed(v.returned, ['nonce', 'dispatch', 'forwardCount', 'coreCalls']) && v.returned.nonce === nonce && v.returned.dispatch === 'returned' && v.returned.forwardCount === 1 && v.returned.coreCalls === 1 &&
        fileValid(v.file) && v.file.bytes === e.bytes && v.file.sha256 === e.sha256;
}

/**
 * Ordered source observer. Public actor injection ALWAYS produces synthetic evidence.
 * Only runLive constructs the private actual actors; config cannot supply actor seams.
 */
async function observeLifetime(io, options) {
    let phaseUntil = Infinity, sequence = 0;
    const r = { format: 'trial-l-observation-v2', synthetic: true, nativeExecuted: false, status: 'pending', reason: 'none', nonce: options.nonce,
        nativeHoldMs: 7000, mutationBudgetMs: 6000, ipcDeadlineMs: 2000, events: [], readDiagnostics: options.readDiagnostics ?? createReadDiagnostics() };
    // Actors supply one controller-relative monotonic origin, also used by exit/IPC witnesses.
    const now = () => Math.floor(io.now());
    const check = () => { requireFact(now() <= 290000, 'controller-deadline'); requireFact(io.now() < phaseUntil, 'phase-deadline'); };
    const emit = async (stage, start, data) => {
        const end = now();
        requireFact(end >= start && r.events.length < 100);
        r.events.push({ stage, atMs: end, durationMs: end - start, data: structuredClone(data) });
        requireFact(Buffer.byteLength(JSON.stringify(r)) <= 1048576);
        try { await io.checkpoint(r); } catch { throw new Error('checkpoint-failed'); }
    };
    const command = async (host, kind, stage, extra = {}) => {
        check(); const start = now(), budget = Math.min(2000, Math.floor(phaseUntil - io.now()));
        requireFact(budget >= 1, 'phase-deadline');
        const reply = await io.command(host, kind, extra, budget);
        // Preserve unexpected genuine admissions as unexposed, without copying private data.
        if (reply?.outcome === 'unexpected-admission' && bindingValid(reply.data)) await emit('unexpected-admission', start, reply.data);
        requireFact(validReply(kind, reply), reply?.outcome === 'unexpected-admission' ? 'unexpected-admission' : 'ipc-uncertain');
        requireFact(now() - start < budget, 'ipc-uncertain'); check();
        await emit(stage, start, { host, kind, deadlineMs: budget, outcome: reply.outcome, reason: reply.reason, data: reply.data });
        return reply.data;
    };
    let entry, primary, baseline, incomplete = false;
    const read = async final => {
        const raw = await io.read(final);
        if (!Object.hasOwn(raw, 'markerReadComplete')) { incomplete = false; return raw; }
        const { markerReadComplete, ...sample } = raw;
        requireFact(typeof markerReadComplete === 'boolean'); incomplete = !markerReadComplete;
        requireFact(!final || !incomplete); return sample;
    };
    const pending = async h1 => {
        check(); const value = await read(); check();
        requireFact(!incomplete && validNative(value, options.nonce, 'pending'), 'native-failed'); requireFact(value.h1Alive === h1, 'host-lost');
        if (entry) requireFact(equal(value.entry, entry));
        return value;
    };
    const snapshot = async (stage, count, parent, host = 'h2') => {
        const v = await command(host, 'snapshot', stage);
        requireFact(v.slots.length === count && v.bindings.retained === (host === 'h1' ? 1 : count - 1) && v.bindings.exposed === (host === 'h1' ? 0 : 0), 'capacity-invalid');
        requireFact(v.watch.parent.state === parent, 'parent-retained');
        if (baseline) requireFact(equal(v.watch.intent, baseline.watch.intent), 'intent-changed');
        return v;
    };
    try {
        requireFact(/^[a-f0-9]{32}$/.test(options.nonce) && profileValid(options.profile));
        const one = await command('h1', 'init', 'init-h1'), two = await command('h2', 'init', 'init-h2'); requireFact(equal(one, two));
        primary = await command('h1', 'prepare-primary', 'primary');
        baseline = await snapshot('baseline', 1, 'present', 'h1');
        requireFact(baseline.slots[0].channelLabel === primary.bindingLabel);
        const exposed = await command('h1', 'expose-primary', 'exposed'); requireFact(exposed.bindingLabel === primary.bindingLabel);
        const spawnAt = now(); await io.spawn(); await emit('spawn', spawnAt, { producer: 'independent-controller-owned', count: 1 });
        const rendezvousUntil = io.now() + 60000; let value;
        while (io.now() < rendezvousUntil) {
            value = await read(); requireFact(!incomplete, 'native-failed');
            requireFact(value?.producerAlive === true && value?.h1Alive === true && value?.h2Alive === true, 'producer-lost');
            requireFact(value.failed === null && value.rejected === null && value.unexpected === null && value.file === null && value.forward === null && value.returned === null, 'early-effect');
            if (value.entry !== null) break;
            await io.sleep(10);
        }
        requireFact(io.now() < rendezvousUntil, 'rendezvous-deadline'); requireFact(validNative(value, options.nonce, 'pending'), 'native-failed');
        entry = value.entry; phaseUntil = io.now() + 6000; await emit('b1', now(), value);
        const killAt = now(); const exit = await io.killH1(Math.min(2000, Math.floor(phaseUntil - io.now())));
        requireFact(exitValid(exit), 'exit-unobserved'); check(); await emit('h1-exit', killAt, exit);
        await emit('pending-after-exit', now(), await pending(false));
        await command('h2', 'sweep', 'sweep'); await pending(false); await snapshot('swept', 1, 'absent');
        const bindings = [primary];
        for (let i = 1; i <= 10; i++) {
            await pending(false);
            const b = await command('h2', 'prepare-additional', 'additional-' + i);
            requireFact(bindings.every(old => ['bindingLabel', 'targetLabel', 'generationLabel'].every(k => old[k] !== b[k])), 'binding-invalid'); bindings.push(b);
            const observed = await snapshot('inventory-' + i, i + 1, 'absent');
            requireFact(bindings.every(binding => observed.slots.some(s => s.channelLabel === binding.bindingLabel)), 'binding-invalid');
        }
        await command('h2', 'refuse', 'refuse-before'); await snapshot('full-before', 11, 'absent');
        await emit('pending-before-release', now(), await pending(false)); check();
        const releaseAt = now(); await io.release(); check(); await emit('release', releaseAt, { count: 1 });
        phaseUntil = Infinity;
        const returnUntil = io.now() + 60000;
        while (io.now() < returnUntil) {
            value = await read();
            requireFact(value?.producerAlive === true && value?.h1Alive === false && value?.h2Alive === true, 'producer-lost');
            requireFact(value.failed == null && value.rejected == null && value.unexpected == null, 'native-failed');
            check();
            if (!incomplete && value.returned !== null && value.file !== null) break;
            await io.sleep(10);
        }
        requireFact(io.now() < returnUntil && validNative(value, options.nonce, 'returned') && equal(value.entry, entry), 'native-failed');
        await emit('returned', now(), value); await snapshot('late', 11, 'present');
        await command('h2', 'refuse', 'refuse-after'); await snapshot('full-after', 11, 'present');
        value = await read(true); requireFact(validNative(value, options.nonce, 'returned') && !value.h1Alive && equal(value.entry, entry));
        await emit('final-read', now(), value); sequence = r.events.length;
        r.status = 'observed'; requireFact(validateObservation(r));
    } catch (error) { r.status = 'unestablished'; r.reason = reasons.includes(error?.message) ? error.message : 'io-failed'; }
    // A failed trace remains evidence, never a replacement complete trace.
    if (!sequence && r.status === 'observed') { r.status = 'unestablished'; r.reason = 'invalid-evidence'; }
    try { await io.checkpoint(r); } catch { r.status = 'unestablished'; r.reason = 'checkpoint-failed'; }
    return r;
}

/** Independent ordered replay of complete observations; no pass flag substitutes a gate. */
function validateObservation(r) {
    try {
        if (!closed(r, ['format', 'synthetic', 'nativeExecuted', 'status', 'reason', 'nonce', 'nativeHoldMs', 'mutationBudgetMs', 'ipcDeadlineMs', 'events', 'readDiagnostics']) ||
            r.format !== 'trial-l-observation-v2' || typeof r.synthetic !== 'boolean' || r.nativeExecuted !== !r.synthetic || r.status !== 'observed' || r.reason !== 'none' || !/^[a-f0-9]{32}$/.test(r.nonce) ||
            !validateReadDiagnostics(r.readDiagnostics) || r.readDiagnostics.terminal !== null || r.nativeHoldMs !== 7000 || r.mutationBudgetMs !== 6000 || r.ipcDeadlineMs !== 2000 || Buffer.byteLength(JSON.stringify(r)) > 1048576) return false;
        const stages = ['init-h1', 'init-h2', 'primary', 'baseline', 'exposed', 'spawn', 'b1', 'h1-exit', 'pending-after-exit', 'sweep', 'swept',
            ...Array.from({ length: 10 }, (_, i) => ['additional-' + (i + 1), 'inventory-' + (i + 1)]).flat(),
            'refuse-before', 'full-before', 'pending-before-release', 'release', 'returned', 'late', 'refuse-after', 'full-after', 'final-read'];
        if (!Array.isArray(r.events) || r.events.length !== stages.length) return false;
        let previous = 0; const by = {};
        for (let i = 0; i < stages.length; i++) {
            const e = r.events[i]; if (!closed(e, ['stage', 'atMs', 'durationMs', 'data']) || e.stage !== stages[i] || !integer(e.atMs, 290000) || !integer(e.durationMs, 60000) || e.atMs < previous || e.atMs - e.durationMs < previous) return false;
            by[e.stage] = e; previous = e.atMs;
            if (['spawn', 'b1', 'h1-exit', 'pending-after-exit', 'pending-before-release', 'release', 'returned', 'final-read'].includes(e.stage)) continue;
            const d = e.data;
            if (!closed(d, ['host', 'kind', 'deadlineMs', 'outcome', 'reason', 'data']) || !['h1', 'h2'].includes(d.host) || !integer(d.deadlineMs, 2000) || d.deadlineMs < 1 || e.durationMs >= d.deadlineMs ||
                !validReply(d.kind, { v: 1, id: 'replay', phase: 'settled', late: false, outcome: d.outcome, reason: d.reason, data: d.data })) return false;
            const expectedKind = e.stage.startsWith('init-') ? 'init' : e.stage === 'primary' ? 'prepare-primary' : e.stage === 'exposed' ? 'expose-primary' : e.stage === 'sweep' ? 'sweep' : e.stage.startsWith('additional-') ? 'prepare-additional' : e.stage.startsWith('refuse-') ? 'refuse' : 'snapshot';
            if (d.kind !== expectedKind || d.host !== (['init-h1', 'primary', 'baseline', 'exposed'].includes(e.stage) ? 'h1' : 'h2')) return false;
        }
        if (!equal(by['init-h1'].data.data, by['init-h2'].data.data) || !closed(by.spawn.data, ['producer', 'count']) || by.spawn.data.producer !== 'independent-controller-owned' || by.spawn.data.count !== 1 ||
            !exitValid(by['h1-exit'].data) || by['h1-exit'].data.atMs < by.b1.atMs || by['h1-exit'].data.atMs > by['h1-exit'].atMs ||
            !closed(by.release.data, ['count']) || by.release.data.count !== 1 || by.release.atMs - by.b1.atMs >= 6000) return false;
        if (by.returned.atMs - by.release.atMs >= 60000 || r.readDiagnostics.transients.some(v => v.atMs < by.release.atMs || v.atMs > by.returned.atMs)) return false;
        const entry = by.b1.data.entry;
        for (const stage of ['b1', 'pending-after-exit', 'pending-before-release', 'returned', 'final-read']) {
            const v = by[stage].data; if (!validNative(v, r.nonce, ['returned', 'final-read'].includes(stage) ? 'returned' : 'pending') || v.h1Alive !== (stage === 'b1') || !equal(v.entry, entry)) return false;
        }
        const primary = by.primary.data.data, baseline = by.baseline.data.data;
        if (by.exposed.data.data.bindingLabel !== primary.bindingLabel || baseline.slots.length !== 1 || baseline.slots[0].channelLabel !== primary.bindingLabel || baseline.watch.parent.state !== 'present' || baseline.bindings.retained !== 1 || baseline.bindings.exposed !== 0) return false;
        const bindings = [primary];
        for (let i = 1; i <= 10; i++) {
            const b = by['additional-' + i].data.data;
            if (!bindings.every(old => ['bindingLabel', 'targetLabel', 'generationLabel'].every(k => old[k] !== b[k]))) return false;
            bindings.push(b); const v = by['inventory-' + i].data.data;
            if (v.slots.length !== i + 1 || v.bindings.retained !== i || !bindings.every(binding => v.slots.some(s => s.channelLabel === binding.bindingLabel))) return false;
        }
        for (const stage of ['swept', ...Array.from({ length: 10 }, (_, i) => 'inventory-' + (i + 1)), 'full-before', 'late', 'full-after']) {
            const v = by[stage].data.data;
            if (!equal(v.watch.intent, baseline.watch.intent) || v.watch.parent.state !== (['late', 'full-after'].includes(stage) ? 'present' : 'absent') || v.bindings.exposed !== 0) return false;
            if (['full-before', 'late', 'full-after'].includes(stage) && (v.slots.length !== 11 || v.bindings.retained !== 10 || v.future.nextPrepare.withinLimits || v.future.nextPrepare.slotAvailable)) return false;
        }
        return by.swept.data.data.slots.length === 1 && by.swept.data.data.bindings.retained === 0;
    } catch { return false; }
}
/** Actual qualification additionally requires the complete live provenance/lifecycle envelope. */
function validateActualNativeL(r) { return validateReceiptEvidence(r) && r.synthetic === false && r.nativeExecuted === true; }
const PINS = Object.freeze({ native: '345996b4bdbae21d817f750fae2f34cbf8d81224a5444c78136091d121beb298', declaration: F.DECLARATION_SHA256,
    node: '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088' });
const F_RAW = '787a6d007ade1fa389eb6daef12bc21bbd310563fe5d181283a48d1266c0f7dc';
/** Pure gate over observed facts plus authenticated F bytes; seams never enter live config. */
async function verifyPrerequisites(config, io) {
    const c = F.validateConfig(config);
    requireFact(c.nativeSha256 === PINS.native && profileValid(c.hostProfile), 'identity-mismatch');
    const facts = await io.facts();
    requireFact(closed(facts, ['profile', 'head', 'clean', 'parentFresh', 'pins']) && profileValid(facts.profile) && equal(facts.profile, c.hostProfile) && facts.head === c.sourceSha && facts.clean === true && facts.parentFresh === true && equal(facts.pins, PINS), 'identity-mismatch');
    const envelope = await io.envelope(), actual = support.parseFPrerequisite(envelope);
    requireFact(equal(actual.receipt.before, PINS), 'identity-mismatch');
    const dependencies = await support.verifyFDependencies(envelope, io.readDependency);
    requireFact(dependencies.ok && dependencies.count === 24, 'identity-mismatch');
    return { rawSha256: hash(actual.raw), rawBytes: actual.raw.length, dependencies, pins: facts.pins, profile: facts.profile };
}

/**
 * One permanent listener retains correlated late outcomes after a local deadline.
 * Unknown/late results permanently poison this client; they never cancel work.
 */
function createHostClient(child, now, receivePrimary = () => { throw new Error('invalid-evidence'); }) {
    let sequence = 0, uncertain = false, lost = false;
    const requests = new Map(), evidence = [];
    const record = (request, phase, late, outcome, reason, binding = null) => {
        if (evidence.length >= 256) { uncertain = true; return; }
        evidence.push({ id: request?.id ?? 'unmatched', kind: request?.kind ?? 'unknown', phase, late, outcome, reason,
            atMs: Math.max(0, Math.min(300000, Math.floor(now()))), binding });
    };
    const fail = (request, phase = 'invalid', reason = 'invalid-evidence') => {
        uncertain = true; record(request, phase, true, 'unknown', reason);
        if (request && !request.done) { request.done = true; clearTimeout(request.timer); request.reject(new Error('ipc-uncertain')); }
    };
    child.on('message', input => {
        const request = requests.get(input?.id);
        if (!request || !input || Buffer.byteLength(JSON.stringify(input)) > 65536) { fail(request); return; }
        let reply = input;
        if (Object.hasOwn(input, 'transient')) {
            if (request.kind !== 'prepare-primary' || !closed(input, ['v', 'id', 'phase', 'late', 'outcome', 'reason', 'data', 'transient'])) { fail(request); return; }
            const { transient, ...safe } = input; reply = safe;
            if (!request.done && validReply(request.kind, safe)) {
                try { receivePrimary(transient); } catch { fail(request); return; }
            }
        }
        const success = validReply(request.kind, reply);
        const failure = closed(reply, ['v', 'id', 'phase', 'late', 'outcome', 'reason']) && reply.v === 1 && ['deadline', 'settled', 'rejected'].includes(reply.phase) && typeof reply.late === 'boolean' &&
            ['failed', 'unknown'].includes(reply.outcome) && ['deadline', 'expired-before-start', 'operation-failed', 'invalid-message', 'duplicate-id', 'protocol-limit', 'profile-mismatch', 'unsafe-root', 'root-busy', 'initialization-failed', 'not-initialized', 'stopped', 'observation-failed', 'exposure-refused', 'primary-already-attempted', 'offer-unavailable', 'capture-unavailable', 'cleanup', 'cleanup-capacity', 'reply-limit', 'already-initialized'].includes(reply.reason);
        const unexpected = closed(reply, ['v', 'id', 'phase', 'late', 'outcome', 'reason', 'data']) && reply.v === 1 && reply.phase === 'settled' && typeof reply.late === 'boolean' && reply.outcome === 'unexpected-admission' && reply.reason === 'none' && bindingValid(reply.data);
        // Late successful response unions still need recursive validation.
        const lateSuccess = reply.late === true && validReply(request.kind, { ...reply, late: false });
        if (!success && !failure && !unexpected && !lateSuccess) { fail(request); return; }
        const late = request.done || reply.late || now() >= request.until;
        record(request, reply.phase, late, reply.outcome, reply.reason, unexpected ? reply.data : null);
        if (late || !success && !unexpected || reply.phase !== 'settled') uncertain = true;
        if (!request.done) {
            request.done = true; clearTimeout(request.timer);
            if (!uncertain) request.resolve(reply); else request.reject(new Error('ipc-uncertain'));
        }
    });
    const loss = () => { lost = true; for (const request of requests.values()) if (!request.done) fail(request, 'lost', 'host-lost'); };
    child.on('error', loss); child.on('disconnect', loss); child.on('close', loss);
    return {
        evidence,
        get uncertain() { return uncertain; },
        async command(kind, extra, deadlineMs) {
            requireFact(!uncertain && !lost && sequence < 100, 'ipc-uncertain');
            const id = 'l-' + (++sequence), message = { v: 1, id, kind, deadlineMs, ...extra };
            requireFact(support.parseLifetimeMessage(message), 'invalid-evidence');
            return new Promise((resolve, reject) => {
                const request = { id, kind, until: now() + deadlineMs, done: false, resolve, reject, timer: null };
                requests.set(id, request);
                request.timer = setTimeout(() => fail(request, 'deadline', 'phase-deadline'), deadlineMs);
                try { child.send(message, error => { if (error) fail(request, 'lost', 'host-lost'); }); }
                catch { fail(request, 'lost', 'host-lost'); }
            });
        }
    };
}
const fs = require('node:fs/promises');
const repo = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Only fixed, content-free classifications cross the read boundary. */
function readFailure(operation, classification) {
    const error = new Error(classification === 'io' ? 'io-failed' : 'invalid-evidence');
    error.readIssue = { operation, classification };
    return error;
}
const markerRoles = ['started', 'entry', 'forward', 'returned', 'rejected', 'failed', 'unexpected'];
const readPhases = ['pre-release', 'post-release', 'final', 'read-back'];
const readOperations = ['lstat-before', 'canonical-before', 'open', 'fstat-before', 'read', 'fstat-after', 'lstat-after', 'canonical-after', 'close', 'parse', 'poll'];
const readClasses = ['type', 'symlink', 'links', 'canonical', 'device', 'inode', 'birthtime', 'bound', 'metadata', 'unstable', 'io', 'json', 'overflow'];
/** Closed bounded diagnostics are evidence of uncertainty, never an affirmative witness. */
function createReadDiagnostics() { return { format: 'trial-l-read-diagnostics-v1', transients: [], terminal: null }; }
/** Validate every record before replay; unknown/private fields cannot enter the receipt union. */
function validateReadDiagnostics(d) {
    if (!closed(d, ['format', 'transients', 'terminal']) || d.format !== 'trial-l-read-diagnostics-v1' || !Array.isArray(d.transients) || d.transients.length > 64) return false;
    const valid = v => closed(v, ['phase', 'role', 'operation', 'classification', 'atMs']) && readPhases.includes(v.phase) && markerRoles.includes(v.role) && readOperations.includes(v.operation) && readClasses.includes(v.classification) && integer(v.atMs, 300000) &&
        (v.classification !== 'json' || v.operation === 'parse') && (v.classification !== 'overflow' || v.operation === 'poll' && v.phase === 'post-release') &&
        (v.classification !== 'unstable' || ['fstat-before', 'read', 'fstat-after', 'lstat-after'].includes(v.operation));
    let previous = 0;
    for (const v of d.transients) {
        if (!valid(v) || v.phase !== 'post-release' || v.classification !== 'unstable' || v.atMs < previous) return false;
        previous = v.atMs;
    }
    return d.terminal === null || valid(d.terminal) && d.terminal.atMs >= previous;
}
/** Preserve the first terminal site and cap transients without discarding earlier uncertainty. */
function recordReadIssue(diagnostics, phase, role, issue, now, transient) {
    requireFact(validateReadDiagnostics(diagnostics) && readPhases.includes(phase) && markerRoles.includes(role));
    const record = { phase, role, operation: issue.operation, classification: issue.classification, atMs: Math.floor(now()) };
    if (transient && diagnostics.transients.length === 64) {
        record.operation = 'poll'; record.classification = 'overflow'; transient = false;
    }
    if (transient) diagnostics.transients.push(record); else diagnostics.terminal ??= record;
    requireFact(validateReadDiagnostics(diagnostics));
    if (!transient) throw readFailure(record.operation, record.classification);
}
/** Strict reader: changed size/count/time never skips final identity, path, link or bound checks. */
async function readStableBytes(file, maximum = 16777216) {
    requireFact(integer(maximum, 16777216) && maximum > 0);
    const io = async (operation, action) => {
        try { return await action(); } catch (cause) {
            const error = readFailure(operation, 'io');
            // Only absence at the initial lookup is absence; mid-read disappearance is terminal.
            if (operation === 'lstat-before' && cause?.code === 'ENOENT') error.code = 'ENOENT';
            throw error;
        }
    };
    const before = await io('lstat-before', () => fs.lstat(file)); let unstable = null;
    const verify = (v, operation) => {
        const fact = (value, classification) => { if (!value) throw readFailure(operation, classification); };
        fact(!v.isSymbolicLink(), 'symlink'); fact(v.isFile(), 'type'); fact(v.nlink === 1, 'links');
        fact(integer(v.size, maximum), 'bound'); fact(Number.isFinite(v.mtimeMs) && Number.isFinite(v.birthtimeMs), 'metadata');
        fact(v.dev === before.dev, 'device'); fact(v.ino === before.ino, 'inode'); fact(v.birthtimeMs === before.birthtimeMs, 'birthtime');
        if (v.size !== before.size || v.mtimeMs !== before.mtimeMs) unstable ??= { operation, classification: 'unstable' };
    };
    const canonical = (value, operation) => { if (value !== path.resolve(file)) throw readFailure(operation, 'canonical'); };
    verify(before, 'lstat-before'); canonical(await io('canonical-before', () => fs.realpath(file)), 'canonical-before');
    const handle = await io('open', () => fs.open(file, require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0)));
    try {
        verify(await io('fstat-before', () => handle.stat()), 'fstat-before');
        const bytes = Buffer.alloc(before.size + 1); let count = 0;
        while (count < bytes.length) {
            const result = await io('read', () => handle.read(bytes, count, bytes.length - count, null));
            if (!integer(result.bytesRead, bytes.length - count)) throw readFailure('read', 'bound');
            if (!result.bytesRead) break; count += result.bytesRead;
        }
        if (count > maximum) throw readFailure('read', 'bound');
        if (count !== before.size) unstable ??= { operation: 'read', classification: 'unstable' };
        // Collect all final observations before deciding whether the sample can be deferred.
        const descriptor = await io('fstat-after', () => handle.stat());
        const after = await io('lstat-after', () => fs.lstat(file));
        const resolved = await io('canonical-after', () => fs.realpath(file));
        verify(descriptor, 'fstat-after'); verify(after, 'lstat-after'); canonical(resolved, 'canonical-after');
        if (unstable) throw readFailure(unstable.operation, unstable.classification);
        return bytes.subarray(0, count);
    } finally { await io('close', () => handle.close()); }
}
/** Actual production marker path. A changing marker is omitted, never represented as absence. */
async function readControlMarkers(directory, phase, diagnostics, now) {
    requireFact(readPhases.includes(phase) && validateReadDiagnostics(diagnostics));
    requireFact(diagnostics.terminal === null);
    const markers = {}; let complete = true;
    for (const role of markerRoles) {
        try { markers[role] = JSON.parse((await readStableBytes(path.join(directory, role + '.json'), 4096)).toString('utf8')); }
        catch (error) {
            if (error.code === 'ENOENT' || ['pre-release', 'post-release'].includes(phase) && error instanceof SyntaxError) { markers[role] = null; continue; }
            const issue = error.readIssue ?? { operation: 'parse', classification: error instanceof SyntaxError ? 'json' : 'io' };
            const transient = phase === 'post-release' && issue.classification === 'unstable';
            recordReadIssue(diagnostics, phase, role, issue, now, transient);
            complete = false;
            // Continue reading stable negative markers; an incomplete sample grants no witness.
        }
    }
    return { markers, complete };
}
/** Stream large pinned executables while verifying identity/size before and after the read. */
async function hashStableFile(file) {
    const before = await fs.lstat(file);
    requireFact(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= 536870912 && await fs.realpath(file) === path.resolve(file), 'identity-mismatch');
    const handle = await fs.open(file, 'r'), digestor = crypto.createHash('sha256'); let count = 0;
    const same = v => v.isFile() && v.nlink === 1 && v.dev === before.dev && v.ino === before.ino && v.birthtimeMs === before.birthtimeMs && v.size === before.size && v.mtimeMs === before.mtimeMs;
    try {
        requireFact(same(await handle.stat()), 'identity-mismatch');
        const stream = handle.createReadStream({ autoClose: false, highWaterMark: 1048576 });
        for await (const chunk of stream) { count += chunk.length; requireFact(count <= 536870912, 'identity-mismatch'); digestor.update(chunk); }
        requireFact(count === before.size && same(await handle.stat()) && same(await fs.lstat(file)), 'identity-mismatch');
        return digestor.digest('hex');
    } finally { await handle.close(); }
}
/** Build only reviewed public generators and exact product bytes. No module is executed. */
async function buildOwnedSources(directory, sources) {
    const { build } = require('esbuild');
    const host = path.join(directory, 'host.cjs'), adapter = path.join(directory, 'adapter.cjs'), product = path.join(directory, 'product');
    const generatedHost = support.createLifetimeHostSource(path.join(repo, 'src/companion/companionCapture.ts'));
    const hostBundle = await build({ stdin: { contents: generatedHost, resolveDir: repo, sourcefile: 'trial-l-host.cjs' }, bundle: true, platform: 'node', format: 'cjs', write: false });
    const adapterBundle = await build({ entryPoints: [path.join(repo, 'src/launch/nodePtyAdapter.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['node-pty'], write: false });
    await fs.writeFile(host, hostBundle.outputFiles[0].contents, { flag: 'wx' });
    await fs.writeFile(adapter, adapterBundle.outputFiles[0].contents, { flag: 'wx' });
    for (const source of sources.filter(s => s.path.startsWith('media/attention/'))) {
        requireFact(/^media\/attention\/[a-zA-Z0-9._/-]+$/.test(source.path) && !source.path.split('/').includes('..'));
        const bytes = await readStableBytes(path.join(repo, source.path)); requireFact(hash(bytes) === source.sha256, 'identity-mismatch');
        const output = path.join(product, source.path.slice('media/attention/'.length));
        await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes, { flag: 'wx' });
    }
    return { host, adapter, product, generated: { hostSha256: hash(hostBundle.outputFiles[0].contents), adapterSha256: hash(adapterBundle.outputFiles[0].contents) } };
}
/** F's unchanged hook emits real Native observations; this controller only writes release. */
async function writeControl(directory, primary, nonce) {
    const plugin = path.join(directory, 'control-plugin'), control = path.join(directory, 'control');
    await fs.mkdir(control); await fs.mkdir(path.join(plugin, '.claude-plugin'), { recursive: true }); await fs.mkdir(path.join(plugin, 'hooks'));
    const source = F.createControlPluginSource({ target: primary.target, control: control.replace(/\\/g, '/'), nonce });
    const manifest = JSON.stringify({ name: 'trial-f-rendezvous', version: '0.0.1', description: 'Owned no-model dispatch feasibility control' });
    const hooks = JSON.stringify({ modules: ['./control.js'] });
    await fs.writeFile(path.join(plugin, 'hooks/control.js'), source, { flag: 'wx' });
    await fs.writeFile(path.join(plugin, '.claude-plugin/plugin.json'), manifest, { flag: 'wx' });
    await fs.writeFile(path.join(plugin, 'hooks/hooks.json'), hooks, { flag: 'wx' });
    return { plugin, control, generated: { pluginSha256: hash(source), manifestSha256: hash(manifest), hooksSha256: hash(hooks) } };
}
/**
 * Bound persistence independently of the writer's queue. Retain original promises and
 * late outcomes; a deadline or overlapping attempt permanently prevents success.
 */
function createCheckpointGuard(write, reject, clock = { now: () => performance.now(), setTimeout, clearTimeout }) {
    let uncertain = false, pending = null;
    const records = [];
    const disqualify = () => { if (!uncertain) { uncertain = true; reject('checkpoint-failed'); } };
    return {
        records,
        get uncertain() { return uncertain; },
        async checkpoint(budgetMs = 1000) {
            requireFact(Number.isFinite(budgetMs) && budgetMs >= 0 && budgetMs <= 1000, 'checkpoint-failed');
            if (uncertain || pending || budgetMs === 0 || records.length >= 200) { disqualify(); throw new Error('checkpoint-failed'); }
            const record = { state: 'pending', promise: null, until: clock.now() + budgetMs };
            records.push(record); pending = record;
            return new Promise((resolve, fail) => {
                let done = false;
                const deadline = () => {
                    if (done) return;
                    done = true; record.state = 'deadline'; disqualify(); fail(new Error('checkpoint-failed'));
                };
                const timer = clock.setTimeout(deadline, budgetMs);
                record.promise = Promise.resolve().then(write).then(() => settle(true), () => settle(false));
                const settle = okay => {
                    clock.clearTimeout(timer); pending = null;
                    const late = done || uncertain || clock.now() >= record.until;
                    record.state = late ? okay ? 'late-settled' : 'late-failed' : okay ? 'settled' : 'failed';
                    if (late || !okay) disqualify();
                    if (!done) { done = true; if (late || !okay) fail(new Error('checkpoint-failed')); else resolve(); }
                };
            });
        }
    };
}
/** Checkpoint gets at most one second; owned teardown never depends on its settlement. */
function checkpointThenStop(owned, persistence, remainingMs, clock = { now: () => performance.now(), sleep }) {
    if (owned.shutdownPromise) return owned.shutdownPromise;
    owned.shutdownRequested = true;
    const until = clock.now() + Math.max(0, remainingMs);
    owned.shutdownPromise = (async () => {
        // Preserve up to eight seconds for the owned exit/close attempt inside the reserve.
        const writeBudget = Math.min(1000, Math.max(0, remainingMs - 8000));
        try { await persistence.checkpoint(writeBudget); } catch { /* Latched uncertainty is not cancellation. */ }
        return stopLifetime(owned, Math.max(0, Math.min(8000, until - clock.now())), clock);
    })();
    return owned.shutdownPromise;
}
/** Owned P termination precedes host stops. Zero budget requests stops without adding a wait. */
async function stopLifetime(owned, budgetMs = 8000, clock = { now: () => performance.now(), sleep }) {
    requireFact(Number.isFinite(budgetMs) && budgetMs >= 0 && budgetMs <= 8000);
    owned.teardown = true;
    if (!owned.producerTermination) {
        const termination = { settled: !owned.pty, failed: false, promise: null }; owned.producerTermination = termination;
        // Invoke through the retained handle NOW, including the hard-deadline callback.
        if (owned.pty) {
            try { termination.promise = Promise.resolve(owned.pty.terminate()).then(() => { termination.settled = true; }, () => { termination.settled = true; termination.failed = true; }); }
            catch { termination.settled = true; termination.failed = true; }
        }
    }
    const termination = owned.producerTermination;
    const stopHosts = () => {
        for (const host of [owned.h1, owned.h2]) {
            if (!host || host.exited || host.stopRequested) continue;
            host.stopRequested = true;
            try { if (!host.child.kill()) owned.hostStopFailed = true; } catch { owned.hostStopFailed = true; }
        }
    };
    const observed = () => !termination.failed && !owned.hostStopFailed && termination.settled && (!owned.pty || owned.producerExited) && [owned.h1, owned.h2].every(host => !host || host.exited && host.closed);
    // Never replace an in-flight stop promise or invent witnesses when no time remains.
    if (budgetMs === 0) { stopHosts(); return observed(); }
    if (owned.stopPromise) return owned.stopPromise;
    owned.stopPromise = (async () => {
        const until = clock.now() + budgetMs, producerUntil = until - Math.min(2000, budgetMs / 3);
        while ((!termination.settled || owned.pty && !owned.producerExited) && clock.now() < producerUntil) await clock.sleep(Math.min(10, producerUntil - clock.now()));
        stopHosts();
        while ([owned.h1, owned.h2].some(host => host && !host.closed) && clock.now() < until) await clock.sleep(10);
        return observed();
    })();
    return owned.stopPromise;
}
/** Validate the launch-only tuple; tokens, paths and target IDs never enter the receipt. */
function validatePrimary(v, binding, capture) {
    try {
        if (!closed(v, ['environment', 'target', 'targetIdentity', 'watch']) || !bindingValid(binding) ||
            !closed(v.environment, ['CLAUDE_WORKSPACES_CAPTURE_DIR', 'CLAUDE_WORKSPACES_CAPTURE_TOKEN', 'CLAUDE_WORKSPACES_CAPTURE_SESSION_ID', 'CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID', 'CLAUDE_WORKSPACES_CAPTURE_GENERATION']) ||
            !closed(v.targetIdentity, ['sessionId', 'claudeSessionId', 'generation']) || !Object.values(v.targetIdentity).every(x => typeof x === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x)) ||
            !closed(v.watch, ['channel', 'slot']) || !/^companion-[a-f0-9]{32}$/.test(v.watch.channel) || !integer(v.watch.slot, 10)) return false;
        const e = v.environment, t = v.targetIdentity, directory = path.join(capture, v.watch.channel);
        return e.CLAUDE_WORKSPACES_CAPTURE_DIR === directory && typeof e.CLAUDE_WORKSPACES_CAPTURE_TOKEN === 'string' && /^[A-Za-z0-9_-]{43}$/.test(e.CLAUDE_WORKSPACES_CAPTURE_TOKEN) &&
            e.CLAUDE_WORKSPACES_CAPTURE_SESSION_ID === t.sessionId && e.CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID === t.claudeSessionId && e.CLAUDE_WORKSPACES_CAPTURE_GENERATION === t.generation &&
            typeof v.target === 'string' && path.dirname(path.resolve(v.target)) === directory && /^request\.[a-f0-9]{32}\.upload$/.test(path.basename(v.target)) &&
            hash(v.watch.channel) === binding.bindingLabel && hash(JSON.stringify([t.sessionId, t.claudeSessionId, t.generation])) === binding.targetLabel && hash(t.generation) === binding.generationLabel;
    } catch { return false; }
}
const additionalSources = ['test/manual/companionNativeLifetime.smoke.cjs', 'test/manual/companionNativeLifetimeSupport.cjs', 'test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json'];
const dependencyFingerprint = 'fdf1843afecd95bc4a019ada9c9e32c68f70f1146777fc63f9dd887f0b2a8aeb';
/** Closed informational receipt validation, separate from the actual execution discriminator. */
function validateReceiptEvidence(r) {
    try {
        if (!closed(r, ['format', 'synthetic', 'nativeExecuted', 'status', 'reason', 'sourceSha', 'sourceFingerprint', 'before', 'after', 'runtime', 'prerequisite', 'sources', 'generated', 'authentication', 'version', 'observation', 'inspections', 'ipc', 'lifecycle', 'cleanup', 'evidenceLevel', 'topology', 'productionAdmission', 'qualificationGates', 'otherLifetimes']) ||
            Buffer.byteLength(JSON.stringify(r)) > 1048576 || r.format !== 'native-trial-l-v2' || typeof r.synthetic !== 'boolean' || r.nativeExecuted !== !r.synthetic || r.status !== 'observed' || r.reason !== 'none' ||
            !/^[a-f0-9]{40}$/.test(r.sourceSha) || !digest(r.sourceFingerprint) || !equal(r.before, PINS) || !equal(r.after, PINS) || !profileValid(r.runtime) || r.authentication !== 'claude.ai' || r.version !== '2.1.322' ||
            r.cleanup !== 'storage-and-intents-preserved' || r.evidenceLevel !== 'sdk-dispatch-pending/pre-next' || r.topology !== 'injected-qualification-probe-only/development' || r.productionAdmission !== false || r.qualificationGates !== 'all-63-pending' || r.otherLifetimes !== 'E/installed-unestablished' ||
            !validateObservation(r.observation) || r.observation.synthetic !== r.synthetic || r.observation.nativeExecuted !== r.nativeExecuted) return false;
        const p = r.prerequisite;
        if (!closed(p, ['rawSha256', 'rawBytes', 'dependencyCount', 'method', 'dependencies']) || p.rawSha256 !== F_RAW || p.rawBytes !== 9372 || p.dependencyCount !== 24 || p.method !== 'exact-working-bytes/no-normalization' ||
            !Array.isArray(p.dependencies) || p.dependencies.length !== 24 || p.dependencies.some(s => !closed(s, ['label', 'sha256']) || !digest(s.label) || !digest(s.sha256)) || hash(JSON.stringify(p.dependencies)) !== dependencyFingerprint) return false;
        if (!Array.isArray(r.sources) || r.sources.length !== 27 || new Set(r.sources.map(s => s.label)).size !== 27 || r.sources.some(s => !closed(s, ['label', 'sha256']) || !digest(s.label) || !digest(s.sha256)) ||
            !p.dependencies.every(s => r.sources.some(t => equal(s, t))) || !additionalSources.every(name => r.sources.some(s => s.label === hash(name)))) return false;
        if (!closed(r.generated, ['hostSha256', 'adapterSha256', 'pluginSha256', 'manifestSha256', 'hooksSha256']) || !Object.values(r.generated).every(digest) ||
            !Array.isArray(r.inspections) || r.inspections.length !== 4 || r.inspections.some((i, n) => !closed(i, ['kind', 'close', 'termination', 'reason', 'exit']) || i.kind !== (n % 2 ? 'auth' : 'version') || i.close !== 'observed' || i.termination !== 'not-requested' || i.reason !== 'none' || i.exit !== 'zero')) return false;
        if (!closed(r.ipc, ['h1', 'h2'])) return false;
        for (const host of ['h1', 'h2']) {
            const commands = r.observation.events.filter(e => e.data?.host === host), evidence = r.ipc[host];
            if (!Array.isArray(evidence) || evidence.length !== commands.length) return false;
            for (let n = 0; n < evidence.length; n++) {
                const e = evidence[n], command = commands[n];
                if (!closed(e, ['id', 'kind', 'phase', 'late', 'outcome', 'reason', 'atMs', 'binding']) || e.id !== 'l-' + (n + 1) || e.kind !== command.data.kind || e.phase !== 'settled' || e.late !== false ||
                    e.outcome !== command.data.outcome || e.reason !== command.data.reason || !integer(e.atMs, 300000) || e.atMs > command.atMs || e.atMs < command.atMs - command.durationMs || e.binding !== null) return false;
            }
        }
        const l = r.lifecycle;
        if (!closed(l, ['producer', 'h1', 'h2', 'hostCloses', 'teardown', 'finalRead']) || ![l.producer, l.h1, l.h2].every(exitValid) || l.hostCloses !== true || l.teardown !== 'owned-exits-observed' || !fileValid(l.finalRead)) return false;
        const b1 = r.observation.events.find(e => e.stage === 'b1'), h1 = r.observation.events.find(e => e.stage === 'h1-exit'), last = r.observation.events.at(-1);
        return equal(l.h1, h1.data) && l.producer.atMs >= last.atMs && l.h2.atMs >= l.producer.atMs && l.finalRead.bytes === b1.data.entry.bytes && l.finalRead.sha256 === b1.data.entry.sha256;
    } catch { return false; }
}

/** Bounded read-only Git command; retain owned handles until actual close, including timeout. */
async function gitBytes(args, owned) {
    const child = require('node:child_process').spawn('git', ['-C', repo, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const item = { child, closed: false }; owned.push(item);
    return new Promise((resolve, reject) => {
        const chunks = []; let size = 0, failed = false;
        const stop = () => { failed = true; try { child.kill(); } catch { /* Only the owned process handle is available. */ } };
        const timer = setTimeout(stop, 10000);
        child.stdout.on('data', b => { size += b.length; if (size > 4194304) stop(); else chunks.push(b); });
        child.stderr.on('data', b => { size += b.length; if (size > 4194304) stop(); });
        child.on('error', stop);
        child.once('close', code => { item.closed = true; clearTimeout(timer); if (failed || code !== 0) reject(new Error('identity-mismatch')); else resolve(Buffer.concat(chunks)); });
    });
}
/** Actual process and canonical ownership facts; recheck only the directory we created. */
async function livePrerequisites(c, gitOwned, existingDirectory = null) {
    const parent = await fs.realpath(c.ownedParent), scratch = await fs.realpath(path.join(repo, '.tmp'));
    requireFact(parent === path.resolve(c.ownedParent) && parent.startsWith(scratch + path.sep), 'identity-mismatch');
    for (let current = parent;; current = path.dirname(current)) {
        const st = await fs.lstat(current); requireFact(st.isDirectory() && !st.isSymbolicLink() && await fs.realpath(current) === current, 'identity-mismatch');
        if (path.dirname(current) === current) break;
    }
    const entries = await fs.readdir(parent);
    const parentFresh = existingDirectory ? entries.length === 1 && path.join(parent, entries[0]) === existingDirectory : entries.length === 0;
    const profile = { platform: process.platform, arch: process.arch, node: process.versions.node, uv: process.versions.uv, electron: process.versions.electron ?? null };
    // Cheap source/profile rejection precedes the expensive streaming binary identity reads.
    requireFact(profileValid(profile) && equal(profile, c.hostProfile), 'identity-mismatch');
    const head = (await gitBytes(['rev-parse', 'HEAD'], gitOwned)).toString().trim();
    const clean = (await gitBytes(['status', '--porcelain', '--untracked-files=no'], gitOwned)).length === 0;
    requireFact(head === c.sourceSha && clean && parentFresh, 'identity-mismatch');
    const pins = { native: await hashStableFile(c.nativeExecutable), declaration: await hashStableFile(c.declarationPath), node: await hashStableFile(process.execPath) };
    const fixture = path.join(repo, additionalSources[2]), envelope = await readStableBytes(fixture, 16384);
    const loaded = support.parseFPrerequisite(envelope);
    const result = await verifyPrerequisites(c, { facts: async () => ({ profile, head, clean, parentFresh, pins }), envelope: async () => envelope, readDependency: name => readStableBytes(path.join(repo, name)) });
    const sourceNames = [...loaded.receipt.sources.map(s => s.path), ...additionalSources];
    const tracked = (await gitBytes(['ls-files', '-z', '--', ...sourceNames], gitOwned)).toString().split('\0').filter(Boolean);
    requireFact(sourceNames.length === 27 && tracked.length === 27 && sourceNames.every(s => tracked.includes(s)), 'identity-mismatch');
    const sources = [];
    for (const name of sourceNames) sources.push({ path: name, sha256: hash(await readStableBytes(path.join(repo, name))) });
    return { ...result, sources, sourceFingerprint: hash(await gitBytes(['ls-files', '--stage', '-z'], gitOwned)),
        dependencies: loaded.receipt.sources.map(s => ({ label: hash(s.path), sha256: s.sha256 })) };
}
/** Discard bounded output; retain only a short private startup-interaction matching tail. */
function createOutputGuard(reject) {
    let bytes = 0, tail = '';
    return (data, interactive = false) => {
        bytes += Buffer.byteLength(data); if (bytes > 65536) { reject('output-limit'); return; }
        if (interactive) {
            tail = (tail + data).slice(-2048);
            if (/trust this folder|sign in|log in|login required|accept.*terms/i.test(tail)) reject('startup-interaction');
        }
    };
}
/** Final immutable marker/upload comparison ignores liveness, never infers quiescence. */
function validateReadBack(expected, observed) {
    return !!expected && !!observed && ['started', 'entry', 'forward', 'returned', 'file', 'rejected', 'failed', 'unexpected'].every(key => equal(expected[key], observed[key])) &&
        expected.rejected === null && expected.failed === null && expected.unexpected === null && fileValid(observed.file);
}

/** Actual one-trial composition. No injectable actor/environment/budget seam is accepted here. */
async function runLive(config) {
    const c = F.validateConfig(config), environment = liveEnvironment(process.env), gitOwned = [];
    const began = performance.now(), hardUntil = began + 300000;
    let observationOrigin = began, expired = false, fault = null, directory, save, primary, built, control, released = false, finalNative;
    const owned = { h1: null, h2: null, pty: null, producerExited: false, producerExit: null, teardown: false }, inspectionOwner = { inspections: [] };
    let receipt; const readDiagnostics = createReadDiagnostics();
    const stamp = () => Math.max(0, Math.floor(performance.now() - observationOrigin));
    const fail = reason => { fault ??= reasons.includes(reason) ? reason : 'io-failed'; if (receipt) { receipt.status = 'unestablished'; receipt.reason = fault; } };
    const check = () => { requireFact(!expired && !owned.shutdownRequested && performance.now() < hardUntil - 10000, 'controller-deadline'); requireFact(!fault, fault || 'io-failed'); };
    const persistence = createCheckpointGuard(async () => { if (save) { requireFact(Buffer.byteLength(JSON.stringify(receipt)) <= 1048576); await save(receipt); } }, fail);
    owned.checkpoints = persistence.records;
    const checkpoint = () => persistence.checkpoint(Math.max(0, Math.min(1000, hardUntil - performance.now())));
    const shutdown = () => checkpointThenStop(owned, persistence, Math.max(0, hardUntil - performance.now() - 1000));
    // Timer callbacks own only retained handles. They grant no filesystem cleanup authority.
    const reserve = setTimeout(() => { expired = true; fail('controller-deadline'); for (const item of inspectionOwner.inspections) item.stop(); void shutdown(); }, 290000);
    const hard = setTimeout(() => {
        expired = true; owned.shutdownRequested = true; fail('controller-deadline');
        // No added wait window: request P first and only then emergency owned hosts.
        // This fallback cannot qualify; requests alone are not actual exit/close evidence.
        const attempt = stopLifetime(owned, 0);
        for (const item of inspectionOwner.inspections) item.stop();
        for (const item of gitOwned) if (!item.closed) { try { item.child.kill(); } catch { /* Retained unresolved handle. */ } }
        void attempt.then(() => { if (require.main === module) process.exit(1); });
    }, 300000);
    try {
        const before = await livePrerequisites(c, gitOwned); check();
        directory = await fs.mkdtemp(path.join(c.ownedParent, 'native-trial-l-'));
        const { createReceiptWriter } = require('./companionNative.smoke.cjs'); save = createReceiptWriter(path.join(directory, 'receipt.json'));
        receipt = { format: 'native-trial-l-v2', synthetic: false, nativeExecuted: false, status: 'pending', reason: 'none', sourceSha: c.sourceSha, sourceFingerprint: before.sourceFingerprint,
            before: before.pins, after: null, runtime: before.profile, prerequisite: { rawSha256: before.rawSha256, rawBytes: before.rawBytes, dependencyCount: 24, method: 'exact-working-bytes/no-normalization', dependencies: before.dependencies },
            sources: before.sources.map(s => ({ label: hash(s.path), sha256: s.sha256 })), generated: null, authentication: 'unverified', version: 'unverified', observation: null, inspections: [], ipc: { h1: [], h2: [] },
            lifecycle: { producer: null, h1: null, h2: null, hostCloses: false, teardown: 'pending', finalRead: null }, cleanup: 'storage-and-intents-preserved', evidenceLevel: 'sdk-dispatch-pending/pre-next',
            topology: 'injected-qualification-probe-only/development', productionAdmission: false, qualificationGates: 'all-63-pending', otherLifetimes: 'E/installed-unestablished' };
        await checkpoint();
        const workspace = path.join(directory, 'workspace'), capture = path.join(directory, 'capture');
        await fs.mkdir(workspace); await fs.mkdir(capture);
        const inspect = async argv => {
            check(); const result = await F.inspectCli(c.nativeExecutable, argv, workspace, environment, inspectionOwner);
            receipt.inspections = F.inspectionEvidence(inspectionOwner); await checkpoint(); check();
            requireFact(result.exitObserved && result.reason === 'none' && result.code === 0, 'auth-unverified');
            if (argv[0] === '--version') { requireFact(/^2\.1\.322(?: \(Claude Code\))?\s*$/.test(result.output), 'identity-mismatch'); receipt.version = '2.1.322'; }
            else { let method; try { method = JSON.parse(result.output).authMethod; } catch { /* Fail closed without publishing output. */ } requireFact(method === 'claude.ai', 'auth-unverified'); receipt.authentication = 'claude.ai'; }
        };
        await inspect(['--version']); await inspect(['auth', 'status']);
        built = await buildOwnedSources(directory, before.sources); check();
        const nonce = crypto.randomBytes(16).toString('hex'), discard = createOutputGuard(fail);
        observationOrigin = performance.now();
        const host = name => {
            check(); const child = require('node:child_process').fork(built.host, [], { cwd: workspace, env: environment, silent: true, windowsHide: true });
            const h = { child, exited: false, closed: false, intentional: false, exit: null }; owned[name] = h;
            child.once('exit', (code, signal) => { h.exited = true; h.exit = { observed: true, atMs: stamp(), code: Number.isInteger(code) ? code : null, signal: [null, 'SIGTERM', 'SIGKILL', 'SIGINT'].includes(signal) ? signal : 'other' }; if (!h.intentional && !owned.teardown) fail('host-lost'); });
            child.once('close', () => { h.closed = true; }); child.once('error', () => fail('host-lost'));
            child.stdout.on('data', discard); child.stderr.on('data', discard);
            h.client = createHostClient(child, stamp, value => { requireFact(name === 'h1' && !primary); primary = value; });
            receipt.ipc[name] = h.client.evidence;
            return h;
        };
        host('h1'); host('h2');
        const alive = h => !!h && !h.exited && F.processAlive(h.child.pid);
        const read = async (final = false) => {
            check();
            const sample = await readControlMarkers(control.control, final ? 'final' : released ? 'post-release' : 'pre-release', readDiagnostics, stamp);
            const result = sample.markers; result.file = null;
            try { const bytes = await readStableBytes(path.resolve(primary.target), 4096); result.file = { bytes: bytes.length, sha256: hash(bytes) }; }
            catch (error) { if (error.code !== 'ENOENT') { if (!released || final) throw error; } }
            check();
            return { producerAlive: !owned.producerExited && F.processAlive(owned.producerPid), h1Alive: alive(owned.h1), h2Alive: alive(owned.h2), ...result, markerReadComplete: sample.complete };
        };
        const io = {
            now: stamp, sleep,
            checkpoint: async observation => { receipt.observation = { ...structuredClone(observation), synthetic: false, nativeExecuted: receipt.nativeExecuted }; await checkpoint(); },
            command: async (name, kind, extra, budget) => {
                check(); const h = owned[name]; requireFact(alive(h), 'host-lost');
                const parameters = kind === 'init' ? { storageRoot: capture, profile: c.hostProfile } : kind === 'snapshot' ? { watch: primary?.watch ?? null } : extra;
                const response = await h.client.command(kind, parameters, budget); check();
                if (kind === 'prepare-primary') requireFact(validatePrimary(primary, response.data, capture));
                return response;
            },
            spawn: async () => {
                check(); control = await writeControl(directory, primary, nonce); receipt.generated = { ...built.generated, ...control.generated }; await checkpoint();
                const { NodePtyFactory } = require(built.adapter), nativePty = require('node-pty');
                const factory = new NodePtyFactory({ spawn: (executable, args, options) => { check(); const native = nativePty.spawn(executable, args, options); owned.producerPid = native.pid; return native; } });
                receipt.nativeExecuted = true;
                owned.pty = await factory.spawn({ executable: c.nativeExecutable, args: ['--session-id', primary.targetIdentity.claudeSessionId, '--plugin-dir', control.plugin, '--plugin-dir', built.product, '--permission-mode', 'default', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'], cwd: workspace, env: { ...environment, ...primary.environment }, importedRoots: [], skippedImportIds: [] });
                owned.pty.onExit(event => { owned.producerExited = true; owned.producerExit = { observed: true, atMs: stamp(), code: Number.isInteger(event.exitCode) ? event.exitCode : null, signal: event.signal === undefined ? null : 'other' }; if (!owned.teardown) fail('producer-lost'); });
                owned.pty.onData(data => discard(data, true));
            },
            read,
            killH1: async budget => {
                check(); const h = owned.h1; requireFact(alive(h) && !owned.producerExited, 'host-lost'); h.intentional = true;
                requireFact(h.child.kill(), 'exit-unobserved'); const until = performance.now() + budget;
                while (!h.exited && performance.now() < until) { check(); await sleep(5); }
                requireFact(h.exited && h.exit, 'exit-unobserved');
                return h.exit;
            },
            release: async () => { check(); requireFact(!released, 'early-effect'); released = true; await fs.writeFile(path.join(control.control, 'release'), '', { flag: 'wx' }); }
        };
        const observation = await observeLifetime(io, { nonce, profile: c.hostProfile, readDiagnostics });
        receipt.observation = { ...observation, synthetic: false, nativeExecuted: receipt.nativeExecuted };
        requireFact(validateObservation(receipt.observation), observation.reason === 'none' ? 'invalid-evidence' : observation.reason); check();
        // The same original raw read and pin/source evidence are checked while P and H2 live.
        await inspect(['--version']); await inspect(['auth', 'status']);
        const after = await livePrerequisites(c, gitOwned, directory); check();
        requireFact(equal(after.pins, before.pins) && equal(after.sources, before.sources) && after.sourceFingerprint === before.sourceFingerprint, 'identity-mismatch'); receipt.after = after.pins;
        const files = [[built.host, receipt.generated.hostSha256], [built.adapter, receipt.generated.adapterSha256], [path.join(control.plugin, 'hooks/control.js'), receipt.generated.pluginSha256], [path.join(control.plugin, '.claude-plugin/plugin.json'), receipt.generated.manifestSha256], [path.join(control.plugin, 'hooks/hooks.json'), receipt.generated.hooksSha256]];
        for (const [file, expected] of files) requireFact(await hashStableFile(file) === expected, 'identity-mismatch');
        for (const source of before.sources.filter(s => s.path.startsWith('media/attention/'))) requireFact(hash(await readStableBytes(path.join(built.product, source.path.slice('media/attention/'.length)))) === source.sha256, 'identity-mismatch');
        const { markerReadComplete, ...final } = await read(true); requireFact(markerReadComplete && validNative(final, nonce, 'returned') && !final.h1Alive); receipt.lifecycle.finalRead = final.file; finalNative = final;
        receipt.status = 'observed';
    } catch (error) { fail(error?.message); }
    finally {
        const settled = await shutdown();
        if (!settled) fail('teardown-unsettled');
        for (const item of inspectionOwner.inspections) if (!item.closed) item.stop();
        await Promise.all(inspectionOwner.inspections.map(item => item.finished));
        if (receipt) {
            receipt.inspections = F.inspectionEvidence(inspectionOwner);
            receipt.lifecycle.producer = owned.producerExit;
            receipt.lifecycle.h1 = owned.h1?.exit ?? null; receipt.lifecycle.h2 = owned.h2?.exit ?? null;
            receipt.lifecycle.hostCloses = !!owned.h1?.closed && !!owned.h2?.closed;
            receipt.lifecycle.teardown = settled ? 'owned-exits-observed' : 'unresolved';
            if (persistence.uncertain) fail('checkpoint-failed');
            if ([owned.h1, owned.h2].some(h => h?.client.uncertain) || gitOwned.some(i => !i.closed) || inspectionOwner.inspections.some(i => !i.closed)) fail('ipc-uncertain');
            // Observed exits do not imply SDK quiescence. Preserve all intents/storage forever here.
            if (primary && control && receipt.lifecycle.finalRead) {
                try {
                    const bytes = await readStableBytes(path.resolve(primary.target), 4096);
                    const raw = { file: { bytes: bytes.length, sha256: hash(bytes) } };
                    Object.assign(raw, (await readControlMarkers(control.control, 'read-back', readDiagnostics, stamp)).markers);
                    requireFact(validateReadBack(finalNative, raw));
                } catch { fail('invalid-evidence'); }
            }
            if (receipt.status === 'observed' && !validateActualNativeL(receipt)) fail('invalid-evidence');
            try { await checkpoint(); } catch { fail('checkpoint-failed'); }
        }
        clearTimeout(reserve); clearTimeout(hard);
    }
    if (!receipt) throw new Error(fault || 'identity-mismatch');
    return receipt;
}
/** Deterministic in-memory smoke checks only; no filesystem or actor is needed. */
async function selfTest() {
    requireFact(parseArguments([]).mode === 'plan' && parseArguments(['--force']) === undefined);
    requireFact(liveEnvironment({ CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' }).CLAUDE_CODE_USE_POWERSHELL_TOOL === '1');
    requireFact(!validateActualNativeL({ healthy: true }) && !validInventory({}));
    return { synthetic: true, nativeExecuted: false, tests: 3 };
}
/** The live branch is the sole route to config reads and actual actor construction. */
async function main(argv) {
    const args = parseArguments(argv); if (!args) return 2;
    if (args.mode === 'plan') { console.log('Trial L source preparation only. Separate review/approval required for --run-live --config ABSOLUTE_PATH. One Native producer, two hosts, ten additional bindings; 6000ms observed B1 budget, unchanged 7000ms Native guard, 2000ms IPC, 60s rendezvous, 5min total. L/E/installed/all63/admission remain pending.'); return 0; }
    if (args.mode === 'self-test') { console.log(JSON.stringify(await selfTest())); return 0; }
    const c = JSON.parse((await readStableBytes(args.config, 16384)).toString('utf8'));
    const receipt = await runLive(c);
    console.log('trial-l:' + receipt.status + ':' + receipt.reason);
    return validateActualNativeL(receipt) ? 0 : 1;
}
module.exports = { createReadDiagnostics, validateReadDiagnostics, readControlMarkers, parseArguments, liveEnvironment, validInventory, validReply, observeLifetime, validateObservation, validateActualNativeL, createHostClient, verifyPrerequisites, buildOwnedSources, writeControl, readStableBytes, hashStableFile, stopLifetime, selfTest, main, validatePrimary, validateReceiptEvidence, runLive, createOutputGuard, validateReadBack, createCheckpointGuard, checkpointThenStop };
if (require.main === module) {
    const args = process.argv.slice(2);
    const finish = code => { process.exitCode = code; if (parseArguments(args)?.mode === 'live') process.exit(code); };
    main(args).then(finish, () => { console.error('trial-l:unestablished'); finish(1); });
}
