import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { LaunchSpec } from "../launch/launchPlanner";
import { overlayComposerEnvironment } from "../launch/sessionLaunch";
import {
  ComposerBroker, MAX_COMPOSER_FRAME_BYTES, sameTarget, validComposerTarget,
  type BridgeBinding, type BridgeRequest, type ComposerBrokerOptions, type ComposerTransport
} from "./composerBroker";
import { COMPOSER_SEND_MIN_VERSION, type ClaudeComposerAdapter, type ComposerTarget } from "./composerTypes";

export interface ManagedClaudeComposerAdapter extends ClaudeComposerAdapter {
  prepareLaunch(spec: LaunchSpec, target: ComposerTarget, nativeVersion: string | undefined): Promise<LaunchSpec>;
  isAvailable(target: ComposerTarget): boolean;
  close(): Promise<void>;
}

/** Enforces the approved send-only floor; this never changes ordinary launch support. */
export function supportsComposerVersion(version: string | undefined): boolean {
  const match = version?.match(/^(\d+)\.(\d+)\.(\d+)(?: \(Claude Code\))?$/);
  if (match === undefined || match === null) { return false; }
  const actual = match.slice(1).map(Number);
  if (!actual.every(Number.isSafeInteger)) return false;
  const minimum = COMPOSER_SEND_MIN_VERSION.split(".").map(Number);
  for (let part=0;part<3;part++) {
    if (actual[part] !== minimum[part]) return actual[part]! > minimum[part]!;
  }
  return true;
}

/** Owns same-host file channels separately from the metadata-only attention channel. */
export async function createClaudeComposerAdapter(options: ComposerBrokerOptions): Promise<ManagedClaudeComposerAdapter> {
  const broker = new ComposerBroker(options);
  const storageRoot = path.resolve(options.storagePath);
  const bindings = new Map<string, BridgeBinding>();
  let hostDirectory: Promise<string> | undefined;
  let closed = false;
  const failure = (code: "channel" | "cleanup") => {
    try { options.onFailure?.(code); } catch { /* No diagnostic can change terminal behavior. */ }
  };
  const host = () => {
    hostDirectory ??= (async () => {
      await mkdir(storageRoot, {recursive: true});
      await pruneDeadComposerChannels(storageRoot, options.isProcessAlive ?? processAlive, () => failure("cleanup"));
      const directory = await mkdtemp(path.join(storageRoot, "composer-"));
      try {
        await writeFile(path.join(directory, ".owner.json"), JSON.stringify({schemaVersion:1,kind:"claude-workspaces-composer",processId:process.pid}), {flag: "wx", mode: 0o600});
        return directory;
      } catch (error) {
        await rm(directory,{recursive:true,force:true}).catch(() => failure("cleanup"));
        throw error;
      }
    })();
    const attempt=hostDirectory;
    void attempt.catch(()=>{if(hostDirectory===attempt)hostDirectory=undefined;});
    return hostDirectory;
  };
  const disposeSession = async (target: ComposerTarget) => {
    const binding = bindings.get(target.sessionId);
    if (binding === undefined || !sameTarget(binding.target, target)) { return; }
    bindings.delete(target.sessionId);
    await broker.disposeSession(target);
    await rm(binding.directory, {recursive: true, force: true}).catch(() => failure("cleanup"));
  };
  return {
    isAvailable: target => broker.hasSession(target),
    listCommands: target => broker.listCommands(target),
    submit: request => broker.submit(request),
    disposeSession,
    async prepareLaunch(spec, target, nativeVersion) {
      if (closed || options.platform !== "win32" || options.remoteName !== undefined || !supportsComposerVersion(nativeVersion)
        || !validComposerTarget(target)) { return spec; }
      let binding = bindings.get(target.sessionId);
      if (binding !== undefined && sameTarget(binding.target, target)) { return overlayComposerEnvironment(spec, binding); }
      if (binding !== undefined) { await disposeSession(binding.target); }
      let directory: string | undefined;
      let created = false;
      let transport: ComposerTransport | undefined;
      try {
        directory = path.join(await host(), target.generation);
        await mkdir(directory, {mode: 0o700});
        created = true;
        binding = Object.freeze({directory, target: Object.freeze({...target}), token: randomBytes(32).toString("hex")});
        transport = await (options.transportFactory?.(binding) ?? Promise.resolve(new FileComposerTransport(binding)));
        const current = options.resolveTarget(target.sessionId);
        if (closed || current === undefined || !sameTarget(current, target)) { throw new Error("Composer target changed."); }
        const ownedTarget = binding.target;
        broker.register(ownedTarget, binding.token, transport, keys => options.writeQueue(ownedTarget, keys));
        bindings.set(target.sessionId, binding);
        return overlayComposerEnvironment(spec, binding);
      } catch {
        await transport?.close().catch(() => failure("cleanup"));
        if (created && directory !== undefined) { await rm(directory, {recursive: true, force: true}).catch(() => failure("cleanup")); }
        failure("channel");
        return spec;
      }
    },
    async close() {
      closed = true;
      await broker.close();
      bindings.clear();
      if (hostDirectory !== undefined) {
        try { await rm(await hostDirectory, {recursive: true, force: true}); } catch { failure("cleanup"); }
      }
    }
  };
}

