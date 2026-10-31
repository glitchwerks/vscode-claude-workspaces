import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type * as vscode from "vscode";

import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import { isDraftState } from "./composerStore";
import {
  MAX_DRAFT_UTF8_BYTES, SUBMIT_ACK_TIMEOUT_MS, CATALOG_TIMEOUT_MS,
  type ComposerCommand, type ComposerTarget, type DraftState, type SubmitRequest, type SubmitResult
} from "./composerTypes";

export const MAX_COMPOSER_FRAME_BYTES = 7_000_000;
export const NATIVE_QUEUE_KEYS = "\x18\r";

export interface BridgeBinding {
  readonly directory: string;
  readonly target: ComposerTarget;
  readonly token: string;
}
export interface BridgeRequest {
  readonly protocol: 1;
  readonly token: string;
  readonly requestId: string;
  readonly target: ComposerTarget;
  readonly operation: "submit" | "catalog";
  readonly draft?: DraftState;
}
export interface ComposerTransport {
  exchange(request: BridgeRequest, prepared: (frame: unknown) => Promise<void>, signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
}
export interface ComposerBrokerOptions {
  readonly storagePath: string;
  readonly platform: NodeJS.Platform;
  readonly remoteName?: string;
  readonly resolveTarget: (sessionId: string) => ComposerTarget | undefined;
  readonly writeQueue: (target: ComposerTarget, keys: string) => Promise<void>;
  readonly transportFactory?: (binding: BridgeBinding) => Promise<ComposerTransport>;
  readonly now?: () => number;
  readonly isProcessAlive?: (processId: number) => boolean;
  readonly schedule?: (callback: () => void, delayMs: number) => vscode.Disposable;
  readonly onFailure?: (code: "channel" | "protocol" | "transport" | "cleanup") => void;
}

type BrokerContext = Pick<ComposerBrokerOptions, "resolveTarget" | "now" | "schedule" | "onFailure">;
interface SessionBinding {
  readonly target: ComposerTarget;
  readonly token: string;
  readonly transport: ComposerTransport;
  readonly writeQueue: (keys: string) => Promise<void>;
  readonly results: Map<string, { fingerprint: string; result: Promise<SubmitResult> }>;
  active?: AbortController;
  pending: boolean;
}

/** Correlates native acceptance; a successful queue-key write is never acceptance. */
export class ComposerBroker {
  private readonly bindings = new Map<string, SessionBinding>();
  private readonly now: () => number;
  private readonly schedule: NonNullable<ComposerBrokerOptions["schedule"]>;

  constructor(private readonly context: BrokerContext) {
    this.now = context.now ?? (() => performance.now());
    this.schedule = context.schedule ?? ((callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return {dispose: () => clearTimeout(timer)};
    });
  }

  register(target: ComposerTarget, token: string, transport: ComposerTransport, writeQueue: (keys: string) => Promise<void>): void {
    if (!validComposerTarget(target) || !/^[a-f0-9]{64}$/.test(token)) {
      throw new TypeError("Invalid composer binding.");
    }
    const old = this.bindings.get(target.sessionId);
    old?.active?.abort();
    if (old !== undefined) { void old.transport.close().catch(() => this.failure("cleanup")); }
    this.bindings.set(target.sessionId, {
      target: Object.freeze({...target}), token, transport, writeQueue, results: new Map(), pending: false
    });
  }

  hasSession(target: ComposerTarget): boolean { return this.bindingFor(target) !== undefined; }

