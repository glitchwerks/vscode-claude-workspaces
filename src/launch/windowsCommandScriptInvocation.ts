import path from "node:path";

/** Invocation details required to run a Windows command script through ComSpec. */
export interface WindowsCommandScriptInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
}

/** Identifies a command-script value that cannot cross cmd.exe's syntax boundary safely. */
export class WindowsCommandScriptArgumentError extends Error {
  readonly argumentIndex: number | undefined;
  readonly valueKind: "executable" | "argument";

  constructor(valueKind: "executable" | "argument", argumentIndex?: number) {
    const location = argumentIndex === undefined
      ? "executable"
      : `argument ${argumentIndex}`;
    super(`Windows command-script ${location} contains a quote or line break.`);
    this.name = "WindowsCommandScriptArgumentError";
    this.argumentIndex = argumentIndex;
    this.valueKind = valueKind;
  }
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
  assertSafeCommandScriptValue(executable, "executable");
  args.forEach((argument, index) => {
    assertSafeCommandScriptValue(argument, "argument", index);
  });
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

/** Rejects data that can change quote or command-line boundaries after percent expansion. */
function assertSafeCommandScriptValue(
  value: string,
  valueKind: "executable" | "argument",
  argumentIndex?: number
): void {
  if (/["\r\n]/.test(value)) {
    throw new WindowsCommandScriptArgumentError(valueKind, argumentIndex);
  }
}

/** Reserves a command-safe environment name without shadowing inherited entries. */
function reserveEnvironmentVariableName(
  occupiedNames: Set<string>,
  baseName: string
): string {
  let candidate = baseName;
  let suffix = 0;
  while (occupiedNames.has(candidate.toUpperCase())) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }
  occupiedNames.add(candidate.toUpperCase());
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
