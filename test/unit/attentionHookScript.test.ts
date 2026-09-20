import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const HOOK_SCRIPT_PATH = path.resolve("media", "attention", "report-activity.ps1");
const PROCESS_TIMEOUT_MS = 10_000;
const describeOnWindows = process.platform === "win32" ? describe : describe.skip;

interface ScriptResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runHook(
  payload: Readonly<Record<string, unknown>>,
  environment: Readonly<Record<string, string | undefined>>
): Promise<ScriptResult> {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete childEnvironment[name];
    } else {
      childEnvironment[name] = value;
    }
  }
  return new Promise<ScriptResult>((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      HOOK_SCRIPT_PATH
    ], {
      env: childEnvironment,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

describeOnWindows("attention hook PowerShell script", () => {
  it("writes one atomic signal correlated to both managed and Claude session ids", async function () {
    // Losing either identity makes one host unable to safely route concurrent session activity.
    this.timeout(PROCESS_TIMEOUT_MS);
    const parent = await mkdtemp(path.join(tmpdir(), "attention hook success "));
    const channel = path.join(parent, "host channel");
    await mkdir(channel);
    try {
      const result = await runHook({
        session_id: "claude-session-1",
        hook_event_name: "Notification",
        notification_type: "permission_prompt"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
        CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      const files = await readdir(channel);
      assert.equal(files.filter((name) => name.endsWith(".signal.json")).length, 1);
      assert.equal(files.some((name) => name.endsWith(".tmp")), false);
      const signalName = files.find((name) => name.endsWith(".signal.json"));
      assert.ok(signalName);
      const signal = JSON.parse(await readFile(path.join(channel, signalName), "utf8"));
      assert.deepEqual({
        schemaVersion: signal.schemaVersion,
        managedSessionId: signal.managedSessionId,
        claudeSessionId: signal.claudeSessionId,
        hookEventName: signal.hookEventName,
        notificationType: signal.notificationType
      }, {
        schemaVersion: 1,
        managedSessionId: "managed-session-1",
        claudeSessionId: "claude-session-1",
        hookEventName: "Notification",
        notificationType: "permission_prompt"
      });
      assert.match(signal.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("fails loudly when the extension host channel was removed", async function () {
    // An orphaned PTY must expose the channel-deletion race instead of silently losing activity.
    this.timeout(PROCESS_TIMEOUT_MS);
    const parent = await mkdtemp(path.join(tmpdir(), "attention hook removed "));
    const missingChannel = path.join(parent, "removed channel");
    try {
      const result = await runHook({
        session_id: "claude-session-1",
        hook_event_name: "Stop"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: missingChannel,
        CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
      });

      assert.notEqual(result.exitCode, 0);
      assert.match(result.stderr, /attention channel is unavailable/i);
      assert.equal((await readdir(parent)).length, 0);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("fails loudly when Claude scrubs the routing environment", async function () {
    // Environment scrubbing otherwise produces a silent feature failure with no signal to inspect.
    this.timeout(PROCESS_TIMEOUT_MS);
    const result = await runHook({
      session_id: "claude-session-1",
      hook_event_name: "UserPromptSubmit"
    }, {
      CLAUDE_WORKSPACES_ATTENTION_CHANNEL: undefined,
      CLAUDE_WORKSPACES_SESSION_ID: undefined
    });

    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /attention channel environment is unavailable/i);
  });
});
