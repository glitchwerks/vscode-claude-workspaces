/* eslint @typescript-eslint/no-require-imports: "off" -- Import-safe manual harness support. */
/* global require, module, __dirname, process, Buffer, TextDecoder, performance, setTimeout, clearTimeout */
'use strict';

// Additive Trial L harness support. Importing this module starts no host or producer.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('./companionNativeRendezvous.smoke.cjs');
const RAW_SHA = '787a6d007ade1fa389eb6daef12bc21bbd310563fe5d181283a48d1266c0f7dc';
const F_SOURCE = '108f14b1bb2086f5e49196a932bf6515fc661be6';
const fixturePath = path.resolve(__dirname, '../fixtures/companion/native-qualification/native-f-108f14b.receipt.json');

/** Require a closed plain JSON object, including every required key. */
function closed(value, keys) {
    return !!value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
/** Content-free digest; also used to redact filesystem identities and channel names. */
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
/** Stable bounded read. No unbounded readFile allocation or link traversal. */
async function boundedRead(file, maximum = 2097152) {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximum) throw new Error('unsafe-file');
    const handle = await fs.open(file, require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0));
    try {
        const same = info => info.isFile() && info.nlink === 1 && info.dev === before.dev && info.ino === before.ino &&
            info.birthtimeMs === before.birthtimeMs && info.size === before.size && info.mtimeMs === before.mtimeMs;
        if (!same(await handle.stat())) throw new Error('changed-file');
        const buffer = Buffer.alloc(maximum + 1); let count = 0;
        while (count < buffer.length) {
            const chunk = await handle.read(buffer, count, buffer.length - count, null);
            if (!chunk.bytesRead) break;
            count += chunk.bytesRead;
        }
        if (count !== before.size || !same(await handle.stat()) || !same(await fs.lstat(file))) throw new Error('changed-file');
        return buffer.subarray(0, count);
    } finally { await handle.close(); }
}
/** Authenticate exact historical bytes BEFORE parsing or consulting F's standard validator. */
function parseFPrerequisite(bytes) {
    try {
        if (!Buffer.isBuffer(bytes) || bytes.length > 16384) throw new Error();
        const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!closed(envelope, ['format', 'rawBytes', 'rawSha256', 'rawBase64']) ||
            envelope.format !== 'actual-native-f-envelope-v1' || envelope.rawBytes !== 9372 || envelope.rawSha256 !== RAW_SHA ||
            typeof envelope.rawBase64 !== 'string' || envelope.rawBase64.length !== 12496) throw new Error();
        const raw = Buffer.from(envelope.rawBase64, 'base64');
        if (raw.length !== envelope.rawBytes || raw.toString('base64') !== envelope.rawBase64 || hash(raw) !== RAW_SHA) throw new Error();
        const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        if (!F.validateReceipt(receipt) || receipt.sourceSha !== F_SOURCE || receipt.version !== '2.1.322' ||
            receipt.authentication !== 'claude.ai' || receipt.before.declaration !== F.DECLARATION_SHA256 ||
            receipt.runtime.platform !== 'win32' || receipt.runtime.arch !== 'x64' || receipt.runtime.node !== '24.14.0' ||
            receipt.runtime.uv !== '1.51.0' || receipt.runtime.electron !== null) throw new Error();
        return { raw, receipt };
    } catch { throw new Error('invalid-f-prerequisite'); }
}
/** Load the committed envelope; a caller may supply a different file but never a pass flag. */
async function loadFPrerequisite(file = fixturePath) {
    try { return parseFPrerequisite(await boundedRead(file, 16384)); }
    catch { throw new Error('invalid-f-prerequisite'); }
}
/** Compare exact working bytes. Portable source tests must not call this native qualification. */
async function verifyFDependencies(envelopeBytes, readBytes) {
    const { receipt } = parseFPrerequisite(envelopeBytes);
    if (typeof readBytes !== 'function') throw new Error('invalid-dependency-reader');
    for (const source of receipt.sources) {
        try {
            const bytes = await readBytes(source.path);
            if (!Buffer.isBuffer(bytes) || bytes.length > 16777216 || hash(bytes) !== source.sha256)
                return { ok: false, reason: 'dependency-drift', dependency: hash(source.path) };
        } catch { return { ok: false, reason: 'dependency-unreadable', dependency: hash(source.path) }; }
    }
    return { ok: true, reason: 'none', count: receipt.sources.length, method: 'exact-working-bytes/no-normalization' };
}

