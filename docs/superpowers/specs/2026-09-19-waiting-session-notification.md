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
  - src/launch/claudeCapabilities.ts
  - src/attention/**
  - src/panel/protocol.ts
  - src/panel/sessionPanelProvider.ts
  - src/extension.ts
  - media/attention/**
  - package.json
  - README.md
  - test/unit/**
  - test/unit/claudeCapabilities.test.ts
  - test/integration/**
  - test/support/fakeManagedPty.ts
skills_relevant:
  - powershell
  - hook-authoring
  - test-driven-development
  - simplicity-first
---

# Waiting-Session Attention Notification — Design

**Status:** Draft — D5, D8, D9, D10, D11 decided by the user 2026-09-19 (see §14). D6 and D12 remain open, gated on Phase 0 (Gate 2 and Gate 1 respectively). Phase 0 gate results still outstanding.

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

### Injection site: threading `--settings` into `LaunchController`

`planNewClaudeSession` and `planResumedClaudeSession` are pure functions (`src/launch/sessionLaunch.ts`); nothing yet threads the hook-settings path from extension activation, where it is minted once, to either call site. `LaunchController.launchNewPlan()` calls `planNewClaudeSession` conditionally today — `const spec = claudeSessionId === undefined ? plan : planNewClaudeSession(plan, claudeSessionId);` (`src/launch/launchController.ts:62-65`) — and the resumed-session path calls `planResumedClaudeSession(plan, claudeSessionId)` unconditionally at `src/launch/launchController.ts:178`.

The fix adds a `hooksSettingsPath: () => string | undefined` entry to `LaunchControllerDependencies` (`src/launch/launchController.ts:16-30`), matching the shape of the existing `executable: () => string | undefined` and `createClaudeSessionId: () => string` entries in that same interface (`:19`, `:26`). This keeps `planNewClaudeSession`'s own signature narrow — the conditional lives in the call sites, not the pure planner. `hooksSettingsPath()` returns `undefined` when the capability probe (see the new `--settings` probe below) reports no support for the running executable, and a real path otherwise. Both `launchNewPlan` (`:61-65`) and the resume path (`:178`) must consult it before deciding whether to pass the hook-settings path through, mirroring the existing `claudeSessionId === undefined` conditional already in `launchNewPlan`.

### D2 — Which events mean what

| Hook event / matcher | Meaning | Proposed `activity` transition |
|---|---|---|
| `UserPromptSubmit` | user submitted a prompt | → `working` |
| `PreToolUse` / `PostToolUse` | agent is executing | (no transition; already `working`) |
| `Notification` : `permission_prompt` | permission decision blocks the turn | → `waiting` |
| `Notification` : `agent_needs_input` | agent is asking the user | → `waiting` |
| `Notification` : `elicitation_dialog` | elicitation dialog blocks the turn | → `waiting` |
| `Notification` : `idle_prompt` | session idle at the prompt | → `idle` — not a waiting trigger **(D5 — decided 2026-09-19)** |
| `Stop` | Claude finished responding | → `idle` **(D5 — decided 2026-09-19)** |
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

**The channel directory name itself must be collision-safe, or the "strictly better" claim above does not hold.** The directory is named using a randomly generated UUID minted fresh at each extension host activation — never derived from the workspace path, window title, or any other deterministic or reproducible input. A workspace-derived deterministic name would reintroduce exactly the `sha1(workspaceRoot)` collision this design exists to avoid: two extension hosts opened on the same workspace folder would mint the same directory name and collide, even though each host still only watches "its own" directory by construction. A random UUID per activation guarantees two hosts can never collide, including on the same workspace folder opened twice.

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

**D8 — decided 2026-09-19: per-session.** A permission prompt followed by a distinct agent question inside the same block produces one notification, with the payload updated in place — fewer interruptions, and the user lands on the right session either way. Confirms the recommendation above.

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

The extension suppresses the native notification when its own window is focused, using `vscode.window.state.focused` and `onDidChangeWindowState`. A session that enters `waiting` while the window is focused opens a stage but emits no toast; if the window later loses focus while the stage is still open, **D9 — decided 2026-09-19: no.** The notification does not fire on blur; the stage is considered already-seen. The user was present when the wait began.

### 8.2 The `SessionManager.setActivity` seam (Phase 3 → Phase 1 contract)

Phase 1 (this section) ships the `activity` field and its type contract on `SessionManager`. Phase 3 builds `src/attention/**` — the channel-directory watcher that ingests hook signals and drives `activity` transitions per the §5 D2 table. Something must specify how Phase 3 pushes a state change into Phase 1's data: `SessionManager` gains a new method,

```ts
setActivity(id: SessionId, activity: SessionActivity): void
```

directly analogous to the existing `rename(id: SessionId, displayName: string): void` (`src/sessions/sessionManager.ts:340-352`): look up the record by id, no-op if the session is not found or the activity value is unchanged (a signal arriving for an already-closed session must not throw), update the field on the immutable snapshot, and republish through `publishSessions()` (`:472-478`), the same path `rename` and `activate` (`:331-337`) already use.

**Constraint: `src/attention/**` must depend only on `SessionManager`, never on `LaunchController`.** `setActivity` is the entire interface the watcher needs. If the watcher must react to session lifecycle (for example, clearing channel state when a session closes), it does so by subscribing to `SessionManager`'s existing `onDidChangeSessions: vscode.Event<readonly ManagedSessionSnapshot[]>` (`src/sessions/sessionManager.ts:51`), not by adding a new dependency edge into the launch layer.

### 8.3 Notification content (G3)

`ManagedSessionSnapshot` already carries `displayName`, `launchedRootLabel`, and `launchedRootPath` (`src/sessions/sessionTypes.ts:7-19`) — sufficient to identify both workspace and session with no new data.

---

## 9. Window foregrounding (G4) — the at-risk criterion

External research found no prior art for foregrounding a specific unfocused VS Code window from a Windows toast click, and one shipped extension that instrumented the attempt and documented every technique failing (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L86`). The reconciling fact is identity class, not luck: Claude Desktop and ChatGPT Desktop foreground reliably because they ship with MSIX package identity and a registered `ToastActivatorCLSID`, a Windows-managed activation path unavailable to unpackaged `Code.exe` or anything inside the extension-host sandbox (`:L105`, `:L107-L109`, `:L115`).

One concrete sequence remains untried: a dummy keystroke delivered to the toast-activated launcher's own window to manufacture "received last input" eligibility, then `AllowSetForegroundWindow(Code.exe PID)` from that eligible process, then signaling `Code.exe` to raise itself. The reference implementation tried the `AttachThreadInput`/alt-tap variant, which is a different sequence (`:L113`).

**Per the user's standing decision, this is timeboxed as Phase 0 Gate 2 with an explicit go/no-go.** If it fails inside the timebox, the fallback is a taskbar flash and G4's wording is revised at that point — not silently dropped. Critically, the fallback still satisfies G5: the reveal-and-activate logic runs independently of the foreground attempt, so when the user clicks the flashing taskbar button the correct session is already selected (`:L86`).

**D6 — open, and ordered after the spike:** the toast-emission mechanism (bundled SnoreToast-style helper, PowerShell WinRT script, or a purpose-built launcher) must be chosen *after* Gate 2, because the Chromium-style sequence requires a process that owns a window, and committing to a third-party toast library's click-callback protocol first could foreclose the only sequence the spike exists to test. Note that packaging a native helper is not a new class of problem here — the VSIX is already packaged and published `--target win32-x64` (`package.json:45-48`, the `package:stable`/`package:prerelease`/`publish:*` scripts).

---

## 10. Activation: reveal and activate (G5)

On notification selection the extension reveals the Sessions view and activates the target session. `SessionManager.activate(id)` (`src/sessions/sessionManager.ts:331-337`) and `SessionPanelActions.selectSession` (`src/panel/sessionPanelProvider.ts:40`) are the existing entry points; `src/extension.ts:326` already wires the latter to the former.

No reveal helper exists. The view is a webview view in the panel container (`package.json:120-138`), so `claudeWorkspaces.sessions.focus` — the command VS Code auto-generates for contributed views — is the expected path. *Verify in Phase 0; it is convention, not a documented guarantee.*

**Boundary:** the view is gated `"when": "claudeWorkspaces.savedWorkspace"` (`package.json:135`). If that context key is false, the focus command silently does nothing. **D10 — decided 2026-09-19:** selecting a notification in that state falls back to `showWarningMessage` naming the session, rather than a silent no-op.

---

## 11. Assumptions & Constraints

1. **Windows only.** Non-Windows hosts no-op with no toast and no error. Packaging is already `win32-x64`-only (`package.json:45-48`).
2. **`extensionKind: ["workspace"]`** (`package.json:29-31`). Under Remote-SSH, WSL, or devcontainers the extension host is not on the Windows desktop, cannot see the local `~/.claude` tree, and cannot emit a toast. **This must be an explicit, documented no-op**, detected and logged — not undefined behavior.
3. Detection depends on a Claude Code version whose `Notification` matcher values match those fetched 2026-09-19. Unknown matcher values must be ignored, not crash.
4. Hook scripts run as child processes of `claude` and must be fast and side-effect-free beyond writing their signal.
5. **Stale channel state has an owner.** If the extension host dies, its channel directory leaks and later hook writes land in an unwatched directory. Cleanup on activation (remove channel directories whose owning host is gone) is in scope for this feature, not deferred.

   **Host-crash / channel-deletion race.** Cleanup runs at activation, but if a host crashes mid-session while its PTY child process (and Claude subprocess) survive, the *next* activation's cleanup can delete the channel directory a still-running orphaned PTY's hook scripts are actively writing to — signals become permanently unroutable with no error surfaced anywhere. This is the same "fail loudly" requirement already established for `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` stripping the channel env vars (§6, above): the hook script must detect and log a diagnosable error — to the extension's Output channel, or a fallback log location the README documents — when its target channel path does not exist or is not a directory at write time, rather than silently succeeding or no-op'ing on a deleted path.

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
- New settings under `claudeWorkspaces.*` (`package.json:139-157`): at minimum an enable/disable toggle. **D11 — superseded 2026-09-19 by D5:** not applicable. D5 excludes `idle_prompt` from "waiting" entirely (§5 D2 table), so there is no `idle_prompt` escalation behavior left to make separately configurable.
- If Gate 2 fails, document the taskbar-flash behavior and *why*, so it does not read as a bug.

---

## 14. Open Questions

| ID | Question | Recommendation | Status | Blocks |
|---|---|---|---|---|
| D5 | Does "waiting" include turn-complete (`Stop`) and `idle_prompt`, or only blocked-on-prompt? | Blocked-on-prompt only; `Stop` → `idle`. Counting every finished turn as "waiting" would make #113's badge show nearly every session. **Note this deliberately narrows #51's plain reading** — the issue title "waiting for user input" reads naturally as including a finished turn. The recommendation trades that breadth for signal quality; the user is deciding scope here, not just picking a signal set. | **Decided 2026-09-19** — blocked-on-prompt only, confirming the recommendation. Both `idle_prompt` and `Stop` transition to `idle` (§5 D2 table). | Phase 1 — the #109/#113 contract; now unblocked |
| D6 | Toast emission mechanism | Defer until after Gate 2 | **Open** — deferred behind Gate 2 per the user's standing decision | Phase 4 |
| D8 | Dedup key: per-session, or per (session, notification type)? | Per-session | **Decided 2026-09-19** — per-session, confirming the recommendation (§7) | Phase 3 — now unblocked |
| D9 | Fire on blur if a stage opened while focused? | No | **Decided 2026-09-19** — no, confirming the recommendation (§8.1) | Phase 4 |
| D10 | Notification selected while `claudeWorkspaces.savedWorkspace` is false | `showWarningMessage` fallback | **Decided 2026-09-19** — `showWarningMessage` fallback, confirming the recommendation (§10) | Phase 5 — now unblocked |
| D11 | Separate config for `idle_prompt` escalation? | Yes if D5 excludes it | **Superseded 2026-09-19 by D5** — not applicable; `idle_prompt` is not a "waiting" trigger under the D5 decision, so no separate escalation setting is needed (§13) | Phase 6 — moot, no longer blocks |
| D12 | If Gate 1 shows `--settings` *replaces* rather than merges hooks, accept D1-alt (opt-in mutation of `~/.claude/settings.json`) or descope detection? | Decide only if Gate 1 fails | **Open** — contingent on Phase 0 Gate 1 results | Phase 0 |

---

## 15. Stakeholders

- **User (@cbeaulieu-gt)** — decided D5, D8, D9, D10, D11 on 2026-09-19 (§14); owns the remaining open items D6 and D12, and the Gate 2 go/no-go.
- **#109 and #113** — consumers of the §8 `activity` contract; both should be unblocked by Phase 1.
