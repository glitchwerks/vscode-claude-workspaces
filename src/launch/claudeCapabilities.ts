import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  resolveWindowsExecutable,
  type FileExists
} from "./windowsExecutableResolver";

/** Describes Claude CLI features required by the launch layer. */
export interface ClaudeCapabilities {
  readonly sessionPersistence: boolean;
}

/** Runs the configured Claude executable's help command. */
export interface ClaudeHelpRunner {
  run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

interface ClaudeHelpExecutionOptions {
  readonly encoding: BufferEncoding;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly windowsVerbatimArguments?: boolean;
}

/** Process and platform boundaries used by the Node Claude help runner. */
export interface NodeClaudeHelpRunnerOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly fileExists?: FileExists;
  readonly executeFile?: (
    executable: string,
    args: readonly string[],
    options: ClaudeHelpExecutionOptions
  ) => Promise<{ readonly stdout: string; readonly stderr: string }>;
}

const sessionIdOption = /(?:^|\s)--session-id(?=\s|$)/;
const resumeOption = /(?:^|\s)--resume(?=\s|$)/;
const execFileAsync = promisify(execFile);

/** Executes one help-process invocation through Node's structured process API. */
const executeNodeFile: NonNullable<NodeClaudeHelpRunnerOptions["executeFile"]> = async (
  executable,
  args,
  options
) => {
  const { stdout, stderr } = await execFileAsync(executable, [...args], options);
  return { stdout, stderr };
};

/**
 * Detects Claude CLI launch capabilities and memoizes each configured executable's result.
 */
export class ClaudeCapabilityProbe {
  private readonly capabilitiesByExecutable = new Map<string, Promise<ClaudeCapabilities>>();

  constructor(private readonly runner: ClaudeHelpRunner) {}

  /** Returns the cached capability result for one configured Claude executable. */
  get(executable: string): Promise<ClaudeCapabilities> {
    const cached = this.capabilitiesByExecutable.get(executable);
    if (cached !== undefined) {
      return cached;
    }

    const capabilities = this.detect(executable);
    this.capabilitiesByExecutable.set(executable, capabilities);
    return capabilities;
  }

  /** Detects session persistence support without letting a failed help probe block launch planning. */
  private async detect(executable: string): Promise<ClaudeCapabilities> {
    try {
      const { stdout, stderr } = await this.runner.run(executable);
      const helpText = `${stdout}\n${stderr}`;
      return Object.freeze({
        sessionPersistence: sessionIdOption.test(helpText) && resumeOption.test(helpText)
      });
    } catch {
      return Object.freeze({ sessionPersistence: false });
    }
  }
}

/** Creates the Node process boundary used to query one configured Claude executable. */
export function createNodeClaudeHelpRunner(
  timeoutMs = 5_000,
  options: NodeClaudeHelpRunnerOptions = {}
): ClaudeHelpRunner {
  return {
    async run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }> {
      const environment = options.environment ?? process.env;
      const platform = options.platform ?? process.platform;
      const resolvedExecutable = resolveWindowsExecutable(
        executable,
        environment,
        platform,
        options.fileExists ?? existsSync
      );
      const invocation = createHelpInvocation(resolvedExecutable, environment, platform);
      return (options.executeFile ?? executeNodeFile)(invocation.executable, invocation.args, {
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true,
        ...invocation.executionOptions
      });
    }
  };
}

/** Builds a direct executable call or an explicit Windows command-script call. */
function createHelpInvocation(
  executable: string,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform
): {
  readonly executable: string;
  readonly args: readonly string[];
  readonly executionOptions?: Pick<ClaudeHelpExecutionOptions, "env" | "windowsVerbatimArguments">;
} {
  const extension = path.win32.extname(executable).toLowerCase();
  if (platform !== "win32" || (extension !== ".cmd" && extension !== ".bat")) {
    return { executable, args: ["--help"] };
  }
  const scriptVariableName = unusedEnvironmentVariableName(environment);
  return {
    executable: environmentValue(environment, "COMSPEC") ?? "cmd.exe",
    args: ["/d", "/s", "/v:off", "/c", `""%${scriptVariableName}%" --help"`],
    executionOptions: {
      env: { ...environment, [scriptVariableName]: executable },
      windowsVerbatimArguments: true
    }
  };
}

/** Returns a command-safe variable name that cannot shadow an inherited Windows entry. */
function unusedEnvironmentVariableName(
  environment: Readonly<Record<string, string | undefined>>
): string {
  const baseName = "CLAUDE_WORKSPACES_HELP_SCRIPT";
  const occupiedNames = new Set(Object.keys(environment).map((name) => name.toUpperCase()));
  let candidate = baseName;
  let suffix = 0;
  while (occupiedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }
  return candidate;
}

/** Reads one Windows environment variable without assuming key casing. */
function environmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const key = Object.keys(environment).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : environment[key];
}