/** Closed IPC requests. Watch selectors confer observation only, never binding authority. */
function parseLifetimeMessage(value) {
    try {
        if (!value || Buffer.byteLength(JSON.stringify(value)) > 8192 || value.v !== 1 ||
            typeof value.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value.id) ||
            !Number.isInteger(value.deadlineMs) || value.deadlineMs < 1 || value.deadlineMs > 2000) return null;
        const base = ['v', 'id', 'kind', 'deadlineMs'];
        if (value.kind === 'init') {
            const p = value.profile;
            if (!closed(value, [...base, 'storageRoot', 'profile']) || typeof value.storageRoot !== 'string' ||
                value.storageRoot.length > 2048 || value.storageRoot.includes('\0') || !path.isAbsolute(value.storageRoot) ||
                path.resolve(value.storageRoot) !== value.storageRoot || path.dirname(value.storageRoot) === value.storageRoot ||
                !closed(p, ['platform', 'arch', 'node', 'uv', 'electron']) || !['win32', 'linux', 'darwin'].includes(p.platform) ||
                !['x64', 'arm64'].includes(p.arch) || ![p.node, p.uv].every(v => typeof v === 'string' && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(v) && v.length <= 64) ||
                p.electron !== null) return null;
        } else if (value.kind === 'snapshot') {
            if (!closed(value, [...base, 'watch'])) return null;
            if (value.watch !== null && (!closed(value.watch, ['channel', 'slot']) ||
                typeof value.watch.channel !== 'string' || !/^companion-[a-f0-9]{32}$/.test(value.watch.channel) ||
                !Number.isInteger(value.watch.slot) || value.watch.slot < 0 || value.watch.slot > 10)) return null;
        } else if (!['prepare-primary', 'expose-primary', 'prepare-additional', 'refuse', 'sweep', 'stop'].includes(value.kind) || !closed(value, base)) return null;
        // A caller cannot mutate a queued command after validation.
        return JSON.parse(JSON.stringify(value));
    } catch { return null; }
}

/** Deadline means unknown, never cancellation. The mutation queue retains its original tail. */
function createSerializedDispatcher(handle, emit) {
    let tail = Promise.resolve(), queued = 0;
    const seen = new Set();
    const reply = (id, phase, late, result) => emit({ v: 1, id, phase, late, ...result });
    return {
        accept(input) {
            const m = parseLifetimeMessage(input);
            if (!m) { reply(null, 'rejected', false, { outcome: 'failed', reason: 'invalid-message' }); return; }
            if (seen.has(m.id)) { reply(m.id, 'rejected', false, { outcome: 'failed', reason: 'duplicate-id' }); return; }
            if (queued >= 32 || seen.size >= 256) { reply(m.id, 'rejected', false, { outcome: 'failed', reason: 'protocol-limit' }); return; }
            seen.add(m.id); queued++;
            const until = performance.now() + m.deadlineMs; let expired = false;
            const timer = setTimeout(() => {
                expired = true;
                reply(m.id, 'deadline', true, { outcome: 'unknown', reason: 'deadline' });
            }, m.deadlineMs);
            tail = tail.then(async () => {
                let result;
                try {
                    result = performance.now() >= until ? { outcome: 'failed', reason: 'expired-before-start' } : await handle(m);
                } catch { result = { outcome: 'failed', reason: 'operation-failed' }; }
                clearTimeout(timer); queued--;
                // Wall time is authoritative even if the timer callback was delayed.
                reply(m.id, 'settled', expired || performance.now() >= until, result);
            });
        },
        settled() { return tail; }
    };
}

