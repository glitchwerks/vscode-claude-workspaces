import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { decodeHostMessage, type WebviewMessage } from "../protocol";
import {
  createSessionRenderer,
} from "./renderer";
import { XtermTerminal } from "./xtermTerminal";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const renderer = createSessionRenderer({
  document,
  window: {
    HTMLElement,
    MutationObserver,
    ResizeObserver,
    navigator: window.navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  },
  postMessage: (message) => vscode.postMessage(message),
  terminalFactory: {
    create: (theme, terminalFont) => new XtermTerminal(theme, terminalFont)
  },
  fitTerminal: (terminal) => terminal.fit?.()
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const decoded = decodeHostMessage(event.data);
  if (decoded.ok) {
    renderer.handleMessage(decoded.value);
  }
});
