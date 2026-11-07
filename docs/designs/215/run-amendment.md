# Run commands in a dedicated VS Code terminal

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-07
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **State:** Run, its dedicated/original-folder destination and persistent shell reuse are confirmed. The amended design is ready for fresh review; native execution remains unqualified. [A6; A7]
* **Design:** [Companion design](design_draft.md), with [the pre-amendment checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/41546292c5c960a48170d27b42cfb46bc1cf3ac1/docs/designs/215/design_draft.md) retained as history.

## Confirmed scope change

Add an explicit Run action alongside command Copy. Run executes in a dedicated native VS Code shell terminal, launched in the same core workspace folder as the associated Claude workspace session. It does not submit to Claude's prompt or raw PTY and never selects an arbitrary active terminal. Copy remains non-executing; path Copy is unaffected. This intentionally expands the earlier copying-only boundary. Native question/permission Variant A remains selected. [A6]

Use the session's immutable `launchedRootPath`, which records its launch `spec.cwd` from the selected core root. Do not recompute the origin from a later active editor, imported/additional directory, current workspace selection or Claude's later cwd. The terminal is owned by the managed session/process generation, not found by a matching display name. [S1; A6]

## Selected lifecycle: reuse the same shell

The author selected **keep shell state between Runs**: “Use the same shell.” Lazily create one dedicated interactive shell per managed Claude session/process generation at its recorded original core folder, then reuse that owned shell only when it is observed idle and qualified. Environment activations, variables and intentional `cd` changes carry over. Show the current reported folder before later Runs; do not silently reset it to the origin. Closing the terminal makes the next explicit Run create a new shell at the original folder. A replacement Claude generation must not adopt the earlier terminal. These are selected design contracts, not tested capabilities. [A6; A7; proposed lifecycle contract]

| Choice | Mechanism | Trade-offs and failure conditions |
|---|---|---|
| **Selected: keep shell state between Runs** | Lazily create one dedicated interactive shell per managed Claude session generation. Reuse only an owned, observed idle shell. Its working directory and environment changes carry over; show its current reported folder before a later Run. | Supports workflows such as activating an environment or running `cd` before the next command. Later commands can therefore run outside the original folder. Busy/unknown state blocks execution; missing shell integration prevents automatic dispatch rather than guessing that a prompt is ready. Closing the terminal causes the next Run to launch again from the original folder. |
| Not selected: start fresh from the original folder on each Run | Create a new dedicated interactive shell for each explicit Run, always with the recorded origin as its launch cwd. Do not reuse an earlier Run terminal or carry its environment/cwd changes forward. | Gives each Run a consistent starting context and avoids reusing a previously busy shell, but creates more terminal tabs and loses activations, variables and `cd` state between actions. Keep related steps in one complete command block when state is needed within that Run. A failed/unknown startup does not dispatch the command. |

The selected shell uses normal VS Code terminal profile configuration; it does not copy the private Claude capture environment or change global shell settings. Shell-specific syntax must match a qualified detected shell. A mismatch or unknown shell for shell-specific input makes Run unavailable with a useful message; do not translate command syntax silently. Startup scripts and arbitrary multiline shell syntax still require qualification. [A7; V1; V2; proposed shell contract]

## Run contract

