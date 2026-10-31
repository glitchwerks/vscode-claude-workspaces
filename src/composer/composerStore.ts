import type * as vscode from "vscode";

import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import {
  COMPOSER_STATE_KEY, MAX_DRAFT_UTF8_BYTES, RECENT_MAX_ITEMS, RECENT_MAX_UTF8_BYTES,
  RECOVERY_PAGE_LIMIT, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX,
  type ComposerLayout, type DraftState, type RecoveryCursor, type RecoveryPage,
  type SavedComposerSession, type SaveResult
} from "./composerTypes";

interface ComposerDocument {
  readonly schemaVersion: 1;
  readonly sessions: readonly unknown[];
  readonly favorites: readonly string[];
  readonly layout: ComposerLayout;
  readonly forgotten: readonly string[];
  readonly accepted: Readonly<Record<string, readonly string[]>>;
}

const defaultLayout = Object.freeze({ splitRatio: 1 / 3 });

/** Durable drafts and workspace preferences; only successful writes publish snapshots. */
export class ComposerStore implements vscode.Disposable {
  readonly onDidChangeRecovery: vscode.Event<void>;
  private sessions = new Map<string, SavedComposerSession>();
  private accepted = new Map<string, readonly string[]>();
  private readonly forgotten = new Set<string>();
  private quarantined: readonly unknown[] = [];
  private layout: ComposerLayout = defaultLayout;
  private currentFavorites: readonly string[] = Object.freeze([]);
  private readonly listeners = new Set<() => void>();
  private chain = Promise.resolve();
  private recoveryRevision = 0;
  private readOnly = false;

  constructor(private readonly state: Pick<vscode.Memento, "get" | "update">) {
    this.onDidChangeRecovery = (listener, thisArgs, disposables) => {
      const callback = () => listener.call(thisArgs);
      this.listeners.add(callback);
      const subscription = { dispose: () => { this.listeners.delete(callback); } };
      disposables?.push(subscription);
      return subscription;
    };
    this.load(state.get<unknown>(COMPOSER_STATE_KEY));
  }

  get favorites(): readonly string[] { return this.currentFavorites; }

  get(uuid: string): SavedComposerSession | undefined {
    return this.forgotten.has(uuid) ? undefined : this.sessions.get(uuid);
  }

  getLayout(): ComposerLayout { return this.layout; }

  setLayout(layout: ComposerLayout): Promise<void> {
    return this.enqueue(async () => {
      if (!validLayout(layout)) { throw new TypeError("Invalid composer layout."); }
      await this.persist(this.sessions, { layout: Object.freeze({ ...layout }) });
    });
  }

  /** Enumerates metadata without exporting draft/history text or filtering by transcript. */
  recoveryPage(cursor?: RecoveryCursor): RecoveryPage {
    if (cursor !== undefined && (cursor.revision !== this.recoveryRevision || !isCanonicalUuid(cursor.afterUuid))) {
      throw new Error("Stale or invalid composer recovery cursor.");
    }
    const ordered = [...this.sessions.values()].filter(s =>
      !this.forgotten.has(s.claudeSessionId) && s.draft.text.length > 0
    ).sort((a,b) => a.claudeSessionId.localeCompare(b.claudeSessionId));
    if (cursor !== undefined && !ordered.some(s => s.claudeSessionId === cursor.afterUuid)) {
      throw new Error("Stale composer recovery cursor.");
    }
    const candidates = ordered.filter(s => cursor === undefined || s.claudeSessionId > cursor.afterUuid);
    const rows = candidates.slice(0, RECOVERY_PAGE_LIMIT).map(s => Object.freeze({
      claudeSessionId: s.claudeSessionId, rootId: s.rootId, rootPath: s.rootPath,
      displayName: s.displayName, draftRevision: s.draft.revision
    }));
    return Object.freeze({
      revision: this.recoveryRevision, rows: Object.freeze(rows),
      ...(candidates.length > rows.length ? { nextCursor: Object.freeze({
        revision: this.recoveryRevision, afterUuid: rows[rows.length - 1]!.claudeSessionId
      }) } : {})
    });
  }

  saveDraft(session: SavedComposerSession): Promise<SaveResult> {
    // Snapshot before queuing: caller mutation must not change a pending write.
    let snapshot: SavedComposerSession;
    try { snapshot = normalizeSession(session); } catch { return Promise.resolve("failed"); }
    if (Buffer.byteLength(snapshot.draft.text, "utf8") > MAX_DRAFT_UTF8_BYTES) {
      return Promise.resolve("too-large");
    }
    return this.enqueue(async () => {
      const uuid = snapshot.claudeSessionId;
      if (this.forgotten.has(uuid)) { return "forgotten"; }
      const existing = this.sessions.get(uuid);
      if (existing !== undefined) {
        if (snapshot.draft.revision < existing.draft.revision) { return "stale"; }
        if (snapshot.draft.revision === existing.draft.revision) {
          return sameDraft(snapshot.draft, existing.draft) ? "saved" : "stale";
        }
      }
      const replacement = new Map(this.sessions);
      replacement.set(uuid, Object.freeze({ ...snapshot, recent: existing?.recent ?? Object.freeze([]) }));
      try {
        await this.persist(replacement, {}, true);
        return this.forgotten.has(uuid) ? "forgotten" : "saved";
      } catch { return "failed"; }
    });
  }

