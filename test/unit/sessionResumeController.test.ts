import assert from "node:assert/strict";
import type { Uri, WorkspaceFolder } from "vscode";

import { LaunchController } from "../../src/launch/launchController";
import { ClaudeCapabilityProbe, type ClaudeCapabilities } from "../../src/launch/claudeCapabilities";
import { OutputLogger } from "../../src/logging/outputLogger";
import { ResumableSessionStore, type ResumableSessionSnapshot } from "../../src/sessions/resumableSessionStore";
import { SessionManager } from "../../src/sessions/sessionManager";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";
import { FakeManagedPty, FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { MemoryMemento } from "../support/memoryMemento";
import { createAttentionSignalProcessor } from "../../src/attention/attentionSignalWatcher";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const alphaId = "file:///alpha";
const betaId = "file:///beta";
const initialTime = Date.parse("2026-09-06T10:00:00.000Z");

/** Supplies real workspace models with a controllable filesystem URI boundary. */
function workspace(path = "C:/alpha", includeAlpha = true): WorkspaceModel {
  const uri = (id: string, fsPath: string): Uri => ({
    scheme: "file", fsPath, toString: () => id
  }) as Uri;
  const folders: WorkspaceFolder[] = [{ name: "Beta", index: 1, uri: uri(betaId, "C:/beta") }];
  if (includeAlpha) {
    folders.unshift({ name: "Alpha", index: 0, uri: uri(alphaId, path) });
  }
  return WorkspaceModel.from(uri("file:///group.code-workspace", "C:/group.code-workspace"), folders);
}

/** Exercises the real planner, manager, capability probe, store, and controller together. */
function harness(
  help: "supported" | "unsupported" | "failed" = "supported",
  reporter?: () => NonNullable<ClaudeCapabilities["completionReporter"]>
) {
  const state = new MemoryMemento();
  const logs: string[] = [];
  let logsOpened = 0;
  const logger = new OutputLogger({
    name: "test", append: () => undefined, appendLine: (line) => logs.push(line),
    replace: () => undefined, clear: () => undefined, hide: () => undefined,
    show: () => { logsOpened += 1; }, dispose: () => undefined
  });
  const store = new ResumableSessionStore(state, (message) => logs.push(message));
  const ptys = new FakeManagedPtyFactory();
  const errors: Array<{ message: string; actions: string[] }> = [];
  const warnings: string[] = [];
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];
  const controls = {
    workspace: workspace(), imports: [] as string[], executable: "claude", now: initialTime,
    available: true, configured: 0, action: undefined as string | undefined,
    help, probeCalls: [] as string[], settingsSupported: false, modsSupported: false,
    modResult: "no hooks module to load", versionOutput: "2.1.287 (Claude Code)",
    executableAfterSetup: undefined as string | undefined, sideloadBlocked: false, helpFailuresRemaining: 0,
    hooksSettingsPath: "C:/extension storage/attention-hooks.json" as string | undefined
  };
  let id = 0;
  const claudeSessionIds: readonly string[] = [firstId, secondId];
  let claudeId = 0;
  const manager = new SessionManager({
    ptyFactory: ptys, createId: () => `session-${++id}`, now: () => controls.now,
    logger, notifications: { notify: (notification) => controller.notify(notification) }
  });
  const dependencies = {
    manager, logger, store, currentWorkspace: () => controls.workspace,
    setup: {
      ensureConfigured: async () => {
        if (controls.executableAfterSetup !== undefined) { controls.executable = controls.executableAfterSetup; }
        return {
          schemaVersion: 1, configuredRoots: [alphaId, betaId],
          importsByRoot: { [alphaId]: controls.imports, [betaId]: [] }
        };
      },
      configure: async () => { controls.configured += 1; }
    },
    availability: {
      timeoutMs: 100, maxConcurrency: 2, maxOutstandingProbes: 2, totalTimeoutMs: 1000,
      isAvailable: async () => controls.available
    },
    executable: () => controls.executable, selectRoot: async () => undefined,
    notifications: {
      showWarningMessage: async (message: string) => { warnings.push(message); return undefined; },
      showErrorMessage: async (message: string, ...actions: string[]) => {
        errors.push({ message, actions });
        const action = controls.action;
        controls.action = undefined;
        return action;
      }
    },
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        executedCommands.push({ command, args });
      },
      registerCommand: () => ({ dispose: () => undefined })
    },
    createClaudeSessionId: () => {
      const nextId = claudeSessionIds[claudeId++];
      if (nextId === undefined) {
        throw new Error("Session resume harness exhausted its Claude session IDs.");
      }
      return nextId;
    },
    claudeCapabilities: reporter === undefined ? new ClaudeCapabilityProbe({ run: async (executable, args = ["--help"]) => {
      controls.probeCalls.push(executable);
      if (args[0] === "--help" && controls.helpFailuresRemaining > 0) {
        controls.helpFailuresRemaining -= 1;
        throw new Error("transient help failure");
      }
      if (controls.help === "failed") { throw new Error("help failed"); }
      if (args[0] === "--version") { return { stdout: controls.versionOutput, stderr: "" }; }
      if (args[1] === "test") { return { stdout: controls.modResult, stderr: "" }; }
      if (args[1] === "validate") {
        if (controls.sideloadBlocked) {
          throw Object.assign(new Error("sideload blocked"), {
            stderr: "--plugin-dir is disabled by your organization's managed settings (disableSideloadFlags)."
          });
        }
        throw Object.assign(new Error("empty probe directory"), { code: 1, stderr: "", stdout: JSON.stringify({
          success: false, strict: false, target: "C:/extension-channel",
          manifest: { file: "C:/extension-channel", type: "plugin", errors: [{ path: "directory",
            message: "No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json", code: null }],
          warnings: [], notes: [] }, contents: []
        }) });
      }
      const persistenceHelp = controls.help === "supported"
        ? "--session-id <uuid> --resume <id>"
        : "--help";
      const settingsHelp = controls.settingsSupported ? " --settings <file>" : "";
      return { stdout: `${persistenceHelp}${settingsHelp}${controls.modsSupported ? " --plugin-dir <path>" : ""}`, stderr: "" };
    } }) : { get: async () => ({ sessionPersistence: true, settingsFile: true, completionReporter: reporter() }) },
    hooksSettingsPath: () => controls.hooksSettingsPath,
    completionPluginPath: () => "C:/extension/media/attention",
    now: () => controls.now
  };
  const controller = new LaunchController(dependencies);
  return { controller, store, manager, ptys, controls, errors, warnings, executedCommands, logs, state, logger,
    logsOpened: () => logsOpened,
    dispose: () => { manager.dispose(); store.dispose(); } };
}

