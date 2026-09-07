import path from "node:path";

/** Invocation details required to run a Windows command script through ComSpec. */
export interface WindowsCommandScriptInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
}

/** Returns whether a resolved executable is a Windows command script. */
export function isWindowsCommandScript(executable: string): boolean {
  const extension = path.win32.extname(executable).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

/** Builds an opaque invocation for one resolved Windows command script. */
export function createWindowsCommandScriptInvocation(
  executable: string,
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>
): WindowsCommandScriptInvocation {
  const occupiedNames = new Set(Object.keys(environment).map((name) => name.toUpperCase()));
  const scriptVariableName = reserveEnvironmentVariableName(
    occupiedNames,
    "CLAUDE_WORKSPACES_COMMAND_SCRIPT"
  );
  const argumentVariables = args.map((value, index) => ({
    name: reserveEnvironmentVariableName(
      occupiedNames,
      `CLAUDE_WORKSPACES_COMMAND_ARG_${index}`
    ),
    value
  }));
  const commandArguments = argumentVariables.map(({ name }) => `"%${name}%"`);
  return {
    executable: environmentValue(environment, "COMSPEC") ?? "cmd.exe",
    args: [
      "/d",
      "/s",
      "/v:off",
      "/c",
      [`""%${scriptVariableName}%"`, ...commandArguments].join(" ") + "\""
    ],
    environment: Object.assign(
      { ...environment, [scriptVariableName]: executable },
      Object.fromEntries(argumentVariables.map(({ name, value }) => [name, value]))
    )
  };
}

/** Reserves a command-safe environment name without shadowing inherited entries. */
function reserveEnvironmentVariableName(
  occupiedNames: Set<string>,
  baseName: string
): string {
  let candidate = baseName;
  let suffix = 0;
  while (occupiedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }
  occupiedNames.add(candidate);
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
