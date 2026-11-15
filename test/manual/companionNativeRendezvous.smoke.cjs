/* eslint @typescript-eslint/no-require-imports: "off" -- Explicit source-only/manual native experiment. */
/* global require, module, __dirname, process, console, Buffer, setTimeout, clearTimeout, structuredClone, TextEncoder, TARGET, CONTROL, NONCE, DIAGNOSTIC */
const path = require('node:path');
/** Pure argument gate; native loading is reserved for the explicit live branch. */
function parseArguments(argv) {
    if (!argv.length || (argv.length === 1 && argv[0] === '--plan')) return { mode: 'plan' };
    if (argv.length === 1 && argv[0] === '--diagnostic-plan') return { mode: 'diagnostic-plan' };
    if (argv.length === 3 && argv[0] === '--run-diagnostic' && argv[1] === '--config' && path.isAbsolute(argv[2])) return { mode: 'diagnostic', config: argv[2] };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 3 && argv[0] === '--run-live' && argv[1] === '--config' && path.isAbsolute(argv[2])) return { mode: 'live', config: argv[2] };
    return undefined;
}
/** Default execution prints a plan only, without reading config or loading native adapters. */
async function main(argv) {
    const args = parseArguments(argv);
    if (!args) return 2;
    if (args.mode === 'diagnostic-plan') { console.log('Diagnostic preparation only: one 100ms hold, no retry/long hold; requires separate approval and --run-diagnostic --config ABSOLUTE_PATH. Writer return unattested; informational evidence only. Never a full Trial F/L/E/63-gate qualification.'); return 0; }
    if (args.mode === 'plan') { console.log('Trial F source preparation: sdk-dispatch-pending/pre-next; real execution requires separate approval and --run-live --config ABSOLUTE_PATH. L/E and all 63 qualification gates remain pending.'); return 0; }
    if (args.mode === 'self-test') { const result = await selfTest(); console.log(JSON.stringify({ synthetic: result.synthetic, nativeExecuted: result.nativeExecuted, tests: result.tests })); return 0; }
    const { readBoundedJson } = require('./companionNative.smoke.cjs');
    const config = await readBoundedJson(args.config, 16384);
    const until = performance.now() + 300000;
    const receipt = await runWithBudget(() => runLive(config, until, args.mode), 300000, () => {
        // Cleanup began ten seconds earlier; retain the last atomic checkpoint on a hard deadline.
        if (require.main === module) process.exit(1);
    });
    console.log((args.mode === 'diagnostic' ? 'trial-f-diagnostic:' : 'trial-f:') + receipt.status + ':' + receipt.reason);
    return (args.mode === 'diagnostic' ? validateDiagnosticReceipt(receipt) : validateReceipt(receipt)) ? 0 : 1;
}

const assert = require('node:assert/strict');
const DECLARATION_SHA256 = 'bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc';
const VERSION = '2.1.322';
const hashPattern = /^[a-f0-9]{64}$/;
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
/** Reject unknown config fields rather than accepting executable/environment overrides. */
function validateConfig(c) {
    assert.ok(closed(c, ['nativeExecutable', 'nativeSha256', 'declarationPath', 'declarationSha256', 'nativeVersion', 'sourceSha', 'ownedParent', 'hostProfile']), 'config');
    for (const key of ['nativeExecutable', 'declarationPath', 'ownedParent']) assert.ok(typeof c[key] === 'string' && /^[A-Za-z]:[\\/]/.test(c[key]) && !/[\0\r\n]/.test(c[key]) && !c[key].slice(2).includes(':'), 'absolute-local-path');
    assert.equal(c.declarationSha256, DECLARATION_SHA256, 'declaration-hash');
    assert.equal(c.nativeVersion, VERSION, 'native-version');
    assert.match(c.nativeSha256, hashPattern); assert.match(c.sourceSha, /^[a-f0-9]{40}$/);
    const p = c.hostProfile;
    assert.ok(closed(p, ['platform', 'arch', 'node', 'uv', 'electron']) && p.platform === 'win32' && p.arch === 'x64' && p.electron === null, 'profile');
    for (const key of ['node', 'uv']) assert.ok(typeof p[key] === 'string' && /^\d+\.\d+\.\d+$/.test(p[key]) && p[key].length < 64, 'profile-version');
    return c;
}

