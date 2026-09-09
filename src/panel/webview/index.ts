import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { decodeHostMessage, type WebviewMessage } from "../protocol";
import {
  createSessionRenderer,
} from "./renderer";
import { XtermTerminal } from "./xtermTerminal";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const renderer = createSessionRenderer({
  document,
  documentId: crypto.randomUUID(),
  window: {
    HTMLElement,
    MutationObserver,
    ResizeObserver,
    navigator: window.navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  },
  postMessage: (message) => vscode.postMessage(message),
  loadState: () => vscode.getState(),
  saveState: (state) => vscode.setState(state),
  terminalFactory: {
    create: (theme, terminalFont, openLink) =>
      new XtermTerminal(theme, terminalFont, openLink)
  },
  fitTerminal: (terminal) => terminal.fit?.()
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const decoded = decodeHostMessage(event.data);
  if (decoded.ok) {
    renderer.handleMessage(decoded.value);
  }
});