/** Prunes only our marked, dead-host channels; unknown data and links stay untouched. */
async function pruneDeadComposerChannels(storageRoot: string, alive: (pid: number) => boolean, failed: () => void): Promise<void> {
  for (const entry of await readdir(storageRoot,{withFileTypes:true})) {
    if (!entry.name.startsWith("composer-") || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory=path.resolve(storageRoot,entry.name);
    const relative=path.relative(storageRoot,directory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    try {
      const ownerFile=path.join(directory,".owner.json");
      const metadata=await lstat(ownerFile);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size>1024) continue;
      const owner: unknown=JSON.parse(await readFile(ownerFile,"utf8"));
      if (typeof owner!=="object" || owner===null || !("schemaVersion" in owner) || owner.schemaVersion!==1
        || !("kind" in owner) || owner.kind!=="claude-workspaces-composer" || !("processId" in owner)
        || typeof owner.processId!=="number" || !Number.isSafeInteger(owner.processId) || owner.processId<=0) continue;
      if (!alive(owner.processId)) await rm(directory,{recursive:true,force:true});
    } catch (error) {
      // Missing/foreign metadata is not authority to delete its containing directory.
      if ((error as NodeJS.ErrnoException).code!=="ENOENT" && !(error instanceof SyntaxError)) failed();
    }
  }
}

function processAlive(pid: number): boolean {
  try {process.kill(pid,0);return true;}
  catch (error) {return (error as NodeJS.ErrnoException).code!=="ESRCH";}
}

/** Serialized private request slots; no background request can erase a newer slot. */
export class FileComposerTransport implements ComposerTransport {
  private closed = false;
  private chain = Promise.resolve();
  constructor(private readonly binding: BridgeBinding) {}

  exchange(request: BridgeRequest, prepared: (frame: unknown) => Promise<void>, signal: AbortSignal): Promise<unknown> {
    const result = this.chain.then(() => this.perform(request, prepared, signal));
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  async close(): Promise<void> { this.closed = true; await this.chain; }

  private async perform(request: BridgeRequest, prepared: (frame: unknown) => Promise<void>, signal: AbortSignal): Promise<unknown> {
    const requestPath = path.join(this.binding.directory, "request.json");
    const responsePath = path.join(this.binding.directory, "response.json");
    const temporaryPath = path.join(this.binding.directory, `${request.requestId}.tmp`);
    let ownsSlot = false;
    let preparedSeen = false;
    try {
      if (signal.aborted || this.closed) throw new Error("Composer transport unavailable.");
      await writeFile(temporaryPath, JSON.stringify(request), {encoding:"utf8",flag:"wx",mode:0o600,signal});
      if (signal.aborted || this.closed) throw new Error("Composer transport unavailable.");
      await rm(responsePath, {force:true});
      await rename(temporaryPath, requestPath);
      ownsSlot = true;
      while (!signal.aborted && !this.closed) {
        let frame: unknown;
        try {
          const metadata = await stat(responsePath);
          if (!metadata.isFile() || metadata.size > MAX_COMPOSER_FRAME_BYTES) throw new Error("Invalid composer frame.");
          const text = await readFile(responsePath, {encoding:"utf8",signal});
          try { frame = JSON.parse(text) as unknown; }
          catch { await delay(25,undefined,{signal}); continue; }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await delay(25,undefined,{signal});
          continue;
        }
        if (typeof frame === "object" && frame !== null && "kind" in frame && frame.kind === "prepared") {
          if (!preparedSeen) { await prepared(frame); preparedSeen = true; }
          await delay(25,undefined,{signal});
        } else {
          return frame;
        }
      }
      throw new Error("Composer transport unavailable.");
    } finally {
      await rm(temporaryPath, {force:true}).catch(() => undefined);
      if (ownsSlot) await Promise.all([requestPath,responsePath].map(file => rm(file,{force:true}).catch(() => undefined)));
    }
  }
}
