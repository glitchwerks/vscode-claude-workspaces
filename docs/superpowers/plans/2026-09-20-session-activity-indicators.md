# Session Activity Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible per-session working rings and green unread-response dots that clear when viewed while preserving the session's waiting activity.

**Architecture:** Extend each immutable live-session snapshot with an orthogonal unread boolean and publish activity plus unread changes atomically. Structured Claude hook events remain the source of activity, while the extension injects the current visible-view predicate; the panel protocol transports the resulting snapshot and the renderer presents independent working, unread, lifecycle, and selected-tab states.

**Tech Stack:** TypeScript, VS Code extension/webview APIs, Node.js, Mocha, JSDOM, CSS using VS Code theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-20-session-activity-indicators.md`

## Global Constraints

- Keep `SessionState` (`starting | running | closing`) separate from `SessionActivity` (`idle | working | waiting`); unread response is a required orthogonal boolean (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L19-L23`).
- Apply activity and unread changes in one immutable snapshot publication (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L25-L41`).
- A response is viewed only when its session is active and the Claude Workspaces view is visible (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L43-L52`).
- Render markers only for running sessions, retain existing selected/starting/closing styling, and expose status in the tab's accessible name (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L54-L64`).
- #113 counts every running waiting session regardless of unread status (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L66-L68`, #113).
- Do not persist unread state, add markers to saved sessions, alter #51 notification policy, implement #113's badge, or infer state from terminal text (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L109-L115`).
- Follow TDD for every behavior change and commit each completed task independently.

---

### Task 1: Extend the live-session attention contract

**Files:**
- Modify: `src/sessions/sessionTypes.ts:5-20`
- Modify: `src/sessions/sessionManager.ts:12-24,91-113,331-369,454-466`
- Modify: `src/panel/protocol.ts:259-288`
- Test: `test/unit/sessionManager.test.ts:1548-1702`
- Test: `test/unit/protocol.test.ts:7-21,444-472`
- Update fixtures: every test fixture constructing `ManagedSessionSnapshot`

**Interfaces:**
- Produces: `SessionAttentionState` with exact fields `activity: SessionActivity` and `hasUnreadResponse: boolean`.
- Produces: `SessionManager.setAttention(id: SessionId, attention: SessionAttentionState): void`.
- Produces: `SessionManager.markViewed(id: SessionId): void`.
- Produces: required `ManagedSessionSnapshot.hasUnreadResponse: boolean`.
- Consumes later: Task 2 calls `setAttention`; Task 3 calls `markViewed`; Task 4 reads both snapshot fields.

**Sources:** The current snapshot has only lifecycle and activity, `setActivity` publishes activity-only changes, and the protocol requires exact keys (`src/sessions/sessionTypes.ts:L5-L20`, `src/sessions/sessionManager.ts:L361-L369`, `src/panel/protocol.ts:L259-L288`).

- [ ] **Step 1: Add failing protocol tests for the required boolean**

Add `hasUnreadResponse: false` to the canonical `session` fixture, then add these cases:

```ts
it("accepts both unread-response values on an otherwise valid session snapshot", () => {
  for (const hasUnreadResponse of [false, true]) {
    const candidate = { ...session, hasUnreadResponse };
    assert.deepEqual(decodeHostMessage({ type: "sessionUpdated", session: candidate }), {
      ok: true,
      value: { type: "sessionUpdated", session: candidate }
    });
  }
});

it("rejects missing and non-boolean unread-response state", () => {
  const missing = { ...session } as Record<string, unknown>;
  delete missing.hasUnreadResponse;
  assert.equal(decodeHostMessage({ type: "sessionUpdated", session: missing }).ok, false);
  assert.equal(decodeHostMessage({
    type: "sessionUpdated",
    session: { ...session, hasUnreadResponse: "yes" }
  }).ok, false);
});
```

- [ ] **Step 2: Add failing manager tests for atomic transitions and clearing**

Use the existing `createManager`, `alphaSpec`, and `FakeManagedPtyFactory` helpers:

```ts
it("publishes activity and unread response in one immutable transition", async () => {
  const manager = createManager(
    new FakeManagedPtyFactory(),
    new RecordingLogger(),
    new RecordingNotifications()
  );
  await manager.launch(alphaSpec);
  const published: ManagedSessionSnapshot[][] = [];
  manager.onDidChangeSessions((sessions) => published.push([...sessions]));

  manager.setAttention("session-1", { activity: "waiting", hasUnreadResponse: true });

  assert.deepEqual(manager.sessions.map(({ activity, hasUnreadResponse }) => ({
    activity,
    hasUnreadResponse
  })), [{ activity: "waiting", hasUnreadResponse: true }]);
  assert.equal(published.length, 1);
  assert.deepEqual(published[0]?.map(({ activity, hasUnreadResponse }) => ({
    activity,
    hasUnreadResponse
  })), [{ activity: "waiting", hasUnreadResponse: true }]);
});

it("clears only unread response when a live session is viewed", async () => {
  const manager = createManager(
    new FakeManagedPtyFactory(),
    new RecordingLogger(),
    new RecordingNotifications()
  );
  await manager.launch(alphaSpec);
  manager.setAttention("session-1", { activity: "waiting", hasUnreadResponse: true });

  manager.markViewed("session-1");

  assert.equal(manager.sessions[0]?.activity, "waiting");
  assert.equal(manager.sessions[0]?.hasUnreadResponse, false);
});
```

Also assert: new sessions default false; repeated identical transitions publish nothing; unknown IDs do nothing; entering closing clears unread; removal leaves no snapshot.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/protocol.test.js" "out/test/unit/sessionManager.test.js"
```

Expected: TypeScript errors for missing `hasUnreadResponse`, missing `setAttention`, and missing `markViewed`, or equivalent assertion failures once fixtures compile.

- [ ] **Step 4: Implement the snapshot and manager contract**

In `sessionTypes.ts` add:

```ts
export interface SessionAttentionState {
  readonly activity: SessionActivity;
  readonly hasUnreadResponse: boolean;
}

export interface ManagedSessionSnapshot {
  readonly id: SessionId;
  readonly claudeSessionId: string | null;
  readonly rootId: RootId;
  readonly displayName: string;
  readonly ordinalWithinRoot: number;
  readonly state: SessionState;
  readonly activity: SessionActivity;
  readonly hasUnreadResponse: boolean;
  readonly launchedImportIds: readonly RootId[];
  readonly launchedAddDirPaths: readonly string[];
  readonly launchedRootLabel: string;
  readonly launchedRootPath: string;
  readonly launchedAt: number;
}
```

Initialize launches with `hasUnreadResponse: false`. Replace `setActivity` with:

```ts
setAttention(id: SessionId, attention: SessionAttentionState): void {
  const record = this.records.find((candidate) => candidate.id === id);
  if (
    record === undefined ||
    (record.snapshot.activity === attention.activity &&
      record.snapshot.hasUnreadResponse === attention.hasUnreadResponse)
  ) {
    return;
  }
  record.snapshot = createSnapshot({ ...record.snapshot, ...attention });
  this.publishSessions();
}

markViewed(id: SessionId): void {
  const record = this.records.find((candidate) => candidate.id === id);
  if (record === undefined || !record.snapshot.hasUnreadResponse) {
    return;
  }
  record.snapshot = createSnapshot({ ...record.snapshot, hasUnreadResponse: false });
  this.publishSessions();
}
```

When `transitionToClosing` creates a closing snapshot, set `hasUnreadResponse: false`. Add `hasUnreadResponse` to the protocol exact-key list and require `typeof value.hasUnreadResponse === "boolean"`.

- [ ] **Step 5: Update all complete snapshot fixtures**

Add `hasUnreadResponse: false` to every hand-built `ManagedSessionSnapshot` in unit and integration tests. Use the compiler errors as the exhaustive inventory; do not make the field optional or default it inside the protocol decoder.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the Step 3 commands. Expected: all protocol and session-manager tests pass.

- [ ] **Step 7: Commit the contract**

```text
git add src/sessions/sessionTypes.ts src/sessions/sessionManager.ts src/panel/protocol.ts test
git commit -m "feat(sessions): add unread response state"
```

---

### Task 2: Drive atomic attention state from structured hook events

**Files:**
- Modify: `src/attention/attentionSignalWatcher.ts:5-103,262-288`
- Test: `test/unit/attentionSignalWatcher.test.ts:12-175,230-345`

**Interfaces:**
- Consumes: `SessionAttentionState` and `AttentionSessionRegistry.setAttention(id, attention)` from Task 1.
- Extends: `createAttentionSignalProcessor(manager, onStageTransition?, isSessionViewed?)` where `isSessionViewed(sessionId)` defaults to `false`.
- Produces: exact structured transitions listed in spec D2.

**Sources:** The watcher already validates both managed and Claude identities and owns waiting-stage deduplication before calling the manager (`src/attention/attentionSignalWatcher.ts:L41-L103`). The approved event mapping is fixed in the spec (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L25-L41`).

