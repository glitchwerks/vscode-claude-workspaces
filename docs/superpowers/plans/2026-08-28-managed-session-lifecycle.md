# Managed Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the extension-owned live session registry, lifecycle transitions, navigation, restart, and shutdown behavior required by issue #8.

**Architecture:** `SessionManager` owns private PTY records and publishes immutable session snapshots plus data/change events for the later panel. Launch and termination remain behind `ManagedPtyFactory`/`ManagedPty`; callers never receive a process handle. Immediate process-tree termination is the V1 close strategy, and sessions remain `closing` until the PTY exit event acknowledges termination (#8).

**Tech Stack:** TypeScript 6, VS Code event/disposable types, node-pty behind the existing managed adapter, Mocha with Node strict assertions (`package.json:L34-L43`, `package.json:L144-L161`).

**Spec:** `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L179-L214`

## Global Constraints

- The registry contains only PTYs spawned by this manager; external PTYs are never adopted or terminated (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L181-L214`, #8).
- Public snapshots use `rootId` and `launchedImportIds`, as approved in the issue #8 implementation discussion; both are immutable ID snapshots derived from `LaunchSpec` (`src/launch/launchPlanner.ts:L13-L22`).
- Per-root ordinals are monotonic for the manager lifetime, and the public session array remains in launch order (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L181-L200`).
- A natural exit removes the live session; no exited-session record, transcript, resume identifier, or process handle is persisted (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L201-L214`).
- Close, restart, and terminate-all invoke immediate owned process-tree termination. V1 does not inject `/exit` or Ctrl+C; delayed exit acknowledgement is logged (#8).
- Startup failure removes the provisional session and emits Retry/Open Logs notification data; an immediate non-zero exit does the same (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L241-L252`).
- `ManagedPty.onExit` is the termination acknowledgement boundary; `terminate()` only requests termination (`src/launch/managedPty.ts:L5-L17`).
- All behavior changes follow strict red-green-refactor TDD. Focused tests use `npm run test:unit -- --grep "SessionManager"`; the final gate uses the scripts at `package.json:L34-L43`.

---

### Task 1: Define immutable session and notification contracts

**Files:**
- Create: `src/sessions/sessionTypes.ts`

**Interfaces:**
- Consumes: `RootId` from `src/workspace/workspaceModel.ts`; PTYs remain absent from public types.
- Produces: `SessionId`, `SessionState`, `ManagedSessionSnapshot`, `SessionDataEvent`, `SessionNotification`, `SessionNotificationSink`, and `SessionLifecycleLogger`.

- [ ] **Step 1: Add the exact public contracts**

Create `src/sessions/sessionTypes.ts` with these shapes:

```ts
import type { LaunchSpec } from "../launch/launchPlanner";
import type { RootId } from "../workspace/workspaceModel";

export type SessionId = string;
export type SessionState = "starting" | "running" | "closing";

export interface ManagedSessionSnapshot {
  readonly id: SessionId;
  readonly rootId: RootId;
  readonly displayName: string;
  readonly ordinalWithinRoot: number;
  readonly state: SessionState;
  readonly launchedImportIds: readonly RootId[];
  readonly launchedAt: number;
}

export interface SessionDataEvent {
  readonly sessionId: SessionId;
  readonly data: string;
}

export type SessionNotification =
  | {
      readonly kind: "startup-failed";
      readonly spec: LaunchSpec;
      readonly error: unknown;
    }
  | {
      readonly kind: "immediate-nonzero-exit";
      readonly sessionId: SessionId;
      readonly spec: LaunchSpec;
      readonly exitCode: number;
      readonly signal?: number;
    };

export interface SessionNotificationSink {
  notify(notification: SessionNotification): void;
}

export interface SessionLifecycleLogger {
  startupError(error: unknown): void;
  processExit(sessionId: string, exitCode: number, signal?: number): void;
  shutdown(sessionIds: readonly string[]): void;
  terminationDelayed(sessionId: string): void;
  terminationError(sessionId: string, error: unknown): void;
}
```

These contracts expose IDs and immutable data only; the process-owning PTY is deliberately absent, satisfying the host/webview separation required by the approved architecture (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L216-L239`).

- [ ] **Step 2: Verify the contracts compile**

Run:

```bash
npm run check:types
```

Expected: PASS. This task introduces type contracts only; Task 2 owns the first behavioral RED→GREEN cycle.

- [ ] **Step 3: Commit the contracts**

```bash
git add src/sessions/sessionTypes.ts
git commit -m "feat: define managed session lifecycle contracts"
```

---

### Task 2: Implement launch, ordering, output, and exit handling

**Files:**
- Create: `src/sessions/sessionManager.ts`
- Create: `test/unit/sessionManager.test.ts`
- Modify: `test/support/fakeManagedPty.ts`
- Modify: `src/launch/nodePtyAdapter.ts`
- Modify: `test/unit/nodePtyAdapter.test.ts`

**Interfaces:**
- Consumes: `ManagedPtyFactory.spawn(spec)`, `ManagedPty.onData`, `ManagedPty.onExit`, and immutable `LaunchSpec` (`src/launch/managedPty.ts:L5-L17`, `src/launch/launchPlanner.ts:L13-L22`).
- Produces: `SessionManager.sessions`, `activeSessionId`, `onDidChangeSessions`, `onDidReceiveData`, and `launch(spec)`.

- [ ] **Step 1: Add focused failing tests for launch behavior**

Create `test/unit/sessionManager.test.ts` with literal `LaunchSpec` fixtures, deterministic ID/clock functions, logger and notification recorders, and controlled fake PTYs. Add separate tests that prove:

1. A launch publishes an immutable `starting` snapshot with `rootId`/`launchedImportIds` and no `pty`, then transitions it to `running`.
2. Two alpha sessions become `alpha 1` and `alpha 2`; one beta session becomes `beta 1`; all remain in launch order.
3. Every launch emits `starting`, then `running`, and makes the newest session active.
4. PTY data is forwarded as `{ sessionId, data }` without exposing the PTY.
5. Mutating the source `LaunchSpec.importedRoots` container after launch cannot change `launchedImportIds`.
6. A natural exit logs the exit, removes the session, and selects the session now occupying the removed launch-order index, or the new final session when the removed item was last. **Unverified product rule:** this deterministic neighbor selection fills a behavior not specified by #8.
7. A startup rejection removes the provisional session, logs `startupError`, and emits `{ kind: "startup-failed", spec, error }` so the later notification action has exact retry data (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L241-L252`).
8. A non-zero exit replayed before startup reaches `running` removes the provisional session and emits `immediate-nonzero-exit` with literal exit data.

Use hand-derived arrays for every expected sequence. The mutation test must replace or mutate only caller-owned containers; it must not mutate the frozen result to manufacture a pass.

- [ ] **Step 2: Run and verify RED**

```bash
npm run test:unit -- --grep "SessionManager"
```

Expected: failures identify missing launch transitions, ordering, output forwarding, and exit cleanup.

- [ ] **Step 3: Make PTY exit observable even when it occurs immediately**

Keep the public `ManagedPty.onExit` API, but change `NodeManagedPty` to subscribe to native exit in its constructor, cache the one terminal exit event, and replay it to a late listener. Add an adapter regression test in which the stub emits exit before the manager-style subscription is attached; the late subscriber must receive exactly one event. This closes the startup/exit race created by the current lazy subscription while retaining the established event contract (`src/launch/nodePtyAdapter.ts:L53-L55`, `src/launch/nodePtyAdapter.ts:L88-L95`, `src/launch/managedPty.ts:L5-L17`).

- [ ] **Step 4: Implement the minimal launch registry**

Create `SessionManager` with this constructor and public surface:

```ts
export interface SessionManagerDependencies {
  readonly ptyFactory: ManagedPtyFactory;
  readonly createId: () => SessionId;
  readonly now: () => number;
  readonly logger: SessionLifecycleLogger;
  readonly notifications: SessionNotificationSink;
  readonly terminationAckWarningMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => vscode.Disposable;
}

export class SessionManager implements vscode.Disposable {
  constructor(dependencies: SessionManagerDependencies);
  readonly onDidChangeSessions: vscode.Event<readonly ManagedSessionSnapshot[]>;
  readonly onDidReceiveData: vscode.Event<SessionDataEvent>;
  get sessions(): readonly ManagedSessionSnapshot[];
  get activeSessionId(): SessionId | undefined;
  launch(spec: LaunchSpec): Promise<ManagedSessionSnapshot | undefined>;
}
```

Use type-only VS Code imports and an internal listener-set event helper so plain Node unit tests do not require the VS Code runtime. Store PTY handles and their subscriptions only in private records. Snapshot `spec.root.id` and `spec.importedRoots.map(root => root.id)` before awaiting `spawn`, following the established asynchronous snapshot discipline (`src/launch/launchPlanner.ts:L93-L148`, PR #13).

Freeze every published snapshot object, its `launchedImportIds`, and every returned or emitted snapshot array.

- [ ] **Step 5: Implement exit and active-session rules**

On exit, dispose that record's data/exit subscriptions, log through `processExit`, remove only that record, and publish a new immutable session array. If the active session exits, activate the session now at the removed index, or the previous final session when the removed item was last. Emit the immediate-nonzero notification only when exit acknowledgement arrives before the record completed its `starting -> running` transition (#8).

- [ ] **Step 6: Run focused and adapter tests GREEN**

```bash
npm run test:unit -- --grep "SessionManager|NodePtyAdapter"
```

Expected: all launch, ordering, data, startup failure, immediate-exit, and adapter replay tests pass.

- [ ] **Step 7: Commit launch lifecycle behavior**

```bash
git add src/sessions/sessionManager.ts src/launch/nodePtyAdapter.ts test/support/fakeManagedPty.ts test/unit/sessionManager.test.ts test/unit/nodePtyAdapter.test.ts
git commit -m "feat: track live Claude session launches"
```

---

### Task 3: Implement close, restart, navigation, and terminate-all

**Files:**
- Modify: `src/sessions/sessionManager.ts`
- Modify: `test/unit/sessionManager.test.ts`

**Interfaces:**
- Consumes: private owned-session records established in Task 2.
- Produces: `close(id)`, `restartFresh(id, getCurrentSpec)`, `activatePrevious()`, `activateNext()`, `terminateAll()`, and `dispose()`.

- [ ] **Step 1: Add failing close tests**

Add independent tests proving:

1. `close(id)` changes only the target to `closing`, invokes only its PTY's `terminate()`, and retains the snapshot until `emitExit` acknowledges termination.
2. A configured termination rejection is logged and leaves the record visible as `closing` for retry/diagnosis.
3. If no exit acknowledgement arrives, the injected scheduler calls `terminationDelayed(id)` once; it does not send terminal input or terminate an unrelated PTY.
4. Concurrent `close(id)` calls share the same close operation and do not duplicate termination; after a termination rejection, a later call retries the owned adapter.
5. Calling `close` with an unknown ID is a no-op.

Use an injected manual scheduler. **Unverified product constant:** default `terminationAckWarningMs` is `2_000`; it only controls diagnostic logging and never authorizes removal or broader process discovery.

- [ ] **Step 2: Run close tests and verify RED**

```bash
npm run test:unit -- --grep "SessionManager.*close|closing|termination"
```

Expected: failures show that close state, ownership isolation, delayed acknowledgement, and idempotence are missing.

- [ ] **Step 3: Implement immediate owned termination**

Add:

```ts
close(id: SessionId): Promise<void>;
```

Set `closing` and emit before invoking `terminate()`. Start the acknowledgement-warning timer at close initiation and cancel it on the PTY exit event. Never remove a closing record merely because `terminate()` resolved; removal remains driven by `onExit` (#8). Never call `write()` during close.

- [ ] **Step 4: Add failing restart and navigation tests**

Add separate tests proving:

1. `restartFresh` awaits a newly requested `LaunchSpec`, then initiates close on the selected owned PTY and launches a new session with a new ID/ordinal and the new imports snapshot.
2. If current-spec planning rejects, the original session remains running, no replacement session is created, and the error propagates. **Unverified product rule:** preserving the original session avoids destructive restart behavior when a replacement cannot be planned.
3. Previous/next wrap around launch order; empty navigation is a no-op; a single session remains active.
4. Navigation may select `starting`, `running`, or `closing` sessions because all are still live registry entries.

Define:

```ts
restartFresh(
  id: SessionId,
  getCurrentSpec: () => Promise<LaunchSpec>
): Promise<ManagedSessionSnapshot | undefined>;
activatePrevious(): void;
activateNext(): void;
```

- [ ] **Step 5: Implement restart and navigation GREEN**

Restart must await `getCurrentSpec()`, then call `close(id)`, then call `launch(newSpec)`. It must never reuse the old PTY or old imports. Navigation reads the current launch-order snapshot and emits change only when the active ID changes. **Inference:** navigation includes `closing` entries because the approved registry treats them as live until exit acknowledgement (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L181-L214`).

- [ ] **Step 6: Add failing terminate-all ownership tests**

Add tests proving:

1. `terminateAll()` starts termination for every registered PTY exactly once and logs their IDs in launch order.
2. A second concurrent or later call is idempotent.
3. An unregistered `FakeManagedPty` is untouched.
4. One rejection does not prevent termination attempts for other owned PTYs; the rejection is logged.
5. `dispose()` begins the same idempotent termination path without leaking an unhandled rejection.

- [ ] **Step 7: Implement terminate-all GREEN**

```ts
terminateAll(): Promise<void>;
dispose(): void;
```

Snapshot registered IDs, log them once through `shutdown`, set all live records to `closing`, invoke each owned PTY's `terminate`, and await `Promise.allSettled`. Keep exit-driven removal unchanged. Cache the aggregate in-flight promise so concurrent calls cannot duplicate termination.

- [ ] **Step 8: Run all SessionManager tests**

```bash
npm run test:unit -- --grep "SessionManager"
```

Expected: every lifecycle, ownership, navigation, restart, and shutdown test passes.

- [ ] **Step 9: Commit lifecycle controls**

```bash
git add src/sessions/sessionManager.ts test/unit/sessionManager.test.ts
git commit -m "feat: manage owned Claude session lifecycles"
```

---

### Task 4: Extend structured diagnostics and verify the issue boundary

**Files:**
- Modify: `src/logging/outputLogger.ts`
- Modify: `test/unit/outputLogger.test.ts`
- Modify: `test/unit/sessionManager.test.ts`

**Interfaces:**
- Consumes: `SessionLifecycleLogger` from Task 1.
- Produces: structured `termination-delayed` and `termination-error` output events.

- [ ] **Step 1: Add failing logger tests**

Extend `test/unit/outputLogger.test.ts` with literal JSON assertions:

```ts
logger.terminationDelayed("session-1");
logger.terminationError("session-1", new Error("kill failed"));

assert.deepEqual(lines.slice(-2).map(JSON.parse), [
  { event: "termination-delayed", sessionId: "session-1" },
  { event: "termination-error", sessionId: "session-1", message: "kill failed" }
]);
```

- [ ] **Step 2: Run logger tests and verify RED**

```bash
npm run test:unit -- --grep "OutputLogger"
```

Expected: compilation fails because the two logger methods do not exist.

- [ ] **Step 3: Add the minimal structured logger methods**

Implement the exact event fields asserted above using the existing JSON-line writer and `errorMessage` helper (`src/logging/outputLogger.ts:L6-L52`). Confirm `OutputLogger` structurally satisfies `SessionLifecycleLogger` without importing session-manager implementation code.

- [ ] **Step 4: Run focused tests GREEN**

```bash
npm run test:unit -- --grep "OutputLogger|SessionManager|NodePtyAdapter|FakeManagedPty"
```

- [ ] **Step 5: Run the full verification gate**

```bash
npm run check:types
npm run lint
npm test
npm run build:production
```

Expected: types and lint pass; all unit and both extension-host configurations pass; the production bundle succeeds (`package.json:L34-L43`).

- [ ] **Step 6: Audit scope and artifact persistence**

Run:

```bash
git diff feature/claude-workspaces-v1...HEAD --stat
git diff --check feature/claude-workspaces-v1...HEAD
git ls-tree HEAD -- src/sessions/sessionTypes.ts src/sessions/sessionManager.ts test/unit/sessionManager.test.ts
```

Confirm the diff implements only #8, all referenced source/test artifacts are committed, and no PTY handle appears in a public snapshot.

- [ ] **Step 7: Commit diagnostics and verification adjustments**

```bash
git add src/logging/outputLogger.ts test/unit/outputLogger.test.ts test/unit/sessionManager.test.ts
git commit -m "feat: log managed session termination diagnostics"
```

- [ ] **Step 8: Prepare the child PR**

Before pushing, verify no open PR already uses `issue-8-session-lifecycle`. Push the branch, open a PR targeting `feature/claude-workspaces-v1`, and include `Closes #8` in the PR body. Record the full verification results and Codex attribution in the PR body.