/** Pure closed diagnostic vocabulary, shared by emitted code and the controller validator. */
function diagnosticShape() {
    return { stages: ['startup', 'id', 'version', 'env-dir', 'env-token', 'env-session', 'env-claude', 'env-generation', 'root-stat', 'control-read', 'list', 'write', 'unmatched-write', 'target-candidate'],
        checks: ['originMatch', 'pathExact', 'pathSlash', 'targetBasename', 'pluginMatch', 'userTierMatch', 'valid', 'equals', 'kindDir', 'isLink', 'realExact', 'realSlash', 'realCase', 'parsed', 'schema', 'dirEqual', 'tokenEqual', 'sessionEqual', 'claudeEqual', 'generationEqual', 'nativeEqual'],
        tiers: ['prepend', 'user', 'append', 'builtin', 'core'], outcomes: ['caught', 'expired', 'kept', 'passed', 'rejected', 'returned', 'skipped'] };
}
/** Native-only first-stage observations. All asynchronous work stays inside the invoking event frame. */
function createNativeDiagnostic() {
    const shape = diagnosticShape(), seen = new Set(), values = {};
    const began = performance.now(); let sequence = 0, attemptedBytes = 0, unverified = false, nativeId;
    const root = TARGET.slice(0, TARGET.lastIndexOf('/'));
    const env = { CLAUDE_WORKSPACES_CAPTURE_DIR: 'env-dir', CLAUDE_WORKSPACES_CAPTURE_TOKEN: 'env-token', CLAUDE_WORKSPACES_CAPTURE_SESSION_ID: 'env-session', CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID: 'env-claude', CLAUDE_WORKSPACES_CAPTURE_GENERATION: 'env-generation' };
    const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
    const bounded = (v, limit) => typeof v === 'string' && v.length > 0 && v.length <= limit && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v) && new TextEncoder().encode(v).length <= limit;
    const spelling = v => typeof v === 'string' ? v.replace(/\\/g, '/').replace(/\/$/, '') : null;
    const product = next => next.origin.plugin === 'workspaces-attention' && next.origin.tier === 'user';
    const checks = () => Object.fromEntries(shape.checks.map(key => [key, null]));
    const basename = v => typeof v === 'string' ? v.split(/[\\/]/).at(-1) : null;
    const targetName = basename(TARGET);
    // TraceEntry is flat (pinned declaration 14799-14851): never visit received/returned or arbitrary nested data.
    const traceSummary = (trace, stage) => {
        const out = { present: false, count: 0, visited: 0, truncated: false, unverified: false, links: [] };
        if (!Array.isArray(trace)) { out.unverified = true; return out; }
        const event = stage === 'startup' ? 'session.start' : 'fs.write';
        const plugin = stage === 'startup' ? 'workspaces-attention' : 'engine';
        for (let i = 0; i < Math.min(trace.length, 64); i++) {
            out.visited++; const link = trace[i];
            if (!link || typeof link !== 'object') { out.unverified = true; continue; }
            if (link.plugin !== plugin || link.event !== event) continue;
            out.present = true; out.count++;
            if (out.links.length === 8) { out.truncated = true; continue; }
            const tier = shape.tiers.includes(link.tier) ? link.tier : 'unverified';
            const outcome = shape.outcomes.includes(link.outcome) ? link.outcome : 'unverified';
            if (tier === 'unverified' || outcome === 'unverified') out.unverified = true;
            out.links.push({ tier, outcome });
        }
        out.truncated ||= trace.length > 64;
        return out;
    };
    const validation = (stage, e, result) => {
        const out = checks(), v = result && typeof result === 'object' && Object.hasOwn(result, 'value') ? result.value : undefined;
        out.valid = false;
        if (stage === 'id') { out.valid = uuid(v); if (out.valid) nativeId = v; }
        else if (stage === 'version') out.valid = v?.base === '2.1.322' && v?.version === '2.1.322';
        else if (stage.startsWith('env-')) {
            out.valid = stage === 'env-dir' ? bounded(v, 4096) && !v.includes('\0') && (/^[A-Za-z]:[\\/]/.test(v) || v.startsWith('/')) :
                stage === 'env-token' ? typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) : stage === 'env-claude' ? uuid(v) : bounded(v, 128);
            if (out.valid) values[stage] = v;
            if (stage === 'env-dir') out.equals = v === root;
        } else if (stage === 'root-stat') {
            out.kindDir = v?.kind === 'dir'; out.isLink = typeof v?.isLink === 'boolean' ? v.isLink : null;
            out.realExact = v?.realPath === root; out.realSlash = spelling(v?.realPath) === spelling(root);
            out.realCase = typeof v?.realPath === 'string' && spelling(v.realPath).toLowerCase() === spelling(root).toLowerCase();
            out.valid = out.kindDir && out.isLink === false && out.realSlash;
        } else if (stage === 'control-read') {
            out.valid = bounded(v, 4096); out.parsed = false; out.schema = false;
            if (out.valid && e.path === root + '/control.json') {
                let c; try { c = JSON.parse(v); out.parsed = true; } catch { return out; }
                const keys = ['v', 'token', 'sessionId', 'claudeSessionId', 'generation', 'kind', 'controlRevision', 'state', 'offerId', 'captureEpoch', 'grantId', 'predecessorEpoch', 'reasonCode', 'recoveriesRemaining', 'lastRetired'];
                out.schema = c !== null && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === keys.length && keys.every(k => Object.hasOwn(c, k)) &&
                    c.v === 1 && c.kind === 'control' && Number.isSafeInteger(c.controlRevision) && c.controlRevision >= 1 && c.state === 'offered' &&
                    typeof c.offerId === 'string' && /^[a-f0-9]{32}$/.test(c.offerId) && c.captureEpoch === null && c.grantId === null && c.predecessorEpoch === null && c.reasonCode === null && c.lastRetired === null && [0, 1].includes(c.recoveriesRemaining);
                out.dirEqual = values['env-dir'] === root; out.tokenEqual = typeof values['env-token'] === 'string' && c?.token === values['env-token'];
                out.sessionEqual = typeof values['env-session'] === 'string' && c?.sessionId === values['env-session'];
                out.claudeEqual = typeof values['env-claude'] === 'string' && c?.claudeSessionId === values['env-claude'];
                out.generationEqual = typeof values['env-generation'] === 'string' && c?.generation === values['env-generation'];
                out.nativeEqual = typeof nativeId === 'string' && c?.claudeSessionId === nativeId;
            }
        } else if (stage === 'list') out.valid = Array.isArray(v) && v.length <= 256;
        else if (stage === 'write' || stage === 'unmatched-write' || stage === 'target-candidate') out.valid = result !== null && typeof result === 'object' && Object.hasOwn(result, 'value');
        else out.valid = true;
        return out;
    };
    const checkpoint = async (write, stage, phase, detail, trace, metadata) => {
        const seq = ++sequence;
        try {
            if (seq > 28) { unverified = true; return; }
            const atMs = Math.max(0, Math.min(300000, Math.floor(performance.now() - began)));
            // Snapshot prior known failures only; this checkpoint's final SDK return is not yet observable.
            const record = { nonce: NONCE, seq, stage, phase, atMs, unverified, checks: detail, trace, ...metadata };
            const text = JSON.stringify(record), bytes = new TextEncoder().encode(text);
            if (bytes.length > 1536) { unverified = true; return; }
            const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
            const done = JSON.stringify({ nonce: NONCE, seq, bytes: bytes.length, sha256 });
            attemptedBytes += bytes.length + new TextEncoder().encode(done).length;
            if (attemptedBytes > 65536) { unverified = true; return; }
            await write(CONTROL + '/diagnostic.' + seq + '.json', text);
            // A separate, last-written digest marker prevents an in-progress data write becoming evidence.
            await write(CONTROL + '/diagnostic.' + seq + '.done.json', done);
        } catch { unverified = true; }
    };
    return {
        stage(event, e, next) {
            if (event === 'env.get') return product(next) && Object.hasOwn(env, e.name) ? env[e.name] : null;
            if (event === 'fs.write') {
                if (typeof e.path === 'string' && e.path.startsWith(CONTROL + '/')) return null;
                const candidate = basename(e.path) === targetName;
                let stage = 'unmatched-write';
                try { if (e.path === TARGET && product(next)) stage = 'write'; } catch { unverified = true; }
                return candidate ? ['target-candidate', stage] : stage;
            }
            return product(next) ? ({ 'session.id': 'id', 'session.version': 'version', 'fs.stat': 'root-stat', 'fs.read': 'control-read', 'fs.list': 'list' })[event] : null;
        },
        async observe(stage, e, next, write, original = () => next(e)) {
            // Nest observations around the same original operation, never around next or its origin.
            if (Array.isArray(stage)) return this.observe(stage[0], e, next, write, () => this.observe(stage[1], e, next, write, original));
            if (!stage || seen.has(stage)) return original();
            seen.add(stage);
            const initial = checks(), metadata = { observedTier: 'not-observed', filterDecision: 'unverified' };
            try {
                if (['root-stat', 'list', 'control-read', 'write', 'unmatched-write', 'target-candidate'].includes(stage)) initial.pathExact = e.path === (stage === 'control-read' ? root + '/control.json' : ['write', 'unmatched-write', 'target-candidate'].includes(stage) ? TARGET : root);
                if (stage === 'target-candidate') {
                    initial.pathSlash = spelling(e.path) === spelling(TARGET);
                    initial.targetBasename = basename(e.path) === targetName;
                    initial.pluginMatch = next.origin.plugin === 'workspaces-attention';
                    initial.userTierMatch = next.origin.tier === 'user';
                    metadata.observedTier = shape.tiers.includes(next.origin.tier) ? next.origin.tier : 'unrecognized';
                    metadata.filterDecision = initial.pathExact && initial.pluginMatch && initial.userTierMatch ? 'filter-match' : 'filter-fallthrough';
                    initial.originMatch = initial.pluginMatch && initial.userTierMatch;
                } else initial.originMatch = product(next);
            } catch { unverified = true; }
            // Start next independently of diagnostic storage; await both within this event frame.
            const entering = checkpoint(write, stage, 'entered', initial, null, metadata);
            let result;
            try { result = await original(); }
            catch (error) {
                await entering;
                let trace = null; try { if (['startup', 'write', 'unmatched-write'].includes(stage)) trace = traceSummary(next.trace, stage); } catch { unverified = true; }
                await checkpoint(write, stage, 'rejected', initial, trace, metadata); throw error;
            }
            await entering;
            let detail = initial, trace = null;
            try {
                detail = { ...validation(stage, e, result), originMatch: initial.originMatch, pathExact: initial.pathExact, pathSlash: initial.pathSlash, targetBasename: initial.targetBasename, pluginMatch: initial.pluginMatch, userTierMatch: initial.userTierMatch };
                if (['startup', 'write', 'unmatched-write'].includes(stage)) trace = traceSummary(next.trace, stage);
            } catch { unverified = true; }
            await checkpoint(write, stage, 'returned', detail, trace, metadata);
            return result;
        }
    };
}
/** Closed checkpoint schema; no unknown SDK field can enter the retained receipt. */
function validDiagnosticEvent(v, nonce) {
    const shape = diagnosticShape();
    if (!closed(v, ['nonce', 'seq', 'stage', 'phase', 'atMs', 'unverified', 'checks', 'trace', 'observedTier', 'filterDecision']) || v.nonce !== nonce || !Number.isInteger(v.seq) || v.seq < 1 || v.seq > 28 ||
        !shape.stages.includes(v.stage) || !['entered', 'returned', 'rejected'].includes(v.phase) || !Number.isInteger(v.atMs) || v.atMs < 0 || v.atMs > 300000 || typeof v.unverified !== 'boolean' ||
        ![...shape.tiers, 'unrecognized', 'not-observed'].includes(v.observedTier) || !['filter-match', 'filter-fallthrough', 'unverified'].includes(v.filterDecision) ||
        !closed(v.checks, shape.checks) || !Object.values(v.checks).every(x => x === null || typeof x === 'boolean')) return false;
    const t = v.trace;
    return t === null || closed(t, ['present', 'count', 'visited', 'truncated', 'unverified', 'links']) &&
        ['present', 'truncated', 'unverified'].every(k => typeof t[k] === 'boolean') && Number.isInteger(t.count) && t.count >= 0 && t.count <= 64 &&
        Number.isInteger(t.visited) && t.visited >= t.count && t.visited <= 64 && Array.isArray(t.links) && t.links.length <= Math.min(t.count, 8) &&
        t.links.every(link => closed(link, ['tier', 'outcome']) && [...shape.tiers, 'unverified'].includes(link.tier) && [...shape.outcomes, 'unverified'].includes(link.outcome));
}

