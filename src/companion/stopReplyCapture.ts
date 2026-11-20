import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerOptions, type ServerResponse } from "node:http";
import type { ManagedCaptureIdentity } from "./companionTypes";
import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import { boundedSavedReplyText, savedReplyLimits } from "../panel/savedReplyProtocol";

const loopback = "127.0.0.1";
const stopRoute = "/stop";
const maxBindings = 16;
const maxBodyBytes = 896 * 1024;
const ioTimeout = 2000;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const waiting = Object.freeze({ status: "waiting" } as const);

interface CapturedReply {
  readonly sequence: number;
  readonly text: string;
}

export interface StopReplyState {
  readonly status: "waiting" | "captured" | "gap";
  readonly reply?: CapturedReply;
}

export interface StopReplySource {
  stateFor(target: Readonly<ManagedCaptureIdentity>): StopReplyState | undefined;
  onDidChange(listener: (sessionId: string) => void): { dispose(): void };
}

type StopHttpServerFactory = (options: ServerOptions, listener: RequestListener) => Server;

interface Binding {
  readonly target: Readonly<ManagedCaptureIdentity>;
  readonly token: string;
  state: StopReplyState;
}

function matches(actual: Readonly<ManagedCaptureIdentity> | undefined, expected: Readonly<ManagedCaptureIdentity>): boolean {
  return actual?.sessionId === expected.sessionId &&
    actual.claudeSessionId === expected.claudeSessionId &&
    actual.generation === expected.generation;
}

function acknowledge(response: ServerResponse): void {
  response.statusCode = 204;
  response.setHeader("Connection", "close");
  response.end();
}

/** A passive loopback Stop hook and its activation-local, one-reply-per-launch store. */
export class StopReplyCapture implements StopReplySource {
  private readonly bySession = new Map<string, Binding>();
  private readonly byToken = new Map<string, Binding>();
  private readonly listeners = new Set<(sessionId: string) => void>();
  private server?: Server;
  private port?: number;
  private starting?: Promise<number | undefined>;
  private settleStart?: (port: number | undefined) => void;
  private disposed = false;
  private sequence = 0;

  constructor(
    private readonly currentTarget: (sessionId: string) => Readonly<ManagedCaptureIdentity> | undefined,
    private readonly createHttpServer: StopHttpServerFactory = createServer
  ) {}