1. **Explicit, source-bound intent.** Render Run next to Copy for complete assistant command blocks, with their suggestion/example label still visible. Source-confirmed completed Claude commands may use the explicit label Run again. Generic code, paths, partial/unmapped commands, pending tool requests and unknown/in-progress execution do not receive an enabled Run action. This avoids using Run as an alternative way to answer a pending Claude permission request. There is no automatic execution on capture, rendering, Copy or path review. [A6; design Goals 1-8; proposed eligibility]
2. **Exact command and destination.** A webview action carries document/session/generation/target/revision/action IDs, not executable text or a destination path. The host resolves the complete retained literal command and recorded origin, validates them immediately before dispatch, and rejects stale, changed or evicted targets. Preserve quoting, Unicode and logical newlines; do not copy visual wraps, strip prompts, split a script into independent actions, or add a hidden `cd` prefix. Reject NUL and terminal control characters other than allowed tab/newline sequences. Proposed v1 Run limit: 64 KiB UTF-8; larger commands retain Copy under its separate limits but Run is visibly unavailable, never truncated. [A6; proposed dispatch validation and budget]
3. **Create through the terminal API.** Use `window.createTerminal` with the host-owned origin cwd and a session-specific Run name. Await qualified shell integration/readiness, then use its string command execution method. The API can interrupt existing work, so the controller must not call it against a known busy or unknown-state terminal. Observe shell start/end and terminal-close events; do not use the active terminal as fallback or blindly send text into an unknown foreground program. A 5-second readiness timeout reports Run unavailable, preserving Copy; it does not retry later without another click. [V1; proposed readiness policy]
4. **Show the right surface.** Reveal/focus the dedicated VS Code terminal after the explicit Run action so the user can see its command and output. The companion's Raw toggle continues to reveal the Claude CLI, a separate surface. Label the existing Stop action Stop Claude to keep that scope clear; commands launched through Run use the native VS Code terminal's own interruption controls. Do not route Claude's Escape into the Run terminal. [A6; proposed UI contract]
5. **Keep provenance honest.** Report Preparing, Submitted, Running, Ended/exit code, Failed or Unknown only from the corresponding native evidence. Submission is not proof of successful execution. Keep user-launched Run outcomes distinct from Claude tool provenance; a Run click must not relabel an assistant suggestion as Claude ran this. Multiline completion/correlation needs qualification before claiming the whole block completed. [V1; proposed status contract]
6. **Bound ownership and retries.** Admit one pending/active Run action per managed session; repeated action IDs are inert. Disable duplicate clicks while preparing/running. A busy or unknown terminal does not get interrupted to make room for another Run. A terminal closure or session replacement invalidates pending dispatch; once an accepted command is dispatched, do not kill it merely because the Claude session closes or the view toggles. Preserve terminal output and leave native process controls available. Never retry an uncertain execution automatically. [A6; A7; proposed lifecycle]
7. **Separate qualification from authority.** Respect the host's existing workspace-trust/availability boundary. Run uses normal shell execution with the user's terminal environment, not Claude's tool permission broker, subscription auth or native question controls. Keep the existing subscription-backed CLI and Variant A unchanged. This amendment authorizes design and illustrative mockups, not real command execution during this workflow. [A6; proposed integration boundary]

The UI should make the destination visible before the action, for example:

```text
Suggested command                         [Copy command] [Run]
Runs in a dedicated VS Code terminal for: workspaces
npm run check:types
```

For later Runs, show the shell’s current reported folder alongside its original launch folder when they differ. If current cwd is unavailable, report it as unknown and make Run unavailable until a qualified idle destination is observed. The mockup illustrates first launch, when the current folder is the recorded origin. [A7; proposed presentation]

## Exact implementation-plan delta

