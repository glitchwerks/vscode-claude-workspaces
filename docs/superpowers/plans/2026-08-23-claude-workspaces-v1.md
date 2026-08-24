# Claude Workspaces V1 Implementation Plan

> **Required execution skills:** Use `superpowers:using-git-worktrees` before creating any implementation branch, `superpowers:test-driven-development` for every behavior task, `superpowers:verification-before-completion` before each completion claim, and `superpowers:requesting-code-review` before the primary feature PR is merged.

**Goal:** Ship a standalone VS Code extension named **Claude Workspaces** (`vscode-claude-workspaces`) that launches and manages workspace-aware Claude Code sessions from a dedicated bottom panel.

**Architecture:** A desktop/workspace VS Code extension owns a small domain core (`WorkspaceModel`, `ConfigurationStore`, launch planning, and `SessionManager`) behind testable adapters. The extension host spawns only its own Claude processes through a `ManagedPtyFactory`; a `WebviewView` renders session tabs and xterm.js surfaces through a validated message protocol. Workspace configuration remains in `ExtensionContext.workspaceState`, while each running session retains an immutable launch snapshot. This implements the approved component and ownership boundaries (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L14-L82`).

**Tech stack:** TypeScript in strict mode; npm with an exact-version lockfile; esbuild for the extension-host and webview bundles; VS Code Desktop API; `node-pty`; `@xterm/xterm` plus `@xterm/addon-fit`; Mocha unit tests; `@vscode/test-cli` and `@vscode/test-electron` extension-host tests. VS Code documents esbuild plus separate `tsc --noEmit` checking and its test CLI/Mocha combination at https://code.visualstudio.com/api/working-with-extensions/bundling-extension (fetched 2026-08-23) and https://code.visualstudio.com/api/working-with-extensions/testing-extension (fetched 2026-08-23).

**Spec:** `docs/superpowers/specs/2026-08-23-claude-workspaces.md`

**Global constraints:**

- V1 is a Claude-session product, not a general terminal; no arbitrary shells, split terminals, retained exited tabs, persistence, resume, or external-session adoption (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L14-L28`, `L324-L333`).
- The UI activates only for a saved `.code-workspace`, including saved one-folder workspaces (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L34-L54`).
- Every process argument is passed as an array element; never interpolate a shell command (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L151-L177`).
- All process ownership and shutdown behavior stays behind `ManagedPty`; no production module except the node-pty adapter imports `node-pty` (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L279-L290`).
- The webview uses a nonce-based restrictive CSP and rejects malformed or unknown messages (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L279-L290`).
- The project follows the workspace `AGENTS.md`, including issue-first tracking, feature worktrees, tests for all behavior, README maintenance, and plan deletion when the parent issue closes.

## Delivery model and gates

