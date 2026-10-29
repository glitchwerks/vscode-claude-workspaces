import assert from "node:assert/strict";
import * as vscode from "vscode";
import { createTerminalDiagnosticCapture, type TerminalDiagnosticMessage } from "../../src/diagnostics/terminalDiagnostics";
import { SessionPanelProvider, type SessionPanelActions } from "../../src/panel/sessionPanelProvider";
import type { HostMessage } from "../../src/panel/protocol";
import type { ManagedSessionSnapshot, SessionDataEvent } from "../../src/sessions/sessionTypes";

const DOCUMENT = "11111111-1111-4111-8111-111111111111";
const OTHER_DOCUMENT = "22222222-2222-4222-8222-222222222222";

describe("terminal latency diagnostic provider", () => {
  it("accepts the final frontend window before retiring a manually stopped capture", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT }); await settle();
      harness.capture.toggle(); harness.panel.refreshTerminalDiagnostics();
      const captureId = harness.capture.captureId!;
      const stopping = requestStop(harness.panel);
      assert.equal(harness.capture.active, true);
      const secondStop = requestStop(harness.panel);
      assert.equal(harness.posted.filter((message) => message.type === "terminalDiagnostics" && message.captureId === null).length, 1);
      harness.receivedMessage.fire({ type: "terminalTimingWindow", documentId: DOCUMENT, captureId, sequence: 1,
        frame: { sessions: [{ sessionId: "alpha", metrics: [{ metric: "inputRoundTripMs", count: 1, total: 100, maximum: 100, buckets: [0, 0, 0, 0, 1, 0, 0, 0] }] }], omittedSamples: 0 } });
      harness.receivedMessage.fire({ type: "terminalDiagnosticsStopped", documentId: OTHER_DOCUMENT, captureId, sequence: 1 });
      harness.receivedMessage.fire({ type: "terminalDiagnosticsStopped", documentId: DOCUMENT, captureId, sequence: 0 });
      await settle();
      assert.equal(harness.capture.active, true);
      harness.receivedMessage.fire({ type: "terminalDiagnosticsStopped", documentId: DOCUMENT, captureId, sequence: 1 });
      await Promise.all([stopping, secondStop]);
      assert.equal(harness.capture.active, false);
      const window = harness.lines.find((line) => line.capture === "window"); assert.ok(window?.capture === "window");
      assert.equal(window.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "inputRoundTripMs")?.total, 100);
    } finally { harness.dispose(); }
  });

  it("bounds an unresponsive stop and preserves ordinary input while waiting", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT }); await settle();
      harness.capture.toggle(); harness.panel.refreshTerminalDiagnostics();
      const stopping = requestStop(harness.panel);
      harness.receivedMessage.fire({ type: "input", sessionId: "alpha", data: "unblocked input", isPromptSubmission: false });
      await settle(); assert.deepEqual(harness.inputs, ["unblocked input"]);
      await stopping;
      assert.equal(harness.capture.active, false);
      const window = harness.lines.find((line) => line.capture === "window"); assert.ok(window?.capture === "window");
      assert.equal(Object.fromEntries(window.sessions.flatMap((session) => session.metrics).map((metric) => [metric.metric, metric.total])).frontendDrainTimeout, 1);
    } finally { harness.dispose(); }
  });

  it("does not restart capture when recording a drain timeout reaches its safety expiry", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT }); await settle();
      harness.capture.toggle(); harness.panel.refreshTerminalDiagnostics();
      const stopping = requestStop(harness.panel);
      harness.setTime(300_000);
      await stopping;
      assert.equal(harness.capture.active, false);
      assert.equal(harness.lines.filter((line) => line.capture === "started").length, 1);
      assert.equal(harness.lines.at(-1)?.capture, "stopped");
    } finally { harness.dispose(); }
  });

  it("cancels a pending stop on disposal and accepts an empty final acknowledgement", async () => {
    for (const ending of ["dispose", "empty"] as const) {
      const harness = createHarness();
      try {
        harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT }); await settle();
        harness.capture.toggle(); harness.panel.refreshTerminalDiagnostics();
        const captureId = harness.capture.captureId!;
        const stopping = requestStop(harness.panel);
        if (ending === "dispose") { harness.panel.dispose(); }
        else { harness.receivedMessage.fire({ type: "terminalDiagnosticsStopped", documentId: DOCUMENT, captureId, sequence: 0 }); }
        await stopping;
        assert.equal(harness.capture.active, false);
      } finally { harness.dispose(); }
    }
  });
  it("bounds and expires retired ownership evidence instead of accepting unknown historical IDs", async () => {
    const harness = createHarness({ extraSessions: 129 });
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      harness.panel.refreshTerminalDiagnostics();
      const remaining = [...harness.sessions];
      while (remaining.length > 1) {
        remaining.splice(1, 1);
        harness.sessionChanges.fire([...remaining]);
        await settle(); // Isolate retirement history from delivery-observer overflow.
      }
      const metric = { metric: "renderMs", count: 1, total: 5, maximum: 5, buckets: [0, 1, 0, 0, 0, 0, 0, 0] };
      const send = (retired: string, sequence: number) => harness.receivedMessage.fire({
        type: "terminalTimingWindow", documentId: DOCUMENT, captureId: harness.capture.captureId, sequence,
        frame: { sessions: [{ sessionId: retired, metrics: [metric] }, { sessionId: "alpha", metrics: [metric] }], omittedSamples: 0 }
      });
      send("extra-0", 1); // The oldest of 129 retirements exceeds the bounded history.
      send("extra-128", 2);
      await settle();
      harness.setTime(30_000);
      send("extra-128", 3);
      await settle();
      harness.capture.toggle();
      const window = harness.lines.find((line) => line.capture === "window");
      assert.ok(window?.capture === "window");
      assert.equal(window.sessions.find((session) => session.session !== null)?.metrics.find((metric) => metric.metric === "renderMs")?.count, 1);
      assert.equal(window.omittedSamples, 1);
      assert.equal(window.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "dropped")?.total, 1);
    } finally { harness.dispose(); }
  });
  it("keeps active measurements from an in-flight window containing a recently retired owned session", async () => {
    const harness = createHarness({ includeBeta: true });
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      harness.panel.refreshTerminalDiagnostics();
      harness.sessionChanges.fire([harness.session]);
      const metric = { metric: "renderMs", count: 1, total: 5, maximum: 5, buckets: [0, 1, 0, 0, 0, 0, 0, 0] };
      const message = { type: "terminalTimingWindow", documentId: DOCUMENT, captureId: harness.capture.captureId, sequence: 1,
        frame: { sessions: [{ sessionId: "beta", metrics: [metric] }, { sessionId: "alpha", metrics: [metric] }], omittedSamples: 0 } };
      harness.receivedMessage.fire(message);
      harness.receivedMessage.fire({ ...message, sequence: 2, frame: { ...message.frame,
        sessions: [{ sessionId: "unknown", metrics: [metric] }, { sessionId: "alpha", metrics: [metric] }] } });
      await settle();
      harness.capture.toggle();
      const window = harness.lines.find((line) => line.capture === "window");
      assert.ok(window?.capture === "window");
      assert.equal(window.sessions.find((session) => session.session !== null)?.metrics.find((metric) => metric.metric === "renderMs")?.count, 1);
      assert.equal(window.omittedSamples, 1);
    } finally { harness.dispose(); }
  });
  for (const transition of ["capture restart", "document replacement"] as const) {
    it(`isolates pending delivery observations across ${transition}`, async () => {
      const harness = createHarness({ holdDelivery: true });
      try {
        harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
        await settle();
        harness.capture.toggle();
        harness.panel.refreshTerminalDiagnostics();
        for (let index = 0; index < 128; index += 1) { harness.receivedData.fire({ sessionId: "alpha", data: "old" }); }
        if (transition === "capture restart") { harness.capture.toggle(); }
        else { harness.receivedMessage.fire({ type: "ready", documentId: OTHER_DOCUMENT }); await settle(); }
        harness.capture.toggle();
        harness.panel.refreshTerminalDiagnostics();
        harness.lines.length = 0;
        harness.receivedData.fire({ sessionId: "alpha", data: "new" });
        harness.settleDelivery(0);
        await settle();
        harness.capture.toggle();
        const window = harness.lines.find((line) => line.capture === "window");
        assert.ok(window?.capture === "window");
        const metrics = window.sessions.flatMap((session) => session.metrics);
        assert.equal(metrics.find((metric) => metric.metric === "pendingMessages")?.maximum, 1);
        assert.equal(metrics.find((metric) => metric.metric === "dropped"), undefined);
        assert.equal(harness.posted.filter((message) => message.type === "sessionData").length,
          transition === "capture restart" ? 129 : 130);
      } finally { harness.dispose(); }
    });
  }
  it("continues ordinary input when diagnostic controls and acknowledgements cannot be delivered", async () => {
    const harness = createHarness({ failDiagnosticDelivery: true });
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      assert.doesNotThrow(() => harness.panel.refreshTerminalDiagnostics());
      harness.receivedMessage.fire({ type: "input", sessionId: "alpha", data: "input remains intact", isPromptSubmission: false,
        probe: { captureId: harness.capture.captureId, sequence: 1 } });
      await settle();
      assert.deepEqual(harness.inputs, ["input remains intact"]);
    } finally { harness.dispose(); }
  });
  it("bounds delivery observers without dropping terminal messages during a burst", async () => {
    const harness = createHarness({ holdDelivery: true });
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      harness.panel.refreshTerminalDiagnostics();
      for (let index = 0; index < 200; index += 1) { harness.receivedData.fire({ sessionId: "alpha", data: "synthetic output" }); }
      assert.equal(harness.posted.filter((message) => message.type === "sessionData").length, 200);
      harness.capture.toggle();
      const window = harness.lines.find((line) => line.capture === "window");
      assert.ok(window?.capture === "window");
      const metrics = window.sessions.flatMap((session) => session.metrics);
      assert.equal(metrics.find((metric) => metric.metric === "pendingMessages")?.maximum, 128);
      assert.equal(metrics.find((metric) => metric.metric === "dropped")?.total, 72);
    } finally { harness.dispose(); }
  });
  it("never tags output after capture stops even before its next control refresh", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      harness.panel.refreshTerminalDiagnostics();
      harness.capture.toggle();
      harness.receivedData.fire({ sessionId: "alpha", data: "output after stop" });
      const output = harness.posted.filter((message) => message.type === "sessionData").at(-1);
      assert.ok(output?.type === "sessionData");
      assert.equal(output.probe, undefined);
    } finally { harness.dispose(); }
  });
  it("keeps replay untagged and binds live input/output timings to the active document", async () => {
    const harness = createHarness();
    try {
      harness.receivedData.fire({ sessionId: "alpha", data: "old output\n" });
      harness.capture.toggle();
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      const refresh = harness.panel as SessionPanelProvider & { refreshTerminalDiagnostics(): void };
      assert.equal(typeof refresh.refreshTerminalDiagnostics, "function");
      refresh.refreshTerminalDiagnostics();
      assert.equal(harness.posted.find((message) => message.type === "sessionData")?.probe, undefined);
      assert.ok(harness.posted.some((message) => message.type === "terminalDiagnostics" && message.documentId === DOCUMENT));
      harness.setTime(100);
      const probe = { captureId: harness.capture.captureId!, sequence: 1 };
      harness.receivedMessage.fire({ type: "input", sessionId: "alpha", data: "private input", isPromptSubmission: false, probe });
      harness.setTime(108);
      await settle();
      assert.deepEqual(harness.inputs, ["private input"]);
      assert.deepEqual(harness.posted.find((message) => message.type === "terminalInputAck"), {
        type: "terminalInputAck", documentId: DOCUMENT, sessionId: "alpha", probe, queueMs: 8, actionMs: 3
      });
      harness.receivedData.fire({ sessionId: "alpha", data: "live output" });
      const output = harness.posted.filter((message) => message.type === "sessionData").at(-1);
      assert.ok(output?.type === "sessionData" && output.probe);
      harness.setTime(131);
      const ack = { type: "terminalOutputAck", documentId: DOCUMENT, sessionId: "alpha", probe: output.probe, parseMs: 7, pendingWrites: 0 };
      harness.receivedMessage.fire({ ...ack, documentId: OTHER_DOCUMENT });
      harness.receivedMessage.fire(ack);
      harness.receivedMessage.fire(ack);
      await settle();
      harness.capture.toggle();
      const window = harness.lines.find((line) => line.capture === "window");
      assert.ok(window?.capture === "window");
      const metrics = window.sessions.find((entry) => entry.session !== null)!.metrics;
      assert.equal(metrics.find((metric) => metric.metric === "outputRoundTripMs")?.count, 1);
      assert.equal(metrics.find((metric) => metric.metric === "outputRoundTripMs")?.maximum, 20);
      assert.ok(!JSON.stringify(harness.lines).includes("private input"));
    } finally { harness.dispose(); }
  });

  it("deduplicates aggregate windows and rejects unowned sessions before merging", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      const refresh = harness.panel as SessionPanelProvider & { refreshTerminalDiagnostics(): void };
      assert.equal(typeof refresh.refreshTerminalDiagnostics, "function");
      refresh.refreshTerminalDiagnostics();
      const frame = { sessions: [{ sessionId: "alpha", metrics: [{ metric: "renderMs", count: 1, total: 5, maximum: 5, buckets: [0, 1, 0, 0, 0, 0, 0, 0] }] }], omittedSamples: 0 };
      const message = { type: "terminalTimingWindow", documentId: DOCUMENT, captureId: harness.capture.captureId, sequence: 1, frame };
      harness.receivedMessage.fire(message);
      harness.receivedMessage.fire(message);
      harness.receivedMessage.fire({ ...message, sequence: 2, frame: { ...frame, sessions: [{ ...frame.sessions[0], sessionId: "unknown" }] } });
      await settle();
      harness.capture.toggle();
      const window = harness.lines.find((line) => line.capture === "window");
      assert.ok(window?.capture === "window");
      assert.equal(window.sessions.find((entry) => entry.session !== null)?.metrics.find((metric) => metric.metric === "renderMs")?.count, 1);
    } finally { harness.dispose(); }
  });

  it("stops capture on document replacement without dropping ordinary input", async () => {
    const harness = createHarness();
    try {
      harness.receivedMessage.fire({ type: "ready", documentId: DOCUMENT });
      await settle();
      harness.capture.toggle();
      const refresh = harness.panel as SessionPanelProvider & { refreshTerminalDiagnostics(): void };
      assert.equal(typeof refresh.refreshTerminalDiagnostics, "function");
      refresh.refreshTerminalDiagnostics();
      const oldProbe = { captureId: harness.capture.captureId!, sequence: 1 };
      harness.receivedMessage.fire({ type: "ready", documentId: OTHER_DOCUMENT });
      await settle();
      assert.equal(harness.capture.active, false);
      harness.receivedMessage.fire({ type: "input", sessionId: "alpha", data: "still responsive", isPromptSubmission: false, probe: oldProbe });
      await settle();
      assert.deepEqual(harness.inputs, ["still responsive"]);
    } finally { harness.dispose(); }
  });
});

