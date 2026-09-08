import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

void runHarness().then(
  (result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`, () => process.exit(1));
  }
);
