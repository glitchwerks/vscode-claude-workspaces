/** Whether local conversation evidence can support offering a saved session. */
export type ConversationEligibility = "present" | "absent" | "unknown";

/** Inspects an owned session's transcript without changing it. */
export async function checkConversationEligibility(
  sessionId: string,
  configDirectory = claudeConfigDirectory()
): Promise<ConversationEligibility> {
  // Relative overrides depend on the CLI's launch cwd, which this lookup cannot infer.
  if (!path.isAbsolute(configDirectory) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(sessionId)) {
    return "unknown";
  }
  const projects = path.join(configDirectory, "projects");
  try {
    const directories = await readdir(projects, { withFileTypes: true });
    let result: ConversationEligibility = "absent";
    // Sequential probes bound open descriptors and never inspect unrelated conversation files.
    for (const directory of directories) {
      if (!directory.isDirectory() && !directory.isSymbolicLink()) {
        continue;
      }
      const evidence = await readConversation(path.join(projects, directory.name, `${sessionId}.jsonl`));
      if (evidence === "present") {
        return evidence;
      }
      if (evidence === "unknown") {
        result = "unknown";
      }
    }
    return result;
  } catch (error: unknown) {
    return isMissing(error) ? "absent" : "unknown";
  }
}

/** Resolves the Claude configuration directory used by the launched process. */
export function claudeConfigDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir()
): string {
  const key = platform === "win32"
    ? Object.keys(environment).find((candidate) => candidate.toUpperCase() === "CLAUDE_CONFIG_DIR")
    : "CLAUDE_CONFIG_DIR";
  return (key === undefined ? undefined : environment[key]) || path.join(home, ".claude");
}

/** Streams individual JSONL records with a fixed maximum retained line size. */
async function readConversation(file: string): Promise<ConversationEligibility> {
  const stream = createReadStream(file, { highWaterMark: 64 * 1024 });
  let pending = Buffer.alloc(0);
  let result: ConversationEligibility = "absent";
  try {
    for await (const chunk of stream) {
      const data = Buffer.concat([pending, chunk as Buffer]);
      let start = 0;
      let newline: number;
      while ((newline = data.indexOf(0x0a, start)) >= 0) {
        if (newline - start > MAX_LINE_BYTES) {
          return "unknown";
        }
        const evidence = classifyLine(data.subarray(start, newline).toString("utf8"));
        if (evidence === "present") {
          return evidence;
        }
        if (evidence === "unknown") {
          result = evidence;
        }
        start = newline + 1;
      }
      pending = Buffer.from(data.subarray(start));
      if (pending.length > MAX_LINE_BYTES) {
        return "unknown";
      }
    }
    const final = classifyLine(pending.toString("utf8"));
    return final === "absent" ? result : final;
  } catch (error: unknown) {
    return isMissing(error) ? "absent" : "unknown";
  } finally {
    stream.destroy();
  }
}

/** Reads only record shape; transcript text never leaves this helper or enters logs. */
function classifyLine(line: string): ConversationEligibility {
  if (line.trim().length === 0) {
    return "absent";
  }
  try {
    const record: unknown = JSON.parse(line);
    if (typeof record !== "object" || record === null || !("type" in record)) {
      return "unknown";
    }
    if (record.type === "user" || record.type === "assistant") {
      const message = "message" in record ? record.message : undefined;
      if (typeof message === "object" && message !== null && "role" in message &&
        message.role === record.type && "content" in message &&
        (typeof message.content === "string" || Array.isArray(message.content))) {
        return "present";
      }
      return "unknown";
    }
    return typeof record.type === "string" && METADATA_TYPES.has(record.type) ? "absent" : "unknown";
  } catch {
    return "unknown";
  }
}

/** Distinguishes verified missing paths from unreadable or otherwise uncertain storage. */
function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const MAX_LINE_BYTES = 1024 * 1024;
const METADATA_TYPES = new Set([
  "file-history-snapshot", "queue-operation"
]);
