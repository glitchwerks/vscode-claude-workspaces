import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ClaudeCapabilityProbe,
  createNodeClaudeHelpRunner,
  type ClaudeHelpRunner
} from "../../src/launch/claudeCapabilities";

class ControlledHelpRunner implements ClaudeHelpRunner {
  readonly calls: string[] = [];
  private readonly responses = new Map<string, Promise<{ readonly stdout: string; readonly stderr: string }>>();

  setResponse(
    executable: string,
    response: Promise<{ readonly stdout: string; readonly stderr: string }>
  ): void {
    this.responses.set(executable, response);
  }

  run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }> {
    this.calls.push(executable);
    const response = this.responses.get(executable);
    if (response === undefined) {
      throw new Error(`No help response for ${executable}.`);
    }
    return response;
  }
}

describe("ClaudeCapabilityProbe", () => {
  it("runs the configured executable's help command at the process boundary", async () => {
    // Omitting --help would leave Node waiting for interactive input instead of returning help text.
    const output = await createNodeClaudeHelpRunner().run(process.execPath);

    assert.match(`${output.stdout}\n${output.stderr}`, /Usage: node/);
  });

  it("probes a PATH-resolved Windows command wrapper through ComSpec", async () => {
    // Passing a resolved .cmd file directly to execFile fails and permanently caches unsupported capabilities.
    const calls: Array<{
      executable: string;
      args: readonly string[];
      options: {
        encoding: BufferEncoding;
        timeout: number;
        windowsHide: boolean;
        windowsVerbatimArguments?: boolean;
      };
    }> = [];
    const runner = createNodeClaudeHelpRunner(1_234, {
      environment: {
        Path: "C:\\Program Files\\Claude",
        PATHEXT: ".EXE;.CMD",
        ComSpec: "C:\\Windows\\System32\\cmd.exe"
      },
      platform: "win32",
      fileExists: (candidate) => candidate === "C:\\Program Files\\Claude\\review-fix-claude.CMD",
      executeFile: async (executable, args, executionOptions) => {
        calls.push({ executable, args, options: executionOptions });
        return {
          stdout: "--session-id <uuid>",
          stderr: "--resume [sessionId]"
        };
      }
    });
    const probe = new ClaudeCapabilityProbe(runner);

    assert.deepEqual(await probe.get("review-fix-claude"), { sessionPersistence: true });
    assert.deepEqual(await probe.get("review-fix-claude"), { sessionPersistence: true });
    assert.deepEqual(calls, [{
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/v:off",
        "/c",
        "\"\"%CLAUDE_WORKSPACES_HELP_SCRIPT%\" --help\""
      ],
      options: {
        encoding: "utf8",
        env: {
          Path: "C:\\Program Files\\Claude",
          PATHEXT: ".EXE;.CMD",
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
          CLAUDE_WORKSPACES_HELP_SCRIPT: "C:\\Program Files\\Claude\\review-fix-claude.CMD"
        },
        timeout: 1_234,
        windowsHide: true,
        windowsVerbatimArguments: true
      }
    }]);
  });

  it("executes a PATH-resolved Windows command wrapper end to end", async () => {
    // A syntactically plausible cmd.exe invocation can still fail once Windows applies /s quote handling.
    if (process.platform !== "win32") {
      return;
    }
    const directory = await mkdtemp(path.join(tmpdir(), "claude capability wrapper "));
    const wrapperPath = path.join(directory, "review-fix-claude.cmd");
    await writeFile(
      wrapperPath,
      "@echo off\r\necho --session-id value\r\necho --resume value 1>&2\r\n",
      "utf8"
    );

    try {
      const runner = createNodeClaudeHelpRunner(5_000, {
        environment: {
          Path: directory,
          PATHEXT: ".CMD",
          ComSpec: process.env.ComSpec ?? process.env.COMSPEC
        },
        platform: "win32"
      });

      assert.deepEqual(
        await new ClaudeCapabilityProbe(runner).get("review-fix-claude"),
        { sessionPersistence: true }
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves percent expansion and command metacharacters in a Windows wrapper path", async () => {
    // Interpolating the path into /c expands %TEMP% even inside quotes and makes the wrapper undiscoverable.
    if (process.platform !== "win32") {
      return;
    }
    const parentDirectory = await mkdtemp(path.join(tmpdir(), "claude capability metacharacters "));
    const directory = path.join(parentDirectory, "cw review %TEMP% & x ! bang ^ caret (left) right");
    await mkdir(directory);
    const wrapperPath = path.join(directory, "review-fix-claude.cmd");
    await writeFile(
      wrapperPath,
      "@echo off\r\necho --session-id value\r\necho --resume value 1>&2\r\n",
      "utf8"
    );

    try {
      const runner = createNodeClaudeHelpRunner(5_000, {
        environment: {
          Path: directory,
          PATHEXT: ".CMD",
          ComSpec: process.env.ComSpec ?? process.env.COMSPEC,
          TEMP: process.env.TEMP
        },
        platform: "win32"
      });

      assert.deepEqual(
        await new ClaudeCapabilityProbe(runner).get("review-fix-claude"),
        { sessionPersistence: true }
      );
    } finally {
      await rm(parentDirectory, { recursive: true, force: true });
    }
  });

  it("uses an unoccupied environment variable for the Windows wrapper path", async () => {
    // Reusing an inherited name can make Windows choose the wrong case-insensitive environment entry.
    const calls: Array<{
      args: readonly string[];
      environment: NodeJS.ProcessEnv | undefined;
    }> = [];
    const environment = {
      Path: "C:\\Program Files\\Claude",
      PATHEXT: ".CMD",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      CLAUDE_WORKSPACES_HELP_SCRIPT: "occupied zero",
      claude_workspaces_help_script_1: "occupied one"
    };
    const runner = createNodeClaudeHelpRunner(5_000, {
      environment,
      platform: "win32",
      fileExists: (candidate) => candidate === "C:\\Program Files\\Claude\\review-fix-claude.CMD",
      executeFile: async (_executable, args, options) => {
        calls.push({ args, environment: options.env });
        return { stdout: "collision-safe help", stderr: "" };
      }
    });

    await runner.run("review-fix-claude");

    assert.deepEqual(calls, [{
      args: [
        "/d",
        "/s",
        "/v:off",
        "/c",
        "\"\"%CLAUDE_WORKSPACES_HELP_SCRIPT_2%\" --help\""
      ],
      environment: {
        ...environment,
        CLAUDE_WORKSPACES_HELP_SCRIPT_2: "C:\\Program Files\\Claude\\review-fix-claude.CMD"
      }
    }]);
    assert.equal(environment.CLAUDE_WORKSPACES_HELP_SCRIPT, "occupied zero");
  });

  it("probes a native Windows executable directly with a structured help argument", async () => {
    // Routing every Windows executable through cmd.exe would unnecessarily expose native launches to parsing.
    const calls: Array<{ executable: string; args: readonly string[] }> = [];
    const runner = createNodeClaudeHelpRunner(5_000, {
      environment: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      platform: "win32",
      fileExists: () => {
        throw new Error("An explicit path must not be searched.");
      },
      executeFile: async (executable, args) => {
        calls.push({ executable, args });
        return { stdout: "native help", stderr: "" };
      }
    });

    await runner.run("C:\\Program Files\\Claude\\claude.exe");

    assert.deepEqual(calls, [{
      executable: "C:\\Program Files\\Claude\\claude.exe",
      args: ["--help"]
    }]);
  });

  it("probes an explicit Windows batch wrapper through ComSpec", async () => {
    // Treating .bat as a native executable reproduces the same execFile rejection as a .cmd wrapper.
    const calls: Array<{
      executable: string;
      args: readonly string[];
      windowsVerbatimArguments: boolean | undefined;
    }> = [];
    const runner = createNodeClaudeHelpRunner(5_000, {
      environment: { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
      platform: "win32",
      fileExists: () => {
        throw new Error("An explicit path must not be searched.");
      },
      executeFile: async (executable, args, options) => {
        calls.push({
          executable,
          args,
          windowsVerbatimArguments: options.windowsVerbatimArguments
        });
        return { stdout: "batch help", stderr: "" };
      }
    });

    await runner.run("C:\\Program Files\\Claude\\claude.bat");

    assert.deepEqual(calls, [{
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/v:off",
        "/c",
        "\"\"%CLAUDE_WORKSPACES_HELP_SCRIPT%\" --help\""
      ],
      windowsVerbatimArguments: true
    }]);
  });

  it("enables session persistence only when both complete flags appear across help output", async () => {
    // Matching a flag prefix or searching only one stream would enable an unsupported CLI.
    const runner = new ControlledHelpRunner();
    runner.setResponse("claude", Promise.resolve({
      stdout: "Usage: claude [options]\n  --session-id <uuid>",
      stderr: "  --resume [sessionId]"
    }));
    runner.setResponse("legacy-claude", Promise.resolve({
      stdout: "  --session-identifier <uuid>",
      stderr: "  --resume-session <uuid>"
    }));
    runner.setResponse("resume-only-claude", Promise.resolve({
      stdout: "  --resume [sessionId]",
      stderr: ""
    }));
    const probe = new ClaudeCapabilityProbe(runner);

    assert.deepEqual(await probe.get("claude"), { sessionPersistence: true });
    assert.deepEqual(await probe.get("legacy-claude"), { sessionPersistence: false });
    assert.deepEqual(await probe.get("resume-only-claude"), { sessionPersistence: false });
  });

  it("combines both help streams without assigning each flag to a fixed stream", async () => {
    // Searching --session-id only in stdout or --resume only in stderr rejects valid reordered output.
    const runner = new ControlledHelpRunner();
    runner.setResponse("reordered-claude", Promise.resolve({
      stdout: "  --resume [sessionId]",
      stderr: "  --session-id <uuid>"
    }));

    assert.deepEqual(
      await new ClaudeCapabilityProbe(runner).get("reordered-claude"),
      { sessionPersistence: true }
    );
  });

  it("returns unsupported when the help process rejects", async () => {
    // Propagating a probe failure would prevent an ordinary non-resumable launch.
    const runner = new ControlledHelpRunner();
    runner.setResponse("missing-claude", Promise.reject(new Error("ENOENT")));

    assert.deepEqual(
      await new ClaudeCapabilityProbe(runner).get("missing-claude"),
      { sessionPersistence: false }
    );
  });

  it("shares a pending and completed probe for one executable", async () => {
    // Caching only after await would issue simultaneous duplicate help processes.
    const runner = new ControlledHelpRunner();
    let resolveResponse: ((value: { readonly stdout: string; readonly stderr: string }) => void) | undefined;
    runner.setResponse("claude", new Promise((resolve) => {
      resolveResponse = resolve;
    }));
    const probe = new ClaudeCapabilityProbe(runner);

    const first = probe.get("claude");
    const second = probe.get("claude");
    assert.deepEqual(runner.calls, ["claude"]);

    resolveResponse?.({ stdout: "--session-id <uuid>", stderr: "--resume [sessionId]" });
    assert.deepEqual(await Promise.all([first, second]), [
      { sessionPersistence: true },
      { sessionPersistence: true }
    ]);
    assert.deepEqual(await probe.get("claude"), { sessionPersistence: true });
    assert.deepEqual(runner.calls, ["claude"]);
  });

  it("probes distinct executables independently", async () => {
    // Keying the cache globally would apply one configured executable's support to another.
    const runner = new ControlledHelpRunner();
    runner.setResponse("new-claude", Promise.resolve({
      stdout: "--session-id <uuid>",
      stderr: "--resume [sessionId]"
    }));
    runner.setResponse("old-claude", Promise.resolve({ stdout: "--session-id <uuid>", stderr: "" }));
    const probe = new ClaudeCapabilityProbe(runner);

    assert.deepEqual(await probe.get("new-claude"), { sessionPersistence: true });
    assert.deepEqual(await probe.get("old-claude"), { sessionPersistence: false });
    assert.deepEqual(runner.calls, ["new-claude", "old-claude"]);
  });
});