- [ ] **Step 1: Rewrite the fake manager around atomic attention changes**

Extend `TestSession` with `hasUnreadResponse: boolean`, replace `activityChanges` with:

```ts
readonly attentionChanges: Array<{
  readonly id: string;
  readonly activity: TestSession["activity"];
  readonly hasUnreadResponse: boolean;
}> = [];

setAttention(
  id: string,
  attention: Pick<TestSession, "activity" | "hasUnreadResponse">
): void {
  const current = this.sessions.find((session) => session.id === id);
  if (
    current === undefined ||
    (current.activity === attention.activity &&
      current.hasUnreadResponse === attention.hasUnreadResponse)
  ) {
    return;
  }
  this.attentionChanges.push({ id, ...attention });
  this.sessions = this.sessions.map((candidate) =>
    candidate.id === id ? { ...candidate, ...attention } : candidate
  );
  this.fire();
}
```

Make `session()` return `activity: "idle", hasUnreadResponse: false`.

- [ ] **Step 2: Add failing viewed/unviewed and concurrent transition tests**

```ts
it("marks a stopped unviewed response unread and leaves a viewed response waiting", () => {
  const manager = new FakeSessionManager(session());
  let viewed = false;
  const processor = createAttentionSignalProcessor(manager, undefined, () => viewed);

  processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
  processor.process(signal({ hookEventName: "Stop", notificationType: null }));
  viewed = true;
  processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
  processor.process(signal({ hookEventName: "Stop", notificationType: null }));

  assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
    activity,
    hasUnreadResponse
  })), [
    { activity: "working", hasUnreadResponse: false },
    { activity: "waiting", hasUnreadResponse: true },
    { activity: "working", hasUnreadResponse: false },
    { activity: "waiting", hasUnreadResponse: false }
  ]);
  processor.dispose();
});
```

Add a two-session test where one `Stop` is viewed and the other is not, then assert only the unviewed session has `hasUnreadResponse: true`.

- [ ] **Step 3: Run the watcher tests and confirm RED**

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/attentionSignalWatcher.test.js"
```

Expected: the registry still requires `setActivity`, `Stop` still maps to idle, and the processor does not accept the viewed predicate.

- [ ] **Step 4: Implement the atomic mapping**

Change `AttentionSessionRegistry` to require `setAttention`. Make the internal transition type carry all attention fields:

```ts
type AttentionTransition = SessionAttentionState & Readonly<{
  stage?: "waiting" | "user-prompt" | "session-end";
}>;
```

Store the optional predicate on `OwnedAttentionSignalProcessor`, call it only after identity validation, and map signals as follows:

```ts
function attentionTransition(signal: AttentionSignal, viewed: boolean): AttentionTransition | undefined {
  if (signal.hookEventName === "UserPromptSubmit") {
    return { activity: "working", hasUnreadResponse: false, stage: "user-prompt" };
  }
  if (signal.hookEventName === "Stop") {
    return { activity: "waiting", hasUnreadResponse: !viewed };
  }
  if (signal.hookEventName === "SessionEnd") {
    return { activity: "idle", hasUnreadResponse: false, stage: "session-end" };
  }
  if (signal.hookEventName !== "Notification") {
    return undefined;
  }
  if (["permission_prompt", "agent_needs_input", "elicitation_dialog"].includes(
    signal.notificationType ?? ""
  )) {
    return { activity: "waiting", hasUnreadResponse: false, stage: "waiting" };
  }
  return signal.notificationType === "idle_prompt"
    ? { activity: "idle", hasUnreadResponse: false }
    : undefined;
}
```

After preserving the existing waiting-stage open/close logic, call:

```ts
this.manager.setAttention(signal.managedSessionId, {
  activity: transition.activity,
  hasUnreadResponse: transition.hasUnreadResponse
});
```

- [ ] **Step 5: Update all existing watcher assertions**

Replace activity-only arrays with exact `{ activity, hasUnreadResponse }` arrays. Keep every waiting-stage transition assertion unchanged so unread work cannot regress #51 notification deduplication.

- [ ] **Step 6: Run the watcher and manager suites**

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/attentionSignalWatcher.test.js" "out/test/unit/sessionManager.test.js"
```

