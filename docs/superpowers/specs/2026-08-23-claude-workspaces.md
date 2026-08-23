---
title: Claude Workspaces — standalone VS Code extension design
touches:
  - docs/superpowers/specs/2026-08-23-claude-workspaces.md
  - docs/PROBLEM_STATEMENT.md
---

# Claude Workspaces

**Status:** APPROVED — reviewed and accepted for implementation planning.
**Date:** 2026-08-23.
**Scope:** V1 standalone VS Code extension for launching and managing Claude Code sessions inside a saved `.code-workspace`.

## 1. Product definition

The product is a standalone VS Code extension with a dedicated bottom-panel
surface for Claude Code sessions. It is not a Claude Code plugin and it is not
an increment to `glitchwerks/vscode-claude-conductor`.

The extension owns only sessions launched through its own commands. It does not
discover, adopt, disable, modify, or terminate Claude sessions launched through
another extension or terminal.

V1 uses xterm.js and node-pty as an implementation bridge because Claude Code
is currently a terminal application. The product abstraction is nevertheless a
**Claude session**, not a general-purpose terminal. Terminal profiles, arbitrary
shell launch, split terminals, retained exited tabs, persistence, and resume are
out of scope.

## 2. Resolved product decisions

These are user-owned product decisions from the 2026-08-23 scoping session.

| ID | Decision | Resolution |
|---|---|---|
| D1 | Project home | New standalone VS Code extension. Conductor is prior art only. |
| D2 | Activation boundary | Activate and show contributed UI only for a saved `.code-workspace`, including one-folder workspace files. |
| D3 | Group membership | One `.code-workspace` is one group; every entry in `workspaceFolders` joins automatically. |
| D4 | Configuration storage | Keep extension configuration separate from the `.code-workspace` file in extension-local workspace state. |
| D5 | Default root | Explicit local override, then the first available workspace folder. |
| D6 | Cross-root access | Directed source-to-target import matrix. Every pair defaults disabled. |
| D7 | Reconfiguration | Open setup on first activation and whenever the workspace folder set changes. Dismissal saves safe defaults. |
| D8 | Running-session stability | Configuration changes apply only to future launches; existing sessions retain their launch snapshot. |
| D9 | Session persistence | No persistence or resume in V1. |
| D10 | Termination | Closing a tab terminates that process immediately; window close, reload, or extension deactivation terminates all managed sessions. |
| D11 | Session layout | Multiple sessions per root; automatic names; tabs ordered by launch time. |
| D12 | Renderer | Use xterm.js/node-pty in V1, but expose session-oriented rather than terminal-oriented behavior. |
| D13 | Code reuse | Build cleanly and port only useful, compatible utilities from Conductor with attribution. Do not inherit its session architecture. |

