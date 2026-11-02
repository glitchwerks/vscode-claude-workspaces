/* eslint @typescript-eslint/no-require-imports: "off" -- Opt-in standalone Windows native control. */
/* global require, module, __dirname, process, console, setTimeout, performance, window, document, MutationObserver */
// Uses a supplied Playwright module; no browser/native process starts on import.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const repo = path.resolve(__dirname, '../..');
function parseArguments(argv) {
    const values = new Map();
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (values.has(key))
            return undefined;
        if (key === '--run-live')
            values.set(key, true);
        else if (['--claude-executable', '--playwright-module'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--'))
            values.set(key, argv[++i]);
        else
            return undefined;
    }
    if (!values.get('--run-live') || typeof values.get('--claude-executable') !== 'string' || !path.isAbsolute(values.get('--claude-executable')) || typeof values.get('--playwright-module') !== 'string')
        return undefined;
    return { executable: values.get('--claude-executable'), playwrightModule: path.resolve(values.get('--playwright-module')) };
}
async function main(argv) {
    const args = parseArguments(argv);
    if (!args) {
        console.error('Native control requires --run-live, an absolute --claude-executable and --playwright-module.');
        return 2;
    }
    assert.equal(process.platform, 'win32', 'Windows-only manual control');
    const { executable, playwrightModule } = args;
    const versionResult = await promisify(execFile)(executable, ['--version'], { timeout: 10000, windowsHide: true, env: { ...process.env, DISABLE_AUTOUPDATER: '1' } });
    const versionMatch = versionResult.stdout.match(/\d+\.\d+\.\d+/);
    assert.ok(versionMatch);
    const executableHash = crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');
    const { buildSync } = require('esbuild');
    const { chromium } = require(playwrightModule);
    const { NodePtyFactory } = require('../../out/src/launch/nodePtyAdapter');
    const { createAttentionSignalProcessor, startAttentionChannelWatcher } = require('../../out/src/attention/attentionSignalWatcher');
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const dir = path.join(repo, '.tmp/current-agent-input-' + crypto.randomUUID()), plugin = path.join(dir, 'probe'), product = path.join(dir, 'product'), channel = path.join(dir, 'channel'), workspace = path.join(dir, 'workspace');
    for (const p of [path.join(plugin, '.claude-plugin'), path.join(plugin, 'hooks'), channel, workspace])
        await fs.mkdir(p, { recursive: true });
    await fs.cp(path.join(repo, 'media/attention'), product, { recursive: true });
    await fs.writeFile(path.join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'quiet-agent-input-control', version: '0.0.1', description: 'Synthetic quiet native agent input control' }));
    await fs.writeFile(path.join(plugin, 'hooks/hooks.json'), JSON.stringify({ modules: ['./control.js'] }));
    await fs.writeFile(path.join(plugin, 'hooks/control.js'), `let started=false;let held=0;let spawned=0;let failed=false;let failureKinds=[];
async function observe($){try{const agents=await $.agent.list();const draft=await $.prompt.read();await $.fs.write(${JSON.stringify(path.join(plugin, 'observation.json'))},JSON.stringify({held,spawned,failed,failureKinds,inventoryCount:agents.length,statuses:agents.map(a=>a.status),running:agents.filter(a=>a.status==='running').length,promptLength:draft.text.length,onlyFixtureInput:/^CWFIX_x*$/.test(draft.text)}));}catch{failed=true;}$.clock.after(100,()=>observe($));}
export function register(on){on('session.start',async($,e,next)=>{const r=await next(e);if(!started){started=true;$.clock.after(1000,async()=>{void observe($);for(let i=0;i<2;i++)void $.agent.spawn({prompt:'Reply only with FIXTURE_AGENT_DONE.',description:'Synthetic held agent',subagentType:'general-purpose',model:'haiku'}).then(r=>{if(r.agentId)spawned++;else{failed=true;failureKinds=["tool","enabled","session","permission","model","context","turn","agent"].filter(k=>String(r.deny).toLowerCase().includes(k));}},()=>{failed=true;});});}return r;});}
`);
    buildSync({ entryPoints: [path.join(repo, 'test/manual/nativeAgentInputWebview.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: path.join(dir, 'browser.js') });
    const holder = path.join(dir, 'holder');
    await fs.mkdir(path.join(holder, '.claude-plugin'), { recursive: true });
    await fs.mkdir(path.join(holder, 'hooks'), { recursive: true });
    await fs.writeFile(path.join(holder, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'quiet-agent-holder', version: '0.0.1', description: 'Separate native turn hold control' }));
    await fs.writeFile(path.join(holder, 'hooks/hooks.json'), JSON.stringify({ modules: ['./hold.js'] }));
    await fs.writeFile(path.join(holder, 'hooks/hold.js'), `let held=0;export function register(on){on('turn.step',async function*($,e,next){if(e.agentId!==undefined){held++;await $.fs.write(${JSON.stringify(path.join(plugin, 'held.json'))},JSON.stringify({held}));await $.clock.sleep(60000);}return yield* next(e);});}`);
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    let pty, watcher, processor;
    const errors = [];
    let chain = Promise.resolve(), trusted = false, raw = '', closing = false;
    let dataSubscription;
    const transitions = [];
    const start = performance.now();
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        page.on('pageerror', () => errors.push('page-error'));
        const id = crypto.randomUUID();
        const session = { id: 'keys', claudeSessionId: id, rootId: 'fixture', displayName: 'Quiet native agents', ordinalWithinRoot: 1, state: 'running', activity: 'idle', hasUnreadResponse: false, launchedImportIds: [], launchedAddDirPaths: [], launchedRootLabel: 'fixture', launchedRootPath: workspace, launchedAt: Date.now() };
        await page.exposeFunction('nativeInput', m => { if (m.type === 'input')
            pty?.write(m.data); if (m.type === 'resize')
            pty?.resize(m.cols, m.rows); });
        const css = (await Promise.all(['node_modules/@xterm/xterm/css/xterm.css', 'src/panel/webview/styles.css'].map(p => fs.readFile(path.join(repo, p), 'utf8')))).join('\n');
        await page.setContent('<style>' + css + 'html,body,#app{height:100%;margin:0}:root{color:#ddd;--vscode-foreground:#ddd;--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd;--vscode-panel-background:#1e1e1e}</style><main id="app"></main>');
        await page.addScriptTag({ path: path.join(dir, 'browser.js') });
        await page.evaluate(s => window.agentInputControl.renderer.handleMessage({ type: 'hydrate', sessions: [s], activeSessionId: s.id, resumableSessions: [], terminalFont: { fontFamily: 'monospace', fontSize: 14, lineHeight: 1.1, letterSpacing: 0 } }), session);
        processor = createAttentionSignalProcessor({ sessions: [session], onDidChangeSessions: () => ({ dispose() { } }), setAttention(_id, attention) { Object.assign(session, attention); transitions.push({ ms: performance.now() - start, activity: session.activity, count: session.activeAgentCount ?? 0 }); const copy = { ...session }; chain = chain.then(() => page.evaluate(s => window.agentInputControl.renderer.handleMessage({ type: 'sessionUpdated', session: s }), copy)).catch(() => { if (!closing)
                errors.push('status-delivery'); }); } }, () => { }, undefined, undefined, () => { }, () => false);
        watcher = await startAttentionChannelWatcher(channel, processor, () => errors.push('watcher'));
        pty = await new NodePtyFactory().spawn({ executable, args: ['--session-id', id, '--plugin-dir', product, '--plugin-dir', plugin, '--plugin-dir', holder, '--permission-mode', 'default', '--tools', 'Agent', '--model', 'haiku', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'], cwd: workspace, env: { ...process.env, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel, CLAUDE_WORKSPACES_SESSION_ID: 'keys' }, importedRoots: [], skippedImportIds: [] });
        pty.resize(120, 28);
        dataSubscription = pty.onData(data => { raw = (raw + data).slice(-16000); if (!trusted && /Yes, I trust this folder/.test(raw)) {
            trusted = true;
            pty.write('\r');
        } chain = chain.then(() => page.evaluate(data => window.agentInputControl.renderer.handleMessage({ type: 'sessionData', sessionId: 'keys', data }), data)).catch(() => { if (!closing)
            errors.push('output-delivery'); }); });
        let observation;
        const until = async (predicate) => { const deadline = Date.now() + 20000; while (Date.now() < deadline) {
            try {
                observation = JSON.parse(await fs.readFile(path.join(plugin, 'observation.json'), 'utf8'));
                const hold = JSON.parse(await fs.readFile(path.join(plugin, 'held.json'), 'utf8'));
                observation.held = hold.held;
            }
            catch { /* The native worker may still be replacing its observation file. */ }
            if (predicate())
                return;
            await delay(50);
        } throw Error('Synthetic agent observation deadline: ' + JSON.stringify(observation)); };
        await until(() => observation?.held === 2 && observation.running === 2 && session.activeAgentCount === 2);
        await chain;
        assert.equal(session.activity, 'working');
        assert.equal(await page.locator('.session-tab-agents').innerText(), '2 agents');
        await page.locator('.xterm-helper-textarea').focus();
        await page.keyboard.type('CWFIX_');
        await page.waitForFunction(() => window.agentInputControl.text().includes('CWFIX_'));
        await page.evaluate(() => { window.agentInputControl.remounts = 0; window.agentInputControl.observer = new MutationObserver(rows => window.agentInputControl.remounts += rows.length); window.agentInputControl.observer.observe(document.querySelector('.terminal-stage'), { childList: true }); });
        const samples = [];
        for (let i = 1; i <= 12; i++) {
            const t = performance.now();
            await page.keyboard.type('x');
            await page.waitForFunction(n => window.agentInputControl.text().includes('CWFIX_' + 'x'.repeat(n)), i, { timeout: 5000 });
            samples.push(performance.now() - t);
            await delay(100);
        }
        await until(() => observation?.promptLength === 18);
        await chain;
        const sourceFiles = ['media/attention/hooks/register.js', 'media/attention/hooks/completionRetry.js', 'media/attention/hooks/composer.js', 'media/attention/report-activity.ps1', 'src/attention/attentionSignalWatcher.ts', 'src/panel/webview/renderer.ts', 'src/panel/webview/xtermTerminal.ts', 'src/launch/nodePtyAdapter.ts', 'test/manual/nativeAgentInput.smoke.cjs', 'test/manual/nativeAgentInputWebview.ts'];
        const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (p) => [p, crypto.createHash('sha256').update((await fs.readFile(path.join(repo, p), 'utf8')).replace(/\r\n/g, '\n')).digest('hex')])));
        const receipt = { sourceHashes, version: versionMatch[0], executableSha256: executableHash, browserVersion: browser.version(), measuredAt: new Date().toISOString(), scope: 'Actual native subagents held inside turn.step before model entry; Playwright keyboard events through production renderer/xterm and inbox NodePtyFactory. This does not reproduce the reported affected-machine freeze.', heldAgents: observation.held, oracleRunning: observation.running, oracleAgentCount: observation.inventoryCount, oracleStatuses: observation.statuses, hostActiveAgents: session.activeAgentCount, activity: session.activity, nativePromptLength: observation.promptLength, onlyFixtureInput: observation.onlyFixtureInput, typedCharacters: 18, measuredCharacters: 12, inputToXtermBufferMs: samples, terminalRemounts: await page.evaluate(() => window.agentInputControl.remounts), focusPreserved: await page.locator('.xterm-helper-textarea').evaluate(el => el === document.activeElement), transitions, errors };
        assert.equal(crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex'), executableHash, 'Executable changed during the control');
        await fs.writeFile(path.join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
        console.log(JSON.stringify(receipt));
        assert.equal(receipt.onlyFixtureInput, true);
        assert.equal(receipt.hostActiveAgents, 2);
        assert.equal(receipt.terminalRemounts, 0);
        assert.equal(receipt.focusPreserved, true);
        assert.deepEqual(errors, []);
    }
    finally {
        closing = true;
        dataSubscription?.dispose();
        watcher?.dispose();
        processor?.dispose();
        try {
            await pty?.terminate();
        }
        finally {
            pty?.dispose();
            await chain.catch(() => { });
            await browser.close();
        }
    }
    return 0;
}
module.exports = { parseArguments, main };
if (require.main === module)
    main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error({ name: error.name, code: error.code ?? null }); process.exitCode = 1; });
