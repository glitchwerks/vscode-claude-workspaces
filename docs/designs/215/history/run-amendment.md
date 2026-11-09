# Deferred Run amendment

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-07
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **State:** Deferred from v1 by author decision after C2 evidence. This file preserves the earlier specification; none of its execution files/actions/phases is active implementation scope. The admission failures remain unresolved. [A10; C2E]
* **Design:** [Companion design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), with [the pre-amendment checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/41546292c5c960a48170d27b42cfb46bc1cf3ac1/docs/designs/215/design_draft.md) retained as history.

## Current disposition: deferred

The author instructed “Defer for now” after the [C2 native experiment](c2-experiment-results.md). The active [copying-only design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md) excludes Run and Run again, command-execution messages, a dedicated Run controller/terminal and Run-only target/profile metadata. C2 is deferred, not passed, and does not gate v1 copying. [A10]

The remainder preserves the earlier original-folder/persistent-shell specification, shell matrix, file delta and tests as dated context. Its former Run phase and qualification obligations apply only if execution is explicitly resumed and redesigned/reviewed to address C2. They must not be added to the current v1 allowlists. No fresh-shell substitution, weaker guarantee, implementation or new experiment is authorized here. [A10; C2E]

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

## Run eligibility matrix

This selected v1 matrix determines Run availability independently of literal Copy. Retain requiredShellFamily (bash, pwsh, zsh, cmd or unknown) and evidenceOrigin (assistant-fence, assistant-inline or tool) with each complete immutable Run target. At dispatch compare against the owned terminal’s currently qualified family/profile/build; a display name or family match alone is not qualification. Do not infer portability, translate syntax or silently relaunch another profile. [A8; design item 7; selected eligibility]

| Source declaration | Required family | v1 Run decision |
|---|---|---|
| bash or sh fence | bash | Only in a qualified Bash/Git Bash profile. |
| powershell, pwsh or ps1 fence | pwsh | Only in a qualified pwsh profile. |
| zsh fence | zsh | Unavailable until that family/profile is separately qualified; Copy remains available. |
| cmd or bat fence | cmd | Unavailable until that family/profile is separately qualified; Copy remains available. |
| Generic shell fence or untyped inline command | unknown | Run unavailable with unknown-family reason; Copy remains available. |
| Completed Claude tool command | Established by the C4-approved adapter | Run again only when completion and source shell family are established and match a qualified owned shell; otherwise Copy only. |

Required-source-family metadata does not prove that arbitrary command text is correct or portable. Shell qualification and the C2 interleaving gate remain required. The native current profile is preserved when a command is ineligible; show the unavailable reason instead of switching it. Cross-family, untyped, unqualified-profile, stale-target and tool-without-family cases must have exact fixture outcomes. [A8; selected eligibility; qualification boundary]

## C2 admission closure gate

The author separately authorized the focused native-terminal experiment, now recorded in the [C2 findings](c2-experiment-results.md). It covered foreground/input interleavings, partial typed input, duplicate actions, not-yet-ready integration and terminal closure with real harmless pwsh commands. Partial input was lost on both tested builds; two controlled event-delay trials admitted Run from stale idle state and interrupted foreground work. Ordinary competing-input trials and known-busy guards are reported separately. The required admission boundary is not established: C2 remains open for an explicit author decision before Run implementation/activation. Persistent reuse and non-interruption remain selected. No fresh-shell substitution, weaker guarantee or deferral of Run is assumed approved; the report presents alternatives for that decision. [C2E; A8; review C2]

## Run contract