/** Read exact bounded bytes from one stable regular file handle; never retain them in a receipt. */
async function readDiagnosticBytes(file, limit) {
    assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 1536, 'invalid-evidence');
    const before = await fs.lstat(file);
    const regular = stat => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= limit;
    const same = stat => regular(stat) && ['ino', 'dev', 'size', 'mtimeMs', 'ctimeMs'].every(key => stat[key] === before[key]);
    assert.ok(regular(before), 'invalid-evidence');
    const handle = await fs.open(file, 'r');
    try {
        assert.ok(same(await handle.stat()), 'invalid-evidence');
        const bytes = Buffer.alloc(limit + 1); let count = 0;
        while (count < bytes.length) {
            const read = await handle.read(bytes, count, bytes.length - count, null);
            if (!read.bytesRead) break;
            count += read.bytesRead;
        }
        assert.ok(count <= limit && count === before.size && same(await handle.stat()) && same(await fs.lstat(file)), 'invalid-evidence');
        return bytes.subarray(0, count);
    } finally { await handle.close(); }
}

/** Collect raw-byte-committed observations; file integrity never attests the SDK writer return. */
async function collectDiagnostic(read, nonce) {
    const events = []; let missing = false, invalid = false, truncated = false, bytes = 0;
    for (let seq = 1; seq <= 28; seq++) {
        try {
            const marker = await read('diagnostic.' + seq + '.done.json', 256);
            const data = await read('diagnostic.' + seq + '.json', 1536);
            if (marker === null && data === null) continue;
            if (marker === null || data === null) { missing = true; continue; }
            if (!Buffer.isBuffer(marker) || !Buffer.isBuffer(data) || marker.length > 256 || data.length > 1536) { invalid = true; continue; }
            bytes += marker.length + data.length;
            const done = JSON.parse(marker.toString('utf8'));
            if (bytes > 65536 || !closed(done, ['nonce', 'seq', 'bytes', 'sha256']) || done.nonce !== nonce || done.seq !== seq ||
                !Number.isInteger(done.bytes) || done.bytes < 1 || done.bytes > 1536 || !hashPattern.test(done.sha256) ||
                data.length !== done.bytes || hash(data) !== done.sha256) { invalid = true; continue; }
            // Parse only after verifying the original bytes, never a JSON reserialization.
            const event = JSON.parse(data.toString('utf8'));
            if (!validDiagnosticEvent(event, nonce) || event.seq !== seq) { invalid = true; continue; }
            events.push(event); truncated ||= event.trace?.truncated === true;
        } catch { invalid = true; }
    }
    const counts = diagnosticShape().stages.map(stage => ({ stage, entered: 0, returned: 0, rejected: 0 }));
    let last = -1;
    for (const [index, event] of events.entries()) {
        if (event.seq !== index + 1 || event.atMs < last) missing = true;
        last = event.atMs;
        const count = counts.find(item => item.stage === event.stage);
        if (event.phase === 'entered' ? count.entered !== 0 : count.entered !== 1 || count.returned + count.rejected !== 0) invalid = true;
        count[event.phase]++;
    }
    if (!events.length || counts.some(item => item.entered !== item.returned + item.rejected)) missing = true;
    const unverified = missing || invalid || truncated || events.some(e => e.unverified || e.trace?.unverified);
    // A stored final marker and a stored-then-rejected write are indistinguishable here.
    return { status: 'unverified', integrity: unverified ? 'unverified' : 'verified', writerOutcome: 'unattested', missing, invalid, truncated, events, counts };
}
/** Independently reject malformed/over-budget diagnostic evidence, including unknown nested fields. */
function validDiagnosticEvidence(d, nonce) {
    try {
        if (!closed(d, ['status', 'integrity', 'writerOutcome', 'missing', 'invalid', 'truncated', 'events', 'counts']) || d.status !== 'unverified' || d.writerOutcome !== 'unattested' ||
            !['missing', 'invalid', 'truncated'].every(k => typeof d[k] === 'boolean') || !Array.isArray(d.events) || d.events.length > 28 ||
            !d.events.every(e => validDiagnosticEvent(e, nonce)) || Buffer.byteLength(JSON.stringify(d)) > 65536 ||
            !Array.isArray(d.counts) || d.counts.length !== diagnosticShape().stages.length) return false;
        let last = -1;
        const counts = diagnosticShape().stages.map(stage => ({ stage, entered: 0, returned: 0, rejected: 0 }));
        for (const [i, e] of d.events.entries()) {
            if (e.seq !== i + 1 || e.atMs < last) return false;
            last = e.atMs; const row = counts.find(item => item.stage === e.stage);
            if (e.phase === 'entered' ? row.entered !== 0 : row.entered !== 1 || row.returned + row.rejected !== 0) return false;
            row[e.phase]++;
        }
        if (!d.counts.every((row, i) => closed(row, ['stage', 'entered', 'returned', 'rejected']) && Object.keys(counts[i]).every(k => row[k] === counts[i][k]))) return false;
        const complete = d.events.length > 0 && !d.missing && !d.invalid && !d.truncated && !d.events.some(e => e.unverified || e.trace?.unverified || e.trace?.truncated) && counts.every(row => row.entered === row.returned + row.rejected);
        return d.integrity === (complete ? 'verified' : 'unverified');
    } catch { return false; }
}
/** Snapshot the first observation result before strict final reads can add lifecycle disqualifications. */
function diagnosticObservationEnd(observation, atMs, file) {
    const valid = closed(file, ['bytes', 'sha256']) && Number.isInteger(file.bytes) && file.bytes >= 0 && file.bytes <= 4096 && typeof file.sha256 === 'string' && hashPattern.test(file.sha256);
    return { atMs: Math.max(0, Math.min(300000, Math.floor(atMs))), phase: observation.events.at(-1)?.stage ?? 'awaiting-entry', status: observation.status, reason: observation.reason,
        filePresent: file === null ? false : valid ? true : null, fileBytes: valid ? file.bytes : null, fileSha256: valid ? file.sha256 : null };
}
/** Preserve only bounded classifications from already-owned exit callbacks, never cleanup authority. */
function diagnosticExit(code, signal, atMs) {
    return { observed: true, atMs: Math.max(0, Math.min(300000, Math.floor(atMs))), code: Number.isInteger(code) ? code === 0 ? 'zero' : 'nonzero' : 'unknown',
        signal: signal === undefined || signal === null || signal === 0 ? 'none' : signal === 'SIGTERM' ? 'term' : signal === 'SIGKILL' ? 'kill' : typeof signal === 'number' ? 'numeric' : 'other' };
}
/** The diagnostic receipt adds only closed observation/exit metadata and sanitized native checkpoints. */
function validDiagnosticRecord(d, observation) {
    if (!closed(d, ['observationEnd', 'exits', 'native']) || !closed(d.observationEnd, ['atMs', 'phase', 'status', 'reason', 'filePresent', 'fileBytes', 'fileSha256']) ||
        !Number.isInteger(d.observationEnd.atMs) || d.observationEnd.atMs < 0 || d.observationEnd.atMs > 300000 ||
        !['awaiting-entry', 'entry', 'pending-alive-absent', 'release', 'forward', 'file-created', 'dispatch-returned'].includes(d.observationEnd.phase) ||
        d.observationEnd.status !== observation.status || d.observationEnd.reason !== observation.reason || !closed(d.exits, ['producer', 'host'])) return false;
    const end = d.observationEnd;
    if (end.filePresent === true ? !Number.isInteger(end.fileBytes) || end.fileBytes < 0 || end.fileBytes > 4096 || typeof end.fileSha256 !== 'string' || !hashPattern.test(end.fileSha256) :
        ![false, null].includes(end.filePresent) || end.fileBytes !== null || end.fileSha256 !== null) return false;
    for (const exit of Object.values(d.exits)) if (!closed(exit, ['observed', 'atMs', 'code', 'signal']) || exit.observed !== true ||
        !Number.isInteger(exit.atMs) || exit.atMs < 0 || exit.atMs > 300000 || !['zero', 'nonzero', 'unknown'].includes(exit.code) || !['none', 'term', 'kill', 'numeric', 'other'].includes(exit.signal)) return false;
    if (!validDiagnosticEvidence(d.native, observation.nonce) || d.native.integrity !== 'verified') return false;
    for (const count of d.native.counts.filter(item => item.stage !== 'unmatched-write')) {
        if (count.entered !== 1 || count.returned !== 1 || count.rejected !== 0) return false;
        const event = d.native.events.find(item => item.stage === count.stage && item.phase === 'returned');
        if (event.checks.valid !== true || !['startup', 'target-candidate'].includes(count.stage) && event.checks.originMatch !== true) return false;
        if (count.stage === 'target-candidate' && (event.checks.targetBasename !== true || event.filterDecision === 'unverified' || event.observedTier === 'not-observed')) return false;
        if (['root-stat', 'control-read', 'list', 'write'].includes(count.stage) && event.checks.pathExact !== true) return false;
        if (count.stage === 'control-read' && !['parsed', 'schema', 'dirEqual', 'tokenEqual', 'sessionEqual', 'claudeEqual', 'generationEqual', 'nativeEqual'].every(key => event.checks[key] === true)) return false;
        if (['startup', 'write'].includes(count.stage) && (!event.trace?.present || !event.trace.links.length ||
            event.trace.links.some(link => link.tier !== (count.stage === 'startup' ? 'user' : 'core') || !['returned', 'passed'].includes(link.outcome)))) return false;
    }
    return true;
}

