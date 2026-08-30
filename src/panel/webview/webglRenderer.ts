import type { IEvent, ITerminalAddon, Terminal } from "@xterm/xterm";

/** WebGL addon surface needed to fall back safely after activation or context failure. */
export interface WebglRendererAddon extends ITerminalAddon {
  readonly onContextLoss: IEvent<void>;
}

/** Enables custom-glyph rendering while retaining xterm's DOM renderer as the fallback. */
export function activateWebglRenderer(
  terminal: Pick<Terminal, "loadAddon">,
  createAddon: () => WebglRendererAddon
): void {
  let addon: WebglRendererAddon | undefined;
  try {
    addon = createAddon();
    terminal.loadAddon(addon);
    addon.onContextLoss(() => addon?.dispose());
  } catch {
    addon?.dispose();
  }
}