  /** Start an ephemeral IPv4 listener once. Startup failure leaves ordinary launches available. */
  start(): Promise<number | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    if (this.starting !== undefined) return this.starting;
    const pending = new Promise<number | undefined>(resolve => { this.settleStart = resolve; });
    this.starting = pending;
    try {
      const server = this.createHttpServer({
        maxHeaderSize: 8 * 1024,
        headersTimeout: ioTimeout,
        requestTimeout: ioTimeout,
        connectionsCheckingInterval: 250,
        keepAliveTimeout: 1000
      }, (request, response) => this.receive(request, response));
      this.server = server;
      server.maxConnections = maxBindings;
      server.maxRequestsPerSocket = 1;
      server.timeout = ioTimeout;
      server.on("error", () => {
        if (this.server === server) this.stop();
      });
      server.once("listening", () => {
        if (this.server !== server) return;
        const address = server.address();
        if (address === null || typeof address === "string" || !Number.isInteger(address.port) ||
            address.port < 1 || address.port > 65535) {
          this.stop();
          return;
        }
        this.port = address.port;
        this.finishStart(this.port);
      });
      server.listen(0, loopback);
      server.unref();
    } catch {
      this.stop();
    }
    return pending;
  }

  /** Admit only the current, native-session-qualified launch. Repeated preparation reuses its token. */
  bind(target: Readonly<ManagedCaptureIdentity>): string | undefined {
    if (this.port === undefined || !isCanonicalUuid(target.claudeSessionId) ||
        !matches(this.currentTarget(target.sessionId), target)) return undefined;
    const previous = this.bySession.get(target.sessionId);
    if (previous !== undefined && matches(previous.target, target)) return previous.token;
    this.refresh();
    if (this.bySession.size >= maxBindings) return undefined;
    let token: string;
    try { token = randomBytes(32).toString("hex"); }
    catch { return undefined; }
    if (this.byToken.has(token)) return undefined;
    const binding = { target: Object.freeze({ ...target }), token, state: waiting };
    this.bySession.set(target.sessionId, binding);
    this.byToken.set(token, binding);
    this.changed(target.sessionId);
    return token;
  }

  /** Expose the current launch's last immutable receipt, including an observed capture gap. */
  stateFor(target: Readonly<ManagedCaptureIdentity>): StopReplyState | undefined {
    const binding = this.bySession.get(target.sessionId);
    return binding !== undefined && matches(binding.target, target) && this.owns(binding) ? binding.state : undefined;
  }

  /** Notifications identify only the affected managed session. */
  onDidChange(listener: (sessionId: string) => void): { dispose(): void } {
    if (!this.disposed) this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  /** Retire capabilities when their owning launch closes or changes. */
  refresh(): void {
    for (const binding of this.bySession.values()) {
      if (!this.owns(binding)) this.retire(binding);
    }
  }

  /** Invalidate all launch credentials and captured text before closing the listener. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.stop();
  }

  private finishStart(port: number | undefined): void {
    this.settleStart?.(port);
    this.settleStart = undefined;
  }

  private stop(): void {
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    this.finishStart(undefined);
    this.starting = Promise.resolve(undefined);
    for (const binding of this.bySession.values()) this.retire(binding);
    if (server !== undefined) {
      server.close();
      server.closeAllConnections();
    }
  }

  private owns(binding: Binding): boolean {
    const { target } = binding;
    return this.port !== undefined && this.bySession.get(target.sessionId) === binding &&
      matches(this.currentTarget(target.sessionId), target);
  }

  private retire(binding: Binding): void {
    this.byToken.delete(binding.token);
    this.bySession.delete(binding.target.sessionId);
    this.changed(binding.target.sessionId);
  }

  private changed(sessionId: string): void {
    for (const listener of [...this.listeners]) {
      try { listener(sessionId); }
      catch { /* Reply projection cannot affect the passive hook response. */ }
    }
  }

  private authorized(request: IncomingMessage): Binding | undefined {
    if (request.method !== "POST" || request.url !== stopRoute ||
        request.headers["content-encoding"] !== undefined ||
        !/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/i.test(request.headers["content-type"] ?? "")) {
      return undefined;
    }
    const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.authorization ?? "");
    const binding = match?.[1] === undefined ? undefined : this.byToken.get(match[1]);
    return binding !== undefined && this.owns(binding) ? binding : undefined;
  }

  private receive(request: IncomingMessage, response: ServerResponse): void {
    // Stream errors can arrive after a passive acknowledgement or after listener shutdown.
    request.on("error", () => undefined);
    response.on("error", () => undefined);
    const binding = this.authorized(request);
    const header = request.headers["content-length"];
    const declared = header === undefined ? undefined : /^\d{1,7}$/.test(header) ? Number(header) : Number.NaN;
    if (binding === undefined || (declared !== undefined && (!Number.isSafeInteger(declared) || declared > maxBodyBytes))) {
      acknowledge(response);
      return;
    }

    const capacity = declared ?? maxBodyBytes;
    let buffer: Buffer | undefined;
    let received = 0;
    let finished = false;
    const clear = (respond: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("close", onClose);
      response.off("close", onClose);
      buffer = undefined;
      if (respond) acknowledge(response);
    };
    const onClose = (): void => clear(false);
    const onData = (chunk: Buffer): void => {
      if (chunk.length > capacity - received) {
        clear(true);
        return;
      }
      if (chunk.length === 0) return;
      // At most one allocation per request, even if the input arrives in tiny chunks.
      buffer ??= Buffer.allocUnsafe(capacity);
      chunk.copy(buffer, received);
      received += chunk.length;
    };
    const onEnd = (): void => {
      const bytes = buffer?.subarray(0, received);
      clear(true);
      if (bytes !== undefined && (declared === undefined || received === declared)) {
        this.admit(binding, bytes);
      }
    };
    const deadline = setTimeout(() => clear(true), ioTimeout);
    deadline.unref();
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("close", onClose);
    response.once("close", onClose);
  }

  private admit(binding: Binding, bytes: Uint8Array): void {
    if (!this.owns(binding)) return;
    let event: unknown;
    try { event = JSON.parse(utf8.decode(bytes)); }
    catch { return; }
    if (event === null || typeof event !== "object" || Array.isArray(event)) return;
    const fields = event as Record<string, unknown>;
    if (fields.hook_event_name !== "Stop" || fields.session_id !== binding.target.claudeSessionId ||
        fields.agent_id !== undefined) return;
    const text = fields.last_assistant_message;
    const previous = binding.state.reply;
    if (!boundedSavedReplyText(text, savedReplyLimits.sourceBytes) || text.trim().length === 0) {
      if (binding.state.status === "gap") return;
      binding.state = Object.freeze({ status: "gap", ...(previous === undefined ? {} : { reply: previous }) });
    } else {
      if (binding.state.status === "captured" && previous?.text === text) return;
      const reply = previous?.text === text ? previous : Object.freeze({ sequence: ++this.sequence, text });
      binding.state = Object.freeze({ status: "captured", reply });
    }
    this.changed(binding.target.sessionId);
  }
}