/** The explicit diagnostic scope cannot select the long hold or an automatic retry. */
function trialHolds(mode) {
    assert.ok(['live', 'diagnostic'].includes(mode), 'mode');
    return mode === 'diagnostic' ? [100] : [100, 3000];
}

/** Emitted native code uses only declared web globals and literal SDK methods. Never called in Node. */
function register(on) {
    let held = false;
    const diagnostic = DIAGNOSTIC ? createNativeDiagnostic() : null;
    if (diagnostic) {
        on('session.id', ($, e, next) => diagnostic.observe(diagnostic.stage('session.id', e, next), e, next, (p, text) => $.fs.write(p, text)));
        on('session.version', ($, e, next) => diagnostic.observe(diagnostic.stage('session.version', e, next), e, next, (p, text) => $.fs.write(p, text)));
        on('env.get', ($, e, next) => diagnostic.observe(diagnostic.stage('env.get', e, next), e, next, (p, text) => $.fs.write(p, text)));
        on('fs.stat', ($, e, next) => diagnostic.observe(diagnostic.stage('fs.stat', e, next), e, next, (p, text) => $.fs.write(p, text)));
        on('fs.read', ($, e, next) => diagnostic.observe(diagnostic.stage('fs.read', e, next), e, next, (p, text) => $.fs.write(p, text)));
        on('fs.list', ($, e, next) => diagnostic.observe(diagnostic.stage('fs.list', e, next), e, next, (p, text) => $.fs.write(p, text)));
    }
    on('session.start', async ($, e, next) => {
        const version = await $.session.version();
        const turns = await $.session.turns();
        await $.fs.write(CONTROL + '/started.json', JSON.stringify({ nonce: NONCE, version: version.base === '2.1.322' && version.version === '2.1.322' ? '2.1.322' : 'unsupported', turns: turns === 0 ? 0 : 1 }));
        return diagnostic ? diagnostic.observe('startup', e, next, (p, text) => $.fs.write(p, text)) : next(e);
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
        const intercept = async () => {
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
        };
        return diagnostic ? diagnostic.observe(diagnostic.stage('fs.write', e, next), e, next, (p, text) => $.fs.write(p, text), intercept) : intercept();
    }).catch(async ($, e, next) => {
        // Do not replay next: failed hooks can otherwise be skipped by the engine.
        try { await $.fs.write(CONTROL + '/failed.json', JSON.stringify({ nonce: NONCE, reason: next.signal.aborted ? 'abandoned' : 'hook-failed' })); } catch { /* Controller detects absent/early effects. */ }
        return { deny: 'trial-f-hook-failed' };
    });
}
/** Generate all native plugin code from this committed module. */
function createControlPluginSource({ target, control, nonce, diagnostic = false }) {
    assert.ok(typeof target === 'string' && typeof control === 'string' && /^[a-f0-9]{32}$/.test(nonce));
    assert.equal(typeof diagnostic, 'boolean');
    return 'const DIAGNOSTIC=' + diagnostic + ';\n' + (diagnostic ? diagnosticShape.toString() + '\n' + createNativeDiagnostic.toString() + '\n' : '') + 'const TARGET=' + JSON.stringify(target) + ',CONTROL=' + JSON.stringify(control) + ',NONCE=' + JSON.stringify(nonce) + ';\nexport ' + register.toString();
}