  /** Records only explicitly accepted composer submissions; draft mutation cannot forge history. */
  recordAccepted(uuid: string, requestId: string, text: string): Promise<void> {
    return this.enqueue(async () => {
      if (!isCanonicalUuid(requestId) || typeof text !== "string") {
        throw new TypeError("Invalid accepted composer request.");
      }
      const existing = this.get(uuid);
      if (existing === undefined || this.accepted.get(uuid)?.includes(requestId)) { return; }
      const accepted = new Map(this.accepted);
      accepted.set(uuid, Object.freeze([...(accepted.get(uuid) ?? []), requestId]));
      const recent = [...existing.recent];
      if (Buffer.byteLength(text, "utf8") <= RECENT_MAX_UTF8_BYTES) {
        recent.push(text);
        while (recent.length > RECENT_MAX_ITEMS || historyBytes(recent) > RECENT_MAX_UTF8_BYTES) {
          recent.shift();
        }
      }
      const replacement = new Map(this.sessions);
      replacement.set(uuid, Object.freeze({ ...existing, recent: Object.freeze(recent) }));
      await this.persist(replacement, { accepted });
    });
  }

  /** Tombstone immediately, then serialize deletion behind any earlier backing write. */
  forget(uuid: string): Promise<void> {
    if (!isCanonicalUuid(uuid)) { return Promise.reject(new TypeError("Invalid composer UUID.")); }
    this.forgotten.add(uuid);
    return this.enqueue(async () => {
      const sessions = new Map(this.sessions);
      sessions.delete(uuid);
      const accepted = new Map(this.accepted);
      accepted.delete(uuid);
      const quarantined = this.quarantined.filter(s => !record(s) || s.claudeSessionId !== uuid);
      await this.persist(sessions, { accepted, quarantined }, true);
    });
  }

  /** A single durable replacement retains the source if the destination write fails. */
  transferDraft(sourceUuid: string, target: SavedComposerSession): Promise<void> {
    let snapshot: SavedComposerSession;
    try { snapshot = normalizeSession(target); } catch (error) { return Promise.reject(error); }
    return this.enqueue(async () => {
      const source = this.get(sourceUuid);
      const targetUuid = snapshot.claudeSessionId;
      if (source === undefined || sourceUuid === targetUuid || this.forgotten.has(targetUuid) || this.sessions.has(targetUuid)) {
        throw new Error("Composer draft transfer is unavailable.");
      }
      const sessions = new Map(this.sessions);
      sessions.delete(sourceUuid);
      sessions.set(targetUuid, Object.freeze({ ...snapshot, draft: source.draft, recent: Object.freeze([]) }));
      // Commit the source tombstone together with the destination, never before it persists.
      const forgotten = new Set(this.forgotten);
      forgotten.add(sourceUuid);
      const accepted = new Map(this.accepted);
      accepted.delete(sourceUuid);
      await this.persist(sessions, {
        forgotten, accepted,
        stillValid: () => !this.forgotten.has(sourceUuid) && !this.forgotten.has(targetUuid)
      }, true);
      this.forgotten.add(sourceUuid);
    });
  }

