import assert from "node:assert/strict";
import { AsyncLocalStorage, createHook } from "node:async_hooks";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Uri } from "vscode";

import { NodePtyFactory } from "../../src/launch/nodePtyAdapter";
import type { LaunchSpec } from "../../src/launch/launchPlanner";

interface Disposable {
  dispose(): void;
}

interface HarnessResult {
  readonly exitEvent: { readonly exitCode: number; readonly signal?: number };
  readonly output: string;
  readonly parentDirectory: string;
}

/** Runs the real Windows PTY boundary in a disposable child process. */
async function runHarness(): Promise<HarnessResult> {
  const parentDirectory = await mkdtemp(path.join(tmpdir(), "claude pty wrapper "));
  let pty: Awaited<ReturnType<NodePtyFactory["spawn"]>> | undefined;
  let dataSubscription: Disposable | undefined;
  let exitSubscription: Disposable | undefined;
  let exitTimeout: NodeJS.Timeout | undefined;
  try {
    const wrapperDirectory = path.join(
      parentDirectory,
      "scripts %TEMP% & bang ! caret ^ (left) right"
    );
    const wrapperPath = path.join(wrapperDirectory, "review-fix-claude.cmd");
    const forwardedArguments = [
      "--add-dir",
      "C:\\workspace with spaces\\%TEMP% & bang ! caret ^ (left) right",
      "--session-id",
      "value with spaces %USERPROFILE% & bang ! caret ^ (session)"
    ];
    await mkdir(wrapperDirectory, { recursive: true });
    await writeFile(
      wrapperPath,
      [
        "@echo off",
        "setlocal DisableDelayedExpansion",
        "set /p READY=",
        "echo ARG_1=\"%~1\"",
        "echo ARG_2=\"%~2\"",
        "echo ARG_3=\"%~3\"",
        "echo ARG_4=\"%~4\""
      ].join("\r\n"),
      "utf8"
    );
    const comSpec = process.env.ComSpec ?? process.env.COMSPEC;
    if (comSpec === undefined) {
      throw new Error("ComSpec is required for the Windows command-script harness.");
    }
    const spec: LaunchSpec = {
      executable: "review-fix-claude",
      args: forwardedArguments,
      cwd: parentDirectory,
      env: {
        Path: wrapperDirectory,
        PATHEXT: ".CMD",
        ComSpec: comSpec,
        TEMP: process.env.TEMP,
        USERPROFILE: process.env.USERPROFILE,
        CLAUDE_WORKSPACES_COMMAND_SCRIPT: "occupied script zero",
        claude_workspaces_command_script_1: "occupied script one",
        CLAUDE_WORKSPACES_COMMAND_ARG_0: "occupied argument zero",
        claude_workspaces_command_arg_0_1: "occupied argument one"
      },
      root: {
        id: "alpha",
        label: "alpha",
        uri: { fsPath: parentDirectory } as Uri
      },
      importedRoots: [],
      skippedImportIds: []
    };

    pty = await new NodePtyFactory().spawn(spec);
    let output = "";
    dataSubscription = pty.onData((data) => {
      output += data;
    });
    const exitEvent = new Promise<{ exitCode: number; signal?: number }>((resolve, reject) => {
      exitTimeout = setTimeout(
        () => reject(new Error("Timed out waiting for wrapper exit.")),
        5_000
      );
      exitSubscription = pty?.onExit(resolve);
    });

    pty.write("\r");
    return { exitEvent: await exitEvent, output, parentDirectory };
  } finally {
    if (exitTimeout !== undefined) {
      clearTimeout(exitTimeout);
    }
    exitSubscription?.dispose();
    dataSubscription?.dispose();
    pty?.dispose();
    await rm(parentDirectory, { recursive: true, force: true });
  }
}

/** Checks repeated real sessions in both Node and the VS Code extension host. */
export async function verifyWindowsCommandScriptCleanup(): Promise<HarnessResult & {
  readonly completedSessions: number;
}> {
  // Worker construction initializes stdio lazily; those pipes belong to the host.
  process.stdout.write("");
  process.stderr.write("");
  const owner = new AsyncLocalStorage<boolean>();
  const resources = new Map<number, string>();
  const observed = new Set<string>();
  const hook = createHook({
    init: (id, kind) => {
      if (owner.getStore() === true && ["WORKER", "MESSAGEPORT", "PIPEWRAP"].includes(kind)) {
        resources.set(id, kind);
        observed.add(kind);
      }
    },
    destroy: (id) => { resources.delete(id); }
  }).enable();
  try {
    let result: HarnessResult | undefined;
    for (let index = 0; index < 3; index += 1) {
      // Other extension-host services create MessagePorts too. Track only this
      // PTY's async context so their startup cannot change the cleanup verdict.
      result = await owner.run(true, runHarness);
      assert.equal(result.exitEvent.exitCode, 0, result.output);
      assert.match(result.output, /ARG_4=/, "Final output must arrive before exit");
      // Allow node-pty's one-second drain and worker termination to complete.
      const deadline = Date.now() + 5_000;
      while (resources.size > 0 && Date.now() < deadline) {
        await delay(25);
      }
      assert.deepEqual([...resources.values()], [], "PTY workers and sockets must not accumulate");
    }
    assert.ok(observed.has("WORKER"), "Probe must observe actual native PTY workers");
    assert.ok(observed.has("PIPEWRAP"), "Probe must observe actual native PTY sockets");
    assert.ok(result);
    return { ...result, completedSessions: 3 };
  } finally {
    hook.disable();
    owner.disable();
  }
}

if (require.main === module) {
  void verifyWindowsCommandScriptCleanup().then(
    (result) => {
      // Let Node exit naturally so retained native workers cannot be hidden by this fixture.
      process.stdout.write(`${JSON.stringify(result)}\n`);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.exitCode = 1;
      process.stderr.write(`${message}\n`);
    }
  );
}
