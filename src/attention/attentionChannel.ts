import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";

export const ATTENTION_CHANNELS_DIRECTORY = "attention-channels";
export const ATTENTION_CHANNEL_OWNER_FILE = ".owner.json";

export type AttentionChannelDisabledReason = "non-windows" | "remote-host";

/** One extension-host-owned directory through which hook signals will be routed. */
export interface AttentionChannel {
  readonly id: string;
  readonly path: string;
  close(): Promise<void>;
  dispose(): void;
}

export type AttentionChannelResult =
  | Readonly<{ status: "disabled"; reason: AttentionChannelDisabledReason }>
  | Readonly<{ status: "ready"; channel: AttentionChannel }>;

export interface AttentionChannelOptions {
  readonly storagePath: string;
  readonly platform: NodeJS.Platform;
  readonly remoteName?: string;
  readonly processId: number;
  readonly createId?: () => string;
  readonly isProcessAlive?: (processId: number) => boolean;
}

/** Opens one random, host-owned channel after pruning channels whose host no longer exists. */
export async function openAttentionChannel(
  options: AttentionChannelOptions
): Promise<AttentionChannelResult> {
  if (options.remoteName !== undefined) {
    return Object.freeze({ status: "disabled", reason: "remote-host" });
  }
  if (options.platform !== "win32") {
    return Object.freeze({ status: "disabled", reason: "non-windows" });
  }

  const channelsPath = path.join(options.storagePath, ATTENTION_CHANNELS_DIRECTORY);
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  await mkdir(channelsPath, { recursive: true });
  await removeOrphanedChannels(channelsPath, isProcessAlive);

  const createId = options.createId ?? randomUUID;
  const channelId = createId();
  const channelPath = path.join(channelsPath, channelId);
  const stagingPath = path.join(
    channelsPath,
    `.creating-${options.processId}-${channelId}`
  );
  await mkdir(stagingPath);
  try {
    await writeFile(
      path.join(stagingPath, ATTENTION_CHANNEL_OWNER_FILE),
      JSON.stringify({ processId: options.processId }),
      { encoding: "utf8", flag: "wx" }
    );
    await rename(stagingPath, channelPath);
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }

  return Object.freeze({
    status: "ready",
    channel: new OwnedAttentionChannel(channelId, channelPath)
  });
}

class OwnedAttentionChannel implements AttentionChannel {
  private closeOperation: Promise<void> | undefined;

  constructor(
    readonly id: string,
    readonly path: string
  ) {}

  close(): Promise<void> {
    this.closeOperation ??= rm(this.path, { recursive: true, force: true });
    return this.closeOperation;
  }

  dispose(): void {
    void this.close().catch(() => undefined);
  }
}

async function removeOrphanedChannels(
  channelsPath: string,
  isProcessAlive: (processId: number) => boolean
): Promise<void> {
  const entries = await readdir(channelsPath, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) {
      return;
    }
    const channelPath = path.join(channelsPath, entry.name);
    const ownerProcessId = entry.name.startsWith(".creating-")
      ? stagingOwnerProcessId(entry.name)
      : await readOwnerProcessId(channelPath);
    if (ownerProcessId === undefined || !safelyIsProcessAlive(isProcessAlive, ownerProcessId)) {
      await rm(channelPath, { recursive: true, force: true });
    }
  }));
}

function stagingOwnerProcessId(name: string): number | undefined {
  const match = /^\.creating-(\d+)-/u.exec(name);
  return match === null ? undefined : positiveProcessId(match[1]);
}

async function readOwnerProcessId(channelPath: string): Promise<number | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(channelPath, ATTENTION_CHANNEL_OWNER_FILE), "utf8")
    ) as { processId?: unknown };
    return typeof parsed.processId === "number"
      ? positiveProcessId(parsed.processId)
      : undefined;
  } catch {
    return undefined;
  }
}

function positiveProcessId(value: number | string | undefined): number | undefined {
  const processId = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(processId) && processId > 0 ? processId : undefined;
}

function safelyIsProcessAlive(
  isProcessAlive: (processId: number) => boolean,
  processId: number
): boolean {
  try {
    return isProcessAlive(processId);
  } catch {
    return true;
  }
}

function defaultIsProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