Expected: all tests pass.

- [ ] **Step 7: Commit structured transition handling**

```text
git add src/attention/attentionSignalWatcher.ts test/unit/attentionSignalWatcher.test.ts
git commit -m "feat(attention): track unread responses"
```

---

### Task 3: Connect view visibility to read-state clearing

**Files:**
- Modify: `src/sessions/sessionManager.ts:13-24,331-369`
- Modify: `src/panel/sessionPanelProvider.ts:54-134,402-428,532-550`
- Modify: `src/extension.ts:210-287,362-382,500-534`
- Test: `test/unit/sessionManager.test.ts`
- Test: `test/integration/activation.test.ts:1880-2110`

**Interfaces:**
- Adds optional `SessionManagerDependencies.isSessionViewVisible(): boolean`.
- Adds optional `SessionPanelProviderDependencies.onDidChangeVisibility(visible: boolean): void`.
- Consumes: `SessionManager.markViewed` and the Task 2 `isSessionViewed` predicate.
- Produces: one extension-owned `sessionViewVisible` value shared by activation clearing and hook completion.

**Sources:** The manager owns active identity (`src/sessions/sessionManager.ts:L67-L74`), the provider already receives visibility changes (`src/panel/sessionPanelProvider.ts:L99-L120`), and native notification selection reveals the view before activation (`src/attention/attentionNotificationSelection.ts:L15-L32`). Spec D3 defines the exact viewed rule (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L43-L52`).

- [ ] **Step 1: Add failing manager activation tests**

Extend the existing `createManager` helper's dependency `Pick` with `"isSessionViewVisible"`. Build managers with a mutable visibility predicate. After marking a non-active session unread, assert hidden activation preserves unread and visible activation clears it:

```ts
let visible = false;
const manager = createManager(
  new FakeManagedPtyFactory(),
  new RecordingLogger(),
  new RecordingNotifications(),
  ["session-1", "session-2", "session-3", "session-4"],
  { isSessionViewVisible: () => visible }
);
await manager.launch(alphaSpec);
await manager.launch(betaSpec);
manager.setAttention("session-1", { activity: "waiting", hasUnreadResponse: true });

manager.activate("session-1");
assert.equal(manager.sessions[0]?.hasUnreadResponse, true);

manager.activate("session-2");
visible = true;
manager.activate("session-1");
assert.equal(manager.sessions[0]?.hasUnreadResponse, false);
```

Also call `activate` for an already-active visible unread session and require the unread bit to clear.

- [ ] **Step 2: Add failing provider visibility tests**

Extend `resolvedPanelView` with a mutable `visible` property and `onDidChangeVisibility` emitter. Construct a provider with `onDidChangeVisibility: (visible) => visibility.push(visible)`, then assert:

```ts
panel.resolveWebviewView(harness.view);
assert.deepEqual(visibility, [false]);
harness.setVisible(true);
assert.deepEqual(visibility, [false, true]);
harness.disposed.fire();
assert.deepEqual(visibility, [false, true, false]);
```

Add a session-change assertion proving updates publish when only `activity` or `hasUnreadResponse` changes; this catches the current `sameSession` comparison that omits activity (`src/panel/sessionPanelProvider.ts:L532-L550`).

- [ ] **Step 3: Run focused tests and confirm RED**

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/sessionManager.test.js" "out/test/integration/activation.test.js"
```

Expected: missing dependency callbacks and unread-only updates being suppressed.

- [ ] **Step 4: Implement provider visibility reporting**

Add a private `visible: boolean | undefined` field and this helper so the initial resolved state is reported once:

```ts
private reportVisibility(visible: boolean): void {
  if (visible === this.visible) {
    return;
  }
  this.visible = visible;
  this.dependencies.onDidChangeVisibility?.(visible);
}
```

Call it with the resolved view's initial visibility, from `onDidChangeVisibility`, and with `false` when the current view is disposed, replaced, or the provider is disposed. Update `sameSession` to compare both `activity` and `hasUnreadResponse` before launch metadata.

- [ ] **Step 5: Make activation clear unread only in a visible view**

Add `isSessionViewVisible` to manager dependencies. Update `activate` so selection and read clearing are one publication:

```ts
activate(id: SessionId): void {
  const record = this.records.find((candidate) => candidate.id === id);
  if (record === undefined) {
    return;
  }
  const selectionChanged = this.currentActiveSessionId !== id;
  const clearsUnread = record.snapshot.hasUnreadResponse &&
    (this.dependencies.isSessionViewVisible?.() ?? false);
  if (!selectionChanged && !clearsUnread) {
    return;
  }
  this.currentActiveSessionId = id;
  if (clearsUnread) {
    record.snapshot = createSnapshot({ ...record.snapshot, hasUnreadResponse: false });
  }
  this.publishSessions();
}
```

Because previous/next and notification selection already call manager activation, they inherit the same rule without parallel clearing code (`src/launch/launchController.ts:L43-L50`, `src/attention/attentionNotificationSelection.ts:L15-L32`).

- [ ] **Step 6: Wire one extension-owned visibility value**

Declare `let sessionViewVisible = false` before constructing the manager. Inject `isSessionViewVisible: () => sessionViewVisible`. Pass the Task 2 viewed predicate into the processor:

```ts
const processor = createAttentionSignalProcessor(
  manager,
  coordinateNotification,
  (sessionId) => sessionViewVisible && manager.activeSessionId === sessionId
);
```

Extend `createSessionPanelProvider` with an `onDidChangeVisibility` callback. Its production callback must set `sessionViewVisible` and, when becoming visible, call `manager.markViewed(manager.activeSessionId)` if an active session exists.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run the Step 3 commands. Expected: all tests pass, including visibility disposal and unread-only publication.

- [ ] **Step 8: Commit view/read coordination**

```text
git add src/sessions/sessionManager.ts src/panel/sessionPanelProvider.ts src/extension.ts test/unit/sessionManager.test.ts test/integration/activation.test.ts
git commit -m "feat(sessions): clear unread responses when viewed"
```

---

### Task 4: Render accessible working and unread markers

**Files:**
- Modify: `src/panel/webview/renderer.ts:676-695`
- Modify: `src/panel/webview/styles.css:279-383`
- Test: `test/unit/webviewRenderer.test.ts`
- Modify: `README.md:70-105`
- Test: `test/unit/packageAssets.test.ts`

**Interfaces:**
- Consumes: `ManagedSessionSnapshot.activity` and `.hasUnreadResponse` from Task 1.
- Produces: `.session-tab-working-marker` and `.session-tab-unread-marker` decorative elements.
- Produces: accessible tab name and tooltip text containing `working` or `unread response` when applicable.

**Sources:** Existing rendering replaces all tabs from snapshot state and currently exposes only display name plus lifecycle title (`src/panel/webview/renderer.ts:L255-L257`, `src/panel/webview/renderer.ts:L676-L695`). Spec D4 fixes the presentation semantics (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L54-L64`).

- [ ] **Step 1: Add failing renderer tests for independent states**

Update `panelSession` to default `hasUnreadResponse: false`. Add one test that hydrates four sessions:

```ts
const idle = panelSession("idle", "Idle");
const working = { ...panelSession("working", "Working"), activity: "working" as const };
const unread = {
  ...panelSession("unread", "Unread"),
  activity: "waiting" as const,
  hasUnreadResponse: true
};
const closing = {
  ...panelSession("closing", "Closing"),
  state: "closing" as const,
  activity: "working" as const,
  hasUnreadResponse: true
};
harness.renderer.handleMessage({
  type: "hydrate",
  sessions: [idle, working, unread, closing],
  resumableSessions: [],
  activeSessionId: idle.id,
  terminalFont
});
```

Assert: only Working has `.session-tab-working-marker`; only Unread has `.session-tab-unread-marker`; Closing has neither; Idle remains selected; Working and Unread remain unselected. Assert exact accessible names `Working — working` and `Unread — waiting — unread response`, plus matching tooltip content.

- [ ] **Step 2: Add a failing transition test**

Send `sessionUpdated` for Working to `{ activity: "waiting", hasUnreadResponse: true }`, then send another update with `hasUnreadResponse: false`. Assert the ring is replaced by the green dot and then the dot disappears without changing `aria-selected`.

- [ ] **Step 3: Run renderer tests and confirm RED**

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/webviewRenderer.test.js"
```

Expected: marker elements and accessible status text are absent.

- [ ] **Step 4: Build semantic tab contents**

In `createTab`, compute `showWorking` and `showUnread` only for running sessions. Create a text label span plus conditional decorative marker spans:

```ts
const showWorking = session.state === "running" && session.activity === "working";
const showUnread = session.state === "running" && session.hasUnreadResponse;
const label = dependencies.document.createElement("span");
label.className = "session-tab-label";
label.textContent = session.displayName;
if (showWorking) {
  const marker = dependencies.document.createElement("span");
  marker.className = "session-tab-working-marker";
  marker.setAttribute("aria-hidden", "true");
  tab.append(marker);
}
if (showUnread) {
  const marker = dependencies.document.createElement("span");
  marker.className = "session-tab-unread-marker";
  marker.setAttribute("aria-hidden", "true");
  tab.append(marker);
}
tab.append(label);
```

Build one status-parts array for both `aria-label` and `title`; include lifecycle when not running, otherwise include `working`, `waiting`, and `unread response` as applicable. Do not announce marker glyphs.

- [ ] **Step 5: Add theme-aware CSS**

Make `.session-tab` an inline flex row with a small gap. Draw the working ring with a 2px circular border using `--vscode-progressBar-background` and a focus-border fallback. Draw the 8px unread dot with `--vscode-charts-green`, then `--vscode-testing-iconPassed`, then `--vscode-terminal-ansiGreen` fallbacks. Keep both fixed-size and prevent the label from overflowing:

```css
.session-tab-label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-tab-working-marker {
  inline-size: 10px;
  block-size: 10px;
  flex: 0 0 10px;
  border: 2px solid color-mix(in srgb,
    var(--vscode-progressBar-background, var(--vscode-focusBorder)) 35%, transparent);
  border-block-start-color: var(--vscode-progressBar-background, var(--vscode-focusBorder));
  border-inline-end-color: var(--vscode-progressBar-background, var(--vscode-focusBorder));
  border-radius: 50%;
}

.session-tab-unread-marker {
  inline-size: 8px;
  block-size: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--vscode-charts-green,
    var(--vscode-testing-iconPassed, var(--vscode-terminal-ansiGreen)));
}
```

Do not animate either marker; shape plus accessible text carries meaning without motion or color alone.

- [ ] **Step 6: Document the indicator semantics**

In the README waiting-session section, add a concise paragraph stating: blue ring means Claude is working; green dot means a completed response has not been viewed; selecting that live tab in the visible panel clears the dot but leaves the session waiting; selected, starting, and closing styles remain independent. Add a package-assets assertion for the exact setting-neutral phrases `working indicator` and `unread response` so published documentation cannot silently drop them.

- [ ] **Step 7: Run renderer and documentation tests**

```text
npm run compile:tests
npm exec mocha -- "out/test/unit/webviewRenderer.test.js" "out/test/unit/packageAssets.test.js"
```

Expected: all tests pass.

- [ ] **Step 8: Commit renderer and documentation**

```text
git add src/panel/webview/renderer.ts src/panel/webview/styles.css test/unit/webviewRenderer.test.ts README.md test/unit/packageAssets.test.ts
git commit -m "feat(panel): show session activity indicators"
```

---

### Task 5: Prove the complete lifecycle and finish the branch

**Files:**
- Modify: `test/integration/lifecycle.test.ts:285-450`
- Verify: `test/integration/activation.test.ts`
- Verify: every file changed by Tasks 1-4

**Interfaces:**
- Consumes: structured hook settings/channel, atomic attention state, panel visibility, and renderer protocol from Tasks 1-4.
- Produces: one integration regression proving `working → unread waiting → viewed waiting`.

**Sources:** The existing lifecycle integration already launches a managed PTY, reads generated hook settings, writes correlated signal files, waits for ingestion, and verifies notification behavior (`test/integration/lifecycle.test.ts:L293-L432`). The spec requires an integrated structured-hook sequence (`docs/superpowers/specs/2026-09-20-session-activity-indicators.md:L99-L107`).

- [ ] **Step 1: Add the failing lifecycle integration**

Capture the registered `SessionPanelProvider`, resolve it with a controllable view harness, and collect posted host messages. Launch two sessions, keep the first active in a visible view, and emit correlated signals through the real attention channel:

```ts
await writeSignal(firstSessionId, "UserPromptSubmit", null);
await writeSignal(firstSessionId, "Stop", null);
await writeSignal(secondSessionId, "UserPromptSubmit", null);
await writeSignal(secondSessionId, "Stop", null);
```

Assert the latest snapshots show:

```ts
assert.deepEqual(latestSessions.map(({ id, activity, hasUnreadResponse }) => ({
  id,
  activity,
  hasUnreadResponse
})), [
  { id: firstSessionId, activity: "waiting", hasUnreadResponse: false },
  { id: secondSessionId, activity: "waiting", hasUnreadResponse: true }
]);
```

Fire `selectSession` for the second session through the resolved webview, wait one event-loop turn, and assert its next `sessionUpdated` message has `activity: "waiting", hasUnreadResponse: false`.

- [ ] **Step 2: Run the integration test and confirm RED**

```text
npm run test:integration
```

Expected before final wiring: the unselected response does not remain unread or selecting it does not clear the dot.

- [ ] **Step 3: Make only wiring corrections exposed by the integration test**

Limit corrections to the approved boundaries: the view predicate passed to `createAttentionSignalProcessor`, visibility callback ordering, manager activation/markViewed, `sameSession`, and protocol delivery. Do not add terminal-text parsing, persistence, saved-session markers, or #113 badge code.

- [ ] **Step 4: Run the complete verification matrix**

```text
npm run check:types
npm run lint
npm test
git diff --check origin/prerelease/0.7.x...HEAD
```

Expected: type-check and lint exit 0; 472 baseline unit tests plus all newly added tests pass; all four supported-host integration runs pass; diff check emits no output.

- [ ] **Step 5: Audit artifact persistence and scope**

Run:

```text
git diff --stat origin/prerelease/0.7.x...HEAD
git ls-tree HEAD -- docs/superpowers/specs/2026-09-20-session-activity-indicators.md
git ls-tree HEAD -- docs/superpowers/plans/2026-09-20-session-activity-indicators.md
git grep -n "hasUnreadResponse\|session-tab-working-marker\|session-tab-unread-marker" HEAD -- src test README.md
```

Expected: both planning artifacts are committed; every production field/class has tests and README coverage; no unrelated files appear in the diff.

- [ ] **Step 6: Commit the integration proof**

```text
git add test/integration/lifecycle.test.ts
git commit -m "test(sessions): verify unread response lifecycle"
```

- [ ] **Step 7: Request code review before opening the PR**

Review the full branch against #109 and this plan. Address every Critical/Important finding, rerun the affected focused suites, then repeat Step 4 before creating a PR against `prerelease/0.7.x` with `Closes #109` in the body.
