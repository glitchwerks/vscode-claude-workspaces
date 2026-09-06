import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Describes Claude CLI features required by the launch layer. */
export interface ClaudeCapabilities {
  readonly sessionPersistence: boolean;
}

/** Runs the configured Claude executable's help command. */
export interface ClaudeHelpRunner {
  run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

const sessionIdOption = /(?:^|\s)--session-id(?=\s|$)/;
const resumeOption = /(?:^|\s)--resume(?=\s|$)/;
const execFileAsync = promisify(execFile);

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
export function createNodeClaudeHelpRunner(timeoutMs = 5_000): ClaudeHelpRunner {
  return {
    async run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }> {
      const { stdout, stderr } = await execFileAsync(executable, ["--help"], {
        encoding: "utf8",
        timeout: timeoutMs,
        windowsHide: true
      });
      return { stdout, stderr };
    }
  };
}
