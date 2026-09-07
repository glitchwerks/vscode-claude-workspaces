/** Invocation details required to run a Windows command script through ComSpec. */
export interface WindowsCommandScriptInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly executionOptions: {
    readonly env: NodeJS.ProcessEnv;
    readonly windowsVerbatimArguments: true;
  };
}

/** Builds the existing help invocation for one resolved Windows command script. */
export function createWindowsCommandScriptHelpInvocation(
  executable: string,
  environment: Readonly<Record<string, string | undefined>>
): WindowsCommandScriptInvocation {
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
