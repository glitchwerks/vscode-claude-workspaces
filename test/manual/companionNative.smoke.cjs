/* eslint @typescript-eslint/no-require-imports: "off" -- Explicit opt-in manual extension-host harness. */
/* global require, module, __dirname, __filename, process, console, Buffer, setTimeout, clearTimeout, URL */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const fixture = require('../fixtures/companion/qualification.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const closed = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const nonnegative = value => Number.isFinite(value) && value >= 0;

/** Expectations come from committed synthetic literals, never from the actual clipboard. */
function expectedLiterals(item) {
    if (item.fixtureId) return require('../fixtures/companion/copy-cases.json').cases.find(value => value.id === item.fixtureId).expected.map(value => value.literal.replace(/\r?\n/g, '\r\n'));
    const command = fixture.commands.find(value => value.id === item.id);
    return command ? [command.literal] : [];
}

/** Parsing has no filesystem, child-process, CLI, browser or authentication side effects. */
function parseArguments(argv) {
    if (argv.length === 0 || (argv.length === 1 && argv[0] === '--plan')) return { mode: 'plan' };
    if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
    if (argv.length === 5 && argv[0] === '--run-live' && argv[1] === '--mode' &&
        ['bootstrap', 'packaged', 'performance'].includes(argv[2]) && argv[3] === '--config' && path.isAbsolute(argv[4])) {
        return { mode: argv[2], config: argv[4] };
    }
    return undefined;
}

/** Every gate starts pending; no process exit or bootstrap can manufacture qualification. */
function pendingReceipt(mode) {
    assert.ok(['bootstrap', 'packaged', 'performance'].includes(mode));
    return { format: fixture.format, mode, provenance: fixture.provenance[mode], status: 'pending',
        identity: {}, finalReadBack: false, productionAdmission: false,
        authentication: { kind: 'unverified', providerOverrideAbsent: false },
        injections: mode === 'packaged' ? [] : mode === 'performance' ? ['synthetic-pty', 'synthetic-publisher-driver', 'capture-profile', 'qualification'] : ['development-source', 'capture-profile', 'qualification'],
        gates: fixture.matrix.map(item => ({ id: item.id, status: 'pending', evidence: null })) };
}

/** Keep uncontrolled clipboard values out of receipts, including on a mismatch. Never retry writes. */
function clipboardComparison(expected, actual) {
    if (typeof expected !== 'string' || typeof actual !== 'string' ||
        Buffer.byteLength(expected) > fixture.budgets.clipboardBytes || Buffer.byteLength(actual) > fixture.budgets.clipboardBytes) {
        throw new Error('clipboard limit');
    }
    return { equal: expected === actual, expectedSha256: hash(expected), actualSha256: hash(actual),
        expectedBytes: Buffer.byteLength(expected), actualBytes: Buffer.byteLength(actual) };
}

/** Receipt review is fail-closed. JSON alone is not a production admission mechanism. */
function validateReceipt(value) {
    const reasons = [];
    if (!value || typeof value !== 'object' || Buffer.byteLength(JSON.stringify(value)) > fixture.budgets.receiptBytes) {
        return { accepted: false, reasons: ['invalid-or-oversized-receipt'] };
    }
    if (!closed(value, ['format', 'mode', 'provenance', 'status', 'identity', 'finalReadBack', 'productionAdmission', 'authentication', 'injections', 'gates', 'freshCapture', 'performance'])) reasons.push('unexpected-receipt-field');
    if (value.status !== 'passed') reasons.push('receipt-not-reviewed-passed');
    if (value.format !== fixture.format || value.mode !== 'packaged' || value.provenance !== fixture.provenance.packaged ||
        !Array.isArray(value.injections) || value.injections.length !== 0) reasons.push('not-normal-installed-candidate');
    if (value.finalReadBack !== true || value.productionAdmission !== true) reasons.push('candidate-or-admission-unverified');
    const identity = value.identity ?? {};
    if (!closed(identity, fixture.requiredIdentity)) reasons.push('unexpected-identity-field');
    for (const key of fixture.requiredIdentity) {
        if (identity[key] === undefined || identity[key] === null || identity[key] === '') reasons.push('missing-identity:' + key);
    }
    for (const key of ['sourceFingerprint', 'extensionSha256', 'vsixSha256', 'cliSha256', 'sdkSha256']) {
        if (!isHash(identity[key])) reasons.push('invalid-hash:' + key);
    }
    if (!/^[a-f0-9]{40}$/.test(identity.sourceSha ?? '') || identity.platform !== 'win32' || identity.arch !== 'x64' ||
        identity.schemaVersion !== 1) reasons.push('unsupported-identity');
    if (!closed(value.authentication, ['kind', 'providerOverrideAbsent']) || value.authentication?.kind !== 'subscription' || value.authentication?.providerOverrideAbsent !== true) reasons.push('auth-unverified');
    const fresh = value.freshCapture;
    const comparisonValid = (item, expected) => closed(item, ['equal', 'expectedSha256', 'actualSha256', 'expectedBytes', 'actualBytes']) &&
        item.equal === true && item.expectedSha256 === hash(expected) && item.actualSha256 === hash(expected) &&
        item.expectedBytes === Buffer.byteLength(expected) && item.actualBytes === Buffer.byteLength(expected);
    if (!closed(fresh, ['observed', 'route', 'nonce', 'sessionSha256', 'viewSha256', 'groupSha256', 'targetSha256', 'comparison']) ||
        fresh.observed !== true || fresh.route !== 'normal-installed-webview' || !/^[a-f0-9]{32}$/.test(fresh.nonce ?? '') ||
        !['sessionSha256', 'viewSha256', 'groupSha256', 'targetSha256'].every(key => isHash(fresh[key])) ||
        !comparisonValid(fresh.comparison, 'C:/synthetic/cw_' + fresh.nonce + '.txt')) reasons.push('fresh-capture-unverified');
    const gates = Array.isArray(value.gates) ? value.gates.filter(gate => gate && typeof gate === 'object') : [];
    if (gates.length !== fixture.matrix.length || new Set(gates.map(gate => gate.id)).size !== fixture.matrix.length) reasons.push('matrix-incomplete');
    for (const required of fixture.matrix) {
        const gate = gates.find(item => item.id === required.id);
        const evidence = gate?.evidence;
        if (!closed(gate, ['id', 'status', 'evidence']) || evidence && !closed(evidence, ['observed', 'artifactSha256', 'comparisons', 'kind',
            'sessions', 'durationMs', 'samples', 'p95ReadyCopyMs', 'timingBoundary', 'transportBytes', 'transportFiles', 'globalRetentionBytes',
            'sessionRetentionBytes', 'lostUnmarkedBlocks', 'ignoredTrafficSamples', 'duplicateSamples', 'machineSha256', 'inputSamples', 'inputP95Ms',
            'escapeDispatches', 'inputSent', 'interruptionConfirmed', 'hostExited', 'independentProducerPending', 'parentRecreated', 'capacityRetained', 'normalExitObserved'])) reasons.push('unexpected-gate-field:' + required.id);
        if (gate?.status !== 'passed' || !evidence || !isHash(evidence.artifactSha256) || evidence.observed !== true) {
            reasons.push('unconfirmed:' + required.id); continue;
        }
        const literals = expectedLiterals(required);
        if (required.kind === 'clipboard' && (!Array.isArray(evidence.comparisons) || evidence.comparisons.length !== literals.length ||
            evidence.comparisons.some((item, index) => !comparisonValid(item, literals[index])))) reasons.push('clipboard-unconfirmed:' + required.id);
        if (required.kind === 'performance' && (evidence.sessions !== 4 || evidence.durationMs < 1800000 ||
            !Number.isSafeInteger(evidence.samples) || evidence.samples < 1 || !Number.isFinite(evidence.p95ReadyCopyMs) ||
            evidence.p95ReadyCopyMs < 0 || evidence.p95ReadyCopyMs >= 500 || !['source-receipt-to-visible-ready-copy', 'before-publication-to-visible-ready-copy-upper-bound'].includes(evidence.timingBoundary) ||
            !['durationMs', 'transportBytes', 'transportFiles', 'globalRetentionBytes', 'sessionRetentionBytes', 'inputP95Ms'].every(key => nonnegative(evidence[key])) ||
            !['ignoredTrafficSamples', 'duplicateSamples', 'inputSamples'].every(key => Number.isSafeInteger(evidence[key]) && evidence[key] > 0) || !isHash(evidence.machineSha256) ||
            evidence.transportBytes > 33554432 || evidence.transportFiles > 256 || evidence.globalRetentionBytes > 33554432 ||
            evidence.sessionRetentionBytes > 8388608 || evidence.lostUnmarkedBlocks !== 0)) reasons.push('performance-unconfirmed');
        if (required.kind === 'manual' && evidence.kind !== 'reviewed-native-observation') reasons.push('manual-unreviewed:' + required.id);
        if (required.id === 'native-escape' && (evidence.escapeDispatches !== 1 || evidence.inputSent !== true || evidence.interruptionConfirmed !== true)) reasons.push('escape-unconfirmed');
        if (required.id === 'producer-lifetime' && (evidence.hostExited !== true || evidence.independentProducerPending !== true || evidence.parentRecreated !== true || evidence.capacityRetained !== true ||
            !nonnegative(evidence.transportBytes) || evidence.transportBytes > 33554432 || !nonnegative(evidence.transportFiles) || evidence.transportFiles > 256)) reasons.push('producer-lifetime-unconfirmed');
        if (required.id === 'normal-observed-exit' && evidence.normalExitObserved !== true) reasons.push('producer-exit-unconfirmed');
    }
    return { accepted: reasons.length === 0, reasons };
}

/** Safe mode intentionally exercises only pure parsing/comparison/rejection, never native main. */
function selfTest() {
    assert.deepEqual(parseArguments([]), { mode: 'plan' });
    assert.equal(parseArguments(['--run-live']), undefined);
    assert.equal(clipboardComparison('雪\r\n', '雪\n').equal, false);
    assert.equal(validateReceipt(pendingReceipt('bootstrap')).accepted, false);
    assert.equal(validateReceipt(pendingReceipt('packaged')).accepted, false);
    return { status: 'passed', scope: 'synthetic-self-test-only', checks: 5 };
}

/** A closed local configuration supplies reviewed expectations; it never self-approves this process. */
function validateLiveConfig(value) {
    const keys = ['cliExecutable', 'cliVersion', 'extensionsDirectory', 'installedExtension', 'playwrightModule', 'profile', 'sdkFile', 'sourceSha', 'vscodeExecutable', 'vscodeVersion', 'vsix'];
    const version = text => typeof text === 'string' && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(text);
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join() !== keys.sort().join() ||
        ['cliExecutable', 'extensionsDirectory', 'installedExtension', 'playwrightModule', 'sdkFile', 'vscodeExecutable', 'vsix'].some(key => typeof value[key] !== 'string' || !path.isAbsolute(value[key])) ||
        !/^[a-f0-9]{40}$/.test(value.sourceSha) || !version(value.cliVersion) || !version(value.vscodeVersion) ||
        !value.profile || Object.keys(value.profile).sort().join() !== 'arch,electron,node,platform,uv' ||
        value.profile.platform !== 'win32' || value.profile.arch !== 'x64' ||
        !version(value.profile.node) || !version(value.profile.uv) || !version(value.profile.electron)) throw new Error('invalid live config');
    return value;
}

