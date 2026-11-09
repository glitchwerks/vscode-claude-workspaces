import "@xterm/xterm/css/xterm.css";
import "../../src/panel/webview/styles.css";
import { decodeHostMessage, type WebviewMessage } from "../../src/panel/protocol";
import { createSessionRenderer } from "../../src/panel/webview/renderer";
import { XtermTerminal } from "../../src/panel/webview/xtermTerminal";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();
const terminals: XtermTerminal[] = [];
const pending = new Map<number, number>();
const completed = new Set<number>();
const renderer = createSessionRenderer({
  document, documentId: crypto.randomUUID(),
  window: { HTMLElement, MutationObserver, ResizeObserver, navigator,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) },
  postMessage: (message: WebviewMessage) => vscode.postMessage(message),
  terminalFactory: { create: (theme, font, openLink) => {
    const terminal = new XtermTerminal(theme, font, openLink);
    const write = terminal.write.bind(terminal);
    let syntheticOutput = "";
    // Constant measurement observer in both modes: real production adapter/parser, synthetic text only.
    terminal.write = (data, onParsed) => {
      syntheticOutput = (syntheticOutput + data).slice(-8_192);
      const sequences = [...syntheticOutput.matchAll(/CW_RESULT_(\d{4})/gu)].map((match) => Number(match[1]));
      write(data, () => {
        onParsed?.();
        for (const sequence of sequences) {
          const started = pending.get(sequence);
          if (started === undefined || completed.has(sequence)) { continue; }
          pending.delete(sequence);
          completed.add(sequence);
          const parseMs = performance.now() - started;
          requestAnimationFrame(() => vscode.postMessage({ type: "fixtureEcho", sequence, parseMs,
            nextFrameMs: performance.now() - started, rendererKind: terminal.rendererKind }));
        }
      });
    };
    terminals.push(terminal);
    return terminal;
  } },
  fitTerminal: (terminal) => terminal.fit?.()
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const value = event.data as Record<string, unknown> | null;
  if (value?.type === "fixtureRun" && typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) && value.sequence >= 1 && value.sequence <= 9999 && pending.size === 0) {
    pending.set(value.sequence, performance.now());
    terminals[0]?.paste(`${String(value.sequence).padStart(4, "0")}\r`);
    return;
  }
  const decoded = decodeHostMessage(event.data);
  if (!decoded.ok) { return; }
  renderer.handleMessage(decoded.value);
  if (decoded.value.type === "hydrate" && terminals.length > 0) {
    const bounds = document.querySelector(".terminal-stage")!.getBoundingClientRect();
    vscode.postMessage({ type: "fixtureReady", geometry: { viewportWidth: innerWidth, viewportHeight: innerHeight,
      terminalWidth: bounds.width, terminalHeight: bounds.height, devicePixelRatio } });
  }
  if (decoded.value.type === "terminalDiagnostics") {
    vscode.postMessage({ type: "fixtureCapture", captureId: decoded.value.captureId });
  }
});