These are future implementation paths, not missing artifacts supplied by this documentation PR. The existing [unified implementation list](design_draft.md#detailed-implementation) remains the baseline. The three additions below are included there; the selected persistent-shell lifecycle adds no new dependency or another Claude process. [A6; A7; proposed inventory]

| Action | File | Change and reason |
|---|---|---|
| Create | `src/companion/companionRun.ts` | Own dedicated terminal identity, original cwd, readiness, shell-family checks, execution/status correlation and persistent reuse per session generation. Inject terminal APIs/clock/session lookup for tests. |
| Create | `test/unit/companionRun.test.ts` | Test target/root ownership, literal commands, busy/unknown handling, duplicates, readiness timeout, closure, profile mismatch and persistent environment/cwd reuse. |
| Create | `test/fixtures/companion/run-cases.json` | Commit synthetic source/command/root/profile and lifecycle expectations consumed by those tests. |
| Extend planned modifications | `src/companion/companionTypes.ts`; `src/companion/companionRuntime.ts`; `src/companion/companionContent.ts`; `src/panel/companionProtocol.ts`; `src/extension.ts` | Add Run target eligibility, the namespaced action/status union, terminal dependency injection and disposal/correlation; never accept a webview-supplied executable or cwd. |
| Extend planned modifications | `src/panel/webview/companion/view.ts`; `src/panel/webview/companion/styles.css`; `src/panel/webview/renderer.ts` | Add separate Copy/Run controls, destination, per-action feedback and Stop Claude wording; preserve the existing composer and Claude Raw view. |
| Extend planned tests | `test/unit/companionContent.test.ts`; `test/unit/companionProtocol.test.ts`; `test/unit/companionView.test.ts`; `test/unit/companionRuntime.test.ts`; `test/unit/activation.test.ts`; `test/integration/companion.test.ts`; `test/support/companionHarness.ts` | Add eligibility, stale-action rejection, accessible controls, root binding and fake-terminal integration coverage. |
| Extend planned qualification/docs | `test/manual/companionNative.smoke.cjs`; `test/manual/companionNativeWebview.ts`; `test/fixtures/companion/qualification.json`; `README.md`; `docs/user-guide.md`; `docs/manual-verification/215-companion.md`; `docs/designs/215/design_draft.md`; `docs/designs/215/technical_choices.md`; `docs/designs/215/run-amendment.md` | Explain and qualify Run separately from Copy and Claude Stop, record the selected persistent-shell lifecycle, and preserve actual terminal/profile/root outcomes. |

No change to the observational mod or private file content protocol is needed solely to execute Run: this is a host/view action into the VS Code terminal service. The interactive preview is not a product implementation. [A6; proposed component boundary]

## Acceptance additions

* With core folder A, imported folder B and active editor/terminal in C, the created Run terminal must launch at recorded A. Renaming/reordering workspace folders must not retarget it. Two Claude sessions must not share each other's terminal merely because labels or root paths match. [S1; A6; proposed tests]
* Copy continues to write only the clipboard. Run dispatches the full target once to the owned VS Code shell, never Claude's PTY or another terminal. Stale revisions, partial source, uncertain path edits and pending permission commands do not dispatch. [A6; proposed tests]
* Test spaces/Unicode in the original root, deleted/unavailable root, shell startup changes, supported Git Bash/pwsh profiles, mismatches, disabled/delayed shell integration, process prompts, repeated clicks and view/session changes while preparing. A failed root/readiness check must not fall back to home, the active folder or the active terminal. [V1; V2; A6; proposed tests]
* Qualify complete single-line and multiline commands with real harmless native-shell fixtures separately from model-consuming CLI probes. Verify the observed launch/execution cwd and command value, not just options passed to a fake. Unknown/end/exit-code handling must not imply success. [V1; proposed tests]
* Verify activation/variables/cwd persist between Runs in the same owned shell. A later Run after `cd` uses and displays that current cwd without a hidden reset. Busy/unknown terminals are never interrupted by Run. Closing the terminal recreates it at original A only after the next explicit Run; replacing the Claude generation creates separate ownership and preserves earlier terminal output. [A6; A7; proposed lifecycle tests]

## Sources and evidence limits

* **A6:** [Run request, dedicated-terminal/original-folder decision and read-only source check](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707126769). This checkpoint left reuse open; A7 resolves it.
* **A7:** [Author selection: reuse the same dedicated shell](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909). Environment and cwd carry over; recreation starts from the recorded origin.
* **S1:** Recorded launch context: [session fields](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionTypes.ts#L14-L31), [snapshot assignment from spec.cwd](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L114-L127), [selected-root launch cwd](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/launchPlanner.ts#L142-L153).
* **V1:** [Official VS Code terminal API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration), including TerminalOptions, terminal state, execution and start/end events (fetched 2026-11-07). The project-declared SDK was inspected as described in A6. API presence does not prove packaged command/cwd fidelity.
* **V2:** [Official terminal shell integration support and limits](https://code.visualstudio.com/docs/terminal/shell-integration) (fetched 2026-11-07). No live terminal, command or model experiment was run for this amendment.
