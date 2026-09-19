# Waiting-Session Attention Notification — Implementation Plan

**Issue:** [#51](https://github.com/glitchwerks/vscode-claude-workspaces/issues/51) (milestone 0.7.0)
**Spec:** `docs/superpowers/specs/2026-09-19-waiting-session-notification.md`
**Research:** `docs/research/2026-09-19-waiting-session-notification-window-focus.md`
**Coordinates with:** #109 (per-tab activity indicator), #113 (aggregate panel badge) — both open, both milestone 0.7.0

---

## 1. Overview

Six phases, front-loaded with two kill-or-cure gates.

The ordering is deliberate and differs from the issue's narrative order. **Phase 0 Gate 1 (do hooks work at all here?) precedes the window-focus spike**, because the focus spike only affects the wording of one acceptance criterion, whereas a hook failure invalidates the entire detection design. The research report itself flags hook behaviour under node-pty as unverified (`docs/research/2026-09-19-waiting-session-notification-window-focus.md:L97`).

**Phase 1 ships the `activity` state contract on its own, before any notification machinery.** That is what unblocks #109 and #113, and it is independently valuable even if later phases slip past 0.7.0.

Every phase follows the repo's test-first convention: tests are written and observed failing before implementation.

---

## 2. Phases & Milestones

| Phase | Goal | Entry criteria | Exit criteria |
|---|---|---|---|
| **0** | Prove the two load-bearing unknowns | Spec reviewed | Gate 1 and Gate 2 both resolved and recorded in the issue |
| **1** | `activity` state contract | Gate 1 passed; D5 decided (blocked-on-prompt only, 2026-09-19) | Field published to webview; #109/#113 unblocked |
| **2** | Env injection + channel plumbing | Phase 1 merged | Both PTY branches carry the channel vars, proven by test |
| **3** | Hook script, signal ingestion, dedup | Phase 2 merged; D8 decided (per-session, 2026-09-19) | Waiting state driven end-to-end by real hooks |
| **4** | Notification emission + focus suppression | Phase 3 merged; D9 decided (no fire-on-blur, 2026-09-19); D6 still open, gated on Gate 2 | Native toast on unfocused window; silent when focused |
| **5** | Click routing: reveal + activate | Phase 4 merged; D10 decided (`showWarningMessage` fallback, 2026-09-19) | Selecting a notification lands on the correct session |
| **6** | Docs, configuration, manual runbook | Phase 5 merged; D11 superseded by D5 (2026-09-19) — no separate `idle_prompt` setting needed | README + settings + runbook merged; #51 closable |

---

## 3. Step-by-Step Tasks

### Phase 0 — Gates (no production code; findings recorded on #51)

**Task 0.1 — Gate 1: hook viability under node-pty. Complexity: Medium. Blocks everything.**

Three questions, answered empirically in one session:

1. Do `Notification` and `UserPromptSubmit` hooks fire for `claude` running inside this extension's node-pty, as opposed to a plain integrated terminal? The research report explicitly did not verify this (`docs/research/…:L97`).
2. Does `--settings <path>` supplying a `hooks` block **merge with** the user's existing hooks, or replace them? The spec's §5 D1 argues merge from the general list-merge rule (https://code.claude.com/docs/en/settings, fetched 2026-09-19), but `hooks` is not explicitly named as a merging key. **Test:** launch with the extension's hook settings and confirm one of the user's pre-existing `Notification` hooks still fires alongside. The user's `~/.claude/settings.json` already carries `Notification`, `Stop`, and `UserPromptSubmit` hook blocks (structural keys at lines 151–515), so this is observable without adding anything.
3. Do the injected environment variables reach the hook subprocess? Documented as inherited (https://code.claude.com/docs/en/hooks, fetched 2026-09-19), but confirm on the real `.cmd` launch path.

**Go:** all three hold → proceed to Phase 1.
**No-go on (2):** raise D12 with the user — accept D1-alt (opt-in mutation of `~/.claude/settings.json` with backup and uninstall) or descope detection. Do not proceed on an assumption.
**No-go on (1):** the entire structured-detection design fails. Stop and re-plan; do not silently fall back to terminal-text matching, which both #51 and #109 rule out.

**Task 0.2 — Gate 2: window-foreground spike. Complexity: High. Timeboxed (user to set the box).**

Per the user's standing decision. Implement and test *only* the untried sequence (`docs/research/…:L113`): dummy keystroke to the launcher's own window → `AllowSetForegroundWindow(Code.exe PID)` → signal `Code.exe` to raise itself. Do not re-run the `AttachThreadInput`/alt-tap variant; the reference implementation already proved that one fails from the toast-click context (`docs/research/…:L36`).

**Go:** G4 stands as written in #51.
**No-go:** fall back to taskbar flash; **edit #51's AC #4 wording at that point** and record why. G5 is unaffected either way — reveal-and-activate runs independently of the foreground attempt.

**Task 0.3 — Verify `claudeWorkspaces.sessions.focus` resolves. Complexity: Low.**
Convention, not a documented guarantee (spec §10). Cheap to confirm while the harness from 0.1 is open.

---

### Phase 1 — `activity` state contract *(unblocks type-level and renderer work on #109 and #113)*

> **Scope of the unblock — read before picking up #109 or #113.** Phase 1 ships the type and transport contract, but nothing *drives* the state machine until Phase 3. Against an always-`idle` field, #109's criterion ("displays an activity icon while its Claude agent is processing work") and #113's ("the badge updates as sessions enter or leave the waiting state") are not functionally verifiable. Both issues can begin renderer and badge work on the contract; neither can be closed until Phase 3 lands.

**Task 1.1 — Apply D5 as decided. Complexity: Low.**
D5 is decided (2026-09-19, spec §14): "waiting" is blocked-on-prompt only (`permission_prompt`, `agent_needs_input`, `elicitation_dialog`); `Stop` and `idle_prompt` both transition to `idle` (spec §5 D2 table). This choice propagates directly into #113's badge semantics and cannot be cheaply reversed later — implement the state machine against this decision, not a placeholder.

**Task 1.2 — Tests for `SessionActivity` and the state machine. Complexity: Medium.** *(test-implementer)*
Cover every transition in spec §5 D2, plus out-of-order, duplicate, and unknown events. Extend `test/unit/sessionManager.test.ts` and `test/unit/protocol.test.ts`.

**Task 1.3 — Add `SessionActivity` and the snapshot field. Complexity: Low. Depends on 1.2.**
`src/sessions/sessionTypes.ts:5` (`SessionState`) is left alone — the field is orthogonal, added to `ManagedSessionSnapshot` (`:7-19`). Rationale in spec §8.

**Task 1.4 — Cross the webview boundary. Complexity: Medium. Depends on 1.3.**
`src/panel/protocol.ts:260-282` — the `isSession` validator hard-codes both the required-key list and the three literal `state` values; it must accept and validate `activity`. `ManagedSessionSnapshot` is transported directly (`:46`, `:52-53`), so no separate DTO is needed.

**Task 1.5 — Publish transitions from `SessionManager`. Complexity: Medium. Depends on 1.3.**
Add `setActivity(id: SessionId, activity: SessionActivity): void` to `SessionManager` (spec §8.2) — the seam Phase 3's channel watcher will call. Snapshots are immutable and republished through `publishSessions()` (`src/sessions/sessionManager.ts:472-478`); `setActivity` follows the same shape as `rename` (`:340-352`): look up by id, no-op if not found or unchanged, update the snapshot, republish. Sessions removed at `:390-402` must clear activity state. This method is the entire interface `src/attention/**` needs against `SessionManager` in Phase 3 — do not add ad hoc mutation paths later that bypass it.

**Task 1.6 — Comment on #109 and #113 that the contract has landed. Complexity: Low.**

---

### Phase 2 — Environment injection and channel plumbing

**Task 2.1 — Tests first: both PTY branches. Complexity: Medium.** *(test-implementer)*
Extend `test/unit/nodePtyAdapter.test.ts`. Two cases that must both pass:
- direct spawn carries `CLAUDE_WORKSPACES_ATTENTION_CHANNEL` and `CLAUDE_WORKSPACES_SESSION_ID`;
- the `.cmd` / `.bat` branch carries them too, and they do **not** collide with the names reserved by `createWindowsCommandScriptInvocation` (`src/launch/windowsCommandScriptInvocation.ts:42-53`, `:83-95`).

**Task 2.2 — Thread the session id into the launch spec. Complexity: High. Depends on 2.1.**
The obstacle is real (spec §6): the id is minted at `src/sessions/sessionManager.ts:85`, but `ptyFactory.spawn(spec)` at `:126` takes only the spec (`src/launch/nodePtyAdapter.ts:52`) and `LaunchSpec.env` is frozen by the planner (`src/launch/launchPlanner.ts:139`, `:192`).

Preferred approach: extend the existing `src/launch/sessionLaunch.ts:14-19` seam with an env-overlay helper, matching how `--session-id` is already prefixed. Widening `ManagedPtyFactory.spawn` is the alternative and touches more surface. Either way this ripples into `managedPty.ts`, `test/support/fakeManagedPty.ts`, and `test/unit/sessionLaunch.test.ts`.

**Task 2.3 — Mint and clean up the channel directory. Complexity: Medium.**
One directory per extension host, created at activation (`src/extension.ts:127-264`), watched by that host only. **The directory name must be a randomly generated UUID minted fresh at that activation — never derived from the workspace path, window title, or anything else deterministic or reproducible** (spec §6). A workspace-derived name would reintroduce the exact `sha1(workspaceRoot)` collision the reference implementation has and this design is built to avoid. **Cleanup is part of this task, not deferred** (spec §11.5): on activation, remove channel directories whose owning host no longer exists, or signals leak permanently.

**Task 2.4 — Remote-host detection and no-op. Complexity: Low.**
`extensionKind: ["workspace"]` (`package.json:29-31`) means the host may not be on Windows. Detect, log to the Output channel, and disable the feature explicitly.

---

### Phase 3 — Hook script, ingestion, dedup

**Task 3.0 — Extend the capability probe to `--settings`. Complexity: Medium. Must precede 3.1.**

This codebase deliberately never assumes a CLI flag exists. `ClaudeCapabilityProbe` greps `--help` output for `--session-id` and `--resume` (`src/launch/claudeCapabilities.ts:44-45`), memoizes per executable (`:61-64`), and when support cannot be verified the launch proceeds *without* those flags rather than failing (spec `docs/superpowers/specs/2026-09-06-session-resume.md:38`).

`--settings` must follow the same rule. If the user's installed Claude Code predates the flag, unconditionally prefixing it does not merely degrade detection — an unknown flag plausibly **kills the launch outright**. A notification feature that prevents sessions from starting is a far worse regression than no notifications.

Add a `--settings` probe alongside the existing two, and make the prefix conditional on it. When absent: skip the prefix, disable waiting detection for that executable, and log once to the Output channel. Extend `test/unit/claudeCapabilities.test.ts`.

**Task 3.1 — Compose the hook-settings file and prefix it on *both* launch paths. Complexity: Medium. Depends on 3.0.**

Written into extension storage once per activation; passed as `--settings <path>`.

`src/launch/sessionLaunch.ts` has **two** entry points that both call `prependSessionArgument` (`:14-19`): `planNewClaudeSession` (`:4-6`) and `planResumedClaudeSession` (`:9-11`). Both must carry the flag. If only the new-session path gets it, resumed sessions launch with no hooks and silently never report waiting — a half-feature that looks like an intermittent bug. Also confirm which path `LaunchController.restartFresh` (`src/launch/launchController.ts:304-315`) lands on, since it re-plans and relaunches. **Assert both paths by test** in `test/unit/sessionLaunch.test.ts`.

**Wiring the injection site (spec §5, "Injection site" subsection):** add `hooksSettingsPath: () => string | undefined` to `LaunchControllerDependencies` (`src/launch/launchController.ts:16-30`), matching the shape of the existing `executable: () => string | undefined` (`:26`) and `createClaudeSessionId: () => string` (`:19`) entries. Consult it at both call sites: `launchNewPlan` (`:61-65`), alongside the existing `claudeSessionId === undefined` conditional, and the resumed-session path (`:178`, `planResumedClaudeSession(plan, claudeSessionId)`), which currently calls unconditionally. `hooksSettingsPath()` returns `undefined` when the `--settings` capability probe (Task 3.0) reports no support for the running executable.

> **Hard constraint — pass a path, never inline JSON.** `assertSafeCommandScriptValue` rejects any argument containing `"` (`src/launch/windowsCommandScriptInvocation.ts:77-80`), and JSON always contains quotes, so inline JSON breaks every `claude.cmd` launch. A regression test must cover this.

**Task 3.2 — The hook script, and proof that it ships. Complexity: Medium.**

Reads the two env vars, reads the hook payload from stdin, writes one signal file into the channel directory. Must be fast, dependency-free, and must fail loudly into a diagnosable location rather than silently — a silent failure here makes the whole feature invisible (spec §6, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` risk). This includes the channel-deletion race (spec §11.5): the script must detect and log a diagnosable error when its target channel path does not exist or is not a directory at write time, rather than silently succeeding or no-op'ing — this is the case where a crashed host's orphaned PTY still has hooks firing after the next activation's cleanup removed the directory.

**Packaging is part of this task.** The script is a runtime asset invoked by an external process, not bundled code, so esbuild will not carry it. The repo's asset convention is `media/` (`package.json:16`, `:125`). If the script lands somewhere `.vscodeignore` excludes, the packaged extension ships without it and detection fails **only in the released build, never in dev** — the worst possible discovery timing.

Extend `test/unit/packageAssets.test.ts`, which already enumerates the packaged file list via `listFiles` from `@vscode/vsce` and asserts specific paths are present (`:34-47`), to assert the hook script is packaged. Note that the same test asserts `docs/` contributes only `docs/versioning-policy.md` (`:40-43`), so the spec, plan, and research files added by this work are correctly excluded and will not break it.

**Task 3.3 — Ingestion tests. Complexity: Medium.** *(test-implementer)*
Malformed, partial, and unknown-type signals; unknown session ids; and **a signal addressed to another host's channel is never ingested** — this is the CI-testable core of G6.

**Task 3.4 — Watcher and state-machine wiring. Complexity: High. Depends on 3.2, 3.3.**
Signal → activity transition per spec §5 D2. Unknown matcher values are ignored, not fatal (spec §11.3). The watcher (`src/attention/**`) drives transitions by calling `SessionManager.setActivity(id, activity)` (spec §8.2, Task 1.5) — **it must depend only on `SessionManager`, never on `LaunchController`**; any lifecycle reaction it needs (e.g. clearing state on session close) comes from `SessionManager.onDidChangeSessions` (`src/sessions/sessionManager.ts:51`), not a new import into the launch layer.

**Task 3.5 — Stage dedup. Complexity: Medium.**
Per spec §7 (D8 decided 2026-09-19: per-session): one notification per open stage; stage closes on `UserPromptSubmit`, `SessionEnd`, or session removal. **Do not port the reference implementation's `O_EXCL` claim race** — it arbitrates between two notifiers, and this design has only one (spec §7). The deviation is deliberate.

---

### Phase 4 — Notification emission

**Task 4.1 — Decide D6 *after* Gate 2. Complexity: Medium.**
Choosing a toast library's click-callback protocol before the spike could foreclose the sequence the spike tests (spec §9). Bundling a native helper is not a new class of problem — the VSIX already ships platform binaries and targets `win32-x64` (`package.json:45-48`).

**Task 4.2 — Focus suppression. Complexity: Medium.**
`vscode.window.state.focused` / `onDidChangeWindowState`, behind an injected boundary so it is unit-testable — matching how `ExtensionNotificationsApi` (`src/extension.ts:114-117`) and the other VS Code boundaries in this codebase are already injected. Covers G8, plus D9 (decided 2026-09-19: do not fire on blur).

**Task 4.3 — Emit, with workspace and session identity. Complexity: Medium.**
`displayName`, `launchedRootLabel`, `launchedRootPath` are already on the snapshot (`src/sessions/sessionTypes.ts:7-19`) — no new data needed for G3.

**Task 4.4 — Extend `SessionNotification` or keep a parallel channel. Complexity: Medium.**
`SessionNotification` (`src/sessions/sessionTypes.ts:26-38`) and `LaunchController.notify()` (`src/launch/launchController.ts:324-355`) are failure-oriented: every existing kind routes to `showErrorMessage`, and `notify` keys off `notification.spec` for resume/retry bookkeeping (`:325-331`). A `waiting-for-input` kind would carry no spec and want none of that logic. **Recommendation: a separate attention sink**, reusing the same injected-boundary shape rather than overloading the failure path.

---

### Phase 5 — Click routing

**Task 5.1 — Reveal the panel. Complexity: Medium. Depends on 0.3.**
No reveal helper exists on `SessionPanelProvider`; `claudeWorkspaces.sessions.focus` is the expected path for the panel-container webview view (`package.json:120-138`).

**Task 5.2 — Activate the session. Complexity: Low.**
`SessionManager.activate(id)` (`src/sessions/sessionManager.ts:331-337`) via `selectSession` (`src/panel/sessionPanelProvider.ts:40`), already wired at `src/extension.ts:326`.

**Task 5.3 — Handle the gated-view case. Complexity: Low.**
The view is gated `"when": "claudeWorkspaces.savedWorkspace"` (`package.json:135`); the focus command silently no-ops when false. Per D10 (decided 2026-09-19), fall back to `showWarningMessage` naming the session.

**Task 5.4 — Integration test. Complexity: Medium.**
Activation resolves to the correct session id (`test/integration/`).

---

### Phase 6 — Documentation and runbook

**Task 6.1 — `README.md`.** Windows-only scope, what "waiting" means, remote-host no-op, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` interaction, and — if Gate 2 failed — the taskbar-flash behaviour and why, so it does not read as a bug.

**Task 6.2 — Settings.** New `claudeWorkspaces.*` properties (`package.json:139-157`), at minimum an enable/disable toggle. D11 (superseded by D5, 2026-09-19) is moot — no separate `idle_prompt` escalation setting is needed, since `idle_prompt` is not a "waiting" trigger under D5.

**Task 6.3 — Manual verification runbook. Complexity: Medium.**
Covers what CI structurally cannot: two windows owning different sessions, hook firing under node-pty, toast click-through, minimized-window behaviour. See §6.

**Task 6.4 — Revise #51's AC #4 if Gate 2 failed, and close out.**

---

## 4. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hooks do not fire under node-pty | Low–Medium | **Fatal** to the design | Gate 1 before any code; no text-matching fallback (ruled out by #51 and #109) |
| Installed Claude Code predates `--settings`; the unknown flag kills every managed launch | Medium | **Critical** — worse than the feature's absence | Task 3.0 capability probe, mirroring `claudeCapabilities.ts:44-45`; prefix conditional, detection silently disabled and logged when unsupported |
| `--settings` applied to only one of the two `sessionLaunch.ts` entry points | Medium | Medium — resumed sessions never report waiting | Task 3.1 asserts both `planNewClaudeSession` and `planResumedClaudeSession` by test |
| Hook script excluded from the VSIX by `.vscodeignore` | Medium | High — fails only in the released build | Task 3.2 extends `packageAssets.test.ts:34-47` to assert it is packaged |
| `--settings` replaces rather than merges hooks, silently disabling the user's large existing hook set | Low | **High** — user-visible regression outside this extension | Gate 1 test (2) checks a pre-existing hook still fires; D1-alt contingency |
| Inline JSON breaks every `.cmd` launch | **Certain if attempted** | High | Pass a file path; regression test on the `.cmd` branch (`windowsCommandScriptInvocation.ts:77-80`) |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` strips the channel vars | Low | High — silent feature death | Hook fails loudly; documented in README; exact strip list unretrievable as of 2026-09-19 |
| Window foregrounding unachievable | **High** (no prior art — `docs/research/…:L86`) | Medium — one AC | Timeboxed Gate 2; taskbar-flash fallback; G5 unaffected |
| Env-injection plumbing ripples wider than expected | Medium | Medium | Isolated in Phase 2; `sessionLaunch.ts` seam already exists for exactly this shape |
| Channel directories leak after host crash | Medium | Low–Medium | Activation-time cleanup, Task 2.3 |
| D5 chosen wrong → #113 badge counts nearly every session | Low — D5 decided 2026-09-19 (blocked-on-prompt only, spec §14) | High — cross-issue rework if revisited | Implement Phase 1 against the decided value; do not treat it as provisional |

---

## 5. Dependencies

- **User decisions** — D5, D8, D9, D10, D11 decided 2026-09-19 (spec §14). **Still open:** D6 (Phase 4, deferred until after Gate 2), D12 (only if Gate 1 fails), and the Gate 2 timebox and go/no-go.
- **Claude Code CLI** — `--settings`, hook events, and `Notification` matcher values as documented at https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/settings (both fetched 2026-09-19).
- **#109 and #113** consume Phase 1's `activity` contract; notify both when it lands.
- Windows-only; no new runtime npm dependency unless D6 selects one.

---

## 6. Definition of Done

- [ ] Gate 1 and Gate 2 resolved, with findings recorded on #51.
- [ ] `activity` published through to the webview; #109 and #113 notified.
- [ ] Waiting state driven by real Claude Code hooks, not terminal text.
- [ ] Native Windows notification on an unfocused owning window, naming workspace and session.
- [ ] No notification when the owning window is focused; no duplicates within one wait stage.
- [ ] Selecting a notification reveals the panel and activates the correct session.
- [ ] Automated tests for detection, dedup, focus suppression, and channel routing; **multi-window and toast click-through covered by the manual runbook, not claimed as CI coverage** (§12 of the spec).
- [ ] Remote-host and non-Windows paths are explicit, logged no-ops.
- [ ] README and settings documented; AC #4 revised if Gate 2 failed.
- [ ] Plan file deleted once #51 closes, per `CLAUDE.md § Lifecycle`.
