/* eslint @typescript-eslint/no-require-imports: "off" -- Standalone CommonJS runner for compiled modules. */
/* global require, __dirname, process, setTimeout, clearTimeout */
// Native protocol/lifecycle coverage; this does not establish toast UX acceptance.
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const root = path.resolve(__dirname, "../..");
const { createSnoreToastActivator } = require(path.join(root, "out/src/attention/snoreToastActivator.js"));
const { openSnoreToastActivationServer } = require(path.join(root, "out/src/attention/snoreToastActivationServer.js"));
const { createAttentionNotificationSelectionHandler } = require(path.join(root, "out/src/attention/attentionNotificationSelection.js"));

const children = new Set();
const started = [];
const errors = [];
const owners = [];
const log = (event, details = {}) => process.stdout.write(JSON.stringify({
  time: new Date().toISOString(), event, ...details
}) + "\n");

function powershell() {
  const windows = process.env.SystemRoot ?? process.env.WINDIR;
  assert.ok(windows, "Windows directory is missing from the process environment.");
  return path.join(windows, "System32/WindowsPowerShell/v1.0/powershell.exe");
}

function assertIsolated() {
  const output = execFileSync(powershell(), ["-NoProfile", "-NonInteractive", "-Command",
    `@(Get-CimInstance Win32_Process -Filter "Name = 'SnoreToast.exe'" -ErrorAction Stop | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`],
  { windowsHide: true, encoding: "utf8" }).trim();
  const pids = output === "" ? [] : [].concat(JSON.parse(output));
  const owned = new Set(started.map((child) => child.pid));
  assert.ok(pids.every((pid) => owned.has(pid)),
    "Another SnoreToast helper is running. Stop other notification tests/owners before this isolated smoke.");
}

async function waitFor(predicate) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) { throw new Error("Native callback/cleanup deadline exceeded."); }
    await sleep(25);
  }
}

async function owner(name) {
  const server = await openSnoreToastActivationServer({ onError: (error) => errors.push(error) });
  const state = { name, live: true, selected: 0, received: 0, server, activator: undefined };
  owners.push(state);
  const select = createAttentionNotificationSelectionHandler({
    sessions: () => state.live ? [{ id: name, displayName: name }] : [],
    isPanelAvailable: () => true,
    revealPanel: async () => undefined,
    activateSession: (id) => { assert.equal(id, name); state.selected += 1; },
    showWarning: async () => undefined
  });
  server.onDidSelect((id) => {
    state.received += 1;
    void select(id).catch((error) => errors.push(error));
  });
  state.activator = createSnoreToastActivator({
    executablePath: path.join(root, "media/attention/snoretoast/SnoreToast.exe"),
    hasPendingNotifications: server.hasPendingNotifications,
    onError: (error) => errors.push(error),
    launch: (executable, args) => {
      assert.deepEqual(args, ["-Embedding"]);
      const child = spawn(executable, args, { windowsHide: true, stdio: "ignore" });
      children.add(child);
      started.push(child);
      log("helper-started", { owner: name, pid: child.pid });
      child.once("exit", () => children.delete(child));
      child.once("error", () => children.delete(child));
      return child;
    }
  });
  return state;
}

function register(state) {
  const id = randomUUID();
  state.server.register(id, state.name);
  state.activator.ensureRunning();
  return id;
}

async function invoke(state, id, expectCallback = true) {
  const before = state.received;
  const payload = `action=clicked;notificationId=${id};pipe=${state.server.pipeName};version=0.9.0;`;
  assertIsolated();
  const child = spawn(powershell(), ["-NoProfile", "-NonInteractive", "-File",
    path.join(__dirname, "invokeSnoreToastCallback.ps1"), "-Payload", payload],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (data) => { output += data.toString(); });
  child.stderr.on("data", (data) => { output += data.toString(); });
  const timeout = setTimeout(() => child.kill(), 15_000);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(output)));
    });
  } finally { clearTimeout(timeout); }
  log("native-activation", { owner: state.name, result: output.trim() });
  if (expectCallback) { await waitFor(() => state.received === before + 1); }
}

async function main() {
  assert.equal(process.platform, "win32", "This smoke test requires local Windows.");
  assertIsolated();
  try {
    const a = await owner("owner-A");
    const b = await owner("owner-B");
    register(a); // Keep A's isolated callback server available throughout the stale-owner case.
    const aToast = register(a);
    const bToast = register(b);
    const initial = [...children];
    assert.equal(initial.length, 4);
    log("waiting-through-upstream-deadline", { milliseconds: 65_000 });
    await sleep(65_000);
    assert.ok(initial.every((child) => !children.has(child)), "Original workers must have renewed before expiry.");
    assert.equal(children.size, 4, "Both owners must still have two live renewed helpers.");
    await invoke(a, aToast);
    assert.equal(a.selected, 1);
    assert.equal(b.selected, 0);
    await invoke(b, bToast);
    assert.equal(a.selected, 1);
    assert.equal(b.selected, 1);
    a.live = false;
    await invoke(a, register(a));
    assert.equal(a.selected, 1, "Closed sessions must not activate.");
    b.activator.dispose();
    b.server.dispose();
    await invoke(b, randomUUID(), false);
    assert.equal(b.selected, 1, "A closed owner's callback must remain a no-op.");
    assert.deepEqual(errors, []);
    log("native-protocol-passed", { checks: ["renewal", "two-owner-routing", "closed-session", "closed-owner"] });
  } finally {
    for (const state of owners) { state.activator?.dispose(); state.server.dispose(); }
    await waitFor(() => children.size === 0);
    log("owned-helpers-cleaned", { remaining: children.size, started: started.length });
  }
}

main().catch((error) => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