  submit(request: SubmitRequest): Promise<SubmitResult> {
    const submissionId = typeof request?.submissionId === "string" ? request.submissionId : "";
    if (!validSubmitRequest(request)) {
      return Promise.resolve({status: "rejected", submissionId, reason: "invalid"});
    }
    const binding = this.bindingFor(request.target);
    if (binding === undefined) {
      return Promise.resolve({status: "rejected", submissionId: request.submissionId, reason: "unavailable"});
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(request.draft)).digest("hex");
    const previous = binding.results.get(request.submissionId);
    if (previous !== undefined) {
      return previous.fingerprint === fingerprint ? previous.result
        : Promise.resolve({status: "rejected", submissionId: request.submissionId, reason: "invalid"});
    }
    if (binding.pending) {
      return Promise.resolve({status: "rejected", submissionId: request.submissionId, reason: "unavailable"});
    }
    const message: BridgeRequest = Object.freeze({
      protocol: 1, token: binding.token, requestId: request.submissionId,
      target: binding.target, operation: "submit",
      draft: Object.freeze({...request.draft, selection: Object.freeze({...request.draft.selection})})
    });
    binding.pending = true;
    const result = this.deliver(binding, message).finally(() => { binding.pending = false; });
    binding.results.set(request.submissionId, {fingerprint, result});
    return result;
  }

  async listCommands(target: ComposerTarget): Promise<readonly ComposerCommand[]> {
    const binding = this.bindingFor(target);
    if (binding === undefined || binding.pending) { return Object.freeze([]); }
    binding.pending = true;
    try {
      const request: BridgeRequest = {protocol: 1, token: binding.token, requestId: randomUUID(), target: binding.target, operation: "catalog"};
      const frame = await this.exchange(binding, request, CATALOG_TIMEOUT_MS, async () => { throw new Error("Unexpected preparation."); });
      if (!validIdentity(frame, request) || !keys(frame, ["protocol","token","requestId","target","kind","commands"])
        || frame.kind !== "catalog" || !Array.isArray(frame.commands) || frame.commands.length > 1000
        || !frame.commands.every(validCommand)) { throw new Error("Invalid catalog."); }
      return Object.freeze(frame.commands.map(command => Object.freeze({...command})));
    } catch { this.failure("protocol"); return Object.freeze([]); }
    finally { binding.pending = false; }
  }

  async disposeSession(target: ComposerTarget): Promise<void> {
    const binding = this.bindings.get(target.sessionId);
    if (binding === undefined || !sameTarget(binding.target, target)) { return; }
    this.bindings.delete(target.sessionId);
    binding.active?.abort();
    await binding.transport.close().catch(() => this.failure("cleanup"));
  }

  async close(): Promise<void> {
    await Promise.all([...this.bindings.values()].map(b => this.disposeSession(b.target)));
  }

  private async deliver(binding: SessionBinding, message: BridgeRequest): Promise<SubmitResult> {
    let dispatched = false;
    try {
      const frame = await this.exchange(binding, message, SUBMIT_ACK_TIMEOUT_MS, async prepared => {
        if (!validIdentity(prepared, message) || !keys(prepared, ["protocol","token","requestId","target","kind","queueBinding"])
          || prepared.kind !== "prepared" || prepared.queueBinding !== "ctrl+x enter") {
          throw new Error("Invalid native preparation.");
        }
        if (dispatched) { return; }
        // A partial/throwing PTY write is still possible delivery, never a safe retry.
        dispatched = true;
        await binding.writeQueue(NATIVE_QUEUE_KEYS);
      });
      if (!validIdentity(frame, message) || frame.kind !== "result") { throw new Error("Invalid native result."); }
      if (frame.status === "accepted" && keys(frame, ["protocol","token","requestId","target","kind","status"])) {
        return {status: "accepted", submissionId: message.requestId, revision: message.draft!.revision};
      }
      if (frame.status === "unconfirmed" && keys(frame, ["protocol","token","requestId","target","kind","status"])) {
        return {status: "unconfirmed", submissionId: message.requestId};
      }
      if (frame.status === "rejected" && keys(frame, ["protocol","token","requestId","target","kind","status","reason"])
        && (frame.reason === "unavailable" || frame.reason === "dialog" || frame.reason === "terminal-draft" || frame.reason === "invalid")) {
        return {status: "rejected", submissionId: message.requestId, reason: frame.reason};
      }
      throw new Error("Invalid native outcome.");
    } catch {
      this.failure("transport");
      return dispatched ? {status: "unconfirmed", submissionId: message.requestId}
        : {status: "rejected", submissionId: message.requestId, reason: "unavailable"};
    }
  }