/** Observe regular filesystem identities without publishing local paths. */
function identity(info) { return hash(`${info.dev}:${info.ino}:${info.birthtimeMs}`); }
/** Bound directory allocation before collecting names. */
async function namesAt(directory) {
    const handle = await fs.opendir(directory); const names = [];
    try {
        for (let i = 0; i <= 256; i++) {
            const entry = await handle.read(); if (!entry) return names.sort();
            if (i === 256) throw new Error('inventory-limit');
            names.push(entry.name);
        }
    } finally { await handle.close(); }
}
/** Match the pinned production admission decoder, not a marker-derived ownership credential. */
function observedAdmission(raw) {
    try {
        const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        return closed(v, ['v', 'kind', 'hostId', 'processId', 'channelId']) && v.v === 1 &&
            v.kind === 'claude-workspaces-admission' && /^[a-f0-9]{32}$/.test(v.hostId) &&
            /^[a-f0-9]{32}$/.test(v.channelId) && Number.isSafeInteger(v.processId) && v.processId >= 1 ? v : null;
    } catch { return null; }
}
/** Mirror pinned capacity's filename predicate exactly, including its frame-number check. */
function stagingName(name) {
    if (/^(request|activate)\.[a-f0-9]{32}\.(upload|ready)$/.test(name)) return true;
    const match = /^frame\.[a-f0-9]{32}\.([1-9][0-9]*)\.(upload|ready|committed)$/.exec(name);
    return !!match && Number.isSafeInteger(Number(match[1]));
}
/**
 * Bounded non-atomic disk observation, not a future-reservation getter or cleanup authority.
 * Arithmetic mirrors companionCapture.ts:590-639 at F_SOURCE (no transaction reservations
 * are created by this host API). Physical covered bytes are NOT added to lifetime buckets.
 */
