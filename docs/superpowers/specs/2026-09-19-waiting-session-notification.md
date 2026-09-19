---
title: Waiting-session attention notification and window focus routing
touches:
  - src/sessions/sessionTypes.ts
  - src/sessions/sessionManager.ts
  - src/launch/sessionLaunch.ts
  - src/launch/launchPlanner.ts
  - src/launch/launchController.ts
  - src/launch/managedPty.ts
  - src/launch/nodePtyAdapter.ts
  - src/attention/**
  - src/panel/protocol.ts
  - src/panel/sessionPanelProvider.ts
  - src/extension.ts
  - resources/attention/**
  - package.json
  - README.md
  - test/unit/**
  - test/integration/**
  - test/support/fakeManagedPty.ts
skills_relevant:
  - powershell
  - hook-authoring
  - test-driven-development
  - simplicity-first
---

# Waiting-Session Attention Notification — Design

**Status:** Draft — awaiting user decisions D5, D6, D8, D9, D10 and Phase 0 gate results

**Issue:** [#51](https://github.com/glitchwerks/vscode-claude-workspaces/issues/51) (milestone 0.7.0)

**Coordinates with:** [#109](https://github.com/glitchwerks/vscode-claude-workspaces/issues/109) (per-tab activity indicator, open, milestone 0.7.0), [#113](https://github.com/glitchwerks/vscode-claude-workspaces/issues/113) (aggregate panel badge, open, milestone 0.7.0)

**Research basis:** `docs/research/2026-09-19-waiting-session-notification-window-focus.md`

---

## 1. Overview

When a managed Claude session blocks waiting for the user, and the VS Code window that owns that session is not focused, the extension raises a native Windows notification naming the workspace and session. Selecting the notification brings the user back to that exact session.

This document establishes three things that outlive the feature itself:

1. **The waiting-state definition and its state machine** — the contract #109 and #113 are both blocked on (#109 "Coordinate the state model with #51 so working and waiting-for-input detection share a coherent lifecycle signal"; #113 "Waiting-state detection remains owned by #51").
2. **A structured detection channel** replacing terminal-text matching, which both #51 and #109 explicitly discourage and which has no precedent in this codebase — `src/panel/sessionPanelProvider.ts:376-391` consumes `SessionDataEvent` with no semantic parsing anywhere.
3. **An honest boundary on window foregrounding**, which external research shows is not solved for unpackaged Win32 apps.

---

## 2. Problem Statement

A user running several Claude sessions across several VS Code windows has no way to learn that one of them is blocked without visiting each window and each tab. The cost is unbounded idle time on a blocked agent.

The extension today notifies only on failure — `LaunchController.notify()` (`src/launch/launchController.ts:324-355`) handles exactly the three `SessionNotification` kinds defined at `src/sessions/sessionTypes.ts:26-38` (`startup-failed`, `immediate-nonzero-exit`, `unexpected-nonzero-exit`), and every one of them surfaces through `showWarningMessage` / `showErrorMessage`. There is no OS-level notification path anywhere in `src/`, and no concept of a session being "busy" or "blocked" — `SessionState` is `"starting" | "running" | "closing"` (`src/sessions/sessionTypes.ts:5`).

---

## 3. Goals & Success Criteria

Restating #51's acceptance criteria as testable goals, with the one revision the research forces:

| # | Criterion | Status |
|---|---|---|
| G1 | A reliable waiting-for-input signal triggers an attention notification | Design below, §5 |
| G2 | An unfocused or minimized owning window produces a native Windows notification | Design below, §8 |
| G3 | The notification identifies the workspace and session | Design below, §8.3 |
| G4 | Selecting the notification restores and focuses the owning window | **At risk** — see §9, gated on Phase 0 spike |
| G5 | Selecting the notification reveals Claude Workspaces and activates the correct session | Design below, §10 |
| G6 | Multiple windows route notifications to the owning window | Design below, §6 — dissolved, not solved |
| G7 | Repeated output does not duplicate notifications for one wait state | Design below, §7 |
| G8 | A focused owning window receives no redundant Windows notification | Design below, §8.1 |
| G9 | Detection, dedup, focus routing, multi-window behavior have automated tests | **Partially** — see §12 |
| G10 | Windows-specific behavior and user-facing config documented | Design below, §13 |

---

## 4. Scope

### In Scope

- Waiting-state detection for sessions this extension launched, on Windows.
- The `activity` state model and its publication to the webview — the shared contract for #109 and #113.
- Native Windows notification emission, dedup, and focused-window suppression.
- Panel reveal and session activation on notification selection.
- A timeboxed spike on true window foregrounding, with a defined fallback.

### Out of Scope

- Notifications for terminal processes this extension did not launch (#51).
- Native notifications on non-Windows platforms (#51).
- The aggregate panel badge (#113) and the per-tab indicator (#109) — both *consume* the `activity` field this spec defines; neither is built here.
- Mutating the user's `~/.claude/settings.json` — see D1, this design deliberately avoids it.

---

## 5. Detection: Claude Code hooks, scoped per-invocation

### D1 — Deliver hooks through `--settings <file>`, never through the user's settings files

Claude Code's `Notification` hook supports a matcher on notification type, and the documented values include `permission_prompt`, `idle_prompt`, `agent_needs_input`, `elicitation_dialog`, and `agent_completed` (https://code.claude.com/docs/en/hooks, fetched 2026-09-19). These are precisely the blocked-on-user conditions #51 needs, and they are structured events rather than rendered text.

The reference implementation installs its hooks into `~/.claude/settings.json` (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L31`). **This extension must not**, for a concrete reason: the user's `~/.claude/settings.json` already carries a large hook configuration spanning `PreToolUse`, `UserPromptSubmit`, `Notification` (including an existing `idle_prompt` matcher), and `Stop` (structural keys observed at `C:\Users\chris\.claude\settings.json:151-515`). Any install/uninstall cycle against that file risks clobbering it.

That is avoidable here in a way it was not for the reference implementation, because **this extension builds its own argv**. `src/launch/sessionLaunch.ts:14-19` (`prependSessionArgument`) is the existing, tested seam that prefixes `--session-id` / `--resume` onto a frozen `LaunchSpec`. The same seam prefixes `--settings <path>`.

The settings documentation establishes that this is safe (https://code.claude.com/docs/en/settings, fetched 2026-09-19):

- `--settings` accepts "a key as JSON, inline or as a path to a file. Claude Code applies it above your user, project, and local files and below managed settings."
- "Claude Code merges JSON you pass with `--settings <file-or-json>` with your settings files by the same rules as the other levels: it takes a key you set here over the same key in local, project, or user settings, and keeps the lower-level value for a key you omit."
- Under *Lists merge instead of overriding*: "When you set the same list key… in more than one file, Claude Code combines the lists instead of picking one, so each file can add entries without removing another file's." Four keys are named as exceptions — `fallbackModel`, `modelPicker`, `availableModels`, `modelSettings`. `hooks` is not among them.
- "`--settings` lasts one session and doesn't write to any file."

So the extension's hooks are additive, ephemeral, and scoped to managed sessions only. The user's own hooks continue to fire.

> **Caveat — this is inference from a general rule, not an explicit statement about `hooks`.** The docs do not enumerate `hooks` as a merging list key; the conclusion follows from the general list-merge rule plus the exhaustive exception list. **Phase 0 Gate 1 must confirm it empirically** by observing that one of the user's existing `Notification` hooks still fires in a managed session alongside the extension's. If merge turns out to be replacement, fall back to D1-alt below.

**D1-alt (contingency):** merge-and-install into `~/.claude/settings.json` behind an explicit opt-in setting, with a documented uninstall command and a backup written before first mutation. Materially worse; only if Gate 1 falsifies the merge behavior.

### Load-bearing constraint: `--settings` must receive a *file path*, not inline JSON

On Windows the resolved Claude executable is commonly `claude.cmd`, which routes through `createWindowsCommandScriptInvocation` (`src/launch/nodePtyAdapter.ts:62-65`). That function calls `assertSafeCommandScriptValue` on every argument, which **throws `WindowsCommandScriptArgumentError` for any value containing a `"` character** (`src/launch/windowsCommandScriptInvocation.ts:39-41`, `:77-80`). Inline JSON necessarily contains quotes, so `--settings '{"hooks":…}'` would fail every `.cmd`-based launch.

The extension therefore writes a hook-settings JSON file into its own extension storage once per activation and passes its path. A test must cover the `.cmd` branch specifically.

### D2 — Which events mean what

| Hook event / matcher | Meaning | Proposed `activity` transition |
|---|---|---|
| `UserPromptSubmit` | user submitted a prompt | → `working` |
| `PreToolUse` / `PostToolUse` | agent is executing | (no transition; already `working`) |
| `Notification` : `permission_prompt` | permission decision blocks the turn | → `waiting` |
| `Notification` : `agent_needs_input` | agent is asking the user | → `waiting` |
| `Notification` : `elicitation_dialog` | elicitation dialog blocks the turn | → `waiting` |
| `Notification` : `idle_prompt` | session idle at the prompt | → `waiting` **(D5 — open)** |
| `Stop` | Claude finished responding | → `idle` **(D5 — open)** |
| `SessionEnd` | session terminated | → `idle`, clear channel state |

All matcher values above are quoted from the `Notification` matcher table at https://code.claude.com/docs/en/hooks (fetched 2026-09-19). `Stop` is documented there as "When Claude finishes responding."

---

## 6. Session correlation and window ownership

### D3 — Inject a per-session channel through the PTY environment

The documentation states plainly: "A hook process inherits the parent environment, apart from the `OTEL_*` exporter variables… and, when `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is set to `1`, the variables it strips" (https://code.claude.com/docs/en/hooks, fetched 2026-09-19).

This extension spawns the PTY and owns its environment (`src/launch/nodePtyAdapter.ts:61`, `terminalEnvironment()` at `:80-92`). It therefore injects two variables the hook script reads:

- `CLAUDE_WORKSPACES_ATTENTION_CHANNEL` — absolute path to a directory minted by **this extension host instance** at activation.
- `CLAUDE_WORKSPACES_SESSION_ID` — the managed session id created at `src/sessions/sessionManager.ts:85`.

**This dissolves G6 rather than solving it.** Only the extension host that minted the channel directory knows the path, and it passes the path only to PTYs it owns. Each window watches exactly one directory — its own — so a signal is structurally unable to reach the wrong window. No window-to-window IPC, and no shared registry, is required.

This is strictly better than the reference implementation's `sha1(workspaceRoot)` directory scheme (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L32`), which cannot disambiguate two VS Code windows opened on the same folder. That codebase had no choice — it does not spawn `claude` and cannot set its environment. This one does.

### Plumbing obstacles (both real, both must be planned for)

1. **The session id is not reachable from the spawn call.** `SessionManager.launch()` mints the id at `src/sessions/sessionManager.ts:85` but calls `this.dependencies.ptyFactory.spawn(spec)` at `:126`, and `ManagedPtyFactory.spawn` takes only the spec (`src/launch/nodePtyAdapter.ts:52`). `LaunchSpec.env` is frozen by the planner (`src/launch/launchPlanner.ts:139`, `:192`). The id must be threaded into the spec — the `sessionLaunch.ts:14-19` pattern extends naturally to an env overlay — or the `spawn` signature widened. Either choice touches `launchPlanner.ts`, `managedPty.ts`, `nodePtyAdapter.ts`, `test/support/fakeManagedPty.ts`, and the corresponding unit tests.

2. **There are two environment paths, and a name-reservation collision hazard.** The command-script path spreads the environment (`src/launch/windowsCommandScriptInvocation.ts:64-67`), so an injected variable does survive it — *provided* injection happens before `createWindowsCommandScriptInvocation` is called at `src/launch/nodePtyAdapter.ts:62-65`. But that function also reserves names by prefix collision-avoidance against `CLAUDE_WORKSPACES_COMMAND_SCRIPT` and `CLAUDE_WORKSPACES_COMMAND_ARG_<n>` (`:42-53`, `:83-95`). The chosen variable names must not collide, and a test must assert both the direct and `.cmd` branches carry them.

**Known risk:** if the user sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, the injected variables may be stripped and detection silently dies. The exact strip list was not retrievable (the env-vars reference page did not contain an entry for this variable when fetched 2026-09-19). The hook script must fail loudly into the extension's Output channel rather than silently, and the README must name this variable.

**Alternative considered and not chosen:** the hook payload carries Claude's own `session_id`, and the extension already passes `--session-id <uuid>` (`src/launch/sessionLaunch.ts:5`). But that only happens when the capability probe confirms support (`src/launch/claudeCapabilities.ts:44-45`); sessions on older CLIs would get no correlation at all. Env injection is unconditional. Claude's `session_id` should still be recorded in the signal as a cross-check.

---

## 7. Deduplication

### D4 — Stage-scoped dedup, keyed on the session

A "stage" is one contiguous wait. The extension fires at most one notification per stage.

- A stage opens on the first `waiting` transition for a session and stays open until the session leaves `waiting`.
- A session leaves `waiting` on `UserPromptSubmit` (user responded), on `SessionEnd`, or on the session being closed or removed (`src/sessions/sessionManager.ts:390-402`).
- Repeated `Notification` signals inside an open stage update the stage's payload but do not re-notify. This satisfies G7 directly, and is structurally immune to the "repeated output" failure mode in #51's wording because the design never reads output at all.

The reference implementation's `O_EXCL` atomic-claim race (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L33`) exists to arbitrate between its hook process and its extension, both of which may notify. **It is not needed here**: in this design the hook only writes a signal and the extension is the sole notifier. Adopting the race would be borrowed complexity. *(Flagged because the research report recommends the pattern; the deviation is deliberate.)*

**D8 — open:** should dedup be keyed per-session, or per (session, notification type)? Per-session means a permission prompt followed by a distinct agent question inside the same block produces one notification. Recommendation: per-session, with the payload updated in place — fewer interruptions, and the user lands on the right session either way.

---

## 8. State model — the #109 / #113 contract

### D5 — An orthogonal `activity` field, not a widened `SessionState`

`SessionState` (`src/sessions/sessionTypes.ts:5`) stays `"starting" | "running" | "closing"`. A new orthogonal field is added to `ManagedSessionSnapshot` (`src/sessions/sessionTypes.ts:7-19`):

```ts
export type SessionActivity = "idle" | "working" | "waiting";
```

The clinching argument is #113's own acceptance criterion: *"Working, starting, closing, and inactive sessions are not counted as waiting."* With an orthogonal field that rule is one expression — `state === "running" && activity === "waiting"`. With a widened union, `closing`-while-`waiting` becomes unrepresentable, and every exhaustive check over `SessionState` in the codebase changes.

**This is the deliverable #109 and #113 are waiting on.** Both should be unblocked by the phase that lands this field, before the notification machinery exists.

### Webview boundary

The field crosses into the webview. `ManagedSessionSnapshot` is transported directly in `src/panel/protocol.ts:46`, `:52-53`, and the runtime validator `isSession` at `:260-282` hard-codes both the required-key list and the three literal state values. Adding `activity` requires updating that validator and its tests, plus the renderer surfaces #109 will build on.

### 8.1 Focused-window suppression (G8)

The extension suppresses the native notification when its own window is focused, using `vscode.window.state.focused` and `onDidChangeWindowState`. A session that enters `waiting` while the window is focused opens a stage but emits no toast; if the window later loses focus while the stage is still open, **D9 — open:** does the notification fire on blur, or is the stage considered already-seen? Recommendation: do not fire on blur. The user was present when the wait began.

### 8.3 Notification content (G3)

`ManagedSessionSnapshot` already carries `displayName`, `launchedRootLabel`, and `launchedRootPath` (`src/sessions/sessionTypes.ts:7-19`) — sufficient to identify both workspace and session with no new data.

---

## 9. Window foregrounding (G4) — the at-risk criterion

External research found no prior art for foregrounding a specific unfocused VS Code window from a Windows toast click, and one shipped extension that instrumented the attempt and documented every technique failing (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L86`). The reconciling fact is identity class, not luck: Claude Desktop and ChatGPT Desktop foreground reliably because they ship with MSIX package identity and a registered `ToastActivatorCLSID`, a Windows-managed activation path unavailable to unpackaged `Code.exe` or anything inside the extension-host sandbox (`:L105`, `:L107-L109`, `:L115`).

One concrete sequence remains untried: a dummy keystroke delivered to the toast-activated launcher's own window to manufacture "received last input" eligibility, then `AllowSetForegroundWindow(Code.exe PID)` from that eligible process, then signaling `Code.exe` to raise itself. The reference implementation tried the `AttachThreadInput`/alt-tap variant, which is a different sequence (`:L113`).

**Per the user's standing decision, this is timeboxed as Phase 0 Gate 2 with an explicit go/no-go.** If it fails inside the timebox, the fallback is a taskbar flash and G4's wording is revised at that point — not silently dropped. Critically, the fallback still satisfies G5: the reveal-and-activate logic runs independently of the foreground attempt, so when the user clicks the flashing taskbar button the correct session is already selected (`:L86`).

**D6 — open, and ordered after the spike:** the toast-emission mechanism (bundled SnoreToast-style helper, PowerShell WinRT script, or a purpose-built launcher) must be chosen *after* Gate 2, because the Chromium-style sequence requires a process that owns a window, and committing to a third-party toast library's click-callback protocol first could foreclose the only sequence the spike exists to test. Note that packaging a native helper is not a new class of problem here — the VSIX already ships platform-specific binaries and is already built `--target win32-x64` (`package.json:45-48`).

---

## 10. Activation: reveal and activate (G5)

On notification selection the extension reveals the Sessions view and activates the target session. `SessionManager.activate(id)` (`src/sessions/sessionManager.ts:331-337`) and `SessionPanelActions.selectSession` (`src/panel/sessionPanelProvider.ts:40`) are the existing entry points; `src/extension.ts:326` already wires the latter to the former.

No reveal helper exists. The view is a webview view in the panel container (`package.json:120-138`), so `claudeWorkspaces.sessions.focus` — the command VS Code auto-generates for contributed views — is the expected path. *Verify in Phase 0; it is convention, not a documented guarantee.*

**Boundary:** the view is gated `"when": "claudeWorkspaces.savedWorkspace"` (`package.json:135`). If that context key is false, the focus command silently does nothing. **D10 — open:** what should selecting a notification do in that state? Recommendation: fall back to `showWarningMessage` naming the session, rather than a silent no-op.

---

## 11. Assumptions & Constraints

1. **Windows only.** Non-Windows hosts no-op with no toast and no error. Packaging is already `win32-x64`-only (`package.json:45-48`).
2. **`extensionKind: ["workspace"]`** (`package.json:29-31`). Under Remote-SSH, WSL, or devcontainers the extension host is not on the Windows desktop, cannot see the local `~/.claude` tree, and cannot emit a toast. **This must be an explicit, documented no-op**, detected and logged — not undefined behavior.
3. Detection depends on a Claude Code version whose `Notification` matcher values match those fetched 2026-09-19. Unknown matcher values must be ignored, not crash.
4. Hook scripts run as child processes of `claude` and must be fast and side-effect-free beyond writing their signal.
5. **Stale channel state has an owner.** If the extension host dies, its channel directory leaks and later hook writes land in an unwatched directory. Cleanup on activation (remove channel directories whose owning host is gone) is in scope for this feature, not deferred.

---

## 12. Testing strategy (G9)

| Layer | Coverage | Mechanism |
|---|---|---|
| Hook-settings file composition | schema, path-not-inline-JSON, `.cmd` branch safety | unit |
| Env injection | both `nodePtyAdapter` branches, name-collision with reserved `CLAUDE_WORKSPACES_COMMAND_*` | unit |
| Signal ingestion | malformed/partial/unknown-type signals, unknown session ids | unit |
| State machine | every transition in §5 D2, including out-of-order and duplicate events | unit |
| Dedup | repeated signals in one stage, stage close/reopen, close-while-waiting | unit |
| Focus suppression | focused vs unfocused, blur during open stage | unit, injected window-state boundary |
| Routing | a signal addressed to another host's channel is never ingested | unit |
| Reveal + activate | activation resolves to the right session id | integration |

**G9 carries an honest limitation.** `vscode-test` runs a single window (`package.json:43`), so genuine multi-window routing cannot be asserted in CI. What *is* CI-testable is the routing layer's decision logic — that a host ingests only its own channel. End-to-end multi-window behavior, hook firing under node-pty, and toast click-through require a **manual runbook**, which is a deliverable of this work. The plan must not imply CI coverage it cannot deliver.

---

## 13. Documentation & configuration (G10)

- `README.md`: Windows-only behavior, what "waiting" means, the remote-host no-op, and the `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` interaction.
- New settings under `claudeWorkspaces.*` (`package.json:139-157`): at minimum an enable/disable toggle. **D11 — open:** should `idle_prompt` escalation be separately configurable?
- If Gate 2 fails, document the taskbar-flash behavior and *why*, so it does not read as a bug.

---

## 14. Open Questions

| ID | Question | Recommendation | Blocks |
|---|---|---|---|
| D5 | Does "waiting" include turn-complete (`Stop`) and `idle_prompt`, or only blocked-on-prompt? | Blocked-on-prompt only; `Stop` → `idle`. Counting every finished turn as "waiting" would make #113's badge show nearly every session. **Note this deliberately narrows #51's plain reading** — the issue title "waiting for user input" reads naturally as including a finished turn. The recommendation trades that breadth for signal quality; the user is deciding scope here, not just picking a signal set. | Phase 1 — the #109/#113 contract |
| D6 | Toast emission mechanism | Defer until after Gate 2 | Phase 4 |
| D8 | Dedup key: per-session, or per (session, notification type)? | Per-session | Phase 3 |
| D9 | Fire on blur if a stage opened while focused? | No | Phase 4 |
| D10 | Notification selected while `claudeWorkspaces.savedWorkspace` is false | `showWarningMessage` fallback | Phase 5 |
| D11 | Separate config for `idle_prompt` escalation? | Yes if D5 excludes it | Phase 6 |
| D12 | If Gate 1 shows `--settings` *replaces* rather than merges hooks, accept D1-alt (opt-in mutation of `~/.claude/settings.json`) or descope detection? | Decide only if Gate 1 fails | Phase 0 |

---

## 15. Stakeholders

- **User (@cbeaulieu-gt)** — owns D5, D6, D8–D12, and the Gate 2 go/no-go.
- **#109 and #113** — consumers of the §8 `activity` contract; both should be unblocked by Phase 1.
