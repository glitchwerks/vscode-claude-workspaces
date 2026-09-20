import { writeFile } from "node:fs/promises";
import path from "node:path";

export const ATTENTION_HOOK_SETTINGS_FILE = ".hooks-settings.json";

/** Writes one extension-owned Claude hook configuration for the active host channel. */
export async function writeAttentionHookSettings(
  channelPath: string,
  hookScriptPath: string
): Promise<string> {
  const settingsPath = path.join(channelPath, ATTENTION_HOOK_SETTINGS_FILE);
  const commandHook = Object.freeze({
    type: "command",
    command: "powershell.exe",
    args: Object.freeze([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      hookScriptPath
    ]),
    timeout: 5
  });
  const hooks = Object.freeze({
    UserPromptSubmit: Object.freeze([Object.freeze({ hooks: Object.freeze([commandHook]) })]),
    Notification: Object.freeze([Object.freeze({
      matcher: "permission_prompt|agent_needs_input|elicitation_dialog|idle_prompt",
      hooks: Object.freeze([commandHook])
    })]),
    Stop: Object.freeze([Object.freeze({ hooks: Object.freeze([commandHook]) })]),
    SessionEnd: Object.freeze([Object.freeze({ hooks: Object.freeze([commandHook]) })])
  });
  await writeFile(settingsPath, `${JSON.stringify({ hooks }, undefined, 2)}\n`, {
    encoding: "utf8",
    flag: "w"
  });
  return settingsPath;
}