async function observeInventory(root, rootIdentity, watch, bindings) {
    const rootInfo = await fs.lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || identity(rootInfo) !== rootIdentity || await fs.realpath(root) !== root) throw new Error('unsafe-root');
    const names = await namesAt(root), slots = [], channels = [], checks = [];
    const slotNames = Array.from({ length: 11 }, (_, i) => `companion-admission.${String(i).padStart(2, '0')}.json`);
    let physicalBytes = 0, physicalFiles = 0, extraBytes = 0, extraFiles = 0, unknownRootFiles = 0, unknownRootBytes = 0;
    const violations = new Set(), claimed = new Set(); let missing = 0;
    const file = async full => {
        const info = await fs.lstat(full);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !Number.isSafeInteger(info.size) || info.size < 0) throw new Error('unsafe-file');
        physicalBytes += info.size; physicalFiles++;
        if (physicalFiles > 512) throw new Error('inventory-limit');
        checks.push({ full, info }); return info;
    };
    for (let index = 0; index < 11; index++) {
        const name = slotNames[index]; if (!names.includes(name)) continue;
        const full = path.join(root, name), info = await file(full);
        if (info.size > 1024) throw new Error('invalid-intent');
        const raw = await boundedRead(full, 1024), record = observedAdmission(raw);
        slots.push({ slot: index, bytes: raw.length, sha256: hash(raw), identity: identity(info), channelLabel: record ? hash('companion-' + record.channelId) : null });
        if (!record) { missing++; continue; }
        const channel = 'companion-' + record.channelId;
        if (claimed.has(channel)) violations.add('duplicate-claim');
        claimed.add(channel); if (!names.includes(channel)) missing++;
    }
    for (const name of names) {
        if (slotNames.includes(name)) continue;
        if (name.startsWith('companion-admission.')) violations.add('unknown-intent');
        const full = path.join(root, name);
        if (!/^companion-[a-f0-9]{32}$/.test(name)) {
            const info = await file(full); unknownRootFiles++; unknownRootBytes += info.size; continue;
        }
        const info = await fs.lstat(full);
        if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(full) !== full) throw new Error('unsafe-channel');
        const children = await namesAt(full); let bytes = 0, files = 0, stagedBytes = 0, stagedFiles = 0, unknownBytes = 0, unknownFiles = 0;
        const staged = new Set();
        for (const child of children) {
            const childInfo = await file(path.join(full, child)); bytes += childInfo.size; files++;
            if (stagingName(child)) {
                staged.add(child.replace(/\.(upload|ready|committed)$/, '')); stagedBytes += childInfo.size; stagedFiles++;
            } else if (['ownership.json', 'control.json', 'ack.json', 'control.json.tmp', 'ack.json.tmp'].includes(child)) {
                if (childInfo.size > (child === 'ownership.json' ? 1024 : 4096)) violations.add('control-size');
            } else { extraBytes += childInfo.size; extraFiles++; unknownBytes += childInfo.size; unknownFiles++; }
        }
        const withinLimits = staged.size <= 8 && stagedFiles <= 16 && stagedBytes <= 2097152;
        if (!withinLimits) violations.add('staging-limit');
        if (!claimed.has(name)) { extraBytes += 2114560; extraFiles += 21; }
        if (identity(await fs.lstat(full)) !== identity(info) || JSON.stringify(await namesAt(full)) !== JSON.stringify(children)) throw new Error('changed-inventory');
        channels.push({ label: hash(name), identity: identity(info), claimed: claimed.has(name), bytes, files,
            staging: { transactions: staged.size, files: stagedFiles, bytes: stagedBytes, withinLimits }, unknown: { files: unknownFiles, bytes: unknownBytes } });
    }
    // Reject observed replacements or size changes; this is still no atomic SDK fence.
    for (const check of checks) {
        const now = await fs.lstat(check.full);
        if (!now.isFile() || now.nlink !== 1 || identity(now) !== identity(check.info) || now.size !== check.info.size || now.mtimeMs !== check.info.mtimeMs) throw new Error('changed-inventory');
    }
    if (identity(await fs.lstat(root)) !== rootIdentity || JSON.stringify(await namesAt(root)) !== JSON.stringify(names)) throw new Error('changed-inventory');
    const bytes = 11264 + slots.length * 2114560 + extraBytes, files = 11 + slots.length * 21 + extraFiles;
    const rootEntries = names.length + (11 - slots.length) + missing;
    if (rootEntries > 256) violations.add('root-entry-limit');
    if (bytes > 33554432 || files > 256) violations.add('aggregate-limit');
    const withinLimits = violations.size === 0;
    const watchedChannel = watch && channels.find(c => c.label === hash(watch.channel));
    const watchedSlot = watch && slots.find(s => s.slot === watch.slot);
    return { format: 'lifetime-inventory-v1', observation: 'bounded-stable-scan/non-atomic',
        method: 'companionCapture.ts@108f14b:590-639/no-host-transaction-reservations',
        physical: { bytes: physicalBytes, files: physicalFiles, directories: channels.length, withinLimits: physicalBytes <= 33554432 && physicalFiles <= 256 },
        future: { bytes, files, rootEntries, withinLimits, nextPrepare: { bytes: bytes + 2114560, files: files + 21,
            rootEntries: rootEntries + 1, slotAvailable: slots.length < 11,
            withinLimits: withinLimits && slots.length < 11 && bytes + 2114560 <= 33554432 && files + 21 <= 256 && rootEntries + 1 <= 256 } },
        unknownRoot: { files: unknownRootFiles, bytes: unknownRootBytes, chargedByProduction: false },
        slots, channels, violations: [...violations].sort(), bindings,
        watch: watch ? { parent: watchedChannel ? { state: 'present', identity: watchedChannel.identity } : { state: 'absent' },
            intent: watchedSlot ? { state: 'present', bytes: watchedSlot.bytes, sha256: watchedSlot.sha256, identity: watchedSlot.identity } : { state: 'absent' } } : null };
}

