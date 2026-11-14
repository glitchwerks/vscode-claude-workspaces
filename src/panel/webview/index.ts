import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import "./composer/styles.css";
import "./companion/styles.css";
import { createComposerView } from "./composer/view";
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
const documentId = crypto.randomUUID();
const bootstrap = document.querySelector("#app")?.getAttribute("data-companion-view-id");
const companionViewId = typeof bootstrap === "string" && bootstrap.length === 32 && /^[a-f0-9]{32}$/.test(bootstrap)
  ? bootstrap : undefined;
const renderer = createSessionRenderer({
  createComposer: createComposerView,
  document,
  documentId,
  companionViewId,
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
