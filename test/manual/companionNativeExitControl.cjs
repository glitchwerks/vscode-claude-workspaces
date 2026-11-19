/* global module, performance, TextEncoder, crypto, TARGET, CONTROL, NONCE */
'use strict';
/** This function is emitted verbatim and runs in the Native SDK hook environment. */
function register(on) {
    let held = false, heldFrame = null;
    const write = ($, kind, fields = {}) => $.fs.write(CONTROL + '/' + kind + '.json', JSON.stringify({ nonce: NONCE, ...fields }));
    // A marker failure may itself be impossible to persist as the session ends.
    const acknowledge = async ($, kind, fields) => {
        try {
            await write($, kind, fields);
            return true;
        }
        catch {
            try {
                await write($, 'ack-failed', { marker: kind });
            }
            catch { /* Missing evidence stays unknown. */ }
            return false;
        }
    };
    on('session.start', async ($, e, next) => {
        const version = await $.session.version(), turns = await $.session.turns();
        await acknowledge($, 'started', { version: version.base === '2.1.322' && version.version === '2.1.322' ? '2.1.322' : 'unsupported', turns: turns === 0 ? 0 : 1 });
        return next(e);
    });
    on('turn.start', async ($, e, next) => { await acknowledge($, 'unexpected', { event: 'turn' }); return next(e); });
    on('model.complete', async ($) => {
        await acknowledge($, 'unexpected', { event: 'model' });
        return { deny: 'no-model' };
    }).catch(() => ({ deny: 'no-model' }));
    on('session.end', async ($, e, next) => {
        const reason = ['prompt_input_exit', 'clear', 'resume', 'logout', 'other'].includes(e.reason) ? e.reason : 'unknown';
        const entry = acknowledge($, 'end-entry', { reason });
        try {
            const result = await next(e);
            await Promise.all([entry, acknowledge($, 'end-returned')]);
            return result;
        }
        catch (error) {
            await Promise.all([entry, acknowledge($, 'end-rejected')]);
            throw error;
        }
    });
    on('fs.write', async ($, e, next) => {
        if (typeof e.path !== 'string' || e.path.replace(/\\/g, '/') !== TARGET.replace(/\\/g, '/') ||
            next.origin.plugin !== 'workspaces-attention' || next.origin.tier !== 'user')
            return next(e);
        if (held)
            throw new Error('duplicate');
        held = true;
        // Both deadlines start before hashing, marker I/O and the release wait.
        const began = performance.now();
        const until = began + Math.min(7000, next.budget.remainingMs - 500);
        const consumeUntil = began + 6000;
        const frame = Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, '0')).join('');
        heldFrame = frame;
        const prefix = NONCE + ':' + frame + ':';
        const check = () => {
            if (next.signal.aborted !== false)
                throw new Error('aborted');
            const now = performance.now();
            if (!(now < until && now < consumeUntil && next.budget.remainingMs > 500))
                throw new Error('expired');
        };
        check();
        if (typeof e.text !== 'string')
            throw new Error('payload');
        const data = new TextEncoder().encode(e.text);
        if (data.length < 1 || data.length > 4096)
            throw new Error('payload');
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
        await write($, 'entry', { frame, origin: 'workspaces-attention', tier: 'user', targetKind: 'epoch-request-upload', bytes: data.length, sha256, forwardCount: 0 });
        check();
        // Only this closure owns the original continuation, signal and two fresh challenges.
        const witnesses = {};
        for (const phase of ['send', 'release']) {
            const file = CONTROL + '/challenge-' + phase;
            while (!await $.fs.exists(file)) {
                check();
                await $.clock.sleep(20, { signal: next.signal });
            }
            check();
            const challenge = await $.fs.read(file);
            if (typeof challenge !== 'string' || !challenge.startsWith(prefix) ||
                !/^[0-9a-f]{32}$/.test(challenge.slice(prefix.length)))
                throw new Error('release-mismatch');
            check();
            witnesses[phase] = challenge.slice(prefix.length);
            if (!await acknowledge($, phase + '-participation', { frame, challenge: witnesses[phase] }))
                throw new Error('ack-failed');
            check();
        }
        while (!await $.fs.exists(CONTROL + '/release')) {
            check();
            await $.clock.sleep(20, { signal: next.signal });
            check();
        }
        check();
        if (await $.fs.read(CONTROL + '/release') !== prefix + witnesses.release)
            throw new Error('release-mismatch');
        check();
        if (!await acknowledge($, 'intent', { frame }))
            throw new Error('ack-failed');
        check();
        let result;
        try {
            result = await next(e);
        }
        catch (error) {
            await acknowledge($, 'rejected', { frame });
            throw error;
        }
        const core = next.trace.filter(t => t.plugin === 'engine' && t.tier === 'core' && t.event === 'fs.write');
        const verified = core.length === 1 && ['returned', 'passed'].includes(core[0].outcome) &&
            core[0].received.path === e.path && core[0].received.text === e.text;
        await acknowledge($, 'returned', { frame, coreVerified: verified });
        if (next.signal.aborted)
            await acknowledge($, 'aborted', { frame });
        return result;
    }).catch(async ($, e, next) => {
        if (next.signal.aborted)
            await acknowledge($, 'aborted', { frame: heldFrame });
        const message = next.error?.message;
        const reason = ['duplicate', 'aborted', 'expired', 'payload', 'release-mismatch', 'ack-failed'].includes(message) ? message : 'hook-failed';
        await acknowledge($, 'failed', { frame: heldFrame, reason });
        return { deny: 'diagnostic-write-failed' };
    });
}
/** Generate one plugin with reviewed literal hooks and nonce-bound sibling markers. */
function createControlPluginSource({ target, control, nonce }) {
    if (typeof target !== 'string' || typeof control !== 'string' || !/^[a-f0-9]{32}$/.test(nonce))
        throw new Error('invalid-control');
    return 'const TARGET=' + JSON.stringify(target) + ',CONTROL=' + JSON.stringify(control) + ',NONCE=' + JSON.stringify(nonce) + ';\nexport ' + register.toString();
}
module.exports = { createControlPluginSource };