  setFavorite(invocation: string, enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      if (!validInvocation(invocation)) { throw new TypeError("Invalid composer invocation."); }
      const favorites = this.currentFavorites.filter(f => f !== invocation);
      if (enabled) { favorites.push(invocation); }
      await this.persist(this.sessions, { favorites: Object.freeze(favorites) });
    });
  }

  flush(): Promise<void> { return this.chain; }
  dispose(): void { this.listeners.clear(); }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(sessions: Map<string, SavedComposerSession>, options: {
    layout?: ComposerLayout; favorites?: readonly string[]; accepted?: Map<string, readonly string[]>;
    forgotten?: Set<string>; quarantined?: readonly unknown[]; stillValid?: () => boolean;
  } = {}, recoveryChanged = false): Promise<void> {
    if (this.readOnly) { throw new Error("Unrecognized composer document; storage preserved."); }
    const layout = options.layout ?? this.layout;
    const favorites = options.favorites ?? this.currentFavorites;
    const accepted = options.accepted ?? this.accepted;
    const quarantined = options.quarantined ?? this.quarantined;
    const document: ComposerDocument = {
      schemaVersion: 1, sessions: [...sessions.values(), ...quarantined], layout, favorites,
      forgotten: [...new Set([...this.forgotten, ...(options.forgotten ?? [])])],
      accepted: Object.fromEntries(accepted)
    };
    await this.state.update(COMPOSER_STATE_KEY, document);
    if (options.stillValid !== undefined && !options.stillValid()) {
      // Forget can arrive during external I/O. Restore the prior document with its
      // new tombstones before publishing any destination copied from that source.
      await this.persist(this.sessions);
      throw new Error("Composer draft was forgotten during transfer.");
    }
    this.sessions = sessions;
    this.layout = layout;
    this.currentFavorites = favorites;
    this.accepted = accepted;
    this.quarantined = quarantined;
    if (recoveryChanged) {
      this.recoveryRevision++;
      for (const listener of [...this.listeners]) {
        try { listener(); } catch { /* Presentation cannot invalidate a persisted write. */ }
      }
    }
  }

  private load(value: unknown): void {
    if (value === undefined) { return; }
    if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.sessions)) {
      this.readOnly = true;
      return;
    }
    if (Array.isArray(value.forgotten)) {
      for (const uuid of value.forgotten) { if (isCanonicalUuid(uuid)) { this.forgotten.add(uuid); } }
    }
    const quarantined: unknown[] = [];
    for (const raw of value.sessions) {
      try {
        const snapshot = normalizeSession(raw);
        if (this.forgotten.has(snapshot.claudeSessionId)) { continue; }
        if (this.sessions.has(snapshot.claudeSessionId)) { throw new TypeError("Duplicate composer UUID."); }
        this.sessions.set(snapshot.claudeSessionId, snapshot);
      } catch { quarantined.push(raw); }
    }
    this.quarantined = quarantined;
    if (validLayout(value.layout)) { this.layout = Object.freeze({ ...value.layout }); }
    if (Array.isArray(value.favorites)) {
      this.currentFavorites = Object.freeze([...new Set(value.favorites.filter(validInvocation))]);
    }
    if (record(value.accepted)) {
      for (const [uuid, ids] of Object.entries(value.accepted)) {
        if (this.get(uuid) !== undefined && Array.isArray(ids) && ids.every(isCanonicalUuid)) {
          this.accepted.set(uuid, Object.freeze([...new Set(ids)]));
        }
      }
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validLayout(value: unknown): value is ComposerLayout {
  return record(value) && typeof value.splitRatio === "number" && Number.isFinite(value.splitRatio)
    && value.splitRatio >= SPLIT_RATIO_MIN && value.splitRatio <= SPLIT_RATIO_MAX;
}

function validInvocation(value: unknown): value is string {
  return typeof value === "string" && /^\/\S{1,255}$/u.test(value)
    && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function offset(value: unknown, text: string): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > text.length) { return false; }
  return value === 0 || value === text.length || !(/[\uD800-\uDBFF]/.test(text[value - 1]!) && /[\uDC00-\uDFFF]/.test(text[value]!));
}

/** Validates UTF-16 selection boundaries without truncating or rewriting draft text. */
export function isDraftState(value: unknown): value is DraftState {
  return record(value) && typeof value.revision === "number" && Number.isSafeInteger(value.revision)
    && value.revision >= 0 && typeof value.text === "string" && record(value.selection)
    && offset(value.selection.anchor, value.text) && offset(value.selection.head, value.text);
}

function normalizeSession(value: unknown): SavedComposerSession {
  if (!record(value) || !isCanonicalUuid(value.claudeSessionId) || !isDraftState(value.draft)
    || ![value.rootId, value.rootPath, value.displayName].every(v => typeof v === "string" && v.length > 0)
    || !Array.isArray(value.recent) || !value.recent.every(v => typeof v === "string")
    || value.recent.length > RECENT_MAX_ITEMS || historyBytes(value.recent) > RECENT_MAX_UTF8_BYTES) {
    throw new TypeError("Invalid composer session.");
  }
  return Object.freeze({
    claudeSessionId: value.claudeSessionId, rootId: value.rootId as string,
    rootPath: value.rootPath as string, displayName: value.displayName as string,
    draft: Object.freeze({ revision: value.draft.revision, text: value.draft.text,
      selection: Object.freeze({ ...value.draft.selection }) }),
    recent: Object.freeze([...value.recent])
  });
}

function sameDraft(a: DraftState, b: DraftState): boolean {
  return a.text === b.text && a.selection.anchor === b.selection.anchor && a.selection.head === b.selection.head;
}

function historyBytes(recent: readonly string[]): number {
  return recent.reduce((bytes, text) => bytes + Buffer.byteLength(text, "utf8"), 0);
}
