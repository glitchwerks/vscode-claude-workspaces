# Persisted Claude Session Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist extension-created Claude UUIDs and let users safely resume named sessions in their original workspace root.

**Architecture:** Add a validated, versioned workspace-state store and a cached Claude capability probe. Keep `LaunchPlanner` authoritative for roots and current imports; layer `--session-id`/`--resume` arguments immediately before the managed PTY boundary. Carry the Claude UUID through live snapshots, coordinate persistence and failure choices in `LaunchController`, and expose a host-owned resumable-session list through the closed panel protocol. (#27; `src/launch/launchPlanner.ts:L95-L149`; `src/launch/launchController.ts:L49-L190`; `src/panel/protocol.ts:L15-L55`)

**Tech Stack:** TypeScript 6, VS Code extension API workspace state, Node `crypto.randomUUID`, Node `child_process.execFile`, Mocha, Node assertions, JSDOM, esbuild. (`package.json:L35-L47`, `package.json:L153-L174`)

**Spec:** [docs/superpowers/specs/2026-09-06-session-resume.md](../specs/2026-09-06-session-resume.md)

## Global Constraints

- Implement issue #27 only; do not discover or adopt externally launched Claude sessions. (#27)
- Use `--session-id <uuid>` only when both `--session-id` and `--resume` are verified from the configured executable's help text. Claude documents `--session-id` as requiring a valid UUID and `--resume` as accepting a session ID or name. (https://code.claude.com/docs/en/cli-usage, fetched 2026-09-06)
- Do not inspect or mutate Claude transcript files. Claude owns their local storage and cleanup lifecycle. (https://code.claude.com/docs/en/sessions, fetched 2026-09-06)
- A resume must re-run `LaunchPlanner` for the stored root so current imports, current executable settings, and availability checks apply. (`src/launch/launchPlanner.ts:L95-L149`, `src/launch/launchController.ts:L92-L156`, `src/launch/launchController.ts:L271-L307`)
- Failed resumes retain metadata unless the user explicitly chooses **Forget Session**. (#27)
- Preserve exact-key protocol validation and keep executable paths, cwd values, and arguments out of webview-originated messages. (`src/panel/protocol.ts:L63-L81`; `src/launch/launchController.ts:L92-L190`)
- Add or update tests before each production change and keep each task green before committing. (#27; `package.json:L35-L43`)

---

## Task 1: Add the versioned resumable-session store

**Files:**

- Create: `src/sessions/resumableSessionStore.ts`
- Create: `test/unit/resumableSessionStore.test.ts`

The store follows the existing workspace-state validation boundary but owns a separate schema so configuration migrations cannot alter session metadata. (`src/config/configurationStore.ts:L9-L16`, `src/config/configurationStore.ts:L43-L70`)

- [x] Write failing tests for a missing store, a valid version-1 document, malformed records, unknown versions, duplicate UUIDs, immutable snapshots, serialized concurrent upsert/rename/forget calls, and change-event emission.

- [x] Run `npm run compile:tests && npx mocha "out/test/unit/resumableSessionStore.test.js"` and confirm the module/import failure is the expected red state.

- [x] Implement the public types and store surface:

```ts
export interface ResumableSessionSnapshot {
  readonly claudeSessionId: string;
  readonly displayName: string;
  readonly rootId: string;
  readonly rootLabel: string;
  readonly rootPath: string;
  readonly createdAt: string;
  readonly lastLaunchedAt: string;
}

export interface ResumableSessionDocumentV1 {
  readonly schemaVersion: 1;
  readonly sessions: readonly ResumableSessionSnapshot[];
}

export class ResumableSessionStore implements vscode.Disposable {
  readonly sessions: readonly ResumableSessionSnapshot[];
  readonly onDidChangeSessions: vscode.Event<readonly ResumableSessionSnapshot[]>;
  upsert(session: ResumableSessionSnapshot): Promise<void>;
  updateExisting(session: ResumableSessionSnapshot): Promise<void>;
  rename(claudeSessionId: string, displayName: string): Promise<void>;
  forget(claudeSessionId: string): Promise<void>;
  dispose(): void;
}
```

`updateExisting` validates replacement metadata but persists it only when the UUID still exists after earlier queued mutations, preventing an in-flight resume from recreating a forgotten record. (`src/sessions/resumableSessionStore.ts:L64-L88`; `test/unit/resumableSessionStore.test.ts:L68-L108`)

- [x] Validate UUIDs with `validate(...)` logic that accepts canonical RFC 4122 string form, require non-empty trimmed strings, require parseable ISO timestamps, reject duplicate UUIDs, and normalize valid records to frozen copies sorted by descending `lastLaunchedAt` then `claudeSessionId`.

- [x] Serialize workspace-state writes through one internal promise chain; update the in-memory snapshot and fire one change event only after `workspaceState.update` succeeds.

- [x] Run the focused test, then `npm run check:types && npm run lint && npm run test:unit`.

- [x] Commit with `feat(sessions): add resumable session store`.

## Task 2: Probe Claude capabilities and construct UUID-backed launch specs

**Files:**

- Create: `src/launch/claudeCapabilities.ts`
- Create: `src/launch/sessionLaunch.ts`
- Create: `test/unit/claudeCapabilities.test.ts`
- Create: `test/unit/sessionLaunch.test.ts`

Capability detection must use the actual configured executable and flag presence, not an assumed Claude version threshold. (#27; https://code.claude.com/docs/en/cli-usage, fetched 2026-09-06)

- [x] Write failing tests proving: both flags are required; stdout and stderr are searched; probe failures return `unsupported`; concurrent/repeated checks share one cached result per executable; distinct executables probe independently; new and resume transforms preserve planned cwd/root/import metadata and prepend exactly the documented flag/value pair.

- [x] Run the two focused compiled tests and confirm the missing modules are the expected red state.

- [x] Implement:

```ts
export interface ClaudeCapabilities {
  readonly sessionPersistence: boolean;
}

export interface ClaudeHelpRunner {
  run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

export class ClaudeCapabilityProbe {
  constructor(runner: ClaudeHelpRunner);
  get(executable: string): Promise<ClaudeCapabilities>;
}

export function createNodeClaudeHelpRunner(timeoutMs = 5_000): ClaudeHelpRunner;
export function planNewClaudeSession(spec: LaunchSpec, claudeSessionId: string): LaunchSpec;
export function planResumedClaudeSession(spec: LaunchSpec, claudeSessionId: string): LaunchSpec;
```

- [x] Implement the Node runner with `execFile(executable, ["--help"], { encoding: "utf8", timeout: timeoutMs, windowsHide: true })`; do not enable a shell.

- [x] Match complete `--session-id` and `--resume` option tokens in combined stdout/stderr and cache the promise before awaiting it so simultaneous launches cannot duplicate probes.

- [x] Run focused tests, then `npm run check:types && npm run lint && npm run test:unit`.

- [x] Commit with `feat(launch): detect Claude resume support`.

## Task 3: Carry Claude identity through managed sessions

**Files:**

- Modify: `src/sessions/sessionTypes.ts`
- Modify: `src/sessions/sessionManager.ts`
- Modify: `src/panel/protocol.ts`
- Modify: `src/panel/sessionPanelProvider.ts`
- Modify: `test/unit/sessionManager.test.ts`
- Modify: `test/unit/protocol.test.ts`
- Modify: `test/integration/activation.test.ts`

Before this feature, the live snapshot had extension ID, root, display name, ordinal, state, launch time, and immutable import metadata; the protocol and provider validated/compared all fields. (`cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/sessions/sessionTypes.ts:L7-L16`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/panel/protocol.ts:L233-L250`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/panel/sessionPanelProvider.ts:L399-L410`)

- [x] Add failing tests that a launch can receive `{ claudeSessionId, displayName }`, snapshots expose the UUID or `null`, a resumed display name is preserved, generated names remain the default, and protocol/provider comparisons reject or propagate the new required nullable field.

- [x] Run the three focused compiled tests and confirm failures describe the missing identity field/options.

- [x] Add `readonly claudeSessionId: string | null` to `ManagedSessionSnapshot` and the internal session record.

- [x] Change the manager API to:

```ts
export interface ManagedSessionLaunchOptions {
  readonly claudeSessionId?: string;
  readonly displayName?: string;
}

launch(
  spec: LaunchSpec,
  options?: ManagedSessionLaunchOptions
): Promise<ManagedSessionSnapshot | undefined>;
```

- [x] Validate/trim an injected display name at the manager boundary, retain current generated names when absent, and map absent UUIDs to `null` in every snapshot.

- [x] Update `isSession` exact-key validation and `sameSession` equality for `claudeSessionId`.

- [x] Run focused tests, then `npm run check:types && npm run lint && npm run test:unit`.

- [x] Commit with `feat(sessions): track Claude session identity`.

## Task 4: Orchestrate new-session persistence and safe resume

**Files:**

- Modify: `src/extension.ts`
- Modify: `test/integration/activation.test.ts`
- Modify: `test/integration/lifecycle.test.ts`
- Create: `test/unit/sessionResumeController.test.ts`

Before this feature, activation already injected workspace state, PTY creation, availability, executable selection, and panel registration, while `LaunchController` owned planning, launch, restart, and notification actions. (`cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/extension.ts:L70-L86`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/extension.ts:L113-L194`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/extension.ts:L330-L469`)

- [x] Extract or expose a testable resume orchestration boundary and write failing unit tests for supported new launch persistence, unsupported/probe-failed normal launch, stored-record-only lookup, duplicate-live rejection, successful resume, current-import re-planning, missing root, changed root path, stale resume failure, Start New, Forget Session, dismissal retention, and rename persistence.

- [x] Extend activation/lifecycle tests with a reusable in-memory `workspaceState` memento; verify an extension-created UUID survives deactivate/reactivate, appears in the new store, resumes with `--resume`, and remains isolated from unmanaged VS Code terminals.

- [x] Run the focused unit/integration compile targets and confirm the expected red failures before production wiring.

- [x] Extend `ExtensionActivationDependencies` with injectable `createClaudeSessionId`, `claudeCapabilities`, and optional clock defaults; construct `ResumableSessionStore` from `context.workspaceState` during activation and dispose it with extension subscriptions.

- [x] For supported new launches, generate a UUID, use `planNewClaudeSession`, pass identity options to `SessionManager.launch`, and persist only a returned `running` snapshot. For unsupported or failed probes, call the existing unmodified launch path and log why persistence was skipped.

- [x] Add `LaunchController.resumeSession(claudeSessionId)` that resolves only store-owned records, rejects UUIDs already live, validates `rootId` and exact current `rootPath`, probes capability support, re-plans current configuration for the explicit root, adds `--resume`, launches with stored identity/name, and advances `lastLaunchedAt` only after success.

- [x] Track new and resume launch attempts separately so startup and immediate-exit notifications offer the correct actions. Implement **Start New** through the normal current-planning path, **Forget Session** through the store, **Configure Workspace…** for root failures, and **Open Logs** for process failures; retain the record on dismissal.

- [x] After a successful live rename, update the corresponding persisted record when `claudeSessionId` is non-null.

- [x] Run focused tests, then `npm run check:types && npm run lint && npm run test:unit`.

- [x] Commit with `feat(sessions): persist and resume managed Claude sessions`.

## Task 5: Add the separate resumable-session panel flow

**Files:**

- Modify: `src/panel/protocol.ts`
- Modify: `src/panel/sessionPanelProvider.ts`
- Modify: `src/panel/webview/renderer.ts`
- Modify: `src/panel/webview/styles.css`
- Modify: `src/extension.ts`
- Modify: `test/unit/protocol.test.ts`
- Modify: `test/integration/activation.test.ts`
- Modify: `test/unit/webviewRenderer.test.ts`

Before this feature, the panel hydrated only live snapshots, mapped allow-listed actions to injected host handlers, and rendered one sidebar action group. (`cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/panel/protocol.ts:L35-L51`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/panel/sessionPanelProvider.ts:L181-L217`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:src/panel/webview/renderer.ts:L82-L119`)

- [x] Write failing protocol tests for exact `resumeSession` messages and validated resumable arrays in `hydrate`/`resumableSessionsChanged`, including malformed UUIDs, empty labels/paths, duplicate IDs, sparse arrays, missing fields, and privileged excess fields.

- [x] Write failing provider tests for hydration, incremental store updates, UUIDs filtered while live, reappearance after live close, action routing, and disposal of the additional event subscription.

- [x] Write failing JSDOM tests for a distinct **Resume sessions** region, newest-first accessible buttons containing display name and root label/path, empty-state behavior, posting only `{ type: "resumeSession", claudeSessionId }`, incremental updates, and no terminal creation for resumable-only entries.

- [x] Add `resumeSession` to `WebviewMessage`; add `resumableSessions` to hydration and `{ type: "resumableSessionsChanged", sessions }` to `HostMessage`; validate both directions with exact fields and shared record validation.

- [x] Add a resumable source and `resumeSession` action to provider dependencies. Recompute the presented list when either live or persisted snapshots change, excluding every non-null Claude UUID already live.

- [x] Render a separate landmark/list after the existing actions, show display name plus root label/path, use native buttons with an explicit `Resume <name> in <root>` accessible label, and style focus/hover/overflow with existing VS Code theme variables.

- [x] Wire the provider action to `LaunchController.resumeSession` during activation.

- [x] Run focused tests, then `npm run check:types && npm run lint && npm run test:unit`.

- [x] Commit with `feat(panel): present resumable Claude sessions`.

## Task 6: Document the lifecycle and verify the complete feature

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-06-session-resume.md`

Before this feature, the README described names as live-only and listed persistence/resume as unsupported, so release-facing documentation had to be corrected. (`cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:README.md:L67-L79`; `cbd111c1eea1f8485ea29ab2c3e67f9ca97bf6cc:README.md:L89-L97`)

- [x] Update README configuration, commands/sessions, limitations, and troubleshooting sections with: UUID-backed supported sessions; workspace-local metadata fields; current-root/current-import validation; explicit forgetting; unsupported-CLI behavior; stale-session Start New/Forget choices; Claude-owned transcript retention and cleanup.

- [x] Run `npm run check:types` and confirm success.

- [x] Run `npm run lint` and confirm success.

- [x] Run `npm run test:unit` and confirm success.

- [x] Run `npm run build:production` and confirm success.

- [x] Run `npm run test:integration` and confirm success; if the local VS Code updater mutex blocks the Extension Host, record the exact output and require the PR's Windows Extension Host check to pass on the actual pushed commit before merge. (`package.json:L35-L47`; PR #62 documents the same local-environment constraint for the preceding release branch change.)

- [x] Inspect `git diff release-0.3.0...HEAD --stat` and reconcile every issue #27 deliverable. For every committed doc or script path reference, verify `git ls-tree HEAD -- <path>` is non-empty.

- [x] Search changed files for `TODO`, `FIXME`, `placeholder`, and unchecked implementation omissions; resolve any result that belongs to this feature.

- [ ] Request code review using `superpowers:requesting-code-review`; address valid findings and rerun affected verification.

- [x] Commit documentation/verification changes with `docs: explain resumable session lifecycle`.

- [ ] Before pushing, confirm any existing PR for `issue-27-session-resume` is still open. Push the branch and create a PR into `release-0.3.0` whose body includes `Closes #27` and the required Codex attribution. The issue will close when the primary release PR later merges to the default branch because this sub-PR targets the release branch. (#27)

- [ ] Verify the PR's live comments, unresolved review threads, reviews, requested reviewers, and checks on the actual head commit before reporting it ready.

## Plan Self-Review

- [x] Acceptance coverage: UUID capture/persistence (Tasks 1, 3, 4), display/root metadata (Task 1), separate resume UI (Task 5), original-root resume with current imports (Task 4), stale/missing fallback (Task 4), unrelated-session isolation (Tasks 2, 4), reload/success/stale/root tests (Tasks 1, 4, 5), and README lifecycle documentation (Task 6). (#27)
- [x] Type consistency: `claudeSessionId` is a canonical UUID in persisted/webview resume records and `string | null` only in live snapshots where capability fallback is represented.
- [x] Security consistency: the webview sends only a store key; the host owns record lookup, root validation, planning, executable selection, arguments, persistence, and process lifecycle. (`src/panel/protocol.ts:L73-L81`; `src/launch/launchController.ts:L92-L141`)
- [x] No placeholder steps or unresolved design choices remain in this plan.
