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
  environment: Readonly<Record<string, string | undefined>>,
  setupCommand?: string
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
      ...(setupCommand === undefined ? ["-File", HOOK_SCRIPT_PATH] : [
        "-Command", `${setupCommand}\n& $env:ATTENTION_TEST_HOOK_SCRIPT`
      ])
    ], {
      env: { ...childEnvironment, ATTENTION_TEST_HOOK_SCRIPT: HOOK_SCRIPT_PATH },
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

/** Locks the real publication file at encoding construction, before the writer opens it. */
function lockSignalFile(releaseOnRetry: boolean): string {
  return `
function New-Object {
    [CmdletBinding()]
    param([string] $TypeName, [object[]] $ArgumentList)
    if ($TypeName -eq 'System.Text.UTF8Encoding') {
        $script:publicationJson = (Get-Variable -Name signalJson -Scope 1).Value
        $publicationPath = (Get-Variable -Name temporaryPath -Scope 1).Value
        $script:publicationFileLock = [System.IO.File]::Open($publicationPath,
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None)
    }
    Microsoft.PowerShell.Utility\\New-Object -TypeName $TypeName -ArgumentList $ArgumentList
}
function Start-Sleep {
    [CmdletBinding()]
    param([int] $Milliseconds)
    [System.IO.File]::WriteAllText($env:ATTENTION_TEST_RETRY_MARKER, $script:publicationJson)
    ${releaseOnRetry ? "$script:publicationFileLock.Dispose()" : "# Keep the lock through every retry."}
    Microsoft.PowerShell.Utility\\Start-Sleep -Milliseconds $Milliseconds
}
`;
}

describeOnWindows("attention hook PowerShell script", () => {
  it("publishes confirmed parent and agent completion without response content", async function () {
    this.timeout(30_000);
    const channel = await mkdtemp(path.join(tmpdir(), "attention confirmed completion "));
    try {
      for (const agent_id of [undefined, "agent-1"]) {
        const result = await runHook({
          session_id: "claude-session-1", hook_event_name: "TurnComplete", agent_id,
          completion_reporter_ready: true, completion_reason: "aborted", is_aborted: true,
          answer: "PRIVATE_RESPONSE", transcript_path: "PRIVATE_PATH"
        }, {
          CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
          CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
        });
        assert.equal(result.exitCode, 0, result.stderr);
      }
      const files = await readdir(channel);
      assert.equal(files.length, 2);
      const signals = await Promise.all(files.map(async (file) => {
        const json = await readFile(path.join(channel, file), "utf8");
        assert.doesNotMatch(json, /PRIVATE|answer|transcript_path/);
        return JSON.parse(json);
      }));
      assert.deepEqual(signals.map((value) => value.agentId).sort(), ["agent-1", undefined].sort());
      for (const value of signals) {
        assert.equal(value.completionReporterReady, true);
        assert.equal(value.completionReason, "aborted");
        assert.equal(value.isAborted, true);
      }
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });

  it("correlates reporter readiness to the current Claude session", async function () {
    this.timeout(30_000);
    const channel = await mkdtemp(path.join(tmpdir(), "attention reporter readiness "));
    try {
      for (const readiness of ["claude-session-1", "previous-session"]) {
        const result = await runHook({ session_id: "claude-session-1", hook_event_name: "UserPromptSubmit" }, {
          CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
          CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1",
          CLAUDE_WORKSPACES_COMPLETION_SESSION: readiness
        });
        assert.equal(result.exitCode, 0, result.stderr);
      }
      const values = await Promise.all((await readdir(channel)).map(async (file) =>
        JSON.parse(await readFile(path.join(channel, file), "utf8"))));
      assert.deepEqual(values.map((value) => value.completionReporterReady).sort(), [false, true]);
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });
  it("recovers a stop signal after a transient filesystem sharing violation", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const channel = await mkdtemp(path.join(tmpdir(), "attention retry "));
    try {
      const result = await runHook({
        session_id: "claude-session-1", hook_event_name: "SubagentStop", agent_id: "agent-1"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
        CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1",
        ATTENTION_TEST_RETRY_MARKER: path.join(channel, "retry-observed")
      }, lockSignalFile(true));
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      const files = await readdir(channel);
      const signalFiles = files.filter((name) => name.endsWith(".signal.json"));
      assert.equal(signalFiles.length, 1);
      assert.equal(files.some((name) => name.endsWith(".tmp")), false);
      const raw = await readFile(path.join(channel, signalFiles[0]!), "utf8");
      assert.equal(raw, await readFile(path.join(channel, "retry-observed"), "utf8"));
      const written = JSON.parse(raw);
      assert.equal(written.hookEventName, "SubagentStop");
      assert.equal(written.agentId, "agent-1");
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });

  it("reports exhausted publication retries without leaking signal data", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const channel = await mkdtemp(path.join(tmpdir(), "attention persistent retry "));
    try {
      const result = await runHook({
        session_id: "private-session", hook_event_name: "SubagentStop", agent_id: "private-agent",
        last_assistant_message: "private response"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
        CLAUDE_WORKSPACES_SESSION_ID: "private-managed-session",
        ATTENTION_TEST_RETRY_MARKER: path.join(channel, "retry-observed")
      }, lockSignalFile(false));
      assert.notEqual(result.exitCode, 0);
      assert.match(result.stderr, /Signal write failed after 3 attempts/u);
      assert.doesNotMatch(result.stderr, /private|attention persistent retry/u);
      assert.equal((await readdir(channel)).some((name) => name.endsWith(".signal.json")), false);
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });

  for (const hookEventName of ["SubagentStart", "SubagentStop"]) {
    it(`rejects malformed ${hookEventName} identities without writing signals`, async function () {
      this.timeout(30_000);
      const channel = await mkdtemp(path.join(tmpdir(), "attention invalid agent "));
      try {
        for (const agent_id of [undefined, " ", 5]) {
          const result = await runHook({
            session_id: "claude-session-1", hook_event_name: hookEventName, agent_id
          }, {
            CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
            CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
          });
          assert.notEqual(result.exitCode, 0);
          assert.match(result.stderr, /Hook payload is invalid/u);
          assert.deepEqual(await readdir(channel), []);
        }
      } finally {
        await rm(channel, { recursive: true, force: true });
      }
    });

    it(`reports ${hookEventName} with the agent identity and no transcript content`, async function () {
      this.timeout(PROCESS_TIMEOUT_MS);
      const channel = await mkdtemp(path.join(tmpdir(), "attention agent lifecycle "));
      try {
        const result = await runHook({
          session_id: "claude-session-1", hook_event_name: hookEventName,
          agent_id: "agent-1", agent_type: "general-purpose",
          last_assistant_message: "private response", agent_transcript_path: "private path"
        }, {
          CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
          CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
        });
        assert.equal(result.exitCode, 0, result.stderr);
        const files = await readdir(channel);
        assert.equal(files.length, 1);
        const raw = await readFile(path.join(channel, files[0]!), "utf8");
        const signal = JSON.parse(raw);
        assert.equal(signal.agentId, "agent-1");
        assert.equal(signal.hookEventName, hookEventName);
        assert.doesNotMatch(raw, /private/u);
      } finally {
        await rm(channel, { recursive: true, force: true });
      }
    });
  }

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

  it("ignores subagent Stop events instead of marking the parent session waiting", async function () {
    // Settings hooks also run in subagents, so their Stop must not change the parent session state.
    this.timeout(PROCESS_TIMEOUT_MS);
    const parent = await mkdtemp(path.join(tmpdir(), "attention hook subagent stop "));
    const channel = path.join(parent, "host channel");
    await mkdir(channel);
    try {
      const result = await runHook({
        session_id: "claude-session-1",
        hook_event_name: "Stop",
        agent_id: "subagent-1",
        agent_type: "general-purpose"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
        CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      assert.deepEqual(await readdir(channel), []);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("still reports a subagent notification that genuinely needs input", async function () {
    this.timeout(PROCESS_TIMEOUT_MS);
    const parent = await mkdtemp(path.join(tmpdir(), "attention hook subagent input "));
    const channel = path.join(parent, "host channel");
    await mkdir(channel);
    try {
      const result = await runHook({
        session_id: "claude-session-1",
        hook_event_name: "Notification",
        notification_type: "agent_needs_input",
        agent_id: "subagent-1",
        agent_type: "general-purpose"
      }, {
        CLAUDE_WORKSPACES_ATTENTION_CHANNEL: channel,
        CLAUDE_WORKSPACES_SESSION_ID: "managed-session-1"
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
      const files = await readdir(channel);
      assert.equal(files.filter((name) => name.endsWith(".signal.json")).length, 1);
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