const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const repo = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reasons = ['none', 'rendezvous-timeout', 'producer-lost', 'host-lost', 'unexpected-activity', 'early-file', 'early-forward', 'abandoned', 'hook-failed', 'invalid-evidence', 'dispatch-rejected', 'file-mismatch', 'checkpoint-failed', 'io-failed', 'identity-mismatch', 'auth-unverified', 'startup-interaction', 'output-limit', 'teardown-unsettled', 'controller-deadline', 'inspection-unresolved', 'inspection-timeout', 'inspection-output-limit', 'inspection-error', 'inspection-exit-failed'];
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

/** Latch every allowed disqualification until the owned producer lifetime has finished. */
function createTrialGuard(onReject = () => {}) {
    const state = { status: 'pending', finalRead: 'pending', disqualifications: [] };
    return { state, reject(reason) {
        const safe = reasons.includes(reason) && reason !== 'none' ? reason : 'invalid-evidence';
        if (!state.disqualifications.includes(safe)) state.disqualifications.push(safe);
        state.status = 'disqualified'; onReject(safe);
    } };
}
/** Reconcile only bounded native acknowledgments, never payload/path/account text. */
function lifecycleReason(s, observation, final) {
    const nonce = observation.nonce;
    if (s.unexpected) return closed(s.unexpected, ['nonce', 'reason']) && s.unexpected.nonce === nonce && s.unexpected.reason === 'unexpected-activity' ? 'unexpected-activity' : 'invalid-evidence';
    if (s.failed) return closed(s.failed, ['nonce', 'reason']) && s.failed.nonce === nonce && ['abandoned', 'hook-failed'].includes(s.failed.reason) ? s.failed.reason : 'invalid-evidence';
    if (s.rejected) return closed(s.rejected, ['nonce', 'dispatch', 'forwardCount']) && s.rejected.nonce === nonce && s.rejected.dispatch === 'rejected' && s.rejected.forwardCount === 1 ? 'dispatch-rejected' : 'invalid-evidence';
    if (!final) return undefined;
    if (!closed(s.started, ['nonce', 'version', 'turns']) || s.started.nonce !== nonce || s.started.version !== VERSION || s.started.turns !== 0 ||
        !validEntry(s.entry, nonce) || s.entry.bytes !== observation.bytes || s.entry.sha256 !== observation.originalSha256 ||
        !closed(s.forward, ['nonce', 'forwardCount']) || s.forward.nonce !== nonce || s.forward.forwardCount !== 1 ||
        !closed(s.returned, ['nonce', 'dispatch', 'forwardCount', 'coreCalls']) || s.returned.nonce !== nonce || s.returned.dispatch !== 'returned' || s.returned.forwardCount !== 1 || s.returned.coreCalls !== 1 ||
        !closed(s.file, ['bytes', 'sha256']) || s.file.bytes !== observation.bytes || s.file.sha256 !== observation.originalSha256) return 'invalid-evidence';
    return undefined;
}
/** Continue monitoring after dispatch observation, through verification, observed exits and final checkpoint. */
async function finalizeTrial(record, guard, ops) {
    record.lifecycle = guard.state;
    const originalFailure = ['failed', 'unestablished'].includes(record.observation.status);
    let monitoring = true, timer, scanChain = Promise.resolve(), settled = false;
    const scan = final => {
        scanChain = scanChain.then(async () => {
            try {
                const status = await runWithBudget(() => ops.readStatus(final), 1000, () => {});
                const reason = lifecycleReason(status, record.observation, final);
                if (reason) guard.reject(reason);
                if (final) guard.state.finalRead = reason ? 'failed' : 'verified';
            } catch { guard.reject('invalid-evidence'); if (final) guard.state.finalRead = 'failed'; }
        });
        return scanChain;
    };
    const poll = () => { void scan(false).finally(() => { if (monitoring) timer = setTimeout(poll, 20); }); };
    poll();
    try { await ops.verify(); }
    catch (error) { guard.reject(reasons.includes(error?.message) ? error.message : 'identity-mismatch'); }
    finally {
        try { settled = await ops.stop(); } catch { settled = false; }
        if (!settled) guard.reject('teardown-unsettled');
        monitoring = false; clearTimeout(timer);
        await scan(true);
    }
    const apply = () => {
        if (!validateTrial(record.observation) && !guard.state.disqualifications.length) guard.reject(record.observation.reason);
        if (guard.state.disqualifications.length) {
            if (!originalFailure) { record.observation.status = 'unestablished'; record.observation.reason = guard.state.disqualifications[0]; }
        } else if (settled && guard.state.finalRead === 'verified') guard.state.status = 'verified';
    };
    apply();
    try { await ops.checkpoint(); } catch { guard.reject('checkpoint-failed'); }
    // Output callbacks can run while the atomic checkpoint is in flight. Their latched failure wins.
    if (guard.state.disqualifications.length) {
        apply(); try { await ops.checkpoint(); } catch { guard.reject('checkpoint-failed'); apply(); }
    }
    return guard.state.status === 'verified' && validateTrial(record.observation);
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
async function inspectCli(executable, argv, cwd, env, owner = { inspections: [] }) {
    if (owner.inspections.some(item => !item.closed || item.reason !== 'none')) throw new Error('inspection-unresolved');
    const child = require('node:child_process').spawn(executable, argv, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const record = { child, kind: argv[0] === '--version' ? 'version' : 'auth', closed: false,
        reason: 'none', termination: 'not-requested', code: null };
    owner.inspections.push(record);
    record.finished = new Promise(resolve => {
        let output = '', bytes = 0, settled = false, timer, closeTimer;
        const finish = () => {
            if (settled) return; settled = true; clearTimeout(timer); clearTimeout(closeTimer);
            const result = { code: record.closed && record.reason === 'none' ? record.code : null,
                output: record.closed && record.reason === 'none' && record.code === 0 ? output : '',
                exitObserved: record.closed, reason: record.reason, termination: record.termination };
            output = ''; resolve(result);
        };
        record.stop = (reason = 'controller-deadline') => {
            if (record.closed || record.termination !== 'not-requested') return;
            record.reason = reason; record.termination = 'requested'; output = ''; clearTimeout(timer);
            // Start the bounded close wait before signaling: even a synchronous synthetic close is observed.
            closeTimer = setTimeout(finish, 1000);
            try { if (!child.kill()) record.termination = 'request-failed'; }
            catch { record.termination = 'request-failed'; }
        };
        timer = setTimeout(() => record.stop('inspection-timeout'), 10000);
        const consume = (chunk, stdout) => {
            if (settled || record.closed || record.reason !== 'none') return;
            bytes += chunk.length;
            if (bytes > 65536) record.stop('inspection-output-limit');
            else if (stdout) output += chunk.toString();
        };
        child.stdout.on('data', chunk => consume(chunk, true)); child.stderr.on('data', chunk => consume(chunk, false));
        child.once('error', () => record.stop('inspection-error'));
        child.once('close', code => {
            record.closed = true; record.code = Number.isInteger(code) ? code : null;
            if (record.reason === 'none' && code !== 0) record.reason = 'inspection-exit-failed';
            finish();
        });
    });
    return record.finished;
}
/** Project retained owned handles to bounded enum-only receipt evidence; stdout never enters it. */
function inspectionEvidence(owner) {
    return owner.inspections.map(item => ({ kind: item.kind, close: item.closed ? 'observed' : 'unobserved',
        termination: item.termination, reason: item.reason,
        exit: !item.closed ? 'unobserved' : item.code === 0 ? 'zero' : 'nonzero' }));
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
        // This exact shell-tool preference does not select an auth/provider source.
        if (key.toLowerCase() === 'claude_code_use_powershell_tool') continue;
        if (value && (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CONFIG_DIR)$/i.test(key) || /^CLAUDE_CODE_USE_/i.test(key))) throw new Error('auth-unverified');
    }
    return { ...inherited, DISABLE_AUTOUPDATER: '1' };
}
/** Launch only after the explicit mode gate, pinned identity check, fresh ownership and read-only auth check. */
async function runLive(config, deadlineAt = performance.now() + 300000, mode = 'live') {
    const holds = trialHolds(mode), diagnostic = mode === 'diagnostic';
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
    const receipt = { format: diagnostic ? 'native-trial-f-diagnostic-v2' : 'native-trial-f-v1', status: 'pending', reason: 'none', sourceSha: c.sourceSha,
        sourceFingerprint: hash(git(['ls-files', '--stage', '-z'])), before, after: null, runtime: profile,
        authentication: 'unverified', version: 'unverified',
        injections: ['development-product-copy', 'independent-controller-owned-pty', 'qualification-profile', 'host-protocol-autoPoll-false', 'control-plugin-first', 'auto-updater-disabled'],
        evidenceLevel: 'sdk-dispatch-pending/pre-next', productionAdmission: false, qualificationGates: 'all-63-pending',
        lifetimeTrials: 'L/E-pending', cleanup: 'storage-and-intents-preserved', sources: [], trials: [], teardown: [], inspections: [] };
    let active = {}, expired = false;
    const inspectionOwner = { inspections: [] };
    // Reserve ten seconds within the five-minute cap for bounded teardown and final checkpoint.
    const controllerUntil = deadlineAt;
    const deadline = setTimeout(() => { expired = true; for (const item of inspectionOwner.inspections) item.stop(); void stopOwned(active); }, Math.max(0, controllerUntil - performance.now() - 10000));
    const check = () => {
        if (expired || performance.now() >= controllerUntil - 10000) throw new Error('controller-deadline');
        if (['failed', 'unestablished'].includes(receipt.status)) throw new Error(receipt.reason);
        const invalid = receipt.trials.find(item => item.lifecycle?.status === 'disqualified');
        if (invalid) throw new Error(invalid.lifecycle.disqualifications[0] ?? 'invalid-evidence');
    };
    const fail = (reason, status = 'failed') => { receipt.status = status; receipt.reason = reasons.includes(reason) ? reason : 'io-failed'; };
    const inspect = async (argv, cwd) => {
        check();
        const result = await inspectCli(c.nativeExecutable, argv, cwd, environment, inspectionOwner);
        receipt.inspections = inspectionEvidence(inspectionOwner); await save(receipt);
        if (!result.exitObserved) throw new Error('inspection-unresolved');
        if (result.reason !== 'none') throw new Error(result.reason);
        return result;
    };
    try {
        await save(receipt);
        // The same cwd and inherited auth environment are used for both inspection and the no-prompt PTY.
        const authWorkspace = path.join(directory, 'identity-workspace'); await fs.mkdir(authWorkspace);
        check();
        const version = await inspect(['--version'], authWorkspace); check();
        if (version.code !== 0 || !/^2\.1\.322(?: \(Claude Code\))?\s*$/.test(version.output)) throw new Error('identity-mismatch');
        receipt.version = VERSION;
        check();
        const auth = await inspect(['auth', 'status'], authWorkspace); check();
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
        for (const holdMs of holds) {
            check();
            const trialRoot = await fs.mkdtemp(path.join(directory, 'trial-'));
            const workspace = path.join(trialRoot, 'workspace'), capture = path.join(trialRoot, 'capture'), control = path.join(trialRoot, 'control');
            for (const dir of [workspace, capture, control]) await fs.mkdir(dir);
            // Recheck auth using the actual fresh trial cwd before creating its single producer.
            check();
            const trialAuth = await inspect(['auth', 'status'], workspace); check();
            let trialMethod; try { trialMethod = JSON.parse(trialAuth.output).authMethod; } catch { /* Fail closed. */ }
            if (trialAuth.code !== 0 || trialMethod !== 'claude.ai') { fail('auth-unverified', 'unestablished'); break; }
            active = { producerExited: false, hostExited: false };
            const owned = active;
            const trialBegan = performance.now();
            const diagnostics = diagnostic ? { observationEnd: null, exits: { producer: null, host: null }, native: null } : null;
            const guard = createTrialGuard(reason => { fail(reason, 'unestablished'); void stopOwned(owned); });
            owned.host = fork(hostFile, [], { cwd: workspace, env: environment, silent: true, windowsHide: true });
            owned.host.once('exit', (code, signal) => { if (diagnostics) diagnostics.exits.host = diagnosticExit(code, signal, performance.now() - trialBegan); owned.hostExited = true; if (!owned.teardownPromise) guard.reject('host-lost'); });
            let outputBytes = 0;
            owned.host.once('error', () => { guard.reject('host-lost'); });
            const discard = data => { outputBytes += Buffer.byteLength(data); if (outputBytes > 65536) guard.reject('output-limit'); };
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
            const pluginSource = createControlPluginSource({ target: prepared.target, control: control.replace(/\\/g, '/'), nonce, diagnostic });
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
            owned.pty.onExit(event => { if (diagnostics) diagnostics.exits.producer = diagnosticExit(event.exitCode, event.signal, performance.now() - trialBegan); owned.producerExited = true; if (!owned.teardownPromise) guard.reject('producer-lost'); });
            let startupTail = '';
            owned.pty.onData(data => {
                discard(data); startupTail = (startupTail + data).slice(-2048);
                if (/trust this folder|sign in|log in|login required|accept.*terms/i.test(startupTail)) { guard.reject('startup-interaction'); }
            });
            const record = { generated, observation: null, lifecycle: guard.state, ...(diagnostics ? { diagnostic: diagnostics } : {}) }; receipt.trials.push(record); await save(receipt);
            const optional = async (name, final = false) => {
                try { return await readBoundedJson(path.join(control, name + '.json'), 4096); }
                catch (e) { if (e.code === 'ENOENT' || !final && e instanceof SyntaxError) return null; throw new Error('invalid-evidence', { cause: e }); }
            };
            let observationFile;
            const observation = await observeTrial({ now: () => performance.now(), sleep: ms => new Promise(r => setTimeout(r, ms)),
                checkpoint: async value => { record.observation = structuredClone(value); await save(receipt); },
                release: async () => { check(); await fs.writeFile(path.join(control, 'release'), '', { flag: 'wx' }); },
                read: async () => {
                    if (diagnostics) observationFile = undefined;
                    check();
                    const result = {};
                    for (const name of ['started', 'entry', 'forward', 'returned', 'rejected', 'failed', 'unexpected']) result[name] = await optional(name);
                    let file = null;
                    try { file = await readUpload(targetFile);
                    } catch (e) { if (e.code !== 'ENOENT') throw new Error('invalid-evidence', { cause: e }); }
                    if (diagnostics) observationFile = file;
                    return { ...result, file, producerAlive: !owned.producerExited && processAlive(owned.producerPid), hostAlive: !owned.hostExited && processAlive(owned.host.pid) };
                } }, { nonce, holdMs });
            record.observation = observation;
            if (diagnostics) diagnostics.observationEnd = diagnosticObservationEnd(observation, performance.now() - trialBegan, observationFile);
            const accepted = await finalizeTrial(record, guard, {
                verify: async () => {
                    for (const [file, expected] of [[hostFile, generated.hostSha256], [adapterFile, generated.adapterSha256],
                        [path.join(plugin, 'hooks/control.js'), generated.pluginSha256], [path.join(plugin, '.claude-plugin/plugin.json'), generated.manifestSha256], [path.join(plugin, 'hooks/hooks.json'), generated.hooksSha256]]) {
                        if (await hashFile(file) !== expected) throw new Error('identity-mismatch');
                    }
                    for (const source of receipt.sources.filter(s => s.path.startsWith('media/attention/'))) {
                        if (await hashFile(path.join(product, source.path.slice('media/attention/'.length))) !== source.sha256) throw new Error('identity-mismatch');
                    }
                        },
                stop: async () => {
                    const settled = await stopOwned(owned);
                    receipt.teardown.push(...(settled ? ['owned-exits-observed-no-cleanup-authority'] : owned.teardownEvents));
                    if (diagnostics) {
                        try { diagnostics.native = await runWithBudget(() => collectDiagnostic(async (name, limit) => {
                            try { return await readDiagnosticBytes(path.join(control, name), limit); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
                        }, nonce), 1000, () => {}); } catch { diagnostics.native = await collectDiagnostic(async () => null, nonce); }
                    }
                    return settled;
                },
                readStatus: async final => {
                    const status = {};
                    for (const name of ['started', 'entry', 'forward', 'returned', 'rejected', 'failed', 'unexpected']) status[name] = await optional(name, final);
                    if (final) status.file = await readUpload(targetFile);
                    return status;
                },
                checkpoint: () => save(receipt)
            });
            if (!accepted) { fail(record.observation.reason, record.observation.status); break; }
            active = {};
            await save(receipt);
        }
        if (receipt.trials.length === holds.length && receipt.trials.every(t => validateTrial(t.observation) && t.lifecycle.status === 'verified') && receipt.teardown.length === holds.length) {
            // File-only diagnostics retain observations but cannot qualify unknown SDK write returns.
            if (diagnostic) fail('invalid-evidence', 'unestablished');
            else receipt.status = 'observed';
        }
    } catch (error) { const reason = reasons.includes(error?.message) ? error.message : 'io-failed'; fail(reason, reason.startsWith('inspection-') ? 'unestablished' : 'failed'); }
    finally {
        // Checkpoint before bounded teardown, including failures. Preserve uncertain resources forever here.
        try { await save(receipt); } catch { fail('checkpoint-failed'); }
        if (active.host || active.pty) {
            if (!await stopOwned(active)) { receipt.teardown.push(...active.teardownEvents); fail('teardown-unsettled', 'unestablished'); }
        }
        for (const item of inspectionOwner.inspections) if (!item.closed) item.stop();
        await Promise.all(inspectionOwner.inspections.map(item => item.finished));
        receipt.inspections = inspectionEvidence(inspectionOwner);
        if (inspectionOwner.inspections.some(item => !item.closed)) fail('inspection-unresolved', 'unestablished');
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
function validateRunReceipt(r, mode) {
    const diagnostic = mode === 'diagnostic', holds = trialHolds(mode);
    try {
        if (!closed(r, ['format', 'status', 'reason', 'sourceSha', 'sourceFingerprint', 'before', 'after', 'runtime', 'authentication', 'version', 'injections', 'evidenceLevel', 'productionAdmission', 'qualificationGates', 'lifetimeTrials', 'cleanup', 'sources', 'trials', 'teardown', 'inspections']) ||
            Buffer.byteLength(JSON.stringify(r)) > 1048576 || r.format !== (diagnostic ? 'native-trial-f-diagnostic-v2' : 'native-trial-f-v1') || r.status !== (diagnostic ? 'unestablished' : 'observed') || r.reason !== (diagnostic ? 'invalid-evidence' : 'none') ||
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
        if (!Array.isArray(r.trials) || r.trials.length !== holds.length || !Array.isArray(r.teardown) || r.teardown.length !== holds.length || Array.from(r.teardown).some(v => v !== 'owned-exits-observed-no-cleanup-authority')) return false;
        if (!Array.isArray(r.inspections) || r.inspections.length !== holds.length + 2 || Array.from(r.inspections).some((item, index) =>
            !closed(item, ['kind', 'close', 'termination', 'reason', 'exit']) || item.kind !== (index === 0 ? 'version' : 'auth') ||
            item.close !== 'observed' || item.termination !== 'not-requested' || item.reason !== 'none' || item.exit !== 'zero')) return false;
        for (let i = 0; i < holds.length; i++) {
            const t = r.trials[i];
            if (!closed(t, diagnostic ? ['generated', 'observation', 'lifecycle', 'diagnostic'] : ['generated', 'observation', 'lifecycle']) || !closed(t.generated, ['hostSha256', 'adapterSha256', 'pluginSha256', 'manifestSha256', 'hooksSha256']) ||
                !Object.values(t.generated).every(v => typeof v === 'string' && hashPattern.test(v)) ||
                !closed(t.lifecycle, ['status', 'finalRead', 'disqualifications']) || t.lifecycle.status !== 'verified' || t.lifecycle.finalRead !== 'verified' ||
                !Array.isArray(t.lifecycle.disqualifications) || t.lifecycle.disqualifications.length !== 0 || !validateTrial(t.observation) || t.observation.requestedHoldMs !== holds[i] || diagnostic && !validDiagnosticRecord(t.diagnostic, t.observation)) return false;
        }
        return diagnostic || r.trials[0].observation.nonce !== r.trials[1].observation.nonce;
    } catch { return false; }
}
/** Only the original ordered two-hold contract can pass full Trial F validation. */
function validateReceipt(receipt) { return validateRunReceipt(receipt, 'live'); }
/** Validate complete informational observations separately from diagnostic qualification. */
function validateDiagnosticReceiptEvidence(receipt) { return validateRunReceipt(receipt, 'diagnostic'); }
/** File-only evidence remains unverified: no SDK writer-return witness exists at this boundary. */
function validateDiagnosticReceipt(receipt) {
    // The current closed evidence schema accepts only unverified status, so this gate stays closed.
    return validateDiagnosticReceiptEvidence(receipt) && receipt.trials.every(t => t.diagnostic.native.status === 'verified');
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
        trials.push({ generated: Object.fromEntries(['hostSha256', 'adapterSha256', 'pluginSha256', 'manifestSha256', 'hooksSha256'].map(k => [k, sha256])), observation, lifecycle: { status: 'verified', finalRead: 'verified', disqualifications: [] } });
    }
    const identity = { native: sha256, declaration: DECLARATION_SHA256, node: sha256 };
    const receipt = { format: 'native-trial-f-v1', status: 'observed', reason: 'none', sourceSha: 'a'.repeat(40), sourceFingerprint: sha256,
        before: identity, after: identity, runtime: { platform: 'win32', arch: 'x64', node: '24.14.0', uv: '1.51.0', electron: null }, authentication: 'claude.ai', version: VERSION,
        injections, evidenceLevel: 'sdk-dispatch-pending/pre-next', productionAdmission: false, qualificationGates: 'all-63-pending', lifetimeTrials: 'L/E-pending', cleanup: 'storage-and-intents-preserved',
        sources: mandatorySources.map(p => ({ path: p, sha256 })), trials, teardown: ['owned-exits-observed-no-cleanup-authority', 'owned-exits-observed-no-cleanup-authority'],
        inspections: ['version', 'auth', 'auth', 'auth'].map(kind => ({ kind, close: 'observed', termination: 'not-requested', reason: 'none', exit: 'zero' })) };
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
module.exports = { readDiagnosticBytes, validateDiagnosticReceiptEvidence, collectDiagnostic, validDiagnosticEvidence, diagnosticObservationEnd, diagnosticExit, validateDiagnosticReceipt, validDiagnosticEvent, trialHolds, createTrialGuard, finalizeTrial, inspectCli, inspectionEvidence, runWithBudget, processAlive, readUpload, stopOwned, selfTest, validateReceipt, observeTrial, validateTrial, createHostSource, runLive, parseArguments, main, validateConfig, createControlPluginSource, DECLARATION_SHA256 };
if (require.main === module) {
    const argv = process.argv.slice(2);
    const finish = code => {
        process.exitCode = code;
        // Live main has finished its bounded cleanup/checkpoint. Unresolved handles must not keep this controller alive.
        // Exiting this launcher is not evidence that any child, SDK worker or capture lifetime has ended.
        if (['live', 'diagnostic'].includes(parseArguments(argv)?.mode)) process.exit(code);
    };
    main(argv).then(finish, () => { console.error('trial-f:failed'); finish(1); });
}