function settle(): Promise<void> { return new Promise((resolve) => setImmediate(resolve)); }

function requestStop(panel: SessionPanelProvider): Promise<void> {
  const provider = panel as SessionPanelProvider & { stopTerminalDiagnostics(): Promise<void> };
  assert.equal(typeof provider.stopTerminalDiagnostics, "function");
  return provider.stopTerminalDiagnostics();
}

function createHarness(options: { holdDelivery?: boolean; failDiagnosticDelivery?: boolean; includeBeta?: boolean; extraSessions?: number } = {}) {
  let time = 0;
  const lines: TerminalDiagnosticMessage[] = [];
  const posted: HostMessage[] = [];
  const inputs: string[] = [];
  const deliveries: Array<(delivered: boolean) => void> = [];
  const capture = createTerminalDiagnosticCapture((message) => lines.push(message), { now: () => time, schedule: () => () => undefined });
  const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
  const receivedData = new vscode.EventEmitter<SessionDataEvent>();
  const receivedMessage = new vscode.EventEmitter<unknown>();
  const disposed = new vscode.EventEmitter<void>();
  const session: ManagedSessionSnapshot = {
    id: "alpha", claudeSessionId: null, rootId: "root", displayName: "Alpha", ordinalWithinRoot: 1,
    state: "running", activity: "idle", hasUnreadResponse: false, launchedImportIds: [], launchedAddDirPaths: [],
    launchedRootLabel: "Root", launchedRootPath: "C:/synthetic", launchedAt: 0
  };
  const noAction = () => undefined;
  const sessions = [session,
    ...(options.includeBeta ? [{ ...session, id: "beta", displayName: "Beta" }] : []),
    ...Array.from({ length: options.extraSessions ?? 0 }, (_, index) => ({ ...session, id: `extra-${index}`, displayName: `Extra ${index}` }))
  ];
  const actions: SessionPanelActions = {
    input: (_id, data) => { inputs.push(data); time += 3; }, resize: noAction, selectSession: noAction, renameSession: noAction,
    newSession: noAction, newInFolder: noAction, resumeSession: noAction, forgetSession: noAction, closeSession: noAction,
    restartFresh: noAction, previousSession: noAction, nextSession: noAction, configureWorkspace: noAction
  };
  const dependencies = {
    extensionUri: vscode.Uri.file("C:/extensions/synthetic"),
    terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
    sessions: { sessions, activeSessionId: "alpha", onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
    resumableSessions: { sessions: [], onDidChangeSessions: new vscode.EventEmitter<never>().event },
    terminalDiagnostics: capture, diagnosticNow: () => time, actions
  };
  const panel = new SessionPanelProvider(dependencies);
  panel.resolveWebviewView({
    visible: true, onDidDispose: disposed.event,
    webview: { cspSource: "vscode-webview://test", html: "", asWebviewUri: (uri: vscode.Uri) => uri,
      onDidReceiveMessage: receivedMessage.event, postMessage: async (message: HostMessage) => {
        if (options.failDiagnosticDelivery && (message.type === "terminalDiagnostics" || message.type === "terminalInputAck")) {
          throw new Error("synthetic diagnostic delivery failure");
        }
        posted.push(message);
        if (options.holdDelivery && message.type === "sessionData") { return new Promise<boolean>((resolve) => deliveries.push(resolve)); }
        return true;
      } }
  } as unknown as vscode.WebviewView);
  return { panel, capture, posted, lines, inputs, receivedData, receivedMessage, sessionChanges, session, sessions,
    settleDelivery: (index: number) => { deliveries[index]!(true); },
    setTime: (value: number) => { time = value; },
    dispose: () => { panel.dispose(); capture.dispose(); deliveries.forEach((resolve) => resolve(true)); sessionChanges.dispose(); receivedData.dispose(); receivedMessage.dispose(); disposed.dispose(); }
  };
}