/** Refuse links, concurrent replacement and oversized inputs before allocating a JSON document. */
async function readBoundedJson(file, limit = fixture.budgets.receiptBytes) {
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('input limit');
    const handle = await fs.open(file, 'r');
    try {
        const stat = await handle.stat();
        if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size > limit) throw new Error('input limit');
        const bytes = Buffer.alloc(limit + 1);
        let count = 0;
        while (count <= limit) {
            const read = await handle.read(bytes, count, bytes.length - count, null);
            if (!read.bytesRead) break;
            count += read.bytesRead;
        }
        if (count > limit) throw new Error('input limit');
        return JSON.parse(bytes.subarray(0, count).toString('utf8'));
    } finally { await handle.close(); }
}

/** Hash binaries without placing their contents or local paths in a receipt. */
async function hashFile(file) {
    const stream = require('node:fs').createReadStream(file);
    const digest = crypto.createHash('sha256'); let bytes = 0;
    for await (const chunk of stream) {
        bytes += chunk.length;
        if (bytes > 512 * 1024 * 1024) { stream.destroy(); throw new Error('binary limit'); }
        digest.update(chunk);
    }
    return digest.digest('hex');
}

/** Exact installed bundle read-back, not version-range compatibility or development activation. */
async function candidateIdentity(config) {
    const yauzl = require('yauzl');
    const zip = await new Promise((resolve, reject) => yauzl.open(config.vsix, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
    let entries = 0; let totalBytes = 0; let extensionHash; let manifest;
    try {
        await new Promise((resolve, reject) => {
            zip.on('error', reject); zip.on('end', resolve);
            zip.on('entry', entry => {
                void (async () => {
                    if (++entries > 10000 || (totalBytes += entry.uncompressedSize) > 512 * 1024 * 1024) throw new Error('package limit');
                    if (!entry.fileName.startsWith('extension/') || entry.fileName.endsWith('/')) { zip.readEntry(); return; }
                    const relative = entry.fileName.slice('extension/'.length);
                    if (!relative || relative.split('/').some(part => part === '..' || part === '.') || relative.includes('\\') || relative.includes(':')) throw new Error('unsafe package entry');
                    const installed = path.resolve(config.installedExtension, relative);
                    const real = await fs.realpath(installed);
                    const root = await fs.realpath(config.installedExtension);
                    if (!real.startsWith(root + path.sep)) throw new Error('installed package escape');
                    const stream = await new Promise((resolveStream, rejectStream) => zip.openReadStream(entry, (error, value) => error ? rejectStream(error) : resolveStream(value)));
                    const digest = crypto.createHash('sha256'); const chunks = []; let bytes = 0;
                    for await (const chunk of stream) {
                        bytes += chunk.length;
                        if (bytes > 64 * 1024 * 1024) throw new Error('package entry limit');
                        digest.update(chunk);
                        if (relative === 'package.json') { if (bytes > 128 * 1024) throw new Error('manifest limit'); chunks.push(chunk); }
                    }
                    const expected = digest.digest('hex');
                    if (relative === 'package.json') {
                        manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                        const actual = await readBoundedJson(installed, 128 * 1024);
                        // VS Code adds installation metadata; executable/configuration content must still match.
                        delete actual.__metadata; delete manifest.__metadata;
                        assert.deepEqual(actual, manifest, 'installed manifest differs from candidate');
                    } else assert.equal(await hashFile(installed), expected, 'installed asset differs from candidate');
                    if (relative === 'dist/extension.js') extensionHash = expected;
                    zip.readEntry();
                })().catch(reject);
            });
            zip.readEntry();
        });
    } finally { zip.close(); }
    assert.ok(extensionHash && manifest?.publisher === 'cbeaulieu-gt' && manifest?.name === 'vscode-claude-workspaces');
    return { extensionVersion: manifest.version, extensionSha256: extensionHash, vsixSha256: await hashFile(config.vsix) };
}

/** Launch only an explicitly supplied VS Code executable; never download/install or alter global settings. */
async function launchLive(args) {
    const config = validateLiveConfig(await readBoundedJson(args.config));
    assert.equal(process.platform, 'win32');
    const { execFileSync } = require('node:child_process');
    const sourceSha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(sourceSha, config.sourceSha, 'source SHA differs from reviewed config');
    execFileSync('git', ['-C', repo, 'diff', '--quiet', 'HEAD'], { windowsHide: true });
    const candidate = await candidateIdentity(config);
    const scratchRoot = await fs.realpath(path.join(repo, '.tmp'));
    const extensionsRoot = await fs.realpath(config.extensionsDirectory);
    assert.ok(extensionsRoot.startsWith(scratchRoot + path.sep), 'live extensions directory must be task-owned under repository .tmp');
    assert.equal(path.dirname(await fs.realpath(config.installedExtension)), extensionsRoot);
    const installedNames = await fs.readdir(extensionsRoot);
    assert.ok(installedNames.every(name => [path.basename(config.installedExtension), 'extensions.json', '.obsolete'].includes(name)), 'isolated extensions directory required');
    assert.equal(await hashFile(path.join(repo, 'dist/extension.js')), candidate.extensionSha256, 'local build differs from candidate');
    const sourceFingerprint = hash(execFileSync('git', ['-C', repo, 'ls-files', '--stage', '-z'], { windowsHide: true }));
    const owned = await fs.mkdtemp(path.join(repo, '.tmp/companion-qualification-'));
    const workspace = path.join(owned, 'workspace'); const controller = path.join(owned, 'controller');
    await fs.mkdir(workspace); await fs.mkdir(controller);
    const userData = path.join(owned, 'user-data'); await fs.mkdir(path.join(userData, 'User'), { recursive: true });
    await fs.writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({ 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false, 'update.mode': 'none', 'telemetry.telemetryLevel': 'off' }));
    const workspaceFile = path.join(owned, 'synthetic.code-workspace');
    await fs.writeFile(workspaceFile, JSON.stringify({ folders: [{ path: workspace }], settings: {
        'claudeWorkspaces.claudeExecutable': config.cliExecutable, 'claudeWorkspaces.logLevel': 'off',
        'claudeWorkspaces.waitingSessionNotifications': false
    } }, null, 2));
    await fs.writeFile(path.join(controller, 'package.json'), JSON.stringify({ name: 'companion-qualification-controller',
        publisher: 'local', version: '0.0.0', engines: { vscode: '^1.128.0' }, main: './index.cjs', activationEvents: ['onStartupFinished'] }));
    await fs.writeFile(path.join(controller, 'index.cjs'), 'exports.activate = context => ({context});\n');
    const server = require('node:net').createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const cdpPort = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const payload = { config, mode: args.mode, owned, workspace, candidate, sourceSha, sourceFingerprint, cdpPort };
    const payloadFile = path.join(owned, 'host-input.json');
    await fs.writeFile(payloadFile, JSON.stringify(payload));
    const entry = path.join(controller, 'run.cjs');
    await fs.writeFile(entry, 'exports.run = () => require(' + JSON.stringify(__filename) + ').run(' + JSON.stringify(payloadFile) + ');\n');
    // The test-electron runner does not expose its child or a deadline. Use its documented host flags
    // with a bounded owned child, without downloading, tree-killing or retaining raw host output.
    const host = await runOwnedHost(config.vscodeExecutable, [workspaceFile, '--user-data-dir', userData,
        '--extensions-dir', config.extensionsDirectory, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates',
        '--extensionDevelopmentPath=' + controller, '--extensionTestsPath=' + entry,
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + cdpPort,
        ...(args.mode !== 'packaged' ? ['--disable-extension', 'cbeaulieu-gt.vscode-claude-workspaces'] : [])], fixture.budgets.liveTimeoutMs + 60000);
    await fs.writeFile(path.join(owned, 'host-process.json'), JSON.stringify(host, null, 2));
    console.log('Owned receipt retained: ' + path.join(owned, 'receipt.json'));
    return host.code === 0 && !host.timedOut ? 0 : 1;
}

/** Terminate only this owned host once on timeout; independent native producer storage stays reserved. */
function runOwnedHost(executable, args, timeoutMs) {
    assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= fixture.budgets.liveTimeoutMs + 60000);
    return new Promise(resolve => {
        const child = require('node:child_process').spawn(executable, args, { windowsHide: true,
            env: { ...process.env, CW_COMPANION_EXPLICIT_LIVE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let timedOut = false; let stdoutBytes = 0; let stderrBytes = 0; let finished = false; let settlement;
        const finish = code => {
            if (finished) return; finished = true; clearTimeout(timer); clearTimeout(settlement);
            process.removeListener('SIGINT', stop); child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
            resolve({ code, timedOut, stdoutBytes, stderrBytes });
        };
        let stopped = false;
        const stop = () => { if (stopped) return; stopped = true; child.kill(); settlement = setTimeout(() => finish(null), 1000); };
        const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
        process.once('SIGINT', stop);
        child.stdout.on('data', bytes => { stdoutBytes += bytes.length; if (stdoutBytes > 8 * 1024 * 1024) { timedOut = true; stop(); } });
        child.stderr.on('data', bytes => { stderrBytes += bytes.length; if (stderrBytes > 8 * 1024 * 1024) { timedOut = true; stop(); } });
        child.once('error', () => finish(null)); child.once('exit', code => finish(code));
    });
}

/** A sentinel makes an omitted/failed Copy observable. An uncertain platform write ends the case. */
async function runClipboardCase(literals, io) {
    const comparisons = [];
    for (let index = 0; index < literals.length; index++) {
        await io.write('COMPANION_QUALIFICATION_SENTINEL_' + crypto.randomUUID());
        if (!await io.ready(index)) return { status: 'pending', comparisons };
        comparisons.push(clipboardComparison(literals[index], await io.read()));
        if (!comparisons.at(-1).equal) return { status: 'failed', comparisons };
    }
    return { status: 'passed', comparisons };
}

/** Read-only DOM predicate, also evaluated in the actual installed candidate's webview. */
function inspectFreshCapture(document, challenge) {
    if (!/^[a-f0-9]{32}$/.test(challenge.nonce) || challenge.literal !== 'C:/synthetic/cw_' + challenge.nonce + '.txt') return undefined;
    const expected = ('/' + challenge.installedExtension.replaceAll('\\', '/').replace(/^\//, '') + '/dist/panel/webview/index.js').toLowerCase();
    if (![...document.scripts].some(script => {
        try { const url = new URL(script.src); return url.protocol === 'https:' && url.hostname.endsWith('.vscode-resource.vscode-cdn.net') && decodeURIComponent(url.pathname).toLowerCase() === expected; }
        catch { return false; }
    })) return undefined;
    const viewId = document.querySelector('#app')?.getAttribute('data-companion-view-id');
    if (!/^[a-f0-9]{32}$/.test(viewId ?? '')) return undefined;
    const root = document.querySelector('.companion[data-mode="companion"]');
    if (!root || root.closest('[hidden]') || !['', 'Earlier history is unavailable. '].includes(root.querySelector('.companion-notice')?.textContent)) return undefined;
    const codes = [...root.querySelectorAll('.companion-assistant code')].filter(code => code.textContent === challenge.literal);
    if (codes.length !== 1) return undefined;
    const code = codes[0]; const node = code.closest('[data-node-id]');
    const buttons = node?.querySelectorAll('button[data-target-id]');
    if (buttons?.length !== 1 || buttons[0].disabled || buttons[0].textContent !== 'Copy' || buttons[0].closest('[hidden]')) return undefined;
    const groupId = code.closest('[data-group-id]')?.getAttribute('data-group-id');
    const targetId = buttons[0].getAttribute('data-target-id');
    if (!groupId || groupId.length > 256 || !targetId || targetId.length > 256) return undefined;
    return { viewId, groupId, targetId };
}

/** A normal-path observation, not an admission override. Absence stays pending on today's package. */
async function observeNormalCandidate(vscode, payload, choose, active) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const challenge = { nonce, literal: 'C:/synthetic/cw_' + nonce + '.txt', installedExtension: payload.config.installedExtension };
    const instruction = path.join(payload.owned, 'fresh-candidate-challenge.md');
    await fs.writeFile(instruction, '# Fresh normal-candidate challenge\n\nIn the newly launched owned session, ask Claude to output exactly this path as inline code:\n\n`' + challenge.literal + '`\n\nSelect Companion when ready. Do not paste this value into the system clipboard as a result.\n');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(instruction), { preview: true, viewColumn: vscode.ViewColumn.Beside });
    if (await choose('Prepare the new nonce in the normal installed candidate. Capture unavailable means pending, not a pass.', 'Observe actual Companion', 'Pending') !== 'Observe actual Companion') return null;
    const { chromium } = require(payload.config.playwrightModule);
    const browser = await chromium.connectOverCDP('http://127.0.0.1:' + payload.cdpPort, { timeout: 10000 });
    try {
        active();
        const found = [];
        for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
            const proof = await frame.evaluate('(' + inspectFreshCapture.toString() + ')(document,' + JSON.stringify(challenge) + ')').catch(() => undefined);
            if (proof) found.push({ frame, proof });
        }
        if (found.length !== 1) return null;
        const { frame, proof } = found[0];
        const buttons = await frame.locator('button[data-target-id]').all(); let button;
        for (const item of buttons) if (await item.getAttribute('data-target-id') === proof.targetId) { assert.equal(button, undefined); button = item; }
        assert.ok(button && await button.isVisible() && await button.isEnabled());
        const sessionId = await frame.locator('.session-tab[aria-selected="true"][data-session-id]').getAttribute('data-session-id', { timeout: 2000 });
        assert.ok(sessionId && sessionId.length <= 256);
        active(); await vscode.env.clipboard.writeText('COMPANION_FINAL_SENTINEL_' + crypto.randomUUID()); active();
        await button.click({ timeout: 2000 }); // Exactly one dispatch. Never retry an uncertain action.
        await button.locator('..').locator('.companion-action-feedback').filter({ hasText: /^Copied\.$/ }).waitFor({ state: 'visible', timeout: 2000 });
        active(); const comparison = clipboardComparison(challenge.literal, await vscode.env.clipboard.readText()); active();
        const after = await frame.evaluate('(' + inspectFreshCapture.toString() + ')(document,' + JSON.stringify(challenge) + ')');
        assert.deepEqual(after, proof, 'projection changed while copying');
        assert.equal(await frame.locator('.session-tab[aria-selected="true"][data-session-id]').getAttribute('data-session-id'), sessionId);
        assert.equal(comparison.equal, true, 'fresh candidate clipboard mismatch');
        return { observed: true, route: 'normal-installed-webview', nonce, sessionSha256: hash(sessionId),
            viewSha256: hash(proof.viewId), groupSha256: hash(proof.groupId), targetSha256: hash(proof.targetId), comparison };
    } finally { await browser.close(); }
}

/** Bootstrap attaches the production provider to a real WebviewPanel; one activation owns the PTYs. */
async function openBootstrap(vscode, context, payload) {
    const { build } = require('esbuild');
    const { createCaptureQualificationProbe } = require('../../out/src/companion/companionCapture');
    const performanceMode = payload.mode === 'performance';
    const extension = performanceMode ? require(path.join(payload.config.installedExtension, 'dist/extension.js')) : require('../../out/src/extension');
    const browser = path.join(payload.owned, 'browser');
    if (!performanceMode) await build({ entryPoints: [path.join(repo, 'test/manual/companionNativeWebview.ts')], outdir: browser,
        entryNames: 'index', bundle: true, platform: 'browser', format: 'iife' });
    const panel = vscode.window.createWebviewPanel('companionQualificationBootstrap',
        'Companion bootstrap — NOT qualification', vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(repo), vscode.Uri.file(payload.owned)] });
    context.subscriptions.push(panel);
    const root = vscode.Uri.file(payload.workspace);
    const storage = path.join(payload.owned, 'capture'); await fs.mkdir(storage);
    const bootstrapContext = Object.create(context);
    Object.defineProperties(bootstrapContext, { extensionUri: { value: vscode.Uri.file(performanceMode ? payload.config.installedExtension : repo) },
        globalStorageUri: { value: vscode.Uri.file(path.join(payload.owned, 'bootstrap-storage')) } });
    const producers = [];
    const synthetic = performanceMode ? {
        claudeCapabilities: { get: async () => ({ sessionPersistence: true, settingsFile: false, completionReporter: 'available', version: payload.config.cliVersion }) },
        composerAdapter: { prepareLaunch: async spec => spec, isAvailable: () => false, listCommands: async () => [],
            submit: async request => ({ status: 'rejected', submissionId: request.submissionId, reason: 'unavailable' }), disposeSession: async () => {}, close: async () => {} },
        ptyFactory: { spawn: async spec => {
            const { FakeManagedPty } = require('../../out/test/support/fakeManagedPty');
            const pty = new FakeManagedPty();
            const producer = await createSyntheticProducer(payload.config.installedExtension, spec.env);
            producers.push({ ...producer, pty, sessionId: spec.env.CLAUDE_WORKSPACES_CAPTURE_SESSION_ID });
            return pty;
        } }
    } : {};
    const api = await extension.activateWithDependencies(bootstrapContext, {
        ...synthetic,
        executable: () => payload.config.cliExecutable,
        setup: { ensureConfigured: async () => ({ schemaVersion: 1, configuredRoots: [root.toString(true)], importsByRoot: { [root.toString(true)]: [] } }), configure: async () => {} },
        companion: { capture: { storageRoot: storage, coordinator: createCaptureQualificationProbe(payload.config.profile) },
            ...(performanceMode ? { capability: () => ({ platform: process.platform, arch: process.arch, remoteName: null,
                vscodeVersion: vscode.version, cliVersion: payload.config.cliVersion, cliBuild: payload.config.cliVersion, pluginAvailable: true, schemaVersion: 1 }) } : {}),
            qualifiedBuilds: [{ platform: 'win32', arch: 'x64', cliVersion: payload.config.cliVersion, cliBuild: payload.config.cliVersion,
                schemaVersion: 1, adapterId: 'qualification-probe-only', receipt: 'injected-development-nonqualification' }] },
        views: { registerWebviewViewProvider: (_id, provider) => {
            const webview = panel.webview;
            provider.resolveWebviewView({ visible: true, onDidDispose: panel.onDidDispose,
                onDidChangeVisibility: listener => panel.onDidChangeViewState(listener), webview: {
                    get options() { return webview.options; }, set options(value) { webview.options = { ...value, localResourceRoots: [vscode.Uri.file(repo), vscode.Uri.file(payload.owned), vscode.Uri.file(payload.config.installedExtension)] }; },
                    get html() { return webview.html; }, set html(value) {
                        if (performanceMode) { webview.html = value; return; }
                        const script = webview.asWebviewUri(vscode.Uri.file(path.join(browser, 'index.js')));
                        const style = webview.asWebviewUri(vscode.Uri.file(path.join(browser, 'index.css')));
                        webview.html = value.replace(/src="[^"]+index\.js"/u, `src="${script}"`).replace(/href="[^"]+index\.css"/u, `href="${style}"`);
                    }, cspSource: webview.cspSource, asWebviewUri: webview.asWebviewUri.bind(webview),
                    onDidReceiveMessage: webview.onDidReceiveMessage, postMessage: webview.postMessage.bind(webview)
                }
            });
            return { dispose: () => panel.dispose() };
        } }
    });
    for (let index = 0; index < (performanceMode ? 4 : 1); index++) await api.launchController.launch({ rootMode: 'default' });
    return { producers, storage, panel, usage: api.companionQualificationUsage, close: async () => {
        // These are in-process synthetic producers only; this is never independent native-exit proof.
        for (const producer of producers) { await producer.stop(); producer.pty.emitExit({ exitCode: 0 }); }
        await extension.deactivate();
    } };
}

