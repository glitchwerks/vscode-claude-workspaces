import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  isRegularFile,
  resolveWindowsExecutable,
  type FileExists
} from "./windowsExecutableResolver";
import {
  createWindowsCommandScriptInvocation,
  isWindowsCommandScript
} from "./windowsCommandScriptInvocation";

/** Describes Claude CLI features required by the launch layer. */
export interface ClaudeCapabilities {
  readonly sessionPersistence: boolean;
  readonly settingsFile: boolean;
  readonly completionReporter?: "available" | "unsupported" | "disabled" | "remote-disabled" | "failed";
}

/** Runs the configured Claude executable's help command. */
export interface ClaudeHelpRunner {
  run(executable: string, args?: readonly string[]): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

interface ClaudeHelpExecutionOptions {
  readonly cwd?: string;
  readonly encoding: BufferEncoding;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly windowsVerbatimArguments?: boolean;
}

/** Process and platform boundaries used by the Node Claude help runner. */
export interface NodeClaudeHelpRunnerOptions {
  /** Existing host-owned attention channel, which contains no plugin or hooks module. */
  readonly modProbeDirectory?: string;
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
const settingsOption = /(?:^|\s)--settings(?=\s|$)/;
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
    const evict = () => {
      if (this.capabilitiesByExecutable.get(executable) === capabilities) {
        this.capabilitiesByExecutable.delete(executable);
      }
    };
    void capabilities.then((result) => {
      if (result.completionReporter === "failed") {
        evict();
      }
    }, evict);
    return capabilities;
  }

  /** Detects session persistence support from one completed help response. */
  private async detect(executable: string): Promise<ClaudeCapabilities> {
    const { stdout, stderr } = await this.runner.run(executable);
    const helpText = `${stdout}\n${stderr}`;
    const completionReporter = /(?:^|\s)--plugin-dir(?=\s|$)/.test(helpText)
      ? await this.detectCompletionReporter(executable) : undefined;
    return Object.freeze({
      sessionPersistence: sessionIdOption.test(helpText) && resumeOption.test(helpText),
      settingsFile: settingsOption.test(helpText),
      ...(completionReporter === undefined ? {} : { completionReporter })
    });
  }

  private async detectCompletionReporter(executable: string): Promise<NonNullable<ClaudeCapabilities["completionReporter"]>> {
    try {
      const version = await this.runner.run(executable, ["--version"]);
      const match = `${version.stdout}\n${version.stderr}`.match(/^\s*(\d+)\.(\d+)\.(\d+) \(Claude Code\)\s*$/m);
      if (match === null) {
        return "failed";
      }
      const [major, minor, patch] = match.slice(1).map(Number);
      if (major! < 2 || (major === 2 && (minor! < 1 || (minor === 1 && patch! < 287)))) {
        return "unsupported";
      }
      let result: { readonly stdout?: unknown; readonly stderr?: unknown };
      try {
        result = await this.runner.run(executable, ["plugin", "test"]);
      } catch (error) {
        if (typeof error !== "object" || error === null) {
          return "failed";
        }
        result = error as typeof result;
      }
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      if (/hooks modules are turned off (?:here|for installed plugins in this process)/.test(output)) {
        return /rollout switch/.test(output) ? "remote-disabled" : "disabled";
      }
      if (/hooks modules are turned off in this process/.test(output)) {
        return "remote-disabled";
      }
      return /no hooks module to load/.test(output) ? await this.detectSideloadPolicy(executable) : "failed";
    } catch {
      return "failed";
    }
  }

  /** Checks CLI flag policy through file-only validation, without starting sessions or loading plugins. */
  private async detectSideloadPolicy(executable: string): Promise<NonNullable<ClaudeCapabilities["completionReporter"]>> {
    try {
      await this.runner.run(executable, ["plugin", "validate", "--json"]);
      // The host-owned module-free directory has no manifest; successful validation is unexpected.
      return "failed";
    } catch (error) {
      if (typeof error !== "object" || error === null) {
        return "failed";
      }
      const result = error as { readonly code?: unknown; readonly stdout?: unknown; readonly stderr?: unknown };
      if (/disableSideloadFlags/.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)) {
        return "disabled";
      }
      if (result.code !== 1 || typeof result.stdout !== "string") {
        return "failed";
      }
      try {
        return isEmptyDirectoryValidation(JSON.parse(result.stdout)) ? "available" : "failed";
      } catch {
        return "failed";
      }
    }
  }
}

/** Accepts only the controlled empty-directory receipt reached after the CLI's sideload policy gate. */
function isEmptyDirectoryValidation(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const result = value as {
    success?: unknown; strict?: unknown; target?: unknown; contents?: unknown;
    manifest?: { file?: unknown; type?: unknown; errors?: unknown; warnings?: unknown; notes?: unknown };
  };
  const manifest = result.manifest;
  if (result.success !== false || result.strict !== false || typeof result.target !== "string" || result.target.length === 0 ||
      manifest?.file !== result.target || manifest.type !== "plugin" ||
      !Array.isArray(manifest.errors) || manifest.errors.length !== 1 ||
      !Array.isArray(manifest.warnings) || manifest.warnings.length !== 0 ||
      !Array.isArray(manifest.notes) || manifest.notes.length !== 0 ||
      !Array.isArray(result.contents) || result.contents.length !== 0) {
    return false;
  }
  const error = manifest.errors[0] as { path?: unknown; message?: unknown; code?: unknown } | null;
  return error?.path === "directory" && error.code === null &&
    error.message === "No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json";
}

/** Creates the Node process boundary used to query one configured Claude executable. */
export function createNodeClaudeHelpRunner(
  timeoutMs = 5_000,
  options: NodeClaudeHelpRunnerOptions = {}
): ClaudeHelpRunner {
  return {
    async run(executable: string, args: readonly string[] = ["--help"]): Promise<{ readonly stdout: string; readonly stderr: string }> {
      const isModProbe = args[0] === "plugin" && args[1] === "test";
      const isSideloadProbe = args[0] === "plugin" && args[1] === "validate";
      if ((isModProbe || isSideloadProbe) && options.modProbeDirectory === undefined) {
        throw new Error("A module-free availability probe directory is unavailable.");
      }
      const environment = options.environment ?? process.env;
      const platform = options.platform ?? process.platform;
      const resolvedExecutable = resolveWindowsExecutable(
        executable,
        environment,
        platform,
        options.fileExists ?? isRegularFile
      );
      const invocation = createHelpInvocation(resolvedExecutable, environment, platform,
        isSideloadProbe ? ["--plugin-dir", options.modProbeDirectory!, "plugin", "validate", options.modProbeDirectory!, "--json"] : args);
      return (options.executeFile ?? executeNodeFile)(invocation.executable, invocation.args, {
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true,
        ...(isModProbe || isSideloadProbe ? { cwd: options.modProbeDirectory } : {}),
        ...invocation.executionOptions
      });
    }
  };
}

/** Builds a direct executable call or an explicit Windows command-script call. */
function createHelpInvocation(
  executable: string,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  args: readonly string[]
): {
  readonly executable: string;
  readonly args: readonly string[];
  readonly executionOptions?: Pick<ClaudeHelpExecutionOptions, "env" | "windowsVerbatimArguments">;
} {
  if (platform !== "win32" || !isWindowsCommandScript(executable)) {
    return { executable, args };
  }
  const invocation = createWindowsCommandScriptInvocation(
    executable,
    args,
    environment
  );
  return {
    executable: invocation.executable,
    args: invocation.args,
    executionOptions: {
      env: invocation.environment,
      windowsVerbatimArguments: true
    }
  };
}
