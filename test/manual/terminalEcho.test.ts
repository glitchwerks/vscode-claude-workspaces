import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import * as vscode from "vscode";
import { createTerminalDiagnosticCapture, type TerminalDiagnosticMessage } from "../../src/diagnostics/terminalDiagnostics";
import { NodePtyFactory } from "../../src/launch/nodePtyAdapter";
import { OutputLogger } from "../../src/logging/outputLogger";
import { SessionPanelProvider, type SessionPanelActions } from "../../src/panel/sessionPanelProvider";
import { SessionManager } from "../../src/sessions/sessionManager";

interface EchoSample { sequence: number; parseMs: number; nextFrameMs: number; rendererKind: string }
interface Trial { sessions: number; indicator: "idle" | "working"; trial: number; capture: boolean;
  geometry: unknown; sessionAgeMsAtStart: number; samples: EchoSample[]; diagnostics: TerminalDiagnosticMessage[] }
const repo = path.resolve(__dirname, "../../..");
const outputDirectory = path.join(repo, ".tmp/180-diagnostics/controlled-echo");

describe("controlled terminal echo measurement", () => {
  it("records ordered real PTY-to-xterm echoes with capture off and on", async function () {
    if (process.platform !== "win32") { this.skip(); }
    this.timeout(120_000);
    await mkdir(outputDirectory, { recursive: true });
    await build({ entryPoints: [path.join(repo, "test/manual/terminalEchoWebview.ts")], outdir: outputDirectory,
      entryNames: "fixture", bundle: true, platform: "browser", format: "iife" });
    const trials: Trial[] = [];
    let sequence = 0;
    for (const scenario of [
      { sessions: 1, indicator: "idle" }, { sessions: 1, indicator: "working" },
      { sessions: 4, indicator: "idle" }, { sessions: 4, indicator: "working" }
    ] as const) {
      const { sessions, indicator } = scenario;
      const harness = await createHarness(sessions, indicator);
      try {
        for (let trial = 0; trial < 3; trial += 1) {
          for (const enabled of trial % 2 === 0 ? [false, true] : [true, false]) {
            await harness.setCapture(enabled);
            harness.diagnostics.length = 0;
            const sessionAgeMsAtStart = harness.sessionAgeMs();
            const samples: EchoSample[] = [];
            for (let sample = 0; sample < 12; sample += 1) {
              const result = await harness.echo(++sequence);
              assert.equal(result.sequence, sequence, "Echoes must remain ordered and complete");
              assert.ok(Number.isFinite(result.parseMs) && result.parseMs >= 0);
              assert.ok(Number.isFinite(result.nextFrameMs) && result.nextFrameMs >= result.parseMs);
              samples.push(result);
              await delay(125);
            }
            if (enabled) {
              await harness.setCapture(false);
              const windows = harness.diagnostics.filter((message) => message.capture === "window");
              assert.ok(windows.length > 0, "Enabled run must produce actual timing windows");
              const metrics = windows.flatMap((window) => window.sessions.flatMap((session) => session.metrics));
              for (const metric of ["ptyWriteMs", "outputHandlingMs", "outputRoundTripMs", "outputParseMs", "inputQueueMs", "inputRoundTripMs"]) {
                assert.ok(metrics.some((sample) => sample.metric === metric), `Missing real boundary: ${metric}`);
              }
            } else { assert.deepEqual(harness.diagnostics, [], "Disabled capture must produce no diagnostic records"); }
            trials.push({ sessions, indicator, trial, capture: enabled, geometry: harness.geometry,
              sessionAgeMsAtStart, samples, diagnostics: [...harness.diagnostics] });
          }
        }
      } finally { await harness.dispose(); }
    }
    const runtimeFiles = ["src/sessions/sessionManager.ts", "src/panel/sessionPanelProvider.ts", "src/panel/protocol.ts",
      "src/panel/webview/renderer.ts", "src/panel/webview/xtermTerminal.ts", "src/panel/webview/webglRenderer.ts",
      "src/diagnostics/terminalDiagnostics.ts", "src/diagnostics/terminalMetricWindow.ts", "src/diagnostics/terminalProbe.ts",
      "src/diagnostics/webviewTerminalDiagnostics.ts"];
    const harnessFiles = ["test/manual/terminalEcho.test.ts", "test/manual/terminalEchoWebview.ts",
      "test/fixtures/terminal-echo.cmd", ".vscode-test-terminal-echo.cjs"];
    const fingerprint = async (files: string[]): Promise<string> => {
      const hash = createHash("sha256");
      for (const file of files) { hash.update(file).update("\0").update((await readFile(path.join(repo, file), "utf8")).replace(/\r\n/gu, "\n")).update("\0"); }
      return hash.digest("hex");
    };
    const dependencies: Record<string, string> = {};
    for (const name of ["@xterm/xterm", "@xterm/addon-webgl", "@xterm/addon-fit", "node-pty", "esbuild"]) {
      dependencies[name] = (JSON.parse(await readFile(path.join(repo, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;
    }
    const result = { measuredAt: new Date().toISOString(), vscode: vscode.version, node: process.version,
      electron: process.versions.electron, chromium: process.versions.chrome,
      os: { platform: process.platform, release: os.release(), arch: process.arch },
      runtimeSourceFiles: runtimeFiles, runtimeSourceFingerprint: await fingerprint(runtimeFiles),
      measurementHarnessFiles: harnessFiles, measurementHarnessFingerprint: await fingerprint(harnessFiles),
      packageLockFingerprint: createHash("sha256").update((await readFile(path.join(repo, "package-lock.json"), "utf8")).replace(/\r\n/gu, "\n")).digest("hex"), dependencies,
      parameters: { trialsPerCondition: 3, samplesPerTrial: 12, interSampleDelayMs: 125,
        font: { family: "monospace", size: 14, letterSpacing: 0, lineHeight: 1 },
        order: "off/on, on/off, off/on", freshPerScenario: true, reusedWithinScenario: true },
      scope: "Synthetic paste in a real VS Code webview, owned Windows PTY command echo and actual production xterm parse callback. Idle/working indicators are explicitly set presentation states; other sessions wait for input. Next-frame scheduling is not proof of painted pixels. No Claude/agent workload or physical keyboard input.",
      trials };
    const resultPath = path.join(outputDirectory, "results.json");
    await writeFile(resultPath, JSON.stringify(result, null, 2) + "\n");
    console.log(`Controlled echo: ${trials.length} trials, ${sequence} ordered samples; results: ${resultPath}`);
  });
});

async function createHarness(sessionCount: number, indicator: "idle" | "working") {
  const channel = vscode.window.createOutputChannel("Controlled terminal echo");
  const logger = new OutputLogger(channel, { level: "off" });
  const diagnostics: TerminalDiagnosticMessage[] = [];
  let provider: SessionPanelProvider | undefined;
  const capture = createTerminalDiagnosticCapture((message) => { diagnostics.push(message); provider?.refreshTerminalDiagnostics(); });
  let ordinal = 0;
  const manager = new SessionManager({ ptyFactory: new NodePtyFactory(), createId: () => `synthetic-${++ordinal}`,
    now: Date.now, logger, notifications: { notify: () => undefined }, terminalDiagnostics: capture });
  const readiness = new Set<string>();
  const readyOutput = new Map<string, string>();
  const dataSubscription = manager.onDidReceiveData((event) => {
    const output = ((readyOutput.get(event.sessionId) ?? "") + event.data).slice(-8_192);
    readyOutput.set(event.sessionId, output);
    if (output.includes("CW_READY")) { readiness.add(event.sessionId); }
  });
  let panel: vscode.WebviewPanel | undefined;
  const subscriptions: vscode.Disposable[] = [dataSubscription];
  try {
    for (let index = 0; index < sessionCount; index += 1) {
      await manager.launch({ executable: path.join(repo, "test/fixtures/terminal-echo.cmd"), args: [], cwd: repo,
        env: { ...process.env }, root: { id: "synthetic-root", label: "Synthetic", uri: vscode.Uri.file(repo) },
        importedRoots: [], skippedImportIds: [] });
    }
    const deadline = Date.now() + 10_000;
    while (readiness.size < sessionCount && Date.now() < deadline) { await delay(25); }
    assert.equal(readiness.size, sessionCount, "All owned synthetic echo children must become ready");
    dataSubscription.dispose();
    manager.activate("synthetic-1");
    manager.setActivity("synthetic-1", indicator);
    panel = vscode.window.createWebviewPanel("terminalEchoFixture", "Controlled terminal echo", vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(repo)] });
    const webview = panel.webview;
    const listeners = new Set<(message: Record<string, unknown>) => void>();
    subscriptions.push(webview.onDidReceiveMessage((value: unknown) => {
      if (typeof value === "object" && value !== null) { for (const listener of listeners) { listener(value as Record<string, unknown>); } }
    }));
    const wait = (predicate: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { listeners.delete(listener); reject(new Error("Controlled echo message timed out")); }, 10_000);
      const listener = (message: Record<string, unknown>): void => {
        if (predicate(message)) { clearTimeout(timer); listeners.delete(listener); resolve(message); }
      };
      listeners.add(listener);
    });
    const ready = wait((message) => message.type === "fixtureReady");
    const noAction = () => undefined;
    const actions: SessionPanelActions = { input: (id, data) => manager.write(id, data), resize: (id, cols, rows) => manager.resize(id, cols, rows),
      selectSession: (id) => manager.activate(id), renameSession: noAction, newSession: noAction, newInFolder: noAction,
      resumeSession: noAction, forgetSession: noAction, closeSession: noAction, restartFresh: noAction,
      previousSession: noAction, nextSession: noAction, configureWorkspace: noAction };
    const empty = new vscode.EventEmitter<never>();
    subscriptions.push(empty);
    provider = new SessionPanelProvider({ extensionUri: vscode.Uri.file(repo), sessions: manager,
      resumableSessions: { sessions: [], onDidChangeSessions: empty.event }, actions,
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }, terminalDiagnostics: capture });
    provider.resolveWebviewView({ visible: true, onDidDispose: panel.onDidDispose,
      onDidChangeVisibility: (listener: () => void) => panel!.onDidChangeViewState(listener),
      webview: {
        get options() { return webview.options; }, set options(value) { webview.options = value; },
        get html() { return webview.html; }, set html(value: string) {
          const script = webview.asWebviewUri(vscode.Uri.file(path.join(outputDirectory, "fixture.js")));
          const style = webview.asWebviewUri(vscode.Uri.file(path.join(outputDirectory, "fixture.css")));
          webview.html = value.replace(/src="[^"]+index\.js"/u, `src="${script}"`).replace(/href="[^"]+index\.css"/u, `href="${style}"`);
        }, cspSource: webview.cspSource, asWebviewUri: webview.asWebviewUri.bind(webview),
        onDidReceiveMessage: webview.onDidReceiveMessage, postMessage: webview.postMessage.bind(webview)
      }
    } as unknown as vscode.WebviewView);
    const geometry = (await ready).geometry;
    return { diagnostics, geometry, sessionAgeMs: () => Math.max(0, Date.now() - manager.sessions[0]!.launchedAt),
      setCapture: async (enabled: boolean) => {
        if (capture.active === enabled) { return; }
        if (!enabled) {
          // Let the frontend publish its last partial second before host stop rejects stale frames.
          await wait((message) => message.type === "terminalTimingWindow");
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        const acknowledged = wait((message) => message.type === "fixtureCapture" && (enabled ? message.captureId !== null : message.captureId === null));
        capture.toggle();
        await acknowledged;
      },
      echo: async (sequence: number): Promise<EchoSample> => {
        const echoed = wait((message) => message.type === "fixtureEcho" && message.sequence === sequence);
        assert.equal(await webview.postMessage({ type: "fixtureRun", sequence }), true);
        return await echoed as unknown as EchoSample;
      },
      dispose: async () => {
        capture.dispose(); provider?.dispose(); panel?.dispose();
        subscriptions.forEach((subscription) => subscription.dispose());
        await manager.terminateAll(); manager.dispose(); logger.dispose();
      }
    };
  } catch (error) {
    capture.dispose(); provider?.dispose(); panel?.dispose(); subscriptions.forEach((subscription) => subscription.dispose());
    await manager.terminateAll(); manager.dispose(); logger.dispose();
    throw error;
  }
}