1. **Explicit, source-bound intent.** Render Run next to Copy for complete assistant command blocks, with their suggestion/example label still visible. Source-confirmed completed Claude commands may use the explicit label Run again. Generic code, paths, partial/unmapped commands, pending tool requests and unknown/in-progress execution do not receive an enabled Run action. Apply the selected eligibility matrix even to a complete command: generic shell/untyped candidates may be copyable while Run is unavailable. This avoids using Run as an alternative way to answer a pending Claude permission request. There is no automatic execution on capture, rendering, Copy or path review. [A6; design Goals 1-8; proposed eligibility]
2. **Exact command and destination.** A webview action carries document/session/generation/target/revision/action IDs, not executable text or a destination path. The host resolves the complete retained literal command and recorded origin, validates them immediately before dispatch, and rejects stale, changed or evicted targets. Preserve quoting, Unicode and logical newlines; do not copy visual wraps, strip prompts, split a script into independent actions, or add a hidden `cd` prefix. Reject NUL and terminal control characters other than allowed tab/newline sequences. Proposed v1 Run limit: 64 KiB UTF-8; larger commands retain Copy under its separate limits but Run is visibly unavailable, never truncated. [A6; proposed dispatch validation and budget]
3. **Create through the terminal API.** Use `window.createTerminal` with the host-owned origin cwd and a session-specific Run name. Await qualified shell integration/readiness, then use its string command execution method. The API can interrupt existing work, so the controller must not call it against a known busy or unknown-state terminal. Observe shell start/end and terminal-close events; do not use the active terminal as fallback or blindly send text into an unknown foreground program. A 5-second readiness timeout reports Run unavailable, preserving Copy; it does not retry later without another click. This readiness observation is not the unresolved C2 concurrency guarantee. [V1; proposed readiness policy]
4. **Show the right surface.** Reveal/focus the dedicated VS Code terminal after the explicit Run action so the user can see its command and output. The companion's Raw toggle continues to reveal the Claude CLI, a separate surface. Label the existing Stop action Stop Claude to keep that scope clear; commands launched through Run use the native VS Code terminal's own interruption controls. Do not route Claude's Escape into the Run terminal. [A6; proposed UI contract]
5. **Keep provenance honest.** Report Preparing, Submitted, Running, Ended/exit code, Failed or Unknown only from the corresponding native evidence. Submission is not proof of successful execution. Keep user-launched Run outcomes distinct from Claude tool provenance; a Run click must not relabel an assistant suggestion as Claude ran this. Multiline completion/correlation needs qualification before claiming the whole block completed. [V1; proposed status contract]
6. **Bound ownership and retries.** Admit one pending/active Run action per managed session; repeated action IDs are inert. Disable duplicate clicks while preparing/running. A busy or unknown terminal does not get interrupted to make room for another Run. Capture identity retirement invalidates its source Run targets but does not replace the managed process generation or its existing Run shell. A terminal closure or managed process replacement invalidates pending dispatch; once an accepted command is dispatched, do not kill it merely because the Claude session closes or the view toggles. Preserve terminal output and leave native process controls available. Never retry an uncertain execution automatically. [A6; A7; proposed lifecycle]
7. **Separate qualification from authority.** Respect the host's existing workspace-trust/availability boundary. Run uses normal shell execution with the user's terminal environment, not Claude's tool permission broker, subscription auth or native question controls. Keep the existing subscription-backed CLI and Variant A unchanged. This amendment authorizes design and illustrative mockups, not real command execution during this workflow. [A6; proposed integration boundary]

The UI should make the destination visible before the action, for example:

```text
Suggested command                         [Copy command] [Run]
Runs in a dedicated VS Code terminal for: workspaces
npm run check:types
```

For later Runs, show the shell’s current reported folder alongside its original launch folder when they differ. If current cwd is unavailable, report it as unknown and make Run unavailable until a qualified idle destination is observed. The mockup illustrates first launch, when the current folder is the recorded origin. [A7; proposed presentation]

## Exact implementation-plan delta

