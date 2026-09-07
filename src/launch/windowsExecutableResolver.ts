import path from "node:path";

/** File-existence boundary used while resolving Windows executable candidates. */
export type FileExists = (candidate: string) => boolean;

/**
 * Resolves a bare Windows command through Path and PATHEXT.
 *
 * Commands on other platforms and commands that already include an explicit path
 * are returned unchanged.
 */
export function resolveWindowsExecutable(
  executable: string,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  fileExists: FileExists
): string {
  if (
    platform !== "win32" ||
    path.win32.isAbsolute(executable) ||
    executable.includes("/") ||
    executable.includes("\\")
  ) {
    return executable;
  }
  const searchPath = environmentValue(environment, "PATH");
  if (searchPath === undefined) {
    return executable;
  }
  const extensions = path.win32.extname(executable) === ""
    ? (environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter((extension) => extension !== "")
    : [""];
  for (const directoryValue of searchPath.split(";")) {
    const directory = directoryValue.trim().replace(/^"(.*)"$/, "$1");
    if (directory === "") {
      continue;
    }
    for (const extension of extensions) {
      const candidate = path.win32.join(directory, `${executable}${extension}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return executable;
}

function environmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const key = Object.keys(environment).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : environment[key];
}