/** One real Capture manager and retained opaque bindings per explicitly forked owned host. */
function lifetimeHostMain(CompanionCapture, createCaptureQualificationProbe) {
    let resources, root, rootIdentity, primary, primaryAttempted = false, initialized = false, stopped = false;
    const targets = new Map(), held = new Map(), protocols = [];
    const fail = reason => ({ outcome: 'failed', reason });
    const ok = data => ({ outcome: 'ok', reason: 'none', data });
    const operationResult = result => result.ok ? ok({}) : fail(['capture-unavailable', 'cleanup', 'cleanup-capacity'].includes(result.reason) ? result.reason : 'operation-failed');
    const dispatch = createSerializedDispatcher(async m => {
        if (m.kind === 'stop') {
            stopped = true; for (const protocol of protocols) protocol.stop();
            return ok({ storage: 'preserved', managedExit: 'not-asserted' });
        }
        if (stopped) return fail('stopped');
        if (m.kind === 'init') {
            if (initialized) return fail('already-initialized');
            initialized = true;
            const p = m.profile;
            if (p.platform !== 'win32' || p.arch !== 'x64' || process.platform !== p.platform || process.arch !== p.arch ||
                process.versions.node !== p.node || process.versions.uv !== p.uv || (process.versions.electron ?? null) !== p.electron) return fail('profile-mismatch');
            try {
                let current = m.storageRoot;
                for (;;) {
                    const info = await fs.lstat(current);
                    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(current) !== current) return fail('unsafe-root');
                    const parent = path.dirname(current); if (parent === current) break; current = parent;
                }
                root = m.storageRoot; rootIdentity = identity(await fs.lstat(root));
                const coordinator = createCaptureQualificationProbe(p);
                // Exercise the actual OS lease on the identical raw filesystem identity used by Capture.
                const info = await fs.lstat(root), lease = await coordinator.tryAcquire(`${info.dev}:${info.ino}:${info.birthtimeMs}`);
                if (!lease) return fail('root-busy');
                await lease.release();
                resources = new CompanionCapture({ storageRoot: root, coordinator, currentTarget: id => targets.get(id) });
                return ok({ topology: 'injected-qualification-probe-only/development', runtime: p, rootLabel: rootIdentity });
            } catch { return fail('initialization-failed'); }
        }
        if (!resources) return fail('not-initialized');
        try {
            const info = await fs.lstat(root);
            if (!info.isDirectory() || info.isSymbolicLink() || identity(info) !== rootIdentity || await fs.realpath(root) !== root) return fail('unsafe-root');
        } catch { return fail('unsafe-root'); }
        if (m.kind === 'snapshot') {
            try { return ok(await observeInventory(root, rootIdentity, m.watch, { retained: held.size, exposed: primary?.exposed ? 1 : 0 })); }
            catch { return fail('observation-failed'); }
        }
        if (m.kind === 'sweep') return operationResult(await resources.sweep());
        if (m.kind === 'expose-primary') {
            if (!primary || !resources.markProducerExposed(primary.binding)) return fail('exposure-refused');
            primary.exposed = true; return ok({ bindingLabel: primary.label, exposed: true });
        }
        if (m.kind === 'prepare-primary' && (primaryAttempted || held.size)) return fail('primary-already-attempted');
        if (m.kind === 'prepare-primary') primaryAttempted = true;
        const target = Object.freeze({ sessionId: crypto.randomUUID(), claudeSessionId: crypto.randomUUID(), generation: crypto.randomUUID() });
        targets.set(target.sessionId, target);
        const prepared = await resources.prepare(target.sessionId);
        if (!prepared.ok) {
            // Failed/late resource mutations retain their original targets and uncertainty.
            return m.kind === 'refuse' && prepared.reason === 'cleanup-capacity' ?
                { outcome: 'refused', reason: 'cleanup-capacity', data: { exposed: false } } : operationResult(prepared);
        }
        const binding = prepared.value, label = hash(path.basename(binding.directory));
        held.set(label, binding);
        const evidence = { bindingLabel: label, exposed: false,
            targetLabel: hash(JSON.stringify([binding.marker.sessionId, binding.marker.claudeSessionId, binding.marker.generation])),
            generationLabel: hash(binding.marker.generation) };
        if (m.kind !== 'prepare-primary') return { outcome: m.kind === 'refuse' ? 'unexpected-admission' : 'ok', reason: 'none', data: evidence };
        primary = { binding, label, exposed: false };
        const started = await resources.startProtocol(binding, { autoPoll: false });
        if (!started.ok) return operationResult(started);
        protocols.push(started.value);
        try {
            const control = JSON.parse((await boundedRead(path.join(binding.directory, 'control.json'), 4096)).toString());
            if (!/^[a-f0-9]{32}$/.test(control.offerId)) return fail('offer-unavailable');
            let slot;
            for (let i = 0; i < 11; i++) {
                try {
                    const record = observedAdmission(await boundedRead(path.join(root, `companion-admission.${String(i).padStart(2, '0')}.json`), 1024));
                    if (record?.channelId === binding.marker.channelId) { slot = i; break; }
                } catch (error) { if (error.code !== 'ENOENT') return fail('offer-unavailable'); }
            }
            if (slot === undefined) return fail('offer-unavailable');
            return { ...ok(evidence),
                // NEVER copy this launch-only branch into any receipt or sanitized observation.
                transient: { environment: resources.environment({}, binding), target: binding.directory.replace(/[\\/]$/, '') + '/request.' + control.offerId + '.upload',
                    targetIdentity: target, watch: { channel: path.basename(binding.directory), slot } } };
        } catch { return fail('offer-unavailable'); }
    }, reply => {
        if (!process.connected) return;
        if (Buffer.byteLength(JSON.stringify(reply)) > 65536) reply = { v: 1, id: reply.id, phase: 'settled', late: reply.late, outcome: 'failed', reason: 'reply-limit' };
        process.send(reply, error => {
            if (error) return;
            if (stopped && reply.phase === 'settled' && reply.data?.storage === 'preserved') process.exit(0);
        });
    });
    process.on('message', m => dispatch.accept(m));
    process.on('disconnect', () => { for (const protocol of protocols) protocol.stop(); process.exit(0); });
}

/** Pure bundlable source generation. Loading the generated module requires an owned IPC host. */
function createLifetimeHostSource(captureSource = path.resolve(__dirname, '../../src/companion/companionCapture.ts')) {
    if (typeof captureSource !== 'string' || !path.isAbsolute(captureSource)) throw new Error('invalid-capture-source');
    return "'use strict';\nconst fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');\n" +
        [closed, hash, boundedRead, parseLifetimeMessage, createSerializedDispatcher, identity, namesAt, observedAdmission, stagingName, observeInventory, lifetimeHostMain].map(fn => fn.toString()).join('\n') +
        '\nconst {CompanionCapture,createCaptureQualificationProbe}=require(' + JSON.stringify(captureSource) + ');\n' +
        "if(typeof process.send!=='function')throw new Error('owned-ipc-host-required');\n" +
        'lifetimeHostMain(CompanionCapture,createCaptureQualificationProbe);\n';
}

module.exports = { parseFPrerequisite, loadFPrerequisite, verifyFDependencies, parseLifetimeMessage, createSerializedDispatcher, createLifetimeHostSource };