`workspace.workspaceFile` distinguishes saved workspace files from no-workspace
and untitled-workspace states, and `ExtensionContext.workspaceState` is scoped
to the currently opened workspace. These APIs support D2 and D4 without
writing configuration into the workspace file itself
(https://code.visualstudio.com/api/references/vscode-api, fetched 2026-08-23).

## 3. Architecture

### 3.1 Components

| Component | Responsibility |
|---|---|
| `WorkspaceModel` | Determine activation eligibility; expose the ordered root set; detect root-set changes. |
| `ConfigurationStore` | Load, validate, migrate, and save workspace-local default-root and directed-import settings. |
| `SessionLauncher` | Resolve the Claude executable, validate roots, construct arguments and environment, and create the PTY. |
| `SessionManager` | Own the live session registry, naming, launch order, restart, exit handling, and process-tree termination. |
| `SessionPanel` | Register the bottom-panel `WebviewView`; render session tabs and xterm surfaces; translate UI messages into extension commands. |
| `OutputChannel` | Record configuration, launch, skip, failure, and shutdown diagnostics for **Open Logs**. |

VS Code permits extension-contributed view containers in the Panel and permits
those views to be populated by a registered `WebviewView`. This is the host
surface selected above
(https://code.visualstudio.com/api/references/contribution-points, fetched
2026-08-23; https://code.visualstudio.com/api/references/vscode-api, fetched
2026-08-23).

### 3.2 Dependency boundary

The extension may vendor narrowly useful code from Conductor only after a
file-level review confirms the license, dependencies, tests, and assumptions.
Vendored files must retain required attribution. Conductor's terminal registry,
editor-tab lifecycle, Favorites/Recent Projects model, and external-session
adoption logic are not dependencies of this design.

## 4. Workspace configuration

### 4.1 State shape

```text
WorkspaceConfig := {
  schemaVersion: number
  configuredRoots: RootId[]
  defaultRootOverride?: RootId
  importsByRoot: Record<RootId, RootId[]>
}
```

`RootId` is a stable URI string derived from each `WorkspaceFolder.uri`, not
the user-facing folder name. Folder names are labels only and need not be
unique.

The initial `schemaVersion` is `1`. Invalid or unmigratable state is discarded,
safe defaults are saved, the setup popup reopens, and an error is logged.

### 4.2 Setup popup

The setup popup opens when:

1. no valid local configuration exists; or
2. the ordered set of workspace root URIs differs from `configuredRoots`.

It contains:

- a default-root override selector; and
- one expandable row per possible launch root, containing a checkbox for every
  other root.

The matrix is directed. For example, `infra -> backend` does not imply
`backend -> infra`. The diagonal is omitted because a session already owns its
launch root. Every newly introduced source-to-target pair defaults disabled.

Dismissal without saving stores these safe defaults:

- no explicit default override;
- first workspace folder used as the effective default; and
- every cross-root import disabled.

VS Code exposes `onDidChangeWorkspaceFolders` for reacting to folder-set
changes; the setup behavior above is extension-owned logic layered on that API
(https://code.visualstudio.com/api/references/vscode-api, fetched 2026-08-23).

## 5. Launch flow

### 5.1 Commands

- **New Session** — launch in the configured default root, falling back to the
  first available root with one warning.
- **New in Folder…** — choose an explicit workspace root. An unavailable
  explicit root fails instead of silently choosing another.
- **Restart Fresh** — terminate the selected session and launch a new session
  from the same root using the configuration current at restart time.
- **Close Session** — immediately terminate the selected process tree.
- **Previous Session / Next Session** — change the active tab.
- **Configure Workspace…** — reopen setup.

### 5.2 Executable resolution

The launcher uses the configured executable override when present; otherwise it
resolves `claude` through the extension host's `PATH`. Failure produces an
actionable notification and does not alter any other launch mechanism.

### 5.3 Directed imports

For a launch in source root `S`:

1. read `importsByRoot[S]`;
2. snapshot the selected targets for this launch;
3. validate each target independently;
4. skip unavailable targets;
5. show one aggregated warning when one or more targets were skipped; and
6. pass every surviving target as its own `--add-dir` argument.

Arguments are supplied as an argument array to the process API, never assembled
into a shell command string.

The current native precedent for sibling access is `--add-dir`, optionally
combined with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`; the prior-art
report documents the difference between CLI `--add-dir` and settings-based
additional directories
(`docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L29-L44`).

**Pre-implementation probe:** issue
https://github.com/glitchwerks/vscode-claude-conductor/issues/121 (fetched
2026-08-23) requires testing whether a novel `--add-dir` path causes an approval
prompt. That probe must be repeated for this standalone extension before the
mechanism is locked. If it prompts in a way incompatible with one-click launch,
the design returns to review; it must not silently substitute an access model
with different security semantics.

## 6. Session lifecycle

### 6.1 Registry

The registry contains only live processes spawned by `SessionLauncher`:

```text
ManagedSession := {
  id: string
  root: RootId
  displayName: string
  ordinalWithinRoot: number
  state: starting | running | closing
  launchedImports: RootId[]
  pty: ManagedPty
  launchedAt: timestamp
}
```

Names use the workspace-folder label plus a per-root sequence, such as
`backend 1`, `backend 2`. Tabs remain in launch order.

### 6.2 Exit semantics

- A natural process exit removes its tab.
- Closing a tab immediately terminates its process tree and removes the tab
  after termination is acknowledged.
- **Restart Fresh** closes the current process and creates a new session; it is
  not resume.
- Window close, reload, and extension deactivation initiate termination of all
  managed process trees.
- Configuration changes do not mutate live processes or their
  `launchedImports` snapshot.

No exited-session record, transcript, PTY attachment, or Claude session ID is
persisted in V1.

## 7. Panel behavior

The panel appears only when the extension has established that
`workspace.workspaceFile` uses the saved-file scheme. A custom context key
controls the contributed view and command visibility; VS Code contribution
points support `when` clauses for conditional visibility
(https://code.visualstudio.com/api/references/contribution-points, fetched
2026-08-23).

Visible product controls are limited to:

- New Session
- New in Folder…
- Close Session
- Restart Fresh
- Previous / Next Session
- Configure Workspace…

The renderer may still support basic copy, paste, selection, scrolling, resize,
and ANSI rendering because Claude's terminal UI requires them. They are input
and accessibility necessities, not separately promoted terminal features.

Excluded UI includes shell/profile selection, arbitrary command launch, split
terminals, terminal renaming, retained output tabs, reconnection, and resume.

## 8. Failures and user feedback

| Failure | Behavior |
|---|---|
| Missing/invalid Claude executable | Do not create a live tab; notify with **Configure Executable** and **Open Logs**. |
| Default root unavailable | Use first available root; warn once. |
| Explicit root unavailable | Abort that launch; notify with **Configure Workspace**. |
| One or more imported roots unavailable | Skip them, launch with survivors, and warn once with the skipped count. |
| PTY/process startup failure | Remove provisional tab; notify with **Retry** and **Open Logs**. |
| Immediate non-zero exit | Remove tab; notify with **Retry** and **Open Logs**. |
| Corrupt local configuration | Reset safely, log the cause, and reopen setup. |
| Process fails to terminate promptly | Keep state `closing`, log diagnostics, and escalate to process-tree termination. |

No failure in this extension changes or blocks external Claude launch paths.

## 9. V1 requirements

### Functional

- FR-1: The extension UI is available only in a saved `.code-workspace`, even
  when that workspace contains one folder.
- FR-2: Every current workspace folder is an automatic group member.
- FR-3: Configuration is local to the workspace and is not written into the
  `.code-workspace` file.
- FR-4: Setup appears on first use and on root-set changes.
- FR-5: Every directed import edge defaults disabled.
- FR-6: New Session resolves override → first available root.
- FR-7: New in Folder permits any available root.
- FR-8: Multiple sessions may run concurrently from the same root.
- FR-9: Sessions are named automatically and displayed in launch order.
- FR-10: Closing one tab terminates exactly its managed process tree.
- FR-11: Closing/reloading the window or deactivating the extension terminates
  every managed process tree.
- FR-12: Configuration edits affect future launches only.
- FR-13: Natural exit removes the tab.
- FR-14: Startup failure removes the tab and offers Retry/Open Logs.
- FR-15: External Claude sessions are never adopted or controlled.

### Non-functional

- NFR-1: Process arguments are structured, not shell-concatenated.
- NFR-2: Root validation cannot block session creation indefinitely; network
  and unavailable paths require bounded handling.
- NFR-3: Webview content uses a restrictive Content Security Policy and
  validates every message received by the extension host.
- NFR-4: Session ownership and termination behavior are testable behind a PTY
  abstraction rather than coupled directly to node-pty.
- NFR-5: The extension remains session-oriented so the renderer can later be
  replaced by a native Claude conversation UI without changing the workspace,
  configuration, or lifecycle model.

## 10. Testing strategy

### Unit tests

- workspace-file eligibility and root identity;
- configuration defaults, schema validation, migration, and root-set changes;
- directed import lookup, including asymmetric selections;
- default-root and explicit-root resolution;
- exact executable arguments and environment;
- session naming and launch ordering;
- close, restart, natural exit, startup failure, and terminate-all transitions;
- skipped-root aggregation; and
- webview-message schema validation.

### Extension-host tests

- panel and commands hidden without a saved `.code-workspace`;
- activation with saved one-root and multi-root workspace files;
- first-load and root-change setup behavior;
- multiple concurrent mocked PTYs;
- deactivation cleanup; and
- no interaction with terminals or Claude processes not owned by the extension.

### Manual acceptance

- Windows PTY rendering, resize, copy/paste, ANSI behavior, and process-tree
  termination;
- `--add-dir` approval-prompt probe from § 5.3;
- unavailable local and network roots;
- workspace reload with active sessions; and
- executable override containing spaces.

## 11. Deferred

- native chat-style rendering of messages, tools, approvals, and input;
- session persistence, resume, reconnect, or transcript history;
- group-level `CLAUDE.md` tier;
- guaranteed sibling skill discovery;
- tab grouping, drag reordering, or saved tab layouts;
- adoption of externally launched sessions;
- general-purpose terminal features; and
- operation outside saved `.code-workspace` windows.

## 12. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | xterm.js/node-pty can pull the product toward general terminal behavior. | Keep the public model and controls session-oriented; treat the renderer as replaceable. |
| R2 | Native node-pty packaging and process-tree termination differ by platform. | Isolate behind `ManagedPty`; test Windows explicitly; fail startup visibly. |
| R3 | `--add-dir` may prompt or change behavior across Claude releases. | Run the § 5.3 probe before implementation and maintain a launch-level regression test. |
| R4 | Workspace roots can be remote, unavailable, renamed, or reordered. | Use URI identity, detect root-set changes, validate at launch, and aggregate skips. |
| R5 | Vendoring Conductor code could import incompatible assumptions. | Review and port file-by-file; require attribution and local tests; never copy the session architecture wholesale. |
| R6 | Asynchronous extension deactivation may not await ordinary disposable cleanup. | Start termination on window/reload lifecycle signals and keep deactivation cleanup idempotent; verify behavior in Extension Host tests. The VS Code API notes that asynchronous disposable functions are not awaited (https://code.visualstudio.com/api/references/vscode-api, fetched 2026-08-23). |

## 13. Pre-implementation gates

No implementation is authorized by this spec. Before code begins:

1. Create the standalone GitHub repository.
2. Create a milestone for V1.
3. File issues for extension scaffold, workspace configuration, launch/PTY
   ownership, panel UI, and lifecycle/error handling.
4. Run and record the `--add-dir` approval-prompt probe.
5. Inspect any candidate Conductor files before deciding whether to vendor them.
6. Move this spec into the new repository's `docs/` taxonomy and replace its
   provisional component names with verified target paths.
7. Obtain explicit user approval before implementation, as required by the
   workspace issue-tracking policy.

## 14. Sources

- `docs/PROBLEM_STATEMENT.md:L1-L81` — original problem and capability set.
- `docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L29-L44` — native `--add-dir` findings.
- `docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L47-L72` — existing session UI prior art.
- https://code.visualstudio.com/api/references/vscode-api (fetched 2026-08-23) — `workspaceFile`, `workspaceFolders`, `onDidChangeWorkspaceFolders`, `ExtensionContext.workspaceState`, and `registerWebviewViewProvider`.
- https://code.visualstudio.com/api/references/contribution-points (fetched 2026-08-23) — Panel `viewsContainers`, `WebviewView`, and conditional `when` clauses.
- https://code.visualstudio.com/api/ux-guidelines/panel (fetched 2026-08-23) — Panel UX guidance.
- https://github.com/glitchwerks/vscode-claude-conductor/issues/121 (fetched 2026-08-23) — `--add-dir`/environment precedent and required prompting probe.
- https://github.com/glitchwerks/vscode-claude-conductor/issues/68 (fetched 2026-08-23) — existing Conductor terminal-close diagnostic; deliberately not a dependency of this design.