**Pre-deferral inventory (historical):** the [22f736c implementation list](https://github.com/glitchwerks/vscode-claude-workspaces/blob/22f736cafbbf52abf901cc53650aea22f0aa5ef3/docs/designs/215/design_draft.md#detailed-implementation) contained 31 Create and 19 Modify paths, including the three Run additions below. The active copying-only list now excludes those three Create paths and future modification of this deferred record, giving 28 Create / 18 Modify. The historical delta below must not be restored without an explicit execution-scope decision. [A10; A6; A7]

| Action | File | Change and reason |
|---|---|---|
| Create | `src/companion/companionRun.ts` | Own dedicated terminal identity, original cwd, readiness, shell-family checks, execution/status correlation and persistent reuse per session generation. Inject terminal APIs/clock/session lookup for tests. |
| Create | `test/unit/companionRun.test.ts` | Test target/root ownership, literal commands, busy/unknown handling, duplicates, readiness timeout, closure, profile mismatch and persistent environment/cwd reuse. |
| Create | `test/fixtures/companion/run-cases.json` | Commit synthetic source/command/root/profile and lifecycle expectations consumed by those tests. |
| Extend planned modifications | `src/companion/companionTypes.ts`; `src/companion/companionRuntime.ts`; `src/companion/companionContent.ts`; `src/panel/companionProtocol.ts`; `src/extension.ts` | Add Run target eligibility, the namespaced action/status union, terminal dependency injection and disposal/correlation; never accept a webview-supplied executable or cwd. |
| Extend planned modifications | `src/panel/webview/companion/view.ts`; `src/panel/webview/companion/styles.css`; `src/panel/webview/renderer.ts`; `src/panel/webview/index.ts` | Add separate Copy/Run controls, eligibility reasons, destination, per-action feedback and Stop Claude wording. Stylesheet import belongs only in index.ts; renderer remains loadable by the Node harness. Preserve composer and Claude Raw view. |
| Extend planned tests | `test/unit/companionContent.test.ts`; `test/unit/companionProtocol.test.ts`; `test/unit/companionView.test.ts`; `test/unit/companionRuntime.test.ts`; `test/unit/activation.test.ts`; `test/unit/attentionCompletionMod.test.ts`; `test/integration/companion.test.ts`; `test/support/companionHarness.ts` | Add selected-family eligibility, stale-action rejection, accessible controls, root binding and fake-terminal integration coverage. Extend the existing mod-entry helper loader/mock for absent/disabled capture, keeping continuation and metadata-only regressions. |
| Extend planned qualification/docs | `test/manual/companionNative.smoke.cjs`; `test/manual/companionNativeWebview.ts`; `test/fixtures/companion/qualification.json`; `README.md`; `docs/user-guide.md`; `docs/manual-verification/215-companion.md`; `docs/designs/215/design_draft.md`; `docs/designs/215/technical_choices.md`; `docs/designs/215/run-amendment.md` | Explain and qualify Run separately from Copy and Claude Stop, record the selected persistent-shell lifecycle, and preserve actual terminal/profile/root outcomes. |

No change to the observational mod or private file content protocol is needed solely to execute Run: this is a host/view action into the VS Code terminal service. The interactive preview is not a product implementation. [A6; proposed component boundary]

## Acceptance additions

* With core folder A, imported folder B and active editor/terminal in C, the created Run terminal must launch at recorded A. Renaming/reordering workspace folders must not retarget it. Two Claude sessions must not share each other's terminal merely because labels or root paths match. [S1; A6; proposed tests]
* Copy continues to write only the clipboard. Run dispatches the full target once to the owned VS Code shell, never Claude's PTY or another terminal. Stale revisions, partial source, uncertain path edits and pending permission commands do not dispatch. [A6; proposed tests]
* Test spaces/Unicode in the original root, deleted/unavailable root, shell startup changes, supported Git Bash/pwsh profiles, mismatches, disabled/delayed shell integration, process prompts, repeated clicks and view/session changes while preparing. A failed root/readiness check must not fall back to home, the active folder or the active terminal. [V1; V2; A6; proposed tests]
* Qualify complete single-line and multiline commands with real harmless native-shell fixtures separately from model-consuming CLI probes. Verify the observed launch/execution cwd and command value, not just options passed to a fake. Unknown/end/exit-code handling must not imply success. [V1; proposed tests]
* Assert the selected matrix for every shell tag/origin, qualified and unqualified profiles, untyped commands and tool evidence lacking a shell family. Ineligible Run retains Copy and never switches the persistent shell. [A8; selected tests]
* The C2 native interleaving evidence is a closure prerequisite, not satisfied by fake idle-state tests or readiness observation. [A8; review C2]
* Verify activation/variables/cwd persist between Runs in the same owned shell. A later Run after `cd` uses and displays that current cwd without a hidden reset. Busy/unknown terminals are never interrupted by Run. Closing the terminal recreates it at original A only after the next explicit Run; replacing the Claude generation creates separate ownership and preserves earlier terminal output. [A6; A7; proposed lifecycle tests]

## Sources and evidence limits

* **A6:** [Run request, dedicated-terminal/original-folder decision and read-only source check](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707126769). This checkpoint left reuse open; A7 resolves it.
* **A7:** [Author selection: reuse the same dedicated shell](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909). Environment and cwd carry over; recreation starts from the recorded origin.
* **A8:** [Auto accept of the correction proposals](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6709462362). The selected eligibility restrictions and C2 gate refine the retained persistent lifecycle; no probe is authorized.
* **S1:** Recorded launch context: [session fields](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionTypes.ts#L14-L31), [snapshot assignment from spec.cwd](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L114-L127), [selected-root launch cwd](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/launchPlanner.ts#L142-L153).
* **A10:** [Author deferral of Run from v1](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).
* **C2E:** [Authorized experiment, native receipts and unresolved admission boundary](c2-experiment-results.md).
* **V1:** [Official VS Code terminal API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration), including TerminalOptions, terminal state, execution and start/end events (fetched 2026-11-07). The project-declared SDK was inspected as described in A6. API presence does not prove packaged command/cwd fidelity.
* **V2:** [Official terminal shell integration support and limits](https://code.visualstudio.com/docs/terminal/shell-integration) (fetched 2026-11-07). No live terminal, command or model experiment was run for this amendment.