/** Seeds only host-owned metadata, independent of any Claude transcript files. */
async function seed(h: ReturnType<typeof harness>, overrides: Partial<ResumableSessionSnapshot> = {}) {
  await h.store.upsert({
    claudeSessionId: firstId, displayName: "Saved work", rootId: alphaId, rootLabel: "Old alpha",
    rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00.000Z", lastLaunchedAt: "2026-09-02T10:00:00.000Z",
    ...overrides
  });
}

/** Sends a stored identity through the host controller. */
async function resume(h: ReturnType<typeof harness>, id: string): Promise<void> {
  await h.controller.resumeSession(id);
}

/** Drains notification actions that originate from a synchronous process event. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Checks the controller's expectation for one host-owned live launch. */
function reporterExpected(h: ReturnType<typeof harness>, sessionId: string): boolean {
  return h.controller.expectsCompletionReporter(sessionId);
}

describe("session resume orchestration", () => {
  for (const operation of ["new", "resume", "restart", "changed-executable-resume"] as const) {
    it("reuses a failed completion probe during " + operation + " and retries on the next launch", async () => {
      const h = harness();
      h.controls.settingsSupported = true;
      h.controls.modsSupported = true;
      h.controls.versionOutput = "malformed version";
      if (operation === "resume" || operation === "changed-executable-resume") {
        await seed(h);
        if (operation === "changed-executable-resume") { h.controls.executableAfterSetup = "other-claude"; }
        await resume(h, firstId);
      } else {
        await h.controller.launch({ rootMode: "default" });
        if (operation === "restart") {
          h.controls.probeCalls.length = 0;
          await h.controller.restartActive();
        }
      }
      const expected = operation === "changed-executable-resume"
        ? ["claude", "claude", "other-claude", "other-claude"] : ["claude", "claude"];
      assert.deepEqual(h.controls.probeCalls, expected);
      assert.equal(h.ptys.spawnedSpecs.at(-1)?.args.includes("--plugin-dir"), false);
      h.controls.probeCalls.length = 0;
      h.controls.versionOutput = "2.1.287 (Claude Code)";
      h.ptys.ptys.at(-1)!.emitExit({ exitCode: 0 });
      if (operation === "restart") { await resume(h, secondId); }
      else { await h.controller.launch({ rootMode: "default" }); }
      assert.equal(h.ptys.spawnedSpecs.at(-1)?.args.includes("--plugin-dir"), true);
      assert.equal(h.controls.probeCalls.length, 4);
      h.dispose();
    });
  }

  it("expects an admitted reporter even without a persistent Claude session identity", async () => {
    const h = harness("unsupported");
    h.controls.settingsSupported = true;
    h.controls.modsSupported = true;
    await h.controller.launch({ rootMode: "default" });
    const session = h.manager.sessions[0]!;
    assert.equal(session.claudeSessionId, null);
    assert.equal(reporterExpected(h, session.id), true);
    h.dispose();
    assert.equal(reporterExpected(h, session.id), false);
  });

  it("owns reporter expectation before synchronous running-state readiness ingestion", async () => {
    const h = harness("supported", () => "available");
    const warningsBeforeLaunchResolved: boolean[] = [];
    let launchResolved = false;
    let submitted = false;
    const processor = createAttentionSignalProcessor(h.manager, undefined, undefined, (id) => {
      if (reporterExpected(h, id)) { warningsBeforeLaunchResolved.push(!launchResolved); }
    });
    const subscription = h.manager.onDidChangeSessions((sessions) => {
      const running = sessions.find((session) => session.state === "running");
      if (running === undefined || submitted) { return; }
      submitted = true;
      processor.process({ schemaVersion: 1, managedSessionId: running.id,
        claudeSessionId: running.claudeSessionId, hookEventName: "UserPromptSubmit",
        completionReporterReady: false, notificationType: null, createdAt: new Date().toISOString() });
    });
    await h.controller.launch({ rootMode: "default" });
    launchResolved = true;
    assert.deepEqual(warningsBeforeLaunchResolved, [true]);
    assert.equal(h.manager.sessions[0]?.activity, "working");
    subscription.dispose();
    processor.dispose();
    h.dispose();
  });

  it("owns expectations per launch across restart, exit, and the same UUID resumed with changed admission", async () => {
    let support: NonNullable<ClaudeCapabilities["completionReporter"]> = "available";
    const h = harness("supported", () => support);
    await h.controller.launch({ rootMode: "default" });
    const first = h.manager.sessions[0]!.id;
    assert.equal(reporterExpected(h, first), true);
    h.manager.activate(first);
    await h.controller.restartActive();
    assert.equal(reporterExpected(h, first), false);
    h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
    const restarted = h.manager.sessions[0]!.id;
    assert.equal(reporterExpected(h, restarted), true);
    h.ptys.ptys[1]!.emitExit({ exitCode: 0 });
    assert.equal(reporterExpected(h, restarted), false);
    await seed(h);
    support = "disabled";
    await resume(h, firstId);
    const omitted = h.manager.sessions[0]!.id;
    assert.equal(reporterExpected(h, omitted), false);
    h.manager.activate(omitted);
    await h.controller.closeActive();
    h.ptys.ptys[2]!.emitExit({ exitCode: 0 });
    support = "available";
    await resume(h, firstId);
    const resumed = h.manager.sessions[0]!.id;
    assert.equal(reporterExpected(h, resumed), true);
    assert.equal(reporterExpected(h, omitted), false);
    h.manager.activate(resumed);
    await h.controller.closeActive();
    assert.equal(reporterExpected(h, resumed), false);
    h.ptys.ptys[3]!.emitExit({ exitCode: 0 });
    assert.equal(reporterExpected(h, resumed), false);
    h.dispose();
  });

  it("drops reporter expectation when a provisional admitted launch fails", async () => {
    const h = harness("supported", () => "available");
    let provisionalId = "";
    let expectedBeforeFailure = false;
    const subscription = h.manager.onDidChangeSessions((sessions) => {
      const starting = sessions.find((session) => session.state === "starting");
      if (starting === undefined) { return; }
      provisionalId = starting.id;
      expectedBeforeFailure = reporterExpected(h, starting.id);
    });
    h.ptys.spawnError = new Error("spawn failed");
    await h.controller.launch({ rootMode: "default" });
    assert.equal(expectedBeforeFailure, true);
    assert.equal(reporterExpected(h, provisionalId), false);
    assert.equal(h.manager.sessions.length, 0);
    subscription.dispose();
    h.dispose();
  });

  it("keeps ordinary launches available when managed sideload policy rejects reporter admission", async () => {
    const h = harness();
    h.controls.settingsSupported = true;
    h.controls.modsSupported = true;
    h.controls.sideloadBlocked = true;
    await h.controller.launch({ rootMode: "default" });
    assert.equal(h.ptys.spawnedSpecs.length, 1);
    assert.ok(h.ptys.spawnedSpecs[0]!.args.includes("--settings"));
    assert.equal(h.ptys.spawnedSpecs[0]!.args.includes("--plugin-dir"), false);
    assert.match(h.warnings[0]!, /settings or policy/);
    h.dispose();
  });

  it("warns once for the same reporter failure across new, restarted, and resumed sessions", async () => {
    const h = harness("supported", () => "disabled");
    await h.controller.launch({ rootMode: "default" });
    h.manager.activate(h.manager.sessions[0]!.id);
    await h.controller.restartActive();
    h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
    h.manager.activate(h.manager.sessions[0]!.id);
    await h.controller.closeActive();
    h.ptys.ptys[1]!.emitExit({ exitCode: 0 });
    await seed(h);
    await resume(h, firstId);
    assert.equal(h.ptys.spawnedSpecs.length, 3);
    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0]!, /settings or policy/);
    assert.ok(h.ptys.spawnedSpecs.every((spec) => !spec.args.includes("--plugin-dir")));
    h.dispose();
  });

  it("warns again for a different executable or reason and after admission recovers", async () => {
    let support: NonNullable<ClaudeCapabilities["completionReporter"]> = "failed";
    const h = harness("supported", () => support);
    await seed(h);
    const launchAndClose = async () => {
      await resume(h, firstId);
      h.manager.activate(h.manager.sessions[0]!.id);
      await h.controller.closeActive();
      h.ptys.ptys.at(-1)!.emitExit({ exitCode: 0 });
    };
    await launchAndClose();
    await launchAndClose();
    assert.equal(h.warnings.length, 1);
    h.controls.executable = "other-claude";
    await launchAndClose();
    assert.equal(h.warnings.length, 2);
    support = "disabled";
    await launchAndClose();
    assert.equal(h.warnings.length, 3);
    support = "failed";
    await launchAndClose();
    assert.equal(h.warnings.length, 3, "a previously reported reason remains deduplicated until recovery");
    support = "available";
    await launchAndClose();
    assert.equal(h.warnings.length, 3);
    assert.ok(h.ptys.spawnedSpecs.at(-1)!.args.includes("--plugin-dir"));
    support = "disabled";
    await launchAndClose();
    assert.equal(h.warnings.length, 4);
    h.dispose();
  });

  it("loads the admitted reporter on new, resumed, and restarted sessions", async () => {
    const h = harness();
    h.controls.settingsSupported = true;
    h.controls.modsSupported = true;
    await h.controller.launch({ rootMode: "default" });
    h.manager.activate(h.manager.sessions[0]!.id);
    await h.controller.restartActive();
    h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
    h.manager.activate(h.manager.sessions[0]!.id);
    await h.controller.closeActive();
    h.ptys.ptys[1]!.emitExit({ exitCode: 0 });
    await seed(h);
    await resume(h, firstId);
    for (const spec of h.ptys.spawnedSpecs) {
      assert.equal(spec.args[2], "--plugin-dir");
      assert.equal(spec.args[3], "C:/extension/media/attention");
    }
    assert.equal(h.ptys.spawnedSpecs.length, 3);
    assert.deepEqual(h.warnings, []);
    h.dispose();
  });

  for (const [output, message] of [
    ["hooks modules are turned off in this process: rollout switch served off", /Anthropic/],
    ["hooks modules are turned off here: disableAllHooks", /settings or policy/],
    ["unexpected process error", /availability check failed/]
  ] as const) {
    it(`keeps ordinary launches available with explicit reporter warning: ${output}`, async () => {
      const h = harness();
      h.controls.settingsSupported = true;
      h.controls.modsSupported = true;
      h.controls.modResult = output;
      await h.controller.launch({ rootMode: "default" });
      assert.equal(h.ptys.spawnedSpecs.length, 1);
      assert.equal(h.ptys.spawnedSpecs[0]?.args.includes("--plugin-dir"), false);
      assert.match(h.warnings[0]!, message);
      h.dispose();
    });
  }
  for (const level of ["info", "debug", "trace"] as const) {
    it(`filters orchestration outcomes and launch requests at ${level}`, async () => {
      // Missing boundary events or logging trace requests at debug must fail.
      const h = harness();
      h.logger.setLevel(level);
      await h.controller.launch({ rootMode: "default" });
      const records = h.logs.map((line) => JSON.parse(line));
      const events = records.map((record) => record.event);
      for (const event of ["capability-result", "launch-plan", "persistence-write"]) {
        assert.equal(events.includes(event), level !== "info", event);
      }
      assert.equal(events.includes("launch-request"), level === "trace");
      assert.equal(events.includes("capability-started"), level === "trace");
      if (level !== "info") {
        assert.ok(records.some((record) => record.event === "capability-result" && record.outcome === "supported"));
        assert.ok(records.some((record) => record.event === "persistence-write" &&
          record.operation === "create" && record.outcome === "success" && record.sessionId === firstId));
      }
      h.dispose();
    });
  }

  it("logs resume rejection without recording unknown input or saved metadata", async () => {
    // A rejected unknown request ID is untrusted input, not an owned session identity.
    const h = harness();
    h.logger.setLevel("trace");
    await seed(h, { displayName: "DISPLAY_SENTINEL", rootPath: "ROOT_PATH_SENTINEL" });
    await h.controller.resumeSession("PROMPT_SENTINEL");
    await h.controller.resumeSession(firstId);
    const records = h.logs.map((line) => JSON.parse(line));
    assert.deepEqual(records.filter((record) => record.event === "resume-requested").map((record) => record.sessionId),
      [undefined, firstId]);
    assert.ok(records.some((record) => record.event === "resume-rejected" && record.reason === "unknown-session"));
    assert.ok(records.some((record) => record.event === "resume-rejected" &&
      record.reason === "root-unavailable" && record.sessionId === firstId));
    assert.equal(h.logs.join("\n").includes("SENTINEL"), false);
    h.dispose();
  });

  it("records persistence successes and failures without serializing rejected state values", async () => {
    // Storage errors can contain complete persisted objects; only the closed outcome may cross the logger boundary.
    const h = harness();
    h.logger.setLevel("trace");
    await h.controller.launch({ rootMode: "default" });
    await h.controller.renameSession(h.manager.sessions[0]!.id, "DISPLAY_SENTINEL");
    h.manager.write(h.manager.sessions[0]!.id, "PROMPT_SENTINEL");
    h.ptys.ptys[0]!.emitData("PTY_SENTINEL");
    h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
    h.state.update = async () => {
      throw new Error("ROOT_PATH_SENTINEL ENV_SENTINEL CLIPBOARD_SENTINEL --mcp-config MCP_SENTINEL");
    };
    await h.controller.forgetSession(firstId);
    const records = h.logs.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.event === "persistence-write" &&
      record.operation === "rename" && record.outcome === "success"));
    assert.ok(records.some((record) => record.event === "persistence-write" &&
      record.operation === "forget" && record.outcome === "failed" && record.level === "error"));
    assert.equal(h.logs.join("\n").includes("SENTINEL"), false);
    h.dispose();
  });

  for (const action of [undefined, "Forget Session", "Open Logs", "Start New"] as const) {
    it(`offers recovery once for a resumed process rejected on a later turn: ${action ?? "dismiss"}`, async () => {
      const h = harness();
      await seed(h, { claudeSessionId: secondId });
      await resume(h, secondId);
      assert.equal(h.manager.sessions[0]?.state, "running");
      const launched = h.store.sessions[0]!;
      assert.equal(launched.createdAt, "2026-09-01T10:00:00.000Z");
      assert.equal(launched.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
      h.controls.now += 60_000;
      h.controls.action = action;
      await new Promise<void>((resolve) => setImmediate(() => {
        h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
        resolve();
      }));
      await settle();
      assert.deepEqual(h.errors.map((error) => error.actions), [["Start New", "Forget Session", "Open Logs"]]);
      assert.ok(h.manager.sessions.every((session) => session.claudeSessionId !== secondId));
      const saved = h.store.sessions.find((session) => session.claudeSessionId === secondId);
      assert.deepEqual(saved, action === "Forget Session" ? undefined : launched);
      const reloaded = new ResumableSessionStore(h.state, () => undefined);
      assert.deepEqual(reloaded.sessions.find((session) => session.claudeSessionId === secondId), saved);
      if (action === "Open Logs") { assert.equal(h.logsOpened(), 1); }
      if (action === "Start New") {
        assert.deepEqual(h.ptys.spawnedSpecs[1]?.args, ["--session-id", firstId]);
        assert.equal(h.manager.sessions[0]?.state, "running");
      }
      reloaded.dispose();
      h.dispose();
    });
  }

  for (const stop of ["close", "shutdown", "dispose"] as const) {
    it(`does not offer resumed-session recovery after intentional ${stop}`, async () => {
      const h = harness();
      await seed(h);
      await resume(h, firstId);
      if (stop === "close") { await h.controller.closeActive(); }
      else if (stop === "shutdown") { await h.manager.terminateAll(); }
      else { h.manager.dispose(); }
      await new Promise<void>((resolve) => setImmediate(() => {
        h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
        resolve();
      }));
      await settle();
      assert.deepEqual(h.errors, []);
      assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
      h.dispose();
    });
  }

  it("does not offer recovery when an explicitly closed provisional resume exits before running", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    await h.controller.closeActive();
    const pty = new FakeManagedPty();
    pty.emitExit({ exitCode: 1 });
    releaseSpawn!(pty);
    await pending;
    await settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("does not offer recovery when a closed provisional resume later rejects startup", async () => {
    const h = harness();
    await seed(h);
    let rejectSpawn: ((error: Error) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((_resolve, reject) => { rejectSpawn = reject; });
    const pending = resume(h, firstId);
    await settle();
    await h.controller.closeActive();
    rejectSpawn!(new Error("cancelled startup"));
    await pending;
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("does not offer recovery when a closed provisional resume fails its queued resize", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    h.manager.resize(h.manager.activeSessionId!, 80, 24);
    await h.controller.closeActive();
    const pty = new FakeManagedPty();
    pty.resize = () => { throw new Error("cancelled resize"); };
    releaseSpawn!(pty);
    await pending;
    await settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("keeps ordinary new-session exit behavior unchanged after reaching running", async () => {
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    await new Promise<void>((resolve) => setImmediate(() => {
      h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
      resolve();
    }));
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    h.dispose();
  });

  it("distinguishes an unexpected later exit from an immediate launch exit", async () => {
    // Reusing the immediate-exit message misstates a failure that occurred after the session was running.
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    const launchedSpec = h.ptys.spawnedSpecs[0]!;

    h.controller.notify({
      kind: "unexpected-nonzero-exit",
      sessionId: h.manager.sessions[0]!.id,
      spec: launchedSpec,
      exitCode: 1
    });
    await settle();

    assert.deepEqual(h.errors, [{
      message: "Claude session exited unexpectedly.",
      actions: ["Retry", "Open Logs"]
    }]);
    h.dispose();
  });

  it("does not offer recovery for a resumed process that exits successfully on a later turn", async () => {
    const h = harness();
    await seed(h);
    await resume(h, firstId);
    await new Promise<void>((resolve) => setImmediate(() => {
      h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
      resolve();
    }));
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
    h.dispose();
  });

  it("does not restore a UUID when resume completes during an in-flight Forget write", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pendingResume = resume(h, firstId);
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "starting");

    const update = h.state.update.bind(h.state);
    let releaseForget: (() => void) | undefined;
    let delayNextWrite = true;
    h.state.update = async (key, value) => {
      if (delayNextWrite) {
        delayNextWrite = false;
        await new Promise<void>((resolve) => { releaseForget = resolve; });
      }
      await update(key, value);
    };
    const pendingForget = h.store.forget(firstId);
    await settle();
    assert.ok(releaseForget, "Forget must reach the delayed workspace-state boundary");
    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    releaseSpawn!(new FakeManagedPty());
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "running");
    releaseForget();
    await Promise.all([pendingForget, pendingResume]);

    const reloaded = new ResumableSessionStore(h.state, () => undefined);
    assert.deepEqual({ current: h.store.sessions, reloaded: reloaded.sessions }, { current: [], reloaded: [] });
    reloaded.dispose();
    h.dispose();
  });

  it("does not restore metadata forgotten while a resume process is starting", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "starting");
    await h.store.forget(firstId);
    releaseSpawn!(new FakeManagedPty());
    await pending;
    assert.equal(h.manager.sessions[0]?.state, "running");
    assert.deepEqual(h.store.sessions, []);
    h.dispose();
  });

  for (const mode of ["new", "resume"] as const) {
    it(`keeps a running ${mode} session usable and logs a rejected workspace-state write`, async () => {
      const h = harness();
      if (mode === "resume") { await seed(h); }
      const before = h.store.sessions;
      h.state.update = async () => { throw new Error("workspace state write rejected"); };
      if (mode === "resume") { await resume(h, firstId); }
      else { await h.controller.launch({ rootMode: "default" }); }
      assert.equal(h.manager.sessions[0]?.state, "running");
      assert.deepEqual(h.store.sessions, before);
      assert.ok(h.logs.some((line) => {
        const record = JSON.parse(line);
        return record.event === "persistence-write" && record.outcome === "failed" && record.level === "error";
      }));
      h.dispose();
    });
  }

  it("persists a successful live rename without altering its launch timestamps", async () => {
    const h = harness();
    await seed(h);
    await resume(h, firstId);
    const before = h.store.sessions[0]!;
    await h.controller.renameSession(h.manager.sessions[0]!.id, "  Renamed work  ");
    assert.equal(h.manager.sessions[0]?.displayName, "Renamed work");
    assert.deepEqual(h.store.sessions, [{ ...before, displayName: "Renamed work" }]);
    await h.controller.renameSession("unknown", "Ignored");
    await h.controller.renameSession(h.manager.sessions[0]!.id, "  ");
    assert.equal(h.store.sessions[0]?.displayName, "Renamed work");
    h.dispose();
  });

  it("forgets only known non-live metadata and persists the removal", async () => {
    const h = harness();
    await seed(h);
    await seed(h, { claudeSessionId: secondId });

    await h.controller.forgetSession(firstId);

    assert.deepEqual(h.store.sessions.map((session) => session.claudeSessionId), [secondId]);
    const reloaded = new ResumableSessionStore(h.state, () => undefined);
    assert.deepEqual(reloaded.sessions.map((session) => session.claudeSessionId), [secondId]);
    reloaded.dispose();
    h.dispose();
  });

  it("rejects stale and live Forget targets without deleting metadata", async () => {
    const h = harness();
    await seed(h);
    await h.controller.forgetSession(secondId);
    await resume(h, firstId);

    await h.controller.forgetSession(firstId);

    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    h.dispose();
  });

  it("rejects Forget while the same saved session is resuming", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();

    await h.controller.forgetSession(firstId);

    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    releaseSpawn!(new FakeManagedPty());
    await pending;
    assert.equal(h.manager.sessions[0]?.claudeSessionId, firstId);
    h.dispose();
  });

  it("rejects Resume while Forget is persisting the same saved session", async () => {
    const h = harness();
    await seed(h);
    const update = h.state.update.bind(h.state);
    let releaseWrite: (() => void) | undefined;
    h.state.update = async (key, value) => {
      await new Promise<void>((resolve) => { releaseWrite = resolve; });
      await update(key, value);
    };
    const pendingForget = h.controller.forgetSession(firstId);
    await settle();

    await resume(h, firstId);

    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.ptys.spawnedSpecs, []);
    releaseWrite!();
    await pendingForget;
    assert.deepEqual(h.store.sessions, []);
    h.dispose();
  });

  it("reports a failed Forget write and retains the saved session", async () => {
    const h = harness();
    await seed(h);
    h.state.update = async () => { throw new Error("disk unavailable"); };

    await h.controller.forgetSession(firstId);

    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    assert.deepEqual(h.errors, [{ message: "Claude session could not be forgotten.", actions: ["Open Logs"] }]);
    assert.ok(h.logs.some((line) => {
      const record = JSON.parse(line);
      return record.event === "persistence-write" && record.operation === "forget" && record.outcome === "failed";
    }));
    h.dispose();
  });

  it("gives fresh restarts a new persisted UUID using current launch configuration", async () => {
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    h.controls.imports = [betaId];
    await h.controller.restartFresh(h.manager.sessions[0]!.id);
    assert.equal(h.ptys.ptys[0]?.terminated, true);
    assert.deepEqual(h.ptys.spawnedSpecs[1]?.args, ["--session-id", secondId, "--add-dir", "C:/beta"]);
    assert.deepEqual(h.store.sessions.map((session) => session.claudeSessionId), [firstId, secondId]);
    h.dispose();
  });

  it("does not persist a new launch that fails before returning a running snapshot", async () => {
    const h = harness();
    const spawn = h.ptys.spawn.bind(h.ptys);
    h.ptys.spawn = async (spec) => {
      const pty = await spawn(spec);
      h.ptys.ptys.at(-1)!.emitExit({ exitCode: 1 });
      return pty;
    };
    await h.controller.launch({ rootMode: "default" });
    await settle();
    assert.deepEqual(h.store.sessions, []);
    assert.deepEqual(h.errors[0], {
      message: "Claude session exited immediately.",
      actions: ["Retry", "Open Logs"]
    });
    h.dispose();
  });

  it("rejects a root path changed while current configuration is being read", async () => {
    const h = harness();
    await seed(h);
    const probe = h.controls.probeCalls;
    h.controls.workspace = workspace();
    // Probe yields before planning; mutate the current roots during that asynchronous gap.
    const pending = resume(h, firstId);
    assert.deepEqual(probe, ["claude"]);
    h.controls.workspace = workspace("C:/changed");
    await pending;
    assert.deepEqual(h.manager.sessions, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });
  for (const help of ["unsupported", "failed"] as const) {
    it(`launches normally and logs skipped persistence when help is ${help}`, async () => {
      const h = harness(help);
      await h.controller.launch({ rootMode: "default" });
      assert.equal(h.manager.sessions[0]?.state, "running");
      assert.equal(h.manager.sessions[0]?.claudeSessionId, null);
      assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, []);
      assert.deepEqual(h.store.sessions, []);
      assert.ok(h.logs.some((line) => /persistence.*(unsupported|probe)/i.test(line)));
      h.dispose();
    });
  }

  it("passes hook settings to a new session when the configured CLI advertises support", async () => {
    // Probing support but omitting the path leaves every new session unable to publish activity.
    const h = harness();
    h.controls.settingsSupported = true;

    await h.controller.launch({ rootMode: "default" });

    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, [
      "--settings",
      "C:/extension storage/attention-hooks.json",
      "--session-id",
      firstId
    ]);
    h.dispose();
  });

  it("passes hook settings to a resumed session when the configured CLI advertises support", async () => {
    // A resume-only omission makes notification behavior depend on how the session was opened.
    const h = harness();
    h.controls.settingsSupported = true;
    await seed(h);

    await resume(h, firstId);

    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, [
      "--settings",
      "C:/extension storage/attention-hooks.json",
      "--resume",
      firstId
    ]);
    h.dispose();
  });

  it("uses hook settings without requiring session-persistence support", async () => {
    // Treating independent capabilities as one gate drops hook reporting on a compatible older CLI.
    const h = harness("unsupported");
    h.controls.settingsSupported = true;

    await h.controller.launch({ rootMode: "default" });

    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, [
      "--settings",
      "C:/extension storage/attention-hooks.json"
    ]);
    assert.equal(h.manager.sessions[0]?.claudeSessionId, null);
    h.dispose();
  });

  it("logs hook-settings incompatibility only once per executable", async () => {
    // Repeating the same compatibility warning for every launch obscures actionable diagnostics.
    const h = harness();
    h.logger.setLevel("debug");

    await h.controller.launch({ rootMode: "default" });
    await h.controller.launch({ rootMode: "default" });

    const records = h.logs.map((line) => JSON.parse(line));
    assert.equal(records.filter((record) =>
      record.event === "attention-hooks-disabled" && record.reason === "unsupported"
    ).length, 1);
    h.dispose();
  });

  it("warns once when settings-file incompatibility omits the reporter", async () => {
    const h = harness();

    await h.controller.launch({ rootMode: "default" });
    await h.controller.launch({ rootMode: "default" });

    assert.equal(h.manager.sessions.length, 2);
    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0]!, /Background activity tracking is unavailable.*settings-file/);
    assert.equal(h.ptys.spawnedSpecs.some((spec) => spec.args.includes("--plugin-dir")), false);
    h.dispose();
  });

  it("warns once when a failed settings probe omits the reporter", async () => {
    const h = harness("failed");

    await h.controller.launch({ rootMode: "default" });
    await h.controller.launch({ rootMode: "default" });

    assert.equal(h.manager.sessions.length, 2);
    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0]!, /Background activity tracking is unavailable.*check failed/);
    h.dispose();
  });

  it("preserves a failed settings admission until the next launch retries successfully", async () => {
    const h = harness();
    h.controls.settingsSupported = true;
    h.controls.modsSupported = true;
    // A rejected help probe is reused for this launch and retried by the next launch.
    h.controls.helpFailuresRemaining = 1;

    await h.controller.launch({ rootMode: "default" });

    assert.equal(h.warnings.length, 1);
    assert.match(h.warnings[0]!, /availability check failed/);
    assert.equal(h.controls.probeCalls.length, 1);
    assert.equal(h.ptys.spawnedSpecs[0]?.args.includes("--plugin-dir"), false);

    await h.controller.launch({ rootMode: "default" });

    assert.equal(h.ptys.spawnedSpecs[1]?.args.includes("--plugin-dir"), true);
    assert.equal(h.warnings.length, 1);
    h.dispose();
  });

  it("keeps an intentionally unavailable attention channel silent", async () => {
    const h = harness();
    h.controls.hooksSettingsPath = undefined;

    await h.controller.launch({ rootMode: "default" });
    await h.controller.launch({ rootMode: "default" });

    assert.equal(h.manager.sessions.length, 2);
    assert.deepEqual(h.warnings, []);
    h.dispose();
  });

  it("resolves only an exact store-owned UUID", async () => {
    const h = harness();
    await seed(h);
    await resume(h, secondId);
    await resume(h, firstId.toUpperCase().replace("1111", "ABCD"));
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.controls.probeCalls, []);
    assert.equal(h.store.sessions.length, 1);
    h.dispose();
  });

  it("resumes the stored root and name using current imports and executable", async () => {
    const h = harness();
    await seed(h);
    h.controls.imports = [betaId];
    h.controls.executable = "claude-current";
    await resume(h, firstId);
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--resume", firstId, "--add-dir", "C:/beta"]);
    assert.equal(h.ptys.spawnedSpecs[0]?.cwd, "C:/alpha");
    assert.equal(h.ptys.spawnedSpecs[0]?.executable, "claude-current");
    assert.deepEqual(h.controls.probeCalls, ["claude-current"]);
    assert.equal(h.manager.sessions[0]?.displayName, "Saved work");
    assert.equal(h.manager.sessions[0]?.claudeSessionId, firstId);
    assert.equal(h.store.sessions[0]?.createdAt, "2026-09-01T10:00:00.000Z");
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
    h.dispose();
  });

  it("rejects a second resume of a live UUID, including concurrent requests", async () => {
    const h = harness();
    await seed(h);
    await Promise.all([resume(h, firstId), resume(h, firstId)]);
    await resume(h, firstId);
    assert.equal(h.ptys.ptys.length, 1);
    assert.equal(h.manager.sessions.length, 1);
    h.dispose();
  });

  for (const problem of ["missing", "changed path", "unavailable"] as const) {
    it(`retains metadata and offers root recovery when the root is ${problem}`, async () => {
      const h = harness();
      await seed(h);
      const before = h.store.sessions;
      if (problem === "missing") { h.controls.workspace = workspace("C:/alpha", false); }
      if (problem === "changed path") { h.controls.workspace = workspace("C:/ALPHA"); }
      if (problem === "unavailable") { h.controls.available = false; }
      await resume(h, firstId);
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.ok(h.errors[0]?.actions.includes("Configure Workspace…"));
      assert.ok(h.errors[0]?.actions.includes("Start New"));
      assert.ok(h.errors[0]?.actions.includes("Forget Session"));
      h.dispose();
    });
  }

  for (const [help, expectedMessage, expectedReason] of [
    ["unsupported", "This Claude executable does not support session resumption.", "unsupported"],
    ["failed", "Claude session could not be resumed.", "process-failed"]
  ] as const) {
    it(`reports ${expectedReason} when capability help is ${help}`, async () => {
      // Collapsing probe rejection into false misreports an unknown capability as confirmed unsupported.
      const h = harness(help);
      h.logger.setLevel("trace");
      await seed(h);
      const before = h.store.sessions;
      await resume(h, firstId);
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.deepEqual(h.errors, [{
        message: expectedMessage,
        actions: ["Start New", "Forget Session", "Open Logs"]
      }]);
      assert.ok(h.logs.map((line) => JSON.parse(line)).some((record) =>
        record.event === "resume-rejected" && record.reason === expectedReason));
      h.dispose();
    });
  }

  for (const failure of ["spawn", "immediate exit"] as const) {
    it(`retains failed resume metadata and offers process recovery after ${failure}`, async () => {
      const h = harness();
      await seed(h);
      const before = h.store.sessions;
      if (failure === "spawn") { h.ptys.spawnError = new Error("stale session"); }
      else {
        const spawn = h.ptys.spawn.bind(h.ptys);
        h.ptys.spawn = async (spec) => {
          const pty = await spawn(spec);
          h.ptys.ptys.at(-1)!.emitExit({ exitCode: 1 });
          return pty;
        };
      }
      await resume(h, firstId);
      await settle();
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.deepEqual(h.errors[0]?.actions, ["Start New", "Forget Session", "Open Logs"]);
      assert.equal(h.errors.length, 1);
      h.dispose();
    });
  }

  it("offers executable recovery when a resumed executable is missing", async () => {
    const h = harness();
    await seed(h);
    h.ptys.spawnError = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    h.controls.action = "Configure Executable";
    await resume(h, firstId);
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    assert.deepEqual(h.errors, [{
      message: "Claude executable was not found.",
      actions: ["Configure Executable", "Open Logs"]
    }]);
    assert.deepEqual(h.executedCommands, [{
      command: "workbench.action.openSettings",
      args: ["claudeWorkspaces.claudeExecutable"]
    }]);
    h.dispose();
  });

  it("forgets only the selected record after resume failure", async () => {
    const h = harness();
    await seed(h);
    await seed(h, { claudeSessionId: secondId });
    h.ptys.spawnError = new Error("stale session");
    h.controls.action = "Forget Session";
    await resume(h, firstId);
    await settle();
    assert.deepEqual(h.store.sessions.map((session) => session.claudeSessionId), [secondId]);
    h.dispose();
  });

  it("starts new through current default planning after a missing resume root", async () => {
    const h = harness();
    await seed(h, { claudeSessionId: secondId });
    h.controls.workspace = workspace("C:/alpha", false);
    h.controls.action = "Start New";
    await resume(h, secondId);
    await settle();
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--session-id", firstId]);
    assert.equal(h.ptys.spawnedSpecs[0]?.cwd, "C:/beta");
    assert.equal(h.store.sessions.length, 2);
    h.dispose();
  });

  it("configures current roots on root recovery and opens logs on process recovery", async () => {
    const h = harness();
    await seed(h);
    h.controls.workspace = workspace("C:/changed");
    h.controls.action = "Configure Workspace…";
    await resume(h, firstId);
    await settle();
    assert.equal(h.controls.configured, 1);
    h.controls.workspace = workspace();
    h.ptys.spawnError = new Error("stale session");
    h.controls.action = "Open Logs";
    await resume(h, firstId);
    await settle();
    assert.equal(h.logsOpened(), 1);
    h.dispose();
  });

  it("persists an extension-created UUID only once the new session is running", async () => {
    // Omitting identity wiring or writing before PTY startup must fail.
    const h = harness();
    const startingDocuments: unknown[] = [];
    h.manager.onDidChangeSessions((sessions) => {
      if (sessions.some((session) => session.state === "starting")) {
        startingDocuments.push(h.store.sessions);
      }
    });
    await h.controller.launch({ rootMode: "default" });
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--session-id", firstId]);
    assert.equal(h.manager.sessions[0]?.claudeSessionId, firstId);
    assert.deepEqual(startingDocuments, [[]]);
    assert.deepEqual(h.store.sessions, [{
      claudeSessionId: firstId, displayName: "Alpha 1", rootId: alphaId, rootLabel: "Alpha",
      rootPath: "C:/alpha", createdAt: "2026-09-06T10:00:00.000Z", lastLaunchedAt: "2026-09-06T10:00:00.000Z"
    }]);
    h.dispose();
  });
});
