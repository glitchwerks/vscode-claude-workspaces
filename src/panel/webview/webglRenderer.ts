import type { IEvent, ITerminalAddon, Terminal } from "@xterm/xterm";

export interface WebglRendererAddon extends ITerminalAddon {
  readonly onContextLoss: IEvent<void>;
}

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