  private async exchange(binding: SessionBinding, request: BridgeRequest, timeoutMs: number, prepared: (frame: unknown) => Promise<void>): Promise<unknown> {
    const controller = new AbortController();
    binding.active = controller;
    const started = this.now();
    const timer = this.schedule(() => controller.abort(), timeoutMs);
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Composer exchange ended."));
      controller.signal.addEventListener("abort", onAbort, {once: true});
    });
    const assertCurrent = () => {
      if (controller.signal.aborted || this.now() - started >= timeoutMs || this.bindingFor(binding.target) !== binding) {
        throw new Error("Composer exchange is unavailable.");
      }
    };
    try {
      assertCurrent();
      const result = await Promise.race([binding.transport.exchange(request, async frame => {
        assertCurrent();
        await prepared(frame);
      }, controller.signal), aborted]);
      assertCurrent();
      return result;
    } finally {
      timer.dispose();
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
      if (binding.active === controller) { binding.active = undefined; }
    }
  }

  private bindingFor(target: ComposerTarget): SessionBinding | undefined {
    if (!validComposerTarget(target)) { return undefined; }
    const binding = this.bindings.get(target.sessionId);
    const current = this.context.resolveTarget(target.sessionId);
    return binding !== undefined && current !== undefined && sameTarget(binding.target, target) && sameTarget(current, target)
      ? binding : undefined;
  }

  private failure(code: Parameters<NonNullable<ComposerBrokerOptions["onFailure"]>>[0]): void {
    try { this.context.onFailure?.(code); } catch { /* Diagnostics have no authority over delivery. */ }
  }
}

export function validComposerTarget(value: unknown): value is ComposerTarget {
  return record(value) && keys(value, ["sessionId","claudeSessionId","generation"])
    && typeof value.sessionId === "string" && value.sessionId.length > 0 && value.sessionId.length <= 256
    && isCanonicalUuid(value.claudeSessionId) && isCanonicalUuid(value.generation);
}

export function sameTarget(a: ComposerTarget, b: ComposerTarget): boolean {
  return a.sessionId === b.sessionId && a.claudeSessionId === b.claudeSessionId && a.generation === b.generation;
}

function validSubmitRequest(value: unknown): value is SubmitRequest {
  return record(value) && keys(value, ["target","submissionId","draft"]) && validComposerTarget(value.target)
    && isCanonicalUuid(value.submissionId) && isDraftState(value.draft)
    && keys(value.draft, ["revision","text","selection"]) && keys(value.draft.selection, ["anchor","head"])
    && Buffer.byteLength(value.draft.text, "utf8") <= MAX_DRAFT_UTF8_BYTES && value.draft.text.trim().length > 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
}

function validIdentity(value: unknown, request: BridgeRequest): value is Record<string, unknown> {
  if (!record(value) || Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_COMPOSER_FRAME_BYTES
    || value.protocol !== 1 || value.requestId !== request.requestId || typeof value.token !== "string"
    || !/^[a-f0-9]{64}$/.test(value.token) || !validComposerTarget(value.target) || !sameTarget(value.target, request.target)) { return false; }
  return timingSafeEqual(Buffer.from(value.token, "hex"), Buffer.from(request.token, "hex"));
}

function validCommand(value: unknown): value is ComposerCommand {
  return record(value) && Object.keys(value).every(key => ["invocation","description","source","plugin"].includes(key))
    && typeof value.invocation === "string" && /^\/\S{1,255}$/u.test(value.invocation)
    && typeof value.description === "string" && value.description.length <= 4096
    && ["builtin","plugin","user","mcp"].includes(value.source as string)
    && (value.plugin === undefined || (typeof value.plugin === "string" && value.plugin.length <= 256));
}