/** Use the packaged publisher with an explicitly synthetic Node driver and real owned transport files. */
async function createSyntheticProducer(installedRoot, environment) {
    const directory = environment.CLAUDE_WORKSPACES_CAPTURE_DIR;
    assert.ok(typeof directory === 'string' && path.isAbsolute(directory), 'synthetic capture preparation failed');
    const source = await fs.readFile(path.join(installedRoot, 'media/attention/hooks/companion/filePublisher.js'));
    const { createFilePublisher } = await import('data:text/javascript;base64,' + source.toString('base64'));
    const pending = new Set();
    const publisher = createFilePublisher({ fs: {
        read: async file => { const stat = await fs.stat(file); assert.ok(stat.size <= 4096); return fs.readFile(file, 'utf8'); },
        write: async (file, text) => {
            assert.equal(path.dirname(path.resolve(file)), path.resolve(directory));
            const work = fs.writeFile(file, text, { flag: 'wx' }); pending.add(work);
            try { await work; } finally { pending.delete(work); }
        },
        exists: async file => { try { await fs.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } },
        stat: async file => { const stat = await fs.lstat(file); return { kind: stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other',
            size: stat.size, isLink: stat.isSymbolicLink(), mtimeMs: stat.mtimeMs, realPath: await fs.realpath(file) }; },
        list: async file => {
            const entries = await fs.opendir(file); const values = [];
            for await (const entry of entries) {
                const stat = await fs.lstat(path.join(file, entry.name)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
                if (stat) values.push({ name: entry.name, kind: stat.isDirectory() ? 'dir' : 'file', isLink: stat.isSymbolicLink(), size: stat.size, mtimeMs: stat.mtimeMs });
                if (values.length > 256) break;
            }
            return values;
        }
    }, clock: { now: async () => Date.now(), after: (ms, callback) => { const timer = setTimeout(callback, ms); return { cancel: () => clearTimeout(timer) }; } } }, environment);
    publisher.nativeStart(environment.CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID, 'startup');
    return { publisher, stop: async () => { publisher.stop(); await Promise.allSettled([...pending]); } };
}

/** One monotonic clock surrounds publication and the awaited actual ready observation (R3). */
async function measurePublicationUpperBound(publish, ready, now) {
    const start = now();
    await publish();
    assert.equal(await ready(), true, 'ready Copy not observed');
    const elapsed = now() - start;
    assert.ok(nonnegative(elapsed), 'invalid timing samples');
    return elapsed;
}

/** A failed conservative bound does not prove the narrower source-receipt interval failed. */
function summarizeUpperBounds(samples) {
    assert.ok(Array.isArray(samples) && samples.length > 0 && samples.length <= 2000 && samples.every(nonnegative), 'invalid timing samples');
    const sorted = [...samples].sort((a, b) => a - b);
    const p95ReadyCopyMs = sorted[Math.ceil(sorted.length * 0.95) - 1];
    return { p95ReadyCopyMs, latencyGate: p95ReadyCopyMs < 500 ? 'upper-bound-passed' : 'inconclusive-upper-bound',
        timingBoundary: 'before-publication-to-visible-ready-copy-upper-bound' };
}

/** Four-session, thirty-minute synthetic collector; does not qualify native I/O or ordinary activation. */
async function collectSyntheticPerformance(payload, control, active, checkpoint) {
    assert.equal(control.producers.length, 4, 'four synthetic managed sessions required');
    const { performance } = require('node:perf_hooks');
    const { chromium } = require(payload.config.playwrightModule);
    const browser = await chromium.connectOverCDP('http://127.0.0.1:' + payload.cdpPort, { timeout: 10000 });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const durationsMs = []; let duplicateSamples = 0; let ignoredTrafficSamples = 0; let transportBytes = 0; let transportFiles = 0;
    let started;
    let globalRetentionBytes = 0; let sessionRetentionBytes = 0; let queuedSlots = 0; let queuedBytes = 0; let stagedTransactions = 0; let stagedBytes = 0;
    const sampleUsage = () => {
        const usage = control.usage(); assert.equal(usage.managedSessions, 4);
        globalRetentionBytes = Math.max(globalRetentionBytes, usage.globalRetentionBytes);
        sessionRetentionBytes = Math.max(sessionRetentionBytes, usage.maxManagedSessionRetentionBytes);
        assert.ok(globalRetentionBytes <= 33554432 && sessionRetentionBytes <= 8388608, 'retention capacity exceeded');
        for (const producer of control.producers) {
            const snapshot = producer.publisher.snapshot();
            queuedSlots = Math.max(queuedSlots, snapshot.queuedSlots); queuedBytes = Math.max(queuedBytes, snapshot.queuedBytes);
            stagedTransactions = Math.max(stagedTransactions, snapshot.stagedTransactions); stagedBytes = Math.max(stagedBytes, snapshot.stagedBytes);
        }
        assert.ok(queuedSlots <= 64 && queuedBytes <= 4194304 && stagedTransactions <= 8 && stagedBytes <= 2097152, 'publisher capacity exceeded');
    };
    try {
        const deadline = performance.now() + 10000;
        while (control.producers.some(value => value.publisher.snapshot().phase !== 'active') && performance.now() < deadline) { active(); await delay(50); }
        assert.ok(control.producers.every(value => value.publisher.snapshot().phase === 'active'), 'synthetic publisher handshake failed');
        const frames = [];
        for (const context of browser.contexts()) for (const page of context.pages()) for (const frame of page.frames()) {
            if (await frame.locator('.companion').count().catch(() => 0) === 1) frames.push(frame);
        }
        assert.equal(frames.length, 1, 'one owned product webview required'); const frame = frames[0];
        started = performance.now();
        for (let sequence = 0; performance.now() - started < 1800000; sequence++) {
            active(); assert.ok(sequence < 2000, 'sample bound'); const roundStart = performance.now();
            const foreground = control.producers[sequence % 4];
            for (const tab of await frame.locator('.session-tab[data-session-id]').all()) {
                if (await tab.getAttribute('data-session-id') === foreground.sessionId) { await tab.click({ timeout: 2000 }); break; }
            }
            const beforeView = await frame.locator('#app').getAttribute('data-companion-view-id');
            const nonce = crypto.randomBytes(16).toString('hex'); const literal = 'C:/synthetic/cw_' + nonce + '.txt';
            const challenge = { nonce, literal, installedExtension: payload.config.installedExtension };
            const publish = () => {
                for (const producer of control.producers) {
                    const text = producer === foreground ? literal : 'C:/synthetic/background_' + sequence + '.txt';
                    const row = { kind: 'assistantRow', scope: { kind: 'main' }, rowId: 'performance-' + sequence,
                        blocks: [{ kind: 'text', index: 0, text: '`' + text + '`' }] };
                    assert.equal(producer.publisher.enqueue(row, producer.publisher.window()), true);
                    assert.equal(producer.publisher.enqueue(row, producer.publisher.window()), true); duplicateSamples++;
                    assert.equal(producer.publisher.enqueue({ kind: 'unsupported', scope: { kind: 'agent', agentId: 'synthetic' }, reason: 'AGENT_SCOPE' }, producer.publisher.window()), true); ignoredTrafficSamples++;
                }
            };
            const ready = async () => {
                const until = performance.now() + 5000;
                while (performance.now() < until) {
                    active(); sampleUsage(); const proof = await frame.evaluate('(' + inspectFreshCapture.toString() + ')(document,' + JSON.stringify(challenge) + ')');
                    if (proof) {
                        assert.equal(proof.viewId, beforeView, 'view changed during measured publication');
                        assert.equal(await frame.locator('.session-tab[aria-selected="true"]').getAttribute('data-session-id'), foreground.sessionId);
                        for (const button of await frame.locator('button[data-target-id]').all()) {
                            if (await button.getAttribute('data-target-id') === proof.targetId) return await button.isVisible() && await button.isEnabled();
                        }
                    }
                    await delay(10);
                }
                return false;
            };
            durationsMs.push(await measurePublicationUpperBound(publish, ready, () => performance.now()));
            await checkpoint({ kind: 'synthetic-output-upper-bound', complete: false, sessions: 4,
                durationMs: performance.now() - started, samples: durationsMs.length, durationsMs,
                ...summarizeUpperBounds(durationsMs), duplicateSamples, ignoredTrafficSamples, transportBytes, transportFiles,
                globalRetentionBytes, sessionRetentionBytes, queuedSlots, queuedBytes, stagedTransactions, stagedBytes,
                resourceObservation: 'periodic-owned-disk-samples-not-reserved-future-capacity' });
            let bytes = 0; let files = 0; let entriesVisited = 0;
            const scan = async (directory, depth = 0) => {
                assert.ok(depth <= 1, 'unexpected nested capture directory');
                const entries = await fs.opendir(directory);
                for await (const entry of entries) {
                    assert.ok(++entriesVisited <= 300, 'capture enumeration limit');
                    const file = path.join(directory, entry.name); const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
                    if (!stat) continue; assert.equal(stat.isSymbolicLink(), false);
                    if (stat.isDirectory()) await scan(file, depth + 1); else { bytes += stat.size; files++; assert.ok(files <= 256 && bytes <= 33554432, 'transport capacity exceeded'); }
                }
            };
            await scan(control.storage); transportBytes = Math.max(transportBytes, bytes); transportFiles = Math.max(transportFiles, files);
            await delay(Math.max(0, 1000 - (performance.now() - roundStart)));
        }
        const os = require('node:os');
        const machine = { platform: process.platform, arch: process.arch, osRelease: os.release(), logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem() };
        return { kind: 'synthetic-output-upper-bound', complete: true, machine, machineSha256: hash(JSON.stringify(machine)), sessions: 4, durationMs: performance.now() - started, samples: durationsMs.length,
            durationsMs, ...summarizeUpperBounds(durationsMs), duplicateSamples, ignoredTrafficSamples, transportBytes, transportFiles,
            resourceObservation: 'periodic-owned-disk-samples-not-reserved-future-capacity',
            globalRetentionBytes, sessionRetentionBytes, queuedSlots, queuedBytes, stagedTransactions, stagedBytes,
            resourceSampling: 'actual-ledger-and-publisher-snapshots-during-ready-polling-not-atomic-high-water-marks', inputSamples: 0, inputP95Ms: null,
            remaining: ['transient-disk-peaks', 'input-latency', 'view-recreation', 'unmarked-loss-audit', 'native-backend', 'physical-paint'] };
    } finally { await browser.close(); }
}

/** Only the controller is a development extension; the product must resolve to the verified installation. */
async function activateInstalledCandidate(installed, expectedRoot) {
    assert.ok(installed, 'candidate not installed');
    assert.equal(await fs.realpath(installed.extensionPath), await fs.realpath(expectedRoot), 'candidate location');
    assert.equal(installed.packageJSON.main, './dist/extension.js', 'candidate entry point');
    const api = await installed.activate();
    assert.equal(installed.isActive, true, 'candidate activation failed');
    assert.ok(api && Object.keys(api).sort().join() === 'savedWorkspace' && api.savedWorkspace === true, 'normal activation API');
}

/** Runs inside the supplied real extension host. Never invoked by import, plan or self-test. */
async function run(payloadFile) {
    assert.equal(process.env.CW_COMPANION_EXPLICIT_LIVE, '1', 'explicit live launcher required');
    const vscode = require('vscode');
    const payload = await readBoundedJson(payloadFile);
    const config = validateLiveConfig(payload.config);
    const actualProfile = { platform: process.platform, arch: process.arch, node: process.versions.node,
        uv: process.versions.uv, electron: process.versions.electron ?? null };
    assert.equal(vscode.env.remoteName ?? null, null, 'local extension host required');
    assert.deepEqual(actualProfile, config.profile, 'actual extension-host profile mismatch');
    assert.equal(vscode.version, config.vscodeVersion);
    // Inspect names only; values and the environment are never included in any receipt.
    assert.equal(Object.keys(process.env).some(key => /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_USE_BEDROCK|CLAUDE_CODE_USE_VERTEX|CLAUDE_CODE_USE_FOUNDRY)$/i.test(key) && process.env[key]), false,
        'provider/API-key override present');
    const receipt = pendingReceipt(payload.mode);
    const { execFile } = require('node:child_process');
    if (payload.mode !== 'performance') {
        const version = await new Promise((resolve, reject) => execFile(config.cliExecutable, ['--version'],
            { timeout: 10000, maxBuffer: 4096, windowsHide: true }, (error, stdout) => error ? reject(new Error('CLI version probe failed')) : resolve(stdout)));
        assert.equal(version.match(/\b\d+\.\d+\.\d+\b/)?.[0], config.cliVersion);
    }
    receipt.identity = { ...payload.candidate, ...actualProfile, sourceSha: payload.sourceSha,
        sourceFingerprint: payload.sourceFingerprint, vscodeVersion: vscode.version,
        cliVersion: config.cliVersion, cliBuild: config.cliVersion, cliSha256: await hashFile(config.cliExecutable),
        schemaVersion: 1, sdkSha256: await hashFile(config.sdkFile) };
    const output = path.join(payload.owned, 'receipt.json');
    const save = async () => {
        const bytes = JSON.stringify(receipt, null, 2);
        assert.ok(Buffer.byteLength(bytes) <= fixture.budgets.receiptBytes);
        await fs.writeFile(output, bytes + '\n');
    };
    let close; let bootstrap; let expired = false; let timer;
    const active = () => { if (expired) throw new Error('live deadline'); };
    const choose = async (message, ...items) => { active(); const answer = await vscode.window.showInformationMessage(message, ...items); active(); return answer; };
    try {
        await save();
        const controller = vscode.extensions.getExtension('local.companion-qualification-controller');
        const { context } = await controller.activate();
        if (payload.mode !== 'packaged') { bootstrap = await openBootstrap(vscode, context, payload); close = bootstrap.close; }
        else {
            const installed = vscode.extensions.getExtension('cbeaulieu-gt.vscode-claude-workspaces');
            await activateInstalledCandidate(installed, config.installedExtension);
            await vscode.commands.executeCommand('claudeWorkspaces.show');
            await vscode.commands.executeCommand('claudeWorkspaces.newSession');
        }
        const work = async () => {
            if (payload.mode === 'performance') {
                receipt.performance = await collectSyntheticPerformance(payload, bootstrap, active, async progress => { receipt.performance = progress; await save(); });
                receipt.gates.find(gate => gate.id === 'four-session-performance').status = 'manual';
                await save(); return;
            }
            const auth = await choose('Verify this owned CLI shows subscription authentication and no provider/API-key override in CLI/workspace settings. Do not enter account details or credentials.', 'Observed subscription; no override', 'Unverified');
            if (auth === 'Observed subscription; no override') receipt.authentication = { kind: 'subscription', providerOverrideAbsent: true };
            if (payload.mode === 'packaged') {
                receipt.freshCapture = await observeNormalCandidate(vscode, payload, choose, active);
                receipt.productionAdmission = receipt.freshCapture !== null;
                await save();
            }
            const copyCases = require('../fixtures/companion/copy-cases.json');
            for (const item of fixture.matrix) {
                active(); const gate = receipt.gates.find(value => value.id === item.id);
                const source = item.fixtureId ? copyCases.cases.find(value => value.id === item.fixtureId) : fixture.commands.find(value => value.id === item.id);
                const description = source ? '# Synthetic fixture ' + item.id + '\n\nAsk the owned CLI to reproduce this exact synthetic source, preserving literal formatting. Do not use real conversation text.\n\n' + source.input + '\n\n' + item.instruction + '\n\nExpected clipboard literals (JSON; preserve whitespace):\n' + JSON.stringify(expectedLiterals(item), null, 2) : '# Native gate ' + item.id + '\n\n' + item.instruction;
                const instruction = path.join(payload.owned, 'current-step.md'); await fs.writeFile(instruction, description);
                await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(instruction), { preview: true, viewColumn: vscode.ViewColumn.Beside });
                if (item.kind === 'clipboard') {
                    const prepared = await choose(item.id + ': prepare the exact synthetic fixture in the CLI, verify its source, then continue. Clipboard will be overwritten with a unique sentinel before each product Copy.', 'Fixture ready', 'Pending');
                    if (prepared !== 'Fixture ready') { await save(); continue; }
                    const literals = expectedLiterals(item);
                    const result = await runClipboardCase(literals, { write: async value => { active(); await vscode.env.clipboard.writeText(value); active(); },
                        read: async () => { active(); const value = await vscode.env.clipboard.readText(); active(); return value; },
                        ready: async index => await choose(item.id + ' target ' + (index + 1) + ': click product Copy (or Review and confirm the displayed exact literal) ONCE, then read back. Never retry an uncertain write.', 'Copy completed', 'Pending') === 'Copy completed' });
                    gate.status = result.status;
                    gate.evidence = { observed: result.status === 'passed', comparisons: result.comparisons,
                        artifactSha256: hash(JSON.stringify({ id: item.id, comparisons: result.comparisons })) };
                } else {
                    const result = await choose(item.id + ': follow the manual guide and retain the required measured/physical artifact. Operator observations require independent review; no automatic pass.', 'Observed; review required', 'Failed', 'Pending');
                    gate.status = result === 'Failed' ? 'failed' : result === 'Observed; review required' ? 'manual' : 'pending';
                }
                await save();
            }
        };
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('live deadline')); }, fixture.budgets.liveTimeoutMs); });
        await Promise.race([work(), deadline]);
        assert.equal(await hashFile(config.cliExecutable), receipt.identity.cliSha256, 'CLI changed during run');
        assert.equal(await hashFile(config.sdkFile), receipt.identity.sdkSha256, 'SDK changed during run');
        assert.deepEqual(await candidateIdentity(config), payload.candidate, 'candidate changed during run');
        receipt.finalReadBack = payload.mode === 'packaged';
        // This is necessary evidence, not sufficient acceptance: manual/performance gates still need review.
        receipt.status = receipt.gates.some(gate => gate.status === 'failed') ? 'failed' : 'pending';
    } catch {
        expired = true; receipt.status = 'failed';
    } finally {
        clearTimeout(timer); expired = true;
        await save();
        // Deactivation can request termination; it is not proof that an independent producer exited.
        if (close) await close();
        // Never recursively delete owned/user-data/capture storage here, even after host exit.
    }
}

async function main(argv) {
    const args = parseArguments(argv);
    if (!args) { console.error('Use --plan, --self-test, or --run-live --mode bootstrap|packaged|performance --config ABSOLUTE_JSON.'); return 2; }
    if (args.mode === 'plan') { console.log(JSON.stringify(fixture, null, 2)); return 0; }
    if (args.mode === 'self-test') { console.log(JSON.stringify(selfTest())); return 0; }
    return await launchLive(args);
}

module.exports = { parseArguments, pendingReceipt, clipboardComparison, validateReceipt, validateLiveConfig,
    readBoundedJson, runClipboardCase, inspectFreshCapture, activateInstalledCandidate, runOwnedHost,
    measurePublicationUpperBound, summarizeUpperBounds, createSyntheticProducer, selfTest, main, run };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => {
    console.error('Companion qualification stopped; inspect the owned sanitized receipt.'); process.exitCode = 1;
});
