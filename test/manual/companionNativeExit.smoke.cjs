/* eslint @typescript-eslint/no-require-imports: "off" -- Opt-in manual diagnostic. */
/* global module, require, Buffer, process, console, performance, __dirname, setTimeout, clearTimeout, TextDecoder, structuredClone */
'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const equal = require('node:util').isDeepStrictEqual;
const F = require('./companionNativeRendezvous.smoke.cjs');
const L = require('./companionNativeLifetime.smoke.cjs');
const support = require('./companionNativeLifetimeSupport.cjs');
const controlSource = require('./companionNativeExitControl.cjs');
const repo = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const clock = n => Number.isSafeInteger(n) && n >= 0 && n <= 300000;
const closed = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fact = (value, reason = 'invalid-evidence') => {
    if (!value)
        throw new Error(reason);
};
const roles = ['started', 'entry', 'intent', 'returned', 'rejected', 'aborted', 'failed', 'unexpected', 'end-entry', 'end-returned', 'end-rejected', 'ack-failed', 'send-participation', 'release-participation'];
const invariants = Object.freeze({ eQualified: false, admission: false, workerQuiescence: 'unestablished', storage: 'preserved' });
const reasons = ['none', 'invalid-evidence', 'rendezvous-timeout', 'normal-exit-unobserved', 'controller-deadline', 'unexpected-activity', 'identity-mismatch', 'auth-unverified', 'output-limit', 'startup-interaction', 'ipc-uncertain', 'host-lost', 'checkpoint-failed', 'receipt-limit', 'read-failed', 'unestablished', 'teardown-unsettled', 'storage-changed', 'io-failed', 'release-late'];
reasons.push('coverage-gap', 'evidence-conflict', 'participation-unestablished');
const safeReason = e => reasons.includes(e?.message) ? e.message : 'io-failed';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Bound the causal claim by the controller's actual acceptance intervals. */
function classifyMutation(exitAt, reads) {
    if (!clock(exitAt))
        return 'unknown';
    let absentAfter = false, firstAfter = false, observed = false;
    for (const r of reads) {
        if (r.state === 'absent' && r.start > exitAt)
            absentAfter = true;
        if (r.state === 'matching') {
            if (absentAfter)
                return 'observed-post-exit-mutation';
            if (!observed && r.end > exitAt)
                firstAfter = true;
            observed = true;
        }
    }
    if (firstAfter)
        return 'first-observed-after-exit';
    return reads.some(r => r.start > exitAt && ['absent', 'matching'].includes(r.state)) ? 'none-observed' : 'unknown';
}
/** Validate every marker before retaining fields from a file. */
function validMarker(kind, v, nonce) {
    if (!v || v.nonce !== nonce)
        return false;
    const shape = keys => closed(v, ['nonce', ...keys]);
    const frame = typeof v.frame === 'string' && /^[0-9a-f]{32}$/.test(v.frame);
    switch (kind) {
        case 'started': return shape(['version', 'turns']) && ['unsupported', '2.1.322'].includes(v.version) && [0, 1].includes(v.turns);
        case 'entry': return frame && shape(['frame', 'origin', 'tier', 'targetKind', 'bytes', 'sha256', 'forwardCount']) && v.origin === 'workspaces-attention' &&
            v.tier === 'user' && v.targetKind === 'epoch-request-upload' && Number.isInteger(v.bytes) && v.bytes > 0 && v.bytes <= 4096 && digest(v.sha256) && v.forwardCount === 0;
        case 'returned': return frame && shape(['frame', 'coreVerified']) && typeof v.coreVerified === 'boolean';
        case 'intent':
        case 'rejected': return frame && shape(['frame']);
        case 'aborted': return (frame || v.frame === null) && shape(['frame']);
        case 'unexpected': return shape(['event']) && ['turn', 'model', 'duplicate-write'].includes(v.event);
        case 'failed': return (frame || v.frame === null) && shape(['frame', 'reason']) && ['duplicate', 'aborted', 'expired', 'payload', 'release-mismatch', 'ack-failed', 'hook-failed'].includes(v.reason);
        case 'end-entry': return shape(['reason']) && ['prompt_input_exit', 'clear', 'resume', 'logout', 'other', 'unknown'].includes(v.reason);
        case 'ack-failed': return shape(['marker']) && roles.includes(v.marker) && v.marker !== kind;
        case 'send-participation':
        case 'release-participation': return frame && shape(['frame', 'challenge']) && typeof v.challenge === 'string' && /^[a-f0-9]{32}$/.test(v.challenge);
        default: return roles.includes(kind) && shape([]);
    }
}
function pending(s) {
    const m = s.marks;
    return s.complete && m.started?.version === '2.1.322' && m.started.turns === 0 && !!m.entry &&
        !['intent', 'returned', 'failed', 'aborted', 'rejected', 'unexpected', 'ack-failed'].some(k => m[k]) && s.file.state === 'absent';
}
function record(nonce) {
    return { format: 'native-exit-observation-v2', synthetic: true, nativeExecuted: false, ...invariants, nonce,
        status: 'unestablished', reason: 'unestablished', began: null, b1: null, sent: null, releaseRequested: null, releaseAccepted: null, exit: null,
        challenges: { send: null, release: null }, decisions: { sendSample: null, releaseSample: null }, samples: [], mutation: 'unknown', dispatch: 'unknown', coverage: null, end: null };
}
/** Immutable markers and payload hashes remain bound to the same first observed frame on negative outcomes too. */
function acceptEvidence(seen, sample, o, index) {
    const marks = sample.marks;
    const original = (seen.entry ?? marks.entry)?.frame;
    if (Object.values(marks).some(v => Object.hasOwn(v, 'frame') && v.frame !== original))
        return false;
    for (const phase of ['send', 'release']) {
        const ack = marks[phase + '-participation'], challenge = o.challenges[phase];
        if (ack && (!challenge || index <= challenge.sample || ack.challenge !== challenge.token))
            return false;
    }
    if ((marks['end-entry'] || marks['end-returned'] || marks['end-rejected']) &&
        (o.decisions.sendSample === null || index <= o.decisions.sendSample))
        return false;
    if ((marks.intent || marks.returned || marks.rejected || sample.file.state === 'matching') &&
        (o.decisions.releaseSample === null || index <= o.decisions.releaseSample))
        return false;
    if (sample.file.state === 'unmatched')
        return false;
    for (const [i, role] of roles.entries()) {
        const value = sample.marks[role];
        if (seen[role] && (sample.intervals[i][2] === 'absent' || value && !equal(seen[role], value)))
            return false;
        if (value)
            seen[role] = value;
    }
    return !(seen.returned && seen.rejected) && (sample.file.state !== 'matching' ||
        seen.entry?.sha256 === sample.file.sha256 && seen.entry.bytes === sample.file.bytes);
}
/** Only accepted complete samples inside the finite window count towards its coverage. */
function coverage(o) {
    if (!o.exit)
        return null;
    const start = o.exit.at, cutoff = start + 60000;
    const through = Math.max(start, Math.min(cutoff, o.end ?? o.samples.at(-1)?.file.end ?? start));
    let first = null, last = null, maxGap = 0;
    for (const s of o.samples) {
        if (!s.complete || s.intervals[0][0] < start || s.file.end > through)
            continue;
        first ??= s.intervals[0][0];
        maxGap = Math.max(maxGap, s.file.end - (last ?? start));
        last = s.file.end;
    }
    return { first, last, through, maxGap: Math.max(maxGap, through - (last ?? start)) };
}
function summarize(o, seen, conflict) {
    o.coverage = coverage(o);
    o.dispatch = conflict ? 'unknown' : seen.returned ? 'confirmed-returned' : seen.rejected ? 'confirmed-rejected' : 'unknown';
    o.mutation = conflict || !o.exit || o.exit.emergency || o.exit.code !== 0 || o.exit.signal !== null || o.sent === null ? 'unknown' :
        classifyMutation(o.exit.at, o.samples.map(s => s.file));
}
/** Execute the same schedule with injected actors. The public entry always emits synthetic observations. */
async function observeExit(io, nonce) {
    fact(typeof nonce === 'string' && /^[0-9a-f]{32}$/.test(nonce));
    const o = record(nonce);
    const seen = {};
    let conflict = false;
    try {
        const now = () => { const n = io.now(); fact(clock(n) && n < 290000, 'controller-deadline'); return n; };
        o.began = now();
        let checkpointAt = o.began, estimate = 0;
        for (;;) {
            if (o.exit && now() >= o.exit.at + 60000)
                break;
            let sample = await io.sample(false);
            const original = o.samples[o.challenges.send?.sample]?.marks.entry;
            if (original && sample.intervals[roles.indexOf('entry')]?.[2] === 'unstable' &&
                sample.file.state === 'unmatched' && sample.file.bytes === original.bytes && sample.file.sha256 === original.sha256) {
                // Keep the unstable interval. Only the independent stable target read is resolved.
                sample = { ...sample, file: { ...sample.file, state: 'matching' } };
            }
            const t = now();
            fact(Object.entries(sample.marks).every(([k, v]) => validMarker(k, v, nonce)));
            estimate += Buffer.byteLength(JSON.stringify(sample)) + 1;
            fact(estimate < 900000, 'receipt-limit');
            o.samples.push(sample);
            fact(validSample(sample, nonce, o.samples.at(-2)?.file.end ?? o.began, original));
            const phase = o.sent === null ? 'send' : 'release';
            const freshParticipation = !seen[phase + '-participation'];
            conflict = !acceptEvidence(seen, sample, o, o.samples.length - 1);
            fact(!conflict, 'evidence-conflict');
            fact(sample.file.state !== 'hard' && !sample.intervals.some(r => r[2] === 'hard'), 'read-failed');
            if (sample.marks.unexpected || sample.marks.started?.turns === 1)
                throw new Error('unexpected-activity');
            o.exit = io.exit();
            if (o.exit && sample.file.end > o.exit.at + 60000)
                throw new Error('controller-deadline');
            if (!o.exit && io.alive() && pending(sample)) {
                const eligible = phase === 'send' ? !sample.marks['end-entry'] && t < o.began + 60000 :
                    o.releaseRequested === null && sample.marks['end-entry']?.reason === 'prompt_input_exit';
                if (eligible && (o.b1 === null || t < o.b1 + 6000)) {
                    const index = o.samples.length - 1;
                    const challenge = o.challenges[phase];
                    if (!challenge) {
                        if (phase === 'send')
                            o.b1 = t;
                        const token = crypto.randomBytes(16).toString('hex');
                        o.challenges[phase] = { at: t, sample: index, token };
                        await io.challenge(phase, token, seen.entry.frame);
                    }
                    else if (freshParticipation && sample.marks[phase + '-participation']?.challenge === challenge.token) {
                        // This acknowledges only participation at the check within the original frame.
                        if (phase === 'send') {
                            o.decisions.sendSample = index;
                            io.send('/exit\r');
                            o.sent = now();
                        }
                        else {
                            o.decisions.releaseSample = index;
                            o.releaseRequested = t;
                            await io.release(nonce, challenge.token, seen.entry.frame);
                            o.releaseAccepted = now();
                            fact(o.releaseAccepted < o.b1 + 6000, 'release-late');
                        }
                    }
                }
            }
            if (o.sent === null && o.b1 !== null && t >= o.b1 + 6000)
                throw new Error('participation-unestablished');
            if (o.exit && (o.exit.emergency || o.exit.code !== 0 || o.exit.signal !== null || o.sent === null || o.exit.at < o.sent || o.exit.at >= o.sent + 60000))
                throw new Error('normal-exit-unobserved');
            const until = o.exit ? o.exit.at + 60000 : (o.sent ?? o.began) + 60000;
            if (t >= until) {
                if (!o.exit)
                    throw new Error(o.sent === null ? 'rendezvous-timeout' : 'normal-exit-unobserved');
                break;
            }
            if (t - checkpointAt >= 1000 || t === o.b1 || t === o.releaseAccepted) {
                const snapshot = structuredClone(o);
                summarize(snapshot, seen, conflict);
                await io.checkpoint(snapshot);
                checkpointAt = t;
            }
            // After the decision window no further token can be issued. Use the same
            // 450 ms observation cadence as post-exit to leave room for bounded receipts.
            const awaitingDecision = !o.exit && o.releaseRequested === null && (o.b1 === null || t < o.b1 + 6000);
            await io.sleep(Math.max(0, Math.min(awaitingDecision ? 150 : 450, until - now())));
        }
        o.end = now();
        summarize(o, seen, conflict);
        fact(o.coverage.first !== null && o.coverage.maxGap <= 1000 && o.end - (o.exit.at + 60000) <= 1000, 'coverage-gap');
        const last = o.samples.at(-1);
        if (last.complete && last.file.start > o.exit.at && last.marks['end-entry']?.reason === 'prompt_input_exit' && last.marks['end-returned'] && !last.marks['end-rejected'] &&
            !last.marks.failed && !last.marks.aborted && !last.marks['ack-failed'] && !last.marks.rejected && last.marks.intent && last.marks.returned?.coreVerified &&
            last.file.state === 'matching' && o.releaseAccepted !== null) {
            o.status = 'diagnostic-observed';
            o.reason = 'none';
        }
    }
    catch (error) {
        o.reason = safeReason(error);
        o.exit = io.exit();
        summarize(o, seen, conflict);
    }
    return o;
}
const operations = ['lstat-before', 'canonical-before', 'open', 'fstat-before', 'read', 'fstat-after', 'lstat-after', 'canonical-after', 'close', 'parse'];
const classes = ['type', 'symlink', 'links', 'canonical', 'device', 'inode', 'birthtime', 'bound', 'metadata', 'unstable', 'io', 'json', 'schema'];
/** Bound each individual file observation on the same monotonic clock used by ManagedPty.onExit. */
async function readObservation(read, now, role, final, nonce) {
    const start = now();
    try {
        const bytes = await read();
        if (role === 'file')
            return { start, end: now(), state: 'present', bytes: bytes.length, sha256: hash(bytes) };
        let value;
        try {
            value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        }
        catch {
            return { start, end: now(), state: 'hard', operation: 'parse', classification: 'json' };
        }
        if (!validMarker(role, value, nonce))
            return { start, end: now(), state: 'hard', operation: 'parse', classification: 'schema' };
        return { start, end: now(), state: 'present', value };
    }
    catch (error) {
        const end = now(), issue = error.readIssue;
        if (error.code === 'ENOENT' && issue?.operation === 'lstat-before' && issue.classification === 'io')
            return { start, end, state: 'absent', bytes: null, sha256: null };
        const operation = operations.includes(issue?.operation) ? issue.operation : 'read';
        const classification = classes.includes(issue?.classification) ? issue.classification : 'io';
        const transient = !final && classification === 'unstable' && ['read', 'fstat-before', 'fstat-after', 'lstat-after'].includes(operation);
        return { start, end, state: transient ? 'unstable' : 'hard', operation, classification };
    }
}
/** Snapshot every marker in a fixed order. Preserve read intervals even for absent and unstable acknowledgements. */
async function sampleFiles(directory, target, now, nonce, final) {
    const marks = {}, intervals = [];
    let complete = true;
    for (const role of roles) {
        const r = await readObservation(() => L.readStableBytes(path.join(directory, role + '.json'), 2048), now, role, final, nonce);
        const element = [r.start, r.end, r.state];
        if (r.state === 'present')
            marks[role] = r.value;
        if (r.operation) {
            element.push(r.operation, r.classification);
            complete = false;
        }
        intervals.push(element);
    }
    const file = await readObservation(() => L.readStableBytes(path.resolve(target), 4096), now, 'file', final, nonce);
    if (file.state === 'present')
        file.state = file.bytes === marks.entry?.bytes && file.sha256 === marks.entry?.sha256 ? 'matching' : 'unmatched';
    if (['unstable', 'hard'].includes(file.state))
        complete = false;
    return { marks, intervals, file, complete };
}
/** Replay monotonic intervals, closed payload unions and command preconditions. */
function validSample(s, nonce, previous, original) {
    if (!closed(s, ['marks', 'intervals', 'file', 'complete']) || !closed(s.marks, Object.keys(s.marks)) ||
        !Array.isArray(s.intervals) || s.intervals.length !== roles.length || typeof s.complete !== 'boolean')
        return false;
    let cursor = previous, complete = true;
    for (const [i, row] of s.intervals.entries()) {
        if (!Array.isArray(row) || !clock(row[0]) || !clock(row[1]) || row[0] < cursor || row[1] < row[0])
            return false;
        cursor = row[1];
        if (['present', 'absent'].includes(row[2])) {
            if (row.length !== 3)
                return false;
        }
        else if (['hard', 'unstable'].includes(row[2]) && row.length === 5 && operations.includes(row[3]) && classes.includes(row[4]) &&
            (row[2] !== 'unstable' || row[4] === 'unstable'))
            complete = false;
        else
            return false;
        if ((row[2] === 'present') !== Object.hasOwn(s.marks, roles[i]))
            return false;
    }
    if (!Object.entries(s.marks).every(([k, v]) => validMarker(k, v, nonce)))
        return false;
    const r = s.file;
    const entry = s.marks.entry ?? (s.intervals[roles.indexOf('entry')][2] === 'unstable' ? original : undefined);
    if (!clock(r.start) || !clock(r.end) || r.start < cursor || r.end < r.start)
        return false;
    if (['unstable', 'hard'].includes(r.state)) {
        if (!closed(r, ['start', 'end', 'state', 'operation', 'classification']) || !operations.includes(r.operation) || !classes.includes(r.classification) ||
            (r.state === 'unstable' && r.classification !== 'unstable'))
            return false;
        complete = false;
    }
    else {
        if (!closed(r, ['start', 'end', 'state', 'bytes', 'sha256']))
            return false;
        if (r.state === 'absent') {
            if (r.bytes !== null || r.sha256 !== null)
                return false;
        }
        else if (!['matching', 'unmatched'].includes(r.state) || !Number.isInteger(r.bytes) || r.bytes < 0 || r.bytes > 4096 || !digest(r.sha256) ||
            (r.state === 'matching') !== (r.bytes === entry?.bytes && r.sha256 === entry?.sha256))
            return false;
    }
    return s.complete === complete;
}
function validateObservation(o) {
    try {
        if (!closed(o, Object.keys(record(''))) || o.format !== 'native-exit-observation-v2' || o.synthetic !== true || o.nativeExecuted !== false ||
            !Object.entries(invariants).every(([k, v]) => o[k] === v) || typeof o.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(o.nonce) ||
            !['diagnostic-observed', 'unestablished'].includes(o.status) || !reasons.includes(o.reason) ||
            !clock(o.began) || !Array.isArray(o.samples) || o.samples.length > 2000 || Buffer.byteLength(JSON.stringify(o)) > 1048576)
            return false;
        let cursor = o.began, original;
        for (const [i, s] of o.samples.entries()) {
            if (!validSample(s, o.nonce, cursor, original))
                return false;
            if (i === o.challenges?.send?.sample)
                original = s.marks.entry;
            cursor = s.file.end;
        }
        if (!closed(o.decisions, ['sendSample', 'releaseSample']) || !closed(o.challenges, ['send', 'release']))
            return false;
        const atDecision = (index, at) => Number.isInteger(index) && index >= 0 && index < o.samples.length && clock(at) &&
            o.samples[index].file.end <= at && (!o.samples[index + 1] || at <= o.samples[index + 1].intervals[0][0]);
        if ((o.decisions.sendSample === null) !== (o.sent === null) || (o.decisions.releaseSample === null) !== (o.releaseRequested === null) ||
            (o.challenges.send === null) !== (o.b1 === null))
            return false;
        for (const phase of ['send', 'release']) {
            const c = o.challenges[phase], decision = o.decisions[phase + 'Sample'], action = phase === 'send' ? o.sent : o.releaseRequested;
            if (!c) {
                if (decision !== null)
                    return false;
                continue;
            }
            if (!closed(c, ['at', 'sample', 'token']) || !atDecision(c.sample, c.at) || typeof c.token !== 'string' || !/^[a-f0-9]{32}$/.test(c.token))
                return false;
            const requested = o.samples[c.sample];
            if (!pending(requested) || requested.marks[phase + '-participation'] || c.at >= o.b1 + 6000)
                return false;
            if (phase === 'send' ? (o.b1 !== c.at || requested.marks['end-entry']) : (o.sent === null || c.at < o.sent || c.sample <= o.decisions.sendSample ||
                requested.marks['end-entry']?.reason !== 'prompt_input_exit' || c.token === o.challenges.send?.token))
                return false;
            if (decision !== null && (!atDecision(decision, action) || decision <= c.sample || !pending(o.samples[decision]) ||
                o.samples.slice(0, decision).some(s => s.marks[phase + '-participation']) ||
                o.samples[decision].marks[phase + '-participation']?.challenge !== c.token ||
                (phase === 'send' ? !!o.samples[decision].marks['end-entry'] : o.samples[decision].marks['end-entry']?.reason !== 'prompt_input_exit')))
                return false;
        }
        if (o.releaseRequested !== null && (!atDecision(o.decisions.releaseSample, o.releaseRequested) || !pending(o.samples[o.decisions.releaseSample]) ||
            o.samples[o.decisions.releaseSample].marks['end-entry']?.reason !== 'prompt_input_exit' || o.decisions.releaseSample <= o.decisions.sendSample))
            return false;
        const ex = o.exit;
        if (ex !== null && (!closed(ex, ['at', 'code', 'signal', 'emergency']) || !clock(ex.at) || !Number.isSafeInteger(ex.code) ||
            !(ex.signal === null || Number.isSafeInteger(ex.signal)) || typeof ex.emergency !== 'boolean'))
            return false;
        if (o.b1 !== null && (!clock(o.b1) || o.b1 >= o.began + 60000 || !o.samples.some(s => pending(s) && s.file.end <= o.b1 && !s.marks['end-entry'])))
            return false;
        if (o.sent !== null && (!clock(o.sent) || o.b1 === null || o.sent < o.b1 || o.sent >= o.b1 + 6000))
            return false;
        if (o.releaseRequested !== null && (!clock(o.releaseRequested) || o.sent === null || o.releaseRequested < o.sent || o.releaseRequested >= o.b1 + 6000 ||
            (ex && o.releaseRequested > ex.at) || !o.samples.some(s => pending(s) && s.file.start >= o.sent && s.file.end <= o.releaseRequested && s.marks['end-entry']?.reason === 'prompt_input_exit')))
            return false;
        if (o.releaseAccepted !== null && (!clock(o.releaseAccepted) || o.releaseRequested === null || o.releaseAccepted < o.releaseRequested))
            return false;
        if (o.end !== null && (!clock(o.end) || !ex || o.end < ex.at + 60000 || o.end < cursor || cursor > ex.at + 60000))
            return false;
        const seen = {};
        const conflictAt = o.samples.findIndex((s, i) => !acceptEvidence(seen, s, o, i));
        const conflict = conflictAt !== -1;
        const replay = { ...o };
        summarize(replay, seen, conflict);
        if (o.mutation !== replay.mutation || o.dispatch !== replay.dispatch || !equal(o.coverage, replay.coverage))
            return false;
        if (conflict)
            return o.reason === 'evidence-conflict' && o.status === 'unestablished' && conflictAt === o.samples.length - 1 &&
                [o.decisions.sendSample, o.decisions.releaseSample, o.challenges.send?.sample, o.challenges.release?.sample].every(i => i == null || i < conflictAt);
        if (o.reason === 'evidence-conflict')
            return false;
        if (o.status === 'unestablished')
            return o.reason !== 'none';
        if (o.releaseAccepted >= o.b1 + 6000)
            return false;
        const last = o.samples.at(-1);
        if (!ex || !last || last.file.start <= ex.at || !o.coverage || o.coverage.first === null || o.coverage.maxGap > 1000 || o.end - (ex.at + 60000) > 1000 || o.dispatch !== 'confirmed-returned')
            return false;
        for (const [i, s] of o.samples.entries()) {
            if (i <= o.decisions.sendSample && (s.marks['end-entry'] || s.marks['end-returned'] || s.marks['end-rejected']))
                return false;
            if (i <= o.decisions.releaseSample && (s.marks.intent || s.marks.returned || s.marks.rejected || s.file.state === 'matching'))
                return false;
        }
        return o.reason === 'none' && ex !== null && !ex.emergency && ex.code === 0 && ex.signal === null && o.sent !== null && ex.at >= o.sent &&
            ex.at < o.sent + 60000 && o.end !== null && o.releaseAccepted !== null && last.complete && last.file.state === 'matching' &&
            last.marks['end-entry']?.reason === 'prompt_input_exit' && !!last.marks['end-returned'] && !last.marks['end-rejected'] &&
            !!last.marks.intent && last.marks.returned?.coreVerified === true &&
            !o.samples.some(s => s.marks.failed || s.marks.aborted || s.marks.rejected || s.marks.unexpected || s.marks['ack-failed'] || s.file.state === 'hard' || s.intervals.some(r => r[2] === 'hard'));
    }
    catch {
        return false;
    }
}
const profile = { platform: 'win32', arch: 'x64', node: '24.14.0', uv: '1.51.0', electron: null };
const pins = { native: '345996b4bdbae21d817f750fae2f34cbf8d81224a5444c78136091d121beb298', declaration: F.DECLARATION_SHA256, node: '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088' };
const fixture = 'test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json';
const extraSources = [fixture, 'test/manual/companionNativeLifetime.smoke.cjs', 'test/manual/companionNativeLifetimeSupport.cjs', 'test/manual/companionNativeExit.smoke.cjs', 'test/manual/companionNativeExitControl.cjs'];
function validateConfig(value) {
    const c = F.validateConfig(value);
    fact(equal(c.hostProfile, profile) && c.nativeSha256 === pins.native, 'identity-mismatch');
    return c;
}
function ipcBudget(at) { fact(clock(at) && at < 290000, 'controller-deadline'); return Math.min(2000, 290000 - at); }
/** Inspect Git using a bounded owned child and retain its actual close independently of cancellation. */
async function gitRead(args, owned, now) {
    const child = require('node:child_process').spawn('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const item = { child, closed: false };
    owned.push(item);
    const bytes = [];
    let count = 0, failed = false;
    const stop = () => {
        failed = true;
        try {
            child.kill();
        }
        catch { /* Closed/unknown recorded separately. */ }
    };
    const timer = setTimeout(stop, Math.max(1, Math.min(10000, 290000 - now())));
    return new Promise((resolve, reject) => {
        const accumulate = (b, keep) => {
            count += b.length;
            if (count > 4194304)
                stop();
            else if (keep && !failed)
                bytes.push(b);
        };
        child.stdout.on('data', b => accumulate(b, true));
        child.stderr.on('data', b => accumulate(b, false));
        child.once('error', stop);
        child.once('close', code => {
            clearTimeout(timer);
            item.closed = true;
            if (failed || code !== 0)
                reject(new Error('identity-mismatch'));
            else
                resolve(Buffer.concat(bytes));
        });
    });
}
/** Inspect the closed config, committed sources, owned directory and binary pins before and after the observation. */
async function identities(configPath, c, gitOwned, now, directory = null) {
    const git = args => gitRead(args, gitOwned, now);
    const raw = await L.readStableBytes(configPath, 16384);
    fact(equal(validateConfig(JSON.parse(raw)), c), 'identity-mismatch');
    const actualProfile = { platform: process.platform, arch: process.arch, node: process.versions.node, uv: process.versions.uv, electron: process.versions.electron ?? null };
    fact(equal(actualProfile, profile), 'identity-mismatch');
    const head = (await git(['rev-parse', 'HEAD'])).toString().trim();
    fact(head === c.sourceSha && (await git(['status', '--porcelain'])).length === 0, 'identity-mismatch');
    const parent = path.resolve(c.ownedParent), scratch = await fs.realpath(path.join(repo, '.tmp'));
    fact(parent.startsWith(scratch + path.sep), 'identity-mismatch');
    for (let current = parent;; current = path.dirname(current)) {
        const s = await fs.lstat(current);
        fact(s.isDirectory() && !s.isSymbolicLink() && await fs.realpath(current) === current, 'identity-mismatch');
        if (path.dirname(current) === current)
            break;
    }
    const children = await fs.readdir(parent);
    fact(directory ? children.length === 1 && path.join(parent, children[0]) === directory : children.length === 0, 'identity-mismatch');
    const measured = { native: await L.hashStableFile(c.nativeExecutable), declaration: await L.hashStableFile(c.declarationPath), node: await L.hashStableFile(process.execPath) };
    const envelope = await L.readStableBytes(path.join(repo, fixture), 16384);
    const prereq = await L.verifyPrerequisites(c, { facts: async () => ({ profile: actualProfile, head, clean: true, parentFresh: true, pins: measured }),
        envelope: async () => envelope, readDependency: name => L.readStableBytes(path.join(repo, name)) });
    const actual = support.parseFPrerequisite(envelope), names = [...actual.receipt.sources.map(s => s.path), ...extraSources];
    const tracked = (await git(['ls-files', '-z', '--', ...names])).toString().split('\0').filter(Boolean);
    fact(names.length === 29 && tracked.length === 29 && names.every(n => tracked.includes(n)), 'identity-mismatch');
    const sources = [];
    for (const name of names)
        sources.push({ path: name, sha256: hash(await L.readStableBytes(path.join(repo, name))) });
    return { head, pins: measured, config: hash(raw), profile: actualProfile, prerequisite: prereq.rawSha256, sources,
        index: hash(await git(['ls-files', '--stage', '-z'])) };
}
/** Generate only the owned sibling control files and use exclusive creation. */
async function writeControl(directory, primary, nonce) {
    const plugin = path.join(directory, 'control-plugin'), control = path.join(directory, 'control');
    await fs.mkdir(control);
    await fs.mkdir(plugin);
    await fs.mkdir(path.join(plugin, 'hooks'));
    await fs.mkdir(path.join(plugin, '.claude-plugin'));
    const files = [
        ['hooks/control.js', controlSource.createControlPluginSource({ target: primary.target, control: control.replace(/\\/g, '/'), nonce })],
        ['hooks/hooks.json', JSON.stringify({ modules: ['./control.js'] })],
        ['.claude-plugin/plugin.json', JSON.stringify({ name: 'native-exit-diagnostic', version: '0.0.1', description: 'Owned extension normal-exit diagnostic' })]
    ];
    for (const [name, bytes] of files)
        await fs.writeFile(path.join(plugin, name), bytes, { flag: 'wx' });
    return { plugin, control, files: files.map(([name, bytes]) => [path.join(plugin, name), hash(bytes)]) };
}
async function generatedIdentities(built, control, sources) {
    const files = [[built.host, built.generated.hostSha256], [built.adapter, built.generated.adapterSha256], ...control.files];
    for (const s of sources.filter(s => s.path.startsWith('media/attention/')))
        files.push([path.join(built.product, s.path.slice('media/attention/'.length)), s.sha256]);
    const hashes = [];
    for (const [file, expected] of files) {
        const h = hash(await L.readStableBytes(file));
        fact(h === expected, 'identity-mismatch');
        hashes.push(h);
    }
    return hashes;
}
function projection(identity) {
    return { ...identity, sources: identity.sources.map(s => ({ label: hash(s.path), sha256: s.sha256 })) };
}
function retained(v, baseline) {
    return L.validInventory(v) && v.slots.length === 1 && v.channels.length === 1 && v.bindings.retained === 1 && v.bindings.exposed === 1 &&
        v.watch.parent.state === 'present' && (!baseline || equal(v.watch, baseline.watch));
}
/** Evidence persists without an operation that relinquishes either storage or an admission intent. */
async function physicalRead(capture, watch) {
    const parent = path.join(capture, watch.channel), intent = path.join(capture, 'companion-admission.' + String(watch.slot).padStart(2, '0') + '.json');
    const identity = async (file, kind) => {
        const st = await fs.lstat(file, { bigint: true });
        fact((kind === 'directory' ? st.isDirectory() : st.isFile() && st.nlink === 1n) && !st.isSymbolicLink() && await fs.realpath(file) === file, 'storage-changed');
        return hash([st.dev, st.ino, st.birthtimeNs].join(':'));
    };
    const read = async () => ({ parent: await identity(parent, 'directory'), intent: await identity(intent, 'file'), sha256: hash(await L.readStableBytes(intent, 1024)) });
    const a = await read();
    fact(equal(a, await read()), 'storage-changed');
    return a;
}
const actualReceipts = new WeakSet();
const okInspections = ['version', 'auth', 'version', 'auth'].map(kind => ({ kind, close: 'observed', termination: 'not-requested', reason: 'none', exit: 'zero' }));
function envelope() {
    return { format: 'native-exit-diagnostic-v1', topology: 'injected-qualification-probe-only/development', scope: 'diagnostic-not-E', ...invariants,
        synthetic: false, nativeExecuted: false, status: 'unestablished', reason: 'unestablished', before: null, after: null, generated: null, generatedAfter: null,
        inspections: [], ipc: [], baseline: null, finalInventory: null, retainedBefore: null, retainedAfter: null, observation: null, finalRead: null, readBack: null,
        producerExit: null, hostExit: null, hostClose: false, gitCloses: false, teardown: 'pending' };
}
/** Validate a fully observed recorded diagnostic. Authenticating arbitrary JSON requires an independent provenance source. */
function validateReceipt(r) {
    try {
        if (!closed(r, Object.keys(envelope())) || Buffer.byteLength(JSON.stringify(r)) > 1048576 ||
            !Object.entries(invariants).every(([k, v]) => r[k] === v) || r.format !== 'native-exit-diagnostic-v1' || r.scope !== 'diagnostic-not-E' ||
            r.topology !== envelope().topology || r.synthetic !== false || r.nativeExecuted !== true || r.status !== 'diagnostic-observed' || r.reason !== 'none')
            return false;
        const b = r.before;
        if (!closed(b, ['head', 'pins', 'config', 'profile', 'prerequisite', 'sources', 'index']) || !/^[a-f0-9]{40}$/.test(b.head) || !equal(b.pins, pins) ||
            !equal(b.profile, profile) || !digest(b.config) || !digest(b.index) || b.prerequisite !== '787a6d007ade1fa389eb6daef12bc21bbd310563fe5d181283a48d1266c0f7dc' ||
            !Array.isArray(b.sources) || b.sources.length !== 29 || new Set(b.sources.map(s => s.label)).size !== 29 ||
            !b.sources.every(s => closed(s, ['label', 'sha256']) && digest(s.label) && digest(s.sha256)) ||
            hash(JSON.stringify(b.sources.slice(0, 24))) !== 'fdf1843afecd95bc4a019ada9c9e32c68f70f1146777fc63f9dd887f0b2a8aeb' ||
            !extraSources.every((n, i) => b.sources[24 + i].label === hash(n)) || !equal(r.after, b))
            return false;
        if (!Array.isArray(r.generated) || r.generated.length !== 16 || !r.generated.every(digest) || !equal(r.generated, r.generatedAfter) ||
            !equal(r.generated.slice(5), b.sources.slice(0, 11).map(s => s.sha256)) ||
            !equal(r.inspections, okInspections) || !retained(r.baseline) || !retained(r.finalInventory, r.baseline) ||
            !closed(r.retainedBefore, ['parent', 'intent', 'sha256']) || !Object.values(r.retainedBefore).every(digest) || !equal(r.retainedAfter, r.retainedBefore) ||
            r.retainedBefore.sha256 !== r.baseline.watch.intent.sha256)
            return false;
        const o = r.observation;
        if (!o || o.synthetic !== false || o.nativeExecuted !== true || !validateObservation({ ...o, synthetic: true, nativeExecuted: false }) || o.status !== 'diagnostic-observed' ||
            !equal(o.exit, r.producerExit) || !closed(r.hostExit, ['at', 'code', 'signal']) || !clock(r.hostExit.at) || r.hostExit.at < o.end ||
            r.hostExit.code !== 0 || r.hostExit.signal !== null || r.hostClose !== true || r.gitCloses !== true || r.teardown !== 'owned-exits-observed')
            return false;
        const kinds = ['init', 'prepare-primary', 'expose-primary', 'snapshot', 'snapshot', 'stop'];
        if (!Array.isArray(r.ipc) || r.ipc.length !== kinds.length || !r.ipc.every((m, i) => closed(m, ['id', 'kind', 'phase', 'late', 'outcome', 'reason', 'atMs', 'binding']) &&
            m.id === 'l-' + (i + 1) && m.kind === kinds[i] && m.phase === 'settled' && m.late === false && m.outcome === 'ok' && m.reason === 'none' && clock(m.atMs) && m.binding === null && (!i || m.atMs >= r.ipc[i - 1].atMs)))
            return false;
        if (!validSample(r.finalRead, o.nonce, o.end) || !validSample(r.readBack, o.nonce, r.finalRead.file.end) ||
            ![r.finalRead, r.readBack].every(s => s.complete && s.file.state === 'matching' && equal(s.marks, o.samples.at(-1).marks)))
            return false;
        if (r.ipc[3].atMs > o.began || r.ipc[4].atMs < o.end || r.ipc[4].atMs > r.finalRead.intervals[0][0] ||
            r.ipc[5].atMs < r.finalRead.file.end || r.hostExit.at < r.ipc[5].atMs || r.readBack.intervals[0][0] < r.hostExit.at)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
function encodeCheckpoint(value) {
    const bytes = JSON.stringify(value) + '\n';
    fact(Buffer.byteLength(bytes) <= 1048576, 'receipt-limit');
    return bytes;
}
/** Publish a complete token from a fresh sibling staging file. Never write into the consumed name. */
async function publishToken(directory, name, value, io = fs) {
    const output = path.join(directory, name), temporary = output + '.' + crypto.randomUUID() + '.tmp';
    await io.writeFile(temporary, value, { flag: 'wx' });
    await io.rename(temporary, output);
}
/** Verify materialized bytes before handing a generated host to an actor constructor. */
async function forkVerifiedHost(file, expected, fork, read = L.readStableBytes) {
    fact(hash(await read(file)) === expected, 'identity-mismatch');
    return fork(file);
}
/** Enter P-first teardown before any late inspection if the required exit was not observed. */
async function afterObservation(o, owned, now, inspect, report = () => { }) {
    if (!o.exit || o.exit.emergency || o.exit.code !== 0 || o.exit.signal !== null || o.sent === null ||
        o.exit.at < o.sent || o.exit.at >= o.sent + 60000 || o.reason === 'normal-exit-unobserved') {
        const reason = o.reason === 'none' ? 'normal-exit-unobserved' : o.reason;
        report(reason);
        owned.shutdownRequested = true;
        const stopped = await L.stopLifetime(owned, Math.min(8000, Math.max(0, 300000 - now() - 500)));
        return { reason, teardown: stopped ? 'emergency-owned-exits-observed' : 'unresolved' };
    }
    await inspect();
    return null;
}
/** Freeze the owned receipt at submission while keeping the shared guard's deadline and overlap semantics. */
function createReceiptPersistence(receipt, write, fail) {
    let submitted;
    const guard = L.createCheckpointGuard(() => write(encodeCheckpoint(submitted)), fail);
    return {
        async checkpoint(budget = 1000) {
            if (submitted !== undefined || guard.uncertain || !(budget > 0 && budget <= 1000))
                return guard.checkpoint(budget);
            const until = performance.now() + budget;
            submitted = structuredClone(receipt);
            try {
                await guard.checkpoint(Math.min(budget, Math.max(0, until - performance.now())));
            }
            finally {
                submitted = undefined;
            }
        }
    };
}
/** Each checkpoint has an exclusive scratch file and replaces only the owned receipt. */
async function writeCheckpoint(output, bytes) {
    const temporary = output + '.' + crypto.randomUUID() + '.tmp';
    const handle = await fs.open(temporary, 'wx');
    try {
        await handle.writeFile(bytes);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    await fs.rename(temporary, output);
}
/** The only live entry. All actors and clocks are privately constructed after exact source checks. */
async function runLive(configPath) {
    const origin = performance.now(), now = () => Math.floor(performance.now() - origin);
    const c = validateConfig(JSON.parse(await L.readStableBytes(configPath, 16384)));
    const env = L.liveEnvironment(process.env), inspectionOwner = { inspections: [] }, gitOwned = [];
    const owned = { h1: null, h2: null, pty: null, producerExited: false, teardown: false };
    const r = envelope();
    let failure = null, save = null, primary = null, control = null, capture = null, workspace = null, pid = null;
    const nonce = crypto.randomBytes(16).toString('hex');
    const fail = reason => { failure ??= reasons.includes(reason) ? reason : 'io-failed'; r.status = 'unestablished'; r.reason = failure; };
    const check = () => { fact(!failure, failure ?? 'io-failed'); fact(now() < 290000 && !owned.shutdownRequested, 'controller-deadline'); };
    const discard = L.createOutputGuard(fail);
    const persistence = createReceiptPersistence(r, async (bytes) => {
        if (save)
            await writeCheckpoint(save, bytes);
    }, fail);
    const checkpoint = () => persistence.checkpoint(Math.min(1000, Math.max(0, 300000 - now())));
    const emergency = () => {
        fail('controller-deadline');
        for (const i of inspectionOwner.inspections)
            if (!i.closed)
                i.stop();
        for (const g of gitOwned)
            if (!g.closed)
                try {
                    g.child.kill();
                }
                catch { /* actual close observed separately */ }
        return L.checkpointThenStop(owned, persistence, Math.max(0, 300000 - now() - 500));
    };
    const reserve = setTimeout(() => { void emergency(); }, Math.max(0, 290000 - now()));
    const hard = setTimeout(() => {
        void L.stopLifetime(owned, 0);
        for (const i of inspectionOwner.inspections)
            if (!i.closed)
                i.stop();
        if (require.main === module)
            process.exit(1);
    }, Math.max(0, 300000 - now()));
    const inspect = async (argv) => {
        check();
        const pending = F.inspectCli(c.nativeExecutable, argv, workspace, env, inspectionOwner);
        const child = inspectionOwner.inspections.at(-1)?.child;
        // Account every output stream against one run-wide 64 KiB limit, including inspections.
        child?.stdout.on('data', chunk => discard(chunk));
        child?.stderr.on('data', chunk => discard(chunk));
        const v = await pending;
        r.inspections = F.inspectionEvidence(inspectionOwner);
        fact(v.exitObserved && v.code === 0 && v.reason === 'none', 'auth-unverified');
        if (argv[0] === '--version')
            fact(/^2\.1\.322(?: \(Claude Code\))?\s*$/.test(v.output), 'identity-mismatch');
        else {
            let method;
            try {
                method = JSON.parse(v.output).authMethod;
            }
            catch { /* Only a fixed enum leaves the inspection. */ }
            fact(method === 'claude.ai', 'auth-unverified');
        }
        check();
        await checkpoint();
    };
    const alive = () => !owned.producerExited && F.processAlive(pid);
    const sample = final => sampleFiles(control.control, primary.target, now, nonce, final);
    const command = async (kind, extra = {}) => {
        const h = owned.h1;
        fact(h && !h.exited && !h.client.uncertain, 'ipc-uncertain');
        const reply = await h.client.command(kind, extra, ipcBudget(now()));
        fact(L.validReply(kind, reply), 'ipc-uncertain');
        return reply.data;
    };
    const sampleFinal = async () => {
        // Perform both reads even if the diagnostic did not establish the proposed schedule.
        if (owned.h1 && !owned.h1.exited && primary && capture && !owned.h1.client.uncertain) {
            r.finalInventory = await command('snapshot', { watch: primary.watch });
            fact(retained(r.finalInventory, r.baseline), 'storage-changed');
        }
        if (primary && control) {
            r.finalRead = await sample(true);
            fact(r.finalRead.complete, 'read-failed');
        }
    };
    try {
        const identity = await identities(configPath, c, gitOwned, now);
        check();
        const directory = await fs.mkdtemp(path.join(c.ownedParent, 'native-normal-exit-'));
        save = path.join(directory, 'receipt.json');
        r.before = projection(identity);
        await checkpoint();
        workspace = path.join(directory, 'workspace');
        capture = path.join(directory, 'capture');
        await fs.mkdir(workspace);
        await fs.mkdir(capture);
        await inspect(['--version']);
        await inspect(['auth', 'status']);
        const built = await L.buildOwnedSources(directory, identity.sources);
        check();
        const child = await forkVerifiedHost(built.host, built.generated.hostSha256, file => {
            check();
            return require('node:child_process').fork(file, [], { cwd: workspace, env, silent: true, windowsHide: true });
        });
        const h = owned.h1 = { child, closed: false, exited: false, intentional: false };
        child.on('error', () => fail('host-lost'));
        child.once('exit', (code, signal) => {
            h.exited = true;
            r.hostExit = { at: now(), code: Number.isInteger(code) ? code : null, signal: signal === null ? null : 'other' };
            if (!h.intentional && !owned.teardown)
                fail('host-lost');
        });
        child.once('close', () => { h.closed = true; r.hostClose = true; });
        child.stdout.on('data', chunk => discard(chunk));
        child.stderr.on('data', chunk => discard(chunk));
        h.client = L.createHostClient(child, now, value => { fact(!primary); primary = value; });
        r.ipc = h.client.evidence;
        await command('init', { storageRoot: capture, profile: c.hostProfile });
        check();
        const binding = await command('prepare-primary');
        fact(L.validatePrimary(primary, binding, capture));
        check();
        const exposed = await command('expose-primary');
        fact(exposed.bindingLabel === binding.bindingLabel);
        check();
        r.baseline = await command('snapshot', { watch: primary.watch });
        fact(retained(r.baseline), 'storage-changed');
        r.retainedBefore = await physicalRead(capture, primary.watch);
        fact(r.baseline.watch.intent.sha256 === r.retainedBefore.sha256, 'storage-changed');
        control = await writeControl(directory, primary, nonce);
        r.generated = await generatedIdentities(built, control, identity.sources);
        await checkpoint();
        check();
        const { NodePtyFactory } = require(built.adapter), nativePty = require('node-pty');
        const factory = new NodePtyFactory({ spawn: (file, args, options) => {
                check();
                const p = nativePty.spawn(file, args, options);
                pid = p.pid;
                r.nativeExecuted = true;
                return p;
            } });
        owned.pty = await factory.spawn({ executable: c.nativeExecutable, args: ['--session-id', primary.targetIdentity.claudeSessionId,
                '--plugin-dir', control.plugin, '--plugin-dir', built.product, '--permission-mode', 'default', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'],
            cwd: workspace, env: { ...env, ...primary.environment }, importedRoots: [], skippedImportIds: [] });
        owned.pty.onExit(event => {
            owned.producerExited = true;
            r.producerExit = { at: now(), code: event.exitCode, signal: event.signal ?? null, emergency: owned.teardown };
        });
        owned.pty.onData(data => discard(data, true));
        const liveView = o => ({ ...o, synthetic: false, nativeExecuted: r.nativeExecuted });
        let sent = false, released = false;
        const observation = await observeExit({ now, sleep, alive, exit: () => r.producerExit,
            sample: async (final) => { check(); const s = await sample(final); check(); return s; },
            checkpoint: async (o) => { r.observation = liveView(o); await checkpoint(); check(); },
            send: text => { check(); fact(!sent && text === '/exit\r' && alive()); sent = true; owned.pty.write(text); },
            challenge: async (phase, token, frame) => {
                check();
                fact(alive());
                await publishToken(control.control, 'challenge-' + phase, nonce + ':' + frame + ':' + token);
            },
            release: async (token, challenge, frame) => {
                check();
                fact(!released && token === nonce && alive());
                released = true;
                await publishToken(control.control, 'release', nonce + ':' + frame + ':' + challenge);
            }
        }, nonce);
        r.observation = liveView(observation);
        const stopped = await afterObservation(observation, owned, now, async () => {
            fact(validateObservation(observation));
            await checkpoint();
            check();
            await inspect(['--version']);
            await inspect(['auth', 'status']);
        }, fail);
        if (stopped) {
            r.teardown = stopped.teardown;
            throw new Error(stopped.reason);
        }
        r.after = projection(await identities(configPath, c, gitOwned, now, directory));
        fact(equal(r.before, r.after), 'identity-mismatch');
        r.generatedAfter = await generatedIdentities(built, control, identity.sources);
        check();
    }
    catch (error) {
        fail(safeReason(error));
    }
    finally {
        try {
            await sampleFinal();
        }
        catch (error) {
            fail(safeReason(error));
        }
        // A graceful stop follows the real producer exit. A missing exit takes the separate P-first emergency route.
        if (owned.producerExited && owned.h1 && !owned.h1.exited && !owned.h1.client.uncertain && now() < 290000) {
            try {
                owned.h1.intentional = true;
                await command('stop');
                const until = Math.min(290000, now() + 2000);
                while (!owned.h1.closed && now() < until)
                    await sleep(10);
            }
            catch (error) {
                fail(safeReason(error));
            }
        }
        if ((owned.pty && !owned.producerExited) || (owned.h1 && !owned.h1.closed)) {
            fail('teardown-unsettled');
            const stopped = await L.checkpointThenStop(owned, persistence, Math.min(9500, Math.max(0, 300000 - now() - 500)));
            r.teardown = stopped ? 'emergency-owned-exits-observed' : 'unresolved';
        }
        else if (r.teardown === 'pending') {
            r.teardown = owned.producerExited && owned.h1?.closed ? 'owned-exits-observed' : 'unresolved';
        }
        try {
            if (primary && capture) {
                r.retainedAfter = await physicalRead(capture, primary.watch);
                fact(equal(r.retainedBefore, r.retainedAfter), 'storage-changed');
            }
            if (primary && control) {
                r.readBack = await sample(true);
                fact(r.readBack.complete, 'read-failed');
            }
        }
        catch (error) {
            fail(safeReason(error));
        }
        r.gitCloses = gitOwned.length > 0 && gitOwned.every(g => g.closed);
        r.inspections = F.inspectionEvidence(inspectionOwner);
        if (owned.h1?.client.uncertain)
            fail('ipc-uncertain');
        if (!failure && r.observation?.status === 'diagnostic-observed') {
            r.status = 'diagnostic-observed';
            r.reason = 'none';
            if (validateReceipt(r))
                actualReceipts.add(r);
            else
                fail('invalid-evidence');
        }
        else if (!failure)
            fail(r.observation?.reason ?? 'unestablished');
        try {
            await checkpoint();
        }
        catch {
            fail('checkpoint-failed');
        }
        clearTimeout(reserve);
        clearTimeout(hard);
    }
    console.log(r.status + ' ' + r.reason);
    return validateActualReceipt(r) ? 0 : 1;
}
/** Reject unknown opt-ins before acquiring files, credentials or process handles. */
async function main(argv) {
    const args = L.parseArguments(argv);
    if (!args)
        return 2;
    if (args.mode === 'plan') {
        console.log('Diagnostic only. One owned dispatch during normal exit. Storage preserved. E and worker quiescence unestablished.');
        return 0;
    }
    if (args.mode === 'self-test') {
        fact(classifyMutation(10, [{ start: 9, end: 12, state: 'matching' }]) === 'first-observed-after-exit');
        console.log(JSON.stringify({ synthetic: true, nativeExecuted: false, ...invariants }));
        return 0;
    }
    return F.runWithBudget(() => runLive(args.config), 300000, () => {
        if (require.main === module)
            process.exit(1);
    });
}
function validateActualReceipt(receipt) { return actualReceipts.has(receipt) && validateReceipt(receipt); }
module.exports = { main, observeExit, classifyMutation, readObservation, validateObservation, validateActualReceipt, validateReceipt, validateConfig, ipcBudget, encodeCheckpoint, forkVerifiedHost, afterObservation, publishToken, createReceiptPersistence };
if (require.main === module)
    main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { process.exitCode = 1; });
