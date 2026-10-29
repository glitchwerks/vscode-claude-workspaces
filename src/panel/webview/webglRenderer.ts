import type { IEvent, ITerminalAddon, Terminal } from "@xterm/xterm";

export interface WebglRendererAddon extends ITerminalAddon {
  readonly onContextLoss: IEvent<void>;
}

export function activateWebglRenderer(
  terminal: Pick<Terminal, "loadAddon">,
  createAddon: () => WebglRendererAddon,
  observe?: (state: "webgl" | "default") => void
): void {
  const report = (state: "webgl" | "default"): void => { try { observe?.(state); } catch { /* Observation cannot change renderer selection. */ } };
  let addon: WebglRendererAddon | undefined;
  try {
    addon = createAddon();
    terminal.loadAddon(addon);
    addon.onContextLoss(() => { addon?.dispose(); report("default"); });
    report("webgl");
  } catch {
    addon?.dispose();
    report("default");
  }
}