Implementation is not authorized by this plan alone. Complete these gates in order, then obtain explicit user approval before Task 1 (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L346-L359`).

1. Create the standalone GitHub repository `vscode-claude-workspaces` with default branch `main`.
2. Create a **V1** milestone.
3. Create one parent feature issue, **Claude Workspaces V1**, plus child issues for:
   - extension scaffold and activation;
   - workspace configuration and setup;
   - launch planning and PTY ownership;
   - session lifecycle;
   - panel UI and message protocol; and
   - integration, packaging, and acceptance.
4. Add every child issue to the V1 milestone and link it from the parent issue.
5. Move the approved spec, feature overview, problem statement, and research report into the new repository under the same `docs/` paths.
6. Run the `--add-dir` approval-prompt probe with one previously unapproved sibling path. Record the Claude Code version, operating system, exact argument vector, observed prompt, and conclusion on the launch-planning issue. If the result breaks one-click launch, stop and return the design to review (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L165-L177`).
7. Inspect any candidate Conductor source file before porting it. Record its source commit, license, assumptions, dependencies, tests, and attribution requirements on the relevant issue. Copy nothing by default (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L76-L82`).
8. Pull `origin/main`, create primary branch `feature/claude-workspaces-v1`, and create `.worktrees/feature-claude-workspaces-v1`. Each child issue uses a sub-branch and worktree cut from the primary branch; sub-branch PRs target the primary branch, and the final primary PR targets `main`.

## Planned repository layout

```text
vscode-claude-workspaces/
├── .Codex/project-areas.json
├── .github/workflows/ci.yml
├── .vscode-test.js
├── .vscodeignore
├── AGENTS.md
├── LICENSE
├── README.md
├── esbuild.js
├── package-lock.json
├── package.json
├── tsconfig.json
├── docs/
│   ├── FEATURE_OVERVIEW.md
│   ├── PROBLEM_STATEMENT.md
│   ├── research/2026-08-23-multi-root-claude-workspaces-prior-art.md
│   ├── superpowers/plans/2026-08-23-claude-workspaces-v1.md
│   └── superpowers/specs/2026-08-23-claude-workspaces.md
├── media/
│   └── claude-workspaces.svg
├── src/
│   ├── config/
│   │   ├── configurationStore.ts
│   │   ├── setupController.ts
│   │   └── workspaceConfig.ts
│   ├── extension.ts
│   ├── launch/
│   │   ├── launchPlanner.ts
│   │   ├── managedPty.ts
│   │   └── nodePtyAdapter.ts
│   ├── logging/outputLogger.ts
│   ├── panel/
│   │   ├── protocol.ts
│   │   ├── sessionPanelProvider.ts
│   │   └── webview/
│   │       ├── index.ts
│   │       └── styles.css
│   ├── sessions/
│   │   ├── sessionManager.ts
│   │   └── sessionTypes.ts
│   └── workspace/workspaceModel.ts
└── test/
    ├── fixtures/
    │   ├── empty-window/.gitkeep
    │   └── saved-workspace/
    │       ├── alpha/.gitkeep
    │       ├── beta/.gitkeep
    │       └── workspace.code-workspace
    ├── integration/
    │   ├── activation.test.ts
    │   └── lifecycle.test.ts
    ├── support/fakeManagedPty.ts
    └── unit/
        ├── configurationStore.test.ts
        ├── launchPlanner.test.ts
        ├── protocol.test.ts
        ├── sessionManager.test.ts
        ├── setupController.test.ts
        └── workspaceModel.test.ts
```

`.Codex/project-areas.json` maps `extension-host` to `src/**/*.ts`, `webview` to `src/panel/webview/**`, and `tests` to `test/**`. `AGENTS.md` imports `@C:\Users\chris\.Codex\standards\software-standards.md` as required by the workspace standards.

## Stable interfaces

Implement against these interfaces so tests and adapters do not drift between tasks:

```ts
export type RootId = string;

export interface WorkspaceRoot {
  readonly id: RootId;
  readonly label: string;
  readonly uri: vscode.Uri;
}

export interface WorkspaceConfigV1 {
  readonly schemaVersion: 1;
  readonly configuredRoots: readonly RootId[];
  readonly defaultRootOverride?: RootId;
  readonly importsByRoot: Readonly<Record<RootId, readonly RootId[]>>;
}

export interface LaunchRequest {
  readonly rootMode: "default" | "explicit";
  readonly explicitRoot?: RootId;
}

export interface LaunchSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly root: WorkspaceRoot;
  readonly importedRoots: readonly WorkspaceRoot[];
  readonly skippedImportIds: readonly RootId[];
}

export interface ManagedPty {
  readonly onData: vscode.Event<string>;
  readonly onExit: vscode.Event<{ exitCode: number; signal?: number }>;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  terminate(): Promise<void>;
  dispose(): void;
}

export interface ManagedPtyFactory {
  spawn(spec: LaunchSpec): Promise<ManagedPty>;
}

export type SessionState = "starting" | "running" | "closing";

export interface ManagedSessionSnapshot {
  readonly id: string;
  readonly rootId: RootId;
  readonly displayName: string;
  readonly ordinalWithinRoot: number;
  readonly state: SessionState;
  readonly launchedImportIds: readonly RootId[];
  readonly launchedAt: number;
}
```

The state and session fields come directly from the approved models (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L84-L102`, `L179-L214`).

## Task 1: Scaffold the standalone extension and activation boundary

**Issue:** extension scaffold and activation.

**Files:**

- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.js`, `.vscodeignore`, `.vscode-test.js`
- Create: `AGENTS.md`, `.Codex/project-areas.json`, `LICENSE`, `README.md`
- Create: `media/claude-workspaces.svg`
- Create: `src/extension.ts`, `src/workspace/workspaceModel.ts`
- Test: `test/unit/workspaceModel.test.ts`, `test/integration/activation.test.ts`
- Fixture: `test/fixtures/saved-workspace/workspace.code-workspace` and root marker files

**Steps:**

- [ ] Initialize the npm package with name `vscode-claude-workspaces`, extension display name `Claude Workspaces`, desktop entry point `dist/extension.js`, and `engines.vscode` set to `^1.134.0`, matching the verified local test baseline. Declare `extensionKind: ["workspace"]`; contribute a Panel view container and view guarded by `claudeWorkspaces.savedWorkspace == true`. A VS Code extension manifest requires `engines.vscode`, and contribution visibility supports `when` clauses (https://code.visualstudio.com/api/references/extension-manifest and https://code.visualstudio.com/api/references/contribution-points, fetched 2026-08-23).
- [ ] Install runtime dependencies with `npm install --save-exact node-pty @xterm/xterm @xterm/addon-fit`; install build/test dependencies with `npm install --save-dev --save-exact typescript esbuild @types/node @types/vscode mocha @types/mocha @vscode/test-cli @vscode/test-electron @vscode/vsce eslint @eslint/js typescript-eslint`. Commit the generated lockfile.
- [ ] Add scripts: `check:types`, `lint`, `build`, `build:production`, `test:unit`, `test:integration`, `test`, and `package:vsix`. Keep `node-pty` external in the extension-host bundle and include its production package files in the VSIX; bundle the webview separately. VS Code documents externalizing dependencies that cannot be statically bundled and including their files in the package (https://code.visualstudio.com/api/working-with-extensions/bundling-extension, fetched 2026-08-23).
- [ ] Write `workspaceModel.test.ts` first for saved `file:` workspace eligibility, untitled workspace rejection, folder-window rejection, ordered URI-based root IDs, and duplicate display names.
- [ ] Run `npm run test:unit -- --grep "WorkspaceModel"`; confirm failure because `WorkspaceModel` does not exist.
- [ ] Implement `WorkspaceModel.from(workspaceFile, workspaceFolders)`, `isEligible`, `roots`, and `rootIds`. Root IDs are `WorkspaceFolder.uri.toString(true)`; labels never act as identity (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L84-L102`).
- [ ] Run the focused unit test and confirm pass.
- [ ] Write `activation.test.ts` for the saved-workspace fixture. Assert the extension activates, sets `claudeWorkspaces.savedWorkspace` true, and registers its contributed commands; add a second test configuration with no `.code-workspace` and assert the context is false.
- [ ] Run `npm run test:integration`; confirm the activation assertions fail before command/context wiring.
- [ ] Implement `activate()` to compute eligibility and set the context key without spawning any process or opening setup yet. Implement idempotent `deactivate()` as a no-op until lifecycle ownership lands.
- [ ] Update `README.md` with prerequisites, `npm ci`, build, unit-test, integration-test, F5 debugging, and VSIX commands.
- [ ] Run `npm run check:types && npm run lint && npm run test:unit && npm run test:integration && npm run build:production`.
- [ ] Commit with `feat: scaffold saved-workspace extension host` and open the child PR against `feature/claude-workspaces-v1`.

## Task 2: Implement workspace configuration and setup decisions

**Issue:** workspace configuration and setup.

**Files:**

- Create: `src/config/workspaceConfig.ts`, `src/config/configurationStore.ts`, `src/config/setupController.ts`
- Modify: `src/extension.ts`, `package.json`, `README.md`
- Test: `test/unit/configurationStore.test.ts`, `test/unit/setupController.test.ts`
- Extend: `test/integration/activation.test.ts`

**Steps:**

- [ ] Write configuration-store tests for missing state, valid schema v1, corrupt state, root reorder/add/remove, asymmetric imports, no diagonal imports, and safe dismissal defaults. Expect `needsSetup` when no valid state exists or the ordered root IDs differ (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L104-L129`).
- [ ] Run `npm run test:unit -- --grep "ConfigurationStore"`; confirm failure.
- [ ] Implement pure `parseWorkspaceConfig(value)`, `createSafeConfig(rootIds)`, and `reconcileConfig(config, rootIds)`. Reconciliation retains valid directed edges, removes missing roots, adds new source rows with no edges, and never creates reverse edges.
- [ ] Implement `ConfigurationStore` over a minimal `MementoLike` interface with key `claudeWorkspaces.config`, methods `load(roots)`, `save(config)`, and `reset(roots)`. On invalid state, save safe defaults, log the error, and return `needsSetup: true` (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L97-L125`).
- [ ] Run focused configuration tests and confirm pass.
- [ ] Write setup-controller tests for: first activation opens setup; unchanged roots do not reopen it; changed roots reopen it; dismiss saves safe defaults; save rejects unknown roots and self-imports; and changes do not mutate a supplied live-session snapshot.
- [ ] Run `npm run test:unit -- --grep "SetupController"`; confirm failure.
- [ ] Implement `SetupController` using a VS Code `QuickPick` sequence: first an optional default-root choice, then one multi-select import picker for each launch root. This is a configuration popup, not the session panel. Cancel/dismiss calls `createSafeConfig` and persists it. The approved UX requires the popup only on first use or folder-set change (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L104-L129`).
- [ ] Register `claudeWorkspaces.configureWorkspace`; subscribe to `workspace.onDidChangeWorkspaceFolders`; invoke setup automatically only when `needsSetup` is true. Do not reopen setup when a session or folder is merely launched.
- [ ] Extend integration tests to verify first-load setup invocation through an injected test seam and root-change reconciliation without real user interaction.
- [ ] Add settings contribution `claudeWorkspaces.claudeExecutable` as an optional string with no default value; document it in README.
- [ ] Run `npm run check:types && npm run lint && npm run test:unit && npm run test:integration`.
- [ ] Commit with `feat: add workspace-local directed import setup` and open the child PR against the primary branch.

## Task 3: Build launch planning and the PTY boundary

**Issue:** launch planning and PTY ownership.

**Files:**

- Create: `src/launch/launchPlanner.ts`, `src/launch/managedPty.ts`, `src/launch/nodePtyAdapter.ts`
- Create: `src/logging/outputLogger.ts`
- Modify: `src/config/workspaceConfig.ts`, `src/extension.ts`, `package.json`, `README.md`
- Test: `test/unit/launchPlanner.test.ts`, `test/support/fakeManagedPty.ts`

**Steps:**

- [ ] Attach the recorded `--add-dir` probe result to this issue. If it did not pass the gate, stop this task before writing launch code.
- [ ] Write launch-planner tests for override-to-first-root precedence, unavailable default fallback plus one warning result, unavailable explicit-root failure, asymmetric imports, unavailable import aggregation, paths containing spaces, one `--add-dir` token per surviving target, and immutability of the resulting snapshot. These behaviors are specified at `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L131-L177` and `L241-L254`.
- [ ] Run `npm run test:unit -- --grep "LaunchPlanner"`; confirm failure.
- [ ] Implement pure `planLaunch(request, roots, config, executable, environment, availability)` returning `LaunchSpec` plus typed warnings, or a typed launch error. Use bounded parallel availability checks with a configurable timeout; never block indefinitely on a network URI (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L279-L287`).
- [ ] Implement executable resolution as override-or-`claude`; do not invoke a shell. Preserve inherited environment values and do not set the deferred shared-`CLAUDE.md` environment behavior.
- [ ] Run focused launch tests and confirm pass.
- [ ] Define `ManagedPty` and `ManagedPtyFactory`; add `FakeManagedPty` with explicit data, exit, spawn-failure, and terminate controls for later tests.
- [ ] Write adapter contract tests against a stubbed node-pty module for exact executable, argument array, cwd, environment, data, resize, exit, and idempotent termination forwarding.
- [ ] Run the adapter tests and confirm failure before implementation.
- [ ] Implement `NodePtyFactory` as the only module importing `node-pty`. On Windows, use node-pty's process termination API through the adapter; never search for or terminate unrelated processes.
- [ ] Implement `OutputLogger` over one named VS Code output channel, with structured methods for configuration reset, launch plan, skipped imports, startup error, process exit, and shutdown.
- [ ] Run `npm run check:types && npm run lint && npm run test:unit && npm run build:production`.
- [ ] Commit with `feat: add structured Claude launch and PTY adapter` and open the child PR against the primary branch.

## Task 4: Implement the live session lifecycle

**Issue:** session lifecycle.

**Files:**

- Create: `src/sessions/sessionTypes.ts`, `src/sessions/sessionManager.ts`
- Modify: `src/launch/managedPty.ts`, `src/logging/outputLogger.ts`
- Test: `test/unit/sessionManager.test.ts`, `test/support/fakeManagedPty.ts`

**Steps:**

- [ ] Write session-manager tests for multiple sessions in one root; per-root ordinals; launch-order snapshots; `starting -> running`; natural exit removal; close-one immediate termination; restart-fresh using a newly requested launch spec; startup failure removal; immediate non-zero exit notification data; previous/next wraparound; and idempotent terminate-all.
- [ ] Add a test proving a configuration object changed after launch cannot change `launchedImportIds` on an existing session. Add a test proving an unregistered fake PTY is never terminated. The ownership and lifecycle requirements are explicit at `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L179-L214` and `L256-L277`.
- [ ] Run `npm run test:unit -- --grep "SessionManager"`; confirm failure.
- [ ] Implement `SessionManager` with injected `ManagedPtyFactory`, clock, ID factory, logger, and notification sink. Expose `onDidChangeSessions`, `sessions`, `activeSessionId`, `launch(spec)`, `close(id)`, `restartFresh(id, getCurrentSpec)`, `activatePrevious()`, `activateNext()`, and `terminateAll()`.
- [ ] Treat tabs as projections of the live registry: do not persist exited sessions, output, Claude IDs, or resume metadata (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L201-L214`).
- [ ] Keep a closing session visible until termination acknowledgement; after a bounded grace interval, invoke the adapter's process-tree termination path and log escalation (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L241-L252`).
- [ ] Run focused session tests and confirm pass.
- [ ] Run `npm run check:types && npm run lint && npm run test:unit`.
- [ ] Commit with `feat: manage owned Claude session lifecycles` and open the child PR against the primary branch.

## Task 5: Build the session panel and validated webview protocol

**Issue:** panel UI and message protocol.

**Files:**

- Create: `src/panel/protocol.ts`, `src/panel/sessionPanelProvider.ts`
- Create: `src/panel/webview/index.ts`, `src/panel/webview/styles.css`
- Modify: `src/extension.ts`, `package.json`, `esbuild.js`, `.vscodeignore`
- Test: `test/unit/protocol.test.ts`
- Extend: `test/integration/activation.test.ts`

**Steps:**

- [ ] Define a closed protocol. Webview-to-host messages are `ready`, `input`, `resize`, `selectSession`, `newSession`, `newInFolder`, `closeSession`, `restartFresh`, `previousSession`, `nextSession`, and `configureWorkspace`. Host-to-webview messages are `hydrate`, `sessionAdded`, `sessionUpdated`, `sessionRemoved`, `sessionData`, and `activeSessionChanged`.
- [ ] Write protocol tests that accept every valid shape and reject unknown types, missing fields, excess privileged fields, negative dimensions, empty session IDs, and non-string input.
- [ ] Run `npm run test:unit -- --grep "panel protocol"`; confirm failure.
- [ ] Implement discriminated-union decoders returning typed success/error values. The extension host must ignore and log rejected messages rather than throwing (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L279-L285`).
- [ ] Run focused protocol tests and confirm pass.
- [ ] Implement `SessionPanelProvider` as a `WebviewViewProvider`. Generate HTML with no inline executable script, a per-render nonce, local-only resource roots, and CSP restricted to the webview source plus nonce scripts.
- [ ] Implement one xterm instance per live session, lazy attachment to the active tab, `FitAddon`, resize forwarding, output forwarding, copy/paste, selection, scrolling, and ANSI rendering. Dispose the xterm instance when the live session disappears.
- [ ] Render only the approved controls and launch-order tabs. Do not add shell selection, arbitrary command input, split terminal, rename, reopen, resume, or transcript UI (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L216-L239`).
- [ ] Wire the panel to session snapshots and PTY data without granting the webview direct process access.
- [ ] Extend integration tests to resolve the view in a saved workspace and assert it remains unavailable when the eligibility context is false.
- [ ] Run `npm run check:types && npm run lint && npm run test:unit && npm run test:integration && npm run build:production`.
- [ ] Commit with `feat: add Claude session panel and terminal bridge` and open the child PR against the primary branch.

## Task 6: Wire commands, errors, and shutdown ownership

**Issue:** integration, packaging, and acceptance.

**Files:**

- Modify: `src/extension.ts`, `src/config/setupController.ts`, `src/launch/launchPlanner.ts`, `src/sessions/sessionManager.ts`, `src/panel/sessionPanelProvider.ts`, `package.json`, `README.md`
- Test: `test/integration/lifecycle.test.ts`
- Extend: all affected unit tests

**Steps:**

- [ ] Write integration tests with the fake PTY factory injected through a test-only activation seam. Cover New Session, New in Folder, two concurrent sessions, close-one, natural exit, restart-fresh, startup failure, terminate-all, and zero interaction with a separately created VS Code terminal.
- [ ] Run `npm run test:integration -- --grep "managed lifecycle"`; confirm failure.
- [ ] Register the seven approved commands: `claudeWorkspaces.newSession`, `claudeWorkspaces.newInFolder`, `claudeWorkspaces.closeSession`, `claudeWorkspaces.restartFresh`, `claudeWorkspaces.previousSession`, `claudeWorkspaces.nextSession`, and `claudeWorkspaces.configureWorkspace`. Commands must return without side effects when the saved-workspace context is false (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L131-L149`, `L216-L239`).
- [ ] Connect launch warnings/errors to one notification each. Missing executable offers **Configure Executable** and **Open Logs**; explicit missing root offers **Configure Workspace**; startup failure and immediate non-zero exit offer **Retry** and **Open Logs** (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L241-L254`).
- [ ] Make Retry carry the failed request, not a PTY or stale launch spec, so it re-resolves current configuration. Make Restart Fresh close the selected process and build a new spec from its root plus current configuration.
- [ ] Register window/reload lifecycle handling and make `deactivate()` call the same idempotent `terminateAll()` path. Because ordinary asynchronous disposable cleanup is not awaited, begin cleanup from explicit lifecycle signals as well as deactivation (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L335-L344`).
- [ ] Confirm integration tests prove that closing one session terminates exactly one owned PTY and deactivation terminates all remaining owned PTYs.
- [ ] Run `npm run check:types && npm run lint && npm run test`.
- [ ] Commit with `feat: wire commands errors and shutdown cleanup` and open the child PR against the primary branch.

## Task 7: Package and manually accept V1

**Issue:** integration, packaging, and acceptance.

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `.vscodeignore`, `package.json`, `README.md`
- Create during verification only: packaged `.vsix` artifact; do not commit it unless the repository release policy explicitly requires it.

**Steps:**

- [ ] Add CI for Windows, Linux, and macOS unit/type/lint/build checks, with extension-host integration tests on Windows first. Native node-pty behavior varies by platform and requires explicit Windows acceptance (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L335-L344`). Use the `github-actions` skill before authoring the workflow.
- [ ] Add `npm run package:vsix` using `vsce package`; ensure `dist/extension.js`, the webview bundle/CSS, icon, README, license, and required node-pty runtime files are included. VS Code documents VSIX packaging via `vsce` at https://code.visualstudio.com/api/working-with-extensions/publishing-extension (fetched 2026-08-23).
- [ ] Run `npm ci && npm run check:types && npm run lint && npm run test && npm run build:production && npm run package:vsix` from a clean worktree.
- [ ] Inspect the VSIX archive contents. Verify every path named by committed `package.json`, `.vscodeignore`, README, and build scripts exists in `git ls-tree HEAD` or is a declared generated artifact.
- [ ] Install the VSIX into an Extension Development Host and complete the manual acceptance matrix from the spec: one-root saved workspace; multi-root saved workspace; first-load and root-change setup; directed asymmetric imports; multiple same-root sessions; resize/copy/paste/ANSI; unavailable local/network imports; executable override containing spaces; natural exit; immediate close; restart fresh; reload/window close; and external terminal isolation (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L292-L322`).
- [ ] Record acceptance evidence on the integration issue, including the VSIX filename, commit SHA, OS, VS Code version, Claude Code version, pass/fail for each case, and logs for failures.
- [ ] Update README with final installation, configuration, command, V1 limitation, troubleshooting, and development instructions. Explicitly list workspace-level `CLAUDE.md`/shared skills as future scope, not a current feature (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L324-L333`).
- [ ] Run the full verification command again after documentation/package changes.
- [ ] Commit with `chore: package and verify Claude Workspaces v1` and open the final child PR against the primary branch.

## Primary-branch completion

- [ ] Confirm every child PR is merged into `feature/claude-workspaces-v1` and every child issue reflects its final scope.
- [ ] Run `git diff main...HEAD --stat` and reconcile it against this plan's repository layout and all PR deliverables.
- [ ] For every committed doc or script that names a local path, run `git ls-tree HEAD -- <path>` and repair any missing-artifact reference before the PR is created.
- [ ] Run the complete clean-worktree verification from Task 7 on the primary branch.
- [ ] Use `superpowers:requesting-code-review`; address all valid findings and rerun affected checks.
- [ ] Open the primary PR into `main`. Its body must contain `Closes` followed by the parent issue number and a separate `Closes` directive for each child issue, plus the required Codex attribution line.
- [ ] Before merge, fetch live unresolved comments, reviews, requested reviewers, review-bot feedback, and CI status for the exact head commit. Do not merge with unresolved valid, ambiguous, or stale-looking feedback without applying the workspace decision rules.
- [ ] After the parent issue closes, extract any durable rationale not already preserved in the spec, issue, or PR; redirect committed references to durable artifacts; delete this plan file; and clean the merged worktrees with the local `clean-gone` skill.

## Plan self-review

- Coverage: Tasks 1–7 cover FR-1 through FR-15 and NFR-1 through NFR-5 (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L256-L290`).
- Testability: all domain behavior is behind pure functions or injected interfaces; node-pty and VS Code host behavior have adapter/integration coverage.
- Scope: no task adds persistence, resume, transcripts, general terminal features, external adoption, workspace-level `CLAUDE.md`, or shared skills.
- Deferred identifiers: issue numbers and commit SHAs are obtained during execution and are not fabricated in this pre-repository plan; the issue titles, branch topology, paths, interfaces, commands, and acceptance cases are fixed.
- Sequencing: configuration precedes launch planning; launch/PTY precedes lifecycle; lifecycle precedes panel wiring; packaging follows integrated behavior.

## Sources

- `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L14-L359` — approved product, architecture, behavior, tests, risks, and gates.
- `docs/PROBLEM_STATEMENT.md:L1-L81` — original problem and capability set.
- `docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L29-L44` — current `--add-dir` findings.
- https://code.visualstudio.com/api/references/vscode-api (fetched 2026-08-23) — workspace, state, lifecycle, and webview APIs.
- https://code.visualstudio.com/api/references/contribution-points (fetched 2026-08-23) — Panel views and `when` clauses.
- https://code.visualstudio.com/api/references/extension-manifest (fetched 2026-08-23) — manifest requirements.
- https://code.visualstudio.com/api/working-with-extensions/bundling-extension (fetched 2026-08-23) — esbuild, type checking, and external dependencies.
- https://code.visualstudio.com/api/working-with-extensions/testing-extension (fetched 2026-08-23) — test CLI, Electron host, and Mocha.
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension (fetched 2026-08-23) — VSIX packaging.
- https://github.com/glitchwerks/vscode-claude-conductor/issues/121 (fetched 2026-08-23) — required `--add-dir` approval probe.
- https://github.com/glitchwerks/vscode-claude-conductor/issues/68 (fetched 2026-08-23) — deliberately independent Conductor terminal-close issue.
