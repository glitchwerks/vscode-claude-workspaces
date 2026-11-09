/* eslint @typescript-eslint/no-require-imports: "off" -- Standalone CommonJS runner for compiled modules. */
/* global require, module, __filename, process, console, setTimeout, clearTimeout */
// Explicit Windows transport experiment. Does not start Claude or change extension settings.
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const path = require('node:path');

const REPLIES = Object.freeze({
  'plain-bel': '\x1b]7501;?\x07',
  'plain-st': '\x1b]7501;?\x1b\\',
  'lists-bel': '\x1b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\x07',
  'lists-st': '\x1b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\x1b\\',
  'arrow-up': '\x1b[A'
});
const QUERY = '\x1b]7501;?\x07';
const report = state => '\x1b]7501;state=' + state + ':app=transport-control\x07';
const CHILD_TIMEOUT = '\x1b]7501;state=error:app=transport-timeout\x07';
const START = 'Q7TOKEN', END = 'Q8TOKEN';

// Microsoft Terminal #4999: CSI Vk;Sc;Uc;Kd;Cs;Rc _.
// Only the fixed generated ASCII fixtures above are accepted, never user input.
function encodeFixedReply(reply) {
  assert(Object.values(REPLIES).includes(reply));
  return [...reply].map(character => '\x1b[0;0;' + character.charCodeAt(0) + ';1;0;1_').join('');
}

function child(variant) {
  assert(process.stdin.isTTY, 'Controlled child requires a console');
  assert(Object.hasOwn(REPLIES, variant));
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let received = '', finished = false;
  const timer = setTimeout(() => finish('child-timeout'), 3000);
  function finish(outcome) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    // Only generated control metadata is emitted. No input bytes are logged.
    process.stdout.write(outcome === 'child-timeout' ? CHILD_TIMEOUT : report(outcome === 'exact' ? 'done' : 'error'), () => {
      process.stdin.pause();
      setTimeout(() => process.exit(outcome === 'exact' ? 0 : 1), 100);
    });
  }
  process.stdin.on('data', data => {
    received = (received + data.toString('utf8')).slice(-4096);
    if (received.endsWith(END)) finish(received === START + REPLIES[variant] + END ? 'exact' : 'different');
  });
  setTimeout(() => process.stdout.write(QUERY), 50);
}

async function control(factory, variant, transport) {
  const pty = await factory.spawn({
    executable: process.execPath, args: [__filename, '--child', variant],
    cwd: path.dirname(__filename), env: { ...process.env }
  });
  let suffix = '', replied = false, exited = false, settle, reject, timeout;
  let exit, data, completed = false;
  const result = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
  try {
    exit = pty.onExit(() => { exited = true; });
    pty.resize(100, 30);
    data = pty.onData(chunk => {
      try {
        const window = suffix + chunk;
        if (!replied && window.includes(QUERY)) {
          replied = true;
          pty.write(START);
          pty.write(transport === 'win32' ? encodeFixedReply(REPLIES[variant]) : REPLIES[variant]);
          pty.write(END);
        }
        if (window.includes(CHILD_TIMEOUT)) settle('child-timeout');
        else if (window.includes(report('done'))) settle('exact');
        else if (window.includes(report('error'))) settle('different');
        // This parser recognizes only the owned fixture's fixed query/reports.
        suffix = window.slice(-128);
      } catch (error) { reject(error); }
    });
    const outcome = await Promise.race([result, new Promise(resolve => {
      timeout = setTimeout(() => resolve('timeout'), 5000);
    })]);
    completed = true;
    return { variant, transport, querySeen: replied, outcome };
  } finally {
    clearTimeout(timeout);
    // Allow native child-exit delivery before invoking the termination fallback.
    for (let i = 0; completed && i < 20 && !exited; i++) await delay(100);
    try { if (!exited) await pty.terminate(); }
    finally { data?.dispose(); exit?.dispose(); pty.dispose(); suffix = ''; }
  }
}

async function main() {
  assert.equal(process.platform, 'win32', 'Run with Windows Node after npm run compile:tests');
  assert.equal(encodeFixedReply(REPLIES['arrow-up']), '\x1b[0;0;27;1;0;1_\x1b[0;0;91;1;0;1_\x1b[0;0;65;1;0;1_');
  const { NodePtyFactory } = require('../../out/src/launch/nodePtyAdapter.js');
  const rows = [];
  for (const transport of ['raw', 'win32']) {
    for (const variant of Object.keys(REPLIES)) rows.push(await control(new NodePtyFactory(), variant, transport));
  }
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version,
    windows: require('node:os').release(), nodePty: require('node-pty/package.json').version, rows }, null, 2));
  verifyRows(rows);
}

function verifyRows(rows) {
  assert(rows.every(row => row.querySeen && ['exact', 'different'].includes(row.outcome)), 'Every owned child must finish its complete-stream control without timeout');
  assert(rows.filter(row => row.transport === 'win32').every(row => row.outcome === 'exact'), 'Encoded fixed replies must reach the raw-mode child exactly');
  assert(rows.filter(row => row.variant === 'arrow-up').every(row => row.outcome === 'exact'), 'Arrow input must survive both representations');
  // Raw OSC behavior is reported rather than required to fail on future Windows builds.
  // An exact Node-child result does not prove Claude support negotiation.
}

module.exports = { control, encodeFixedReply, verifyRows };
if (require.main === module) {
  if (process.argv[2] === '--child') child(process.argv[3]);
  else main().catch(error => {
    console.error({ name: error.name, code: error.code ?? null });
    process.exitCode = 1;
  });
}
