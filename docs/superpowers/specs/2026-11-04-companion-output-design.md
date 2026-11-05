# Claude output companion with native terminal fallback

Date: 2026-11-04. Parent: [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).

## Status and authority

Design for maintainer review, not implementation or release approval. The maintainer selected the companion view, direct question and permission controls, native Escape for Stop, and a raw-terminal toggle. The approved requirements make complete command copying the primary need, followed by readable separation and preserved interaction. [D1; R1; R2]

This document completes the proposed interaction and integration contract. Defaults explicitly marked **author's call** are proposals, not earlier maintainer decisions. #215 remains open until review and spike acceptance. A documentation PR references #215 without a closing keyword. Implementation needs separately scoped issues under a milestone and explicit authorization; this document does not create that authorization. [D1; #215]

Experiments used Claude Code **2.1.317**, signed in through **claude.ai / Pro**, on Windows. They used a standalone browser, node-pty and the actual repository XtermTerminal adapter, not a packaged VS Code acceptance run. Runtime observations are pinned to committed prerelease snapshot **ef5fd48f4b676881a8730afbf8e583e70565ca11**; this documentation checkpoint branches from stable main **38cab4e6fdeaee2159de93241f138d9bb2d1c73b**. Main owns documentation; future runtime work must recheck the active prerelease line. [E1; E3; B1; B6]

## Intent, needs and boundaries

Make it easy to read what Claude says and copy the complete command it shows, without selecting wrapped terminal rows. Keep the same subscription-backed interactive CLI as the execution and permission authority. The companion adds a presentation and control surface; it does not become another inference client. [R1; R2; D1]

| Classification | Scope and observable result | Basis |
|---|---|---|
| Need | Complete Copy actions on assistant command/code snippets and observed tool commands; preserve quoting, intended newlines and Unicode. | R1; E1 |
| Need | Distinguish assistant suggestions/examples from requested, running and completed tool activity. Never present an unconfirmed request as something Claude ran. | R1; E1 |
| Need | Separate explanations, command input and tool output; render headings, lists and fenced code. | R1; E1 |
| Need | Answer supported questions and allow or deny supported permission requests directly in the companion. | D1; E3 |
| Need | Stop foreground work through the CLI's native Escape path and retain the same raw terminal through a toggle. | D1; E3 |
| Constraint | Keep subscription-backed CLI operation; require no API key, separate API backend or different session for formatted output. | R2; E3 |
| Want, deferred | Syntax highlighting, rich tool-specific viewers, search, export, historical transcript import and side-by-side layouts. | Author's scope call: R1; P1 |
| Outside this design | Automatic execution from a command block, custom native prompt queue, replacement terminal emulator, broad native renderer overrides, background-task management or fixes to #56/#180. | #215; #145; E1; E2; E3 |

Failure conditions include copying a visually wrapped or silently truncated command, answering the wrong request, overriding a native denial, changing the active credential, silently losing capture, or calling a backgrounded process stopped. These follow the observed fidelity, identity and interruption failures. [R1; R2; E1; E3]

## Chosen approach and prior art

The companion observes semantic CLI events while PTY output continues to feed the existing xterm. Plain terminal rows are not semantic evidence of a suggestion, permission or execution. The current runtime has a native composer bridge with session/Claude UUID/generation binding and a separate metadata-only attention channel; output content needs its own protocol boundary. [B2; B3; B4; P1]

| Alternative / prior art | What this design takes or rejects | Evidence |
|---|---|---|
| Native mod presentation | Retains the CLI, but the experiment needed fullscreen mouse support for clickable inline controls; classic keyboard helpers worked. Companion is the selected graphical surface. | D1; E2 |
| Warp blocks | Take explicit Copy and distinct command/output areas. Do not infer suggestion intent from a shell-block precedent. | P1 |
| VS Code shell integration | Keep command source separate from visual lines. Ordinary shell markers do not establish Claude message/tool semantics. | P1 |
| Official Claude VS Code UI | Behavioral precedent for graphical presentation plus a terminal mode; no reuse of proprietary implementation is assumed. | P1 |
| ACP / SDK replacement | Explicit identity/status is useful prior art. Do not replace the retained interactive CLI; subscription/distribution eligibility and same-session terminal access were not established for that replacement. | P1; R2 |

No third-party implementation code is selected for reuse. The prior-art report records primary links and license distinctions. Working local authentication is not a blanket third-party distribution approval. [P1]

## Session layout and normal use

**Author's call:** make the feature an explicit workspace opt-in initially. When enabled and capable, Companion is the initial output view for a new session. Remember a live session's selected view across tab changes and webview recreation; use the workspace preference for a new process generation. An unsupported session opens Raw terminal with a short explanation. This bounds rollout to the single qualified build/platform without changing ordinary CLI launch support. [E1; E3; B3]

The session output area has two mutually exclusive views, **Companion** and **Raw terminal**, with an always-visible toggle and Stop action. The existing composer and adjustable divider remain below the output area. Switching views preserves the composer draft and the same PTY/xterm instance; output continues while either view is hidden. Do not restart Claude or rebuild xterm to toggle. Preserve each view's scroll position and restore focus to the control that initiated a toggle. Raw terminal selection explicitly focuses the terminal. [D1; E3; #145; B5]

In Companion, show one ordered reading stream: user prompt, Claude explanation, tool request/command, then associated output/status. Use spacing, headings and textual labels rather than color alone. Keep incoming questions/permissions in a persistent request area above the composer, reachable without scrolling through output. Do not steal keyboard focus when a request arrives. A compact attention link moves focus to the request on explicit activation. Exact colors, typography and spacing are builder choices using the existing VS Code theme. [Author's layout call: R1; E1; E3]

Annotated example, with the two command categories deliberately separate:

```text
Session A                       [Companion | Raw terminal] [Stop]

Claude explanation
  Try this from your project directory:

Suggested / example             Not execution evidence   [Copy]
  npm test -- --reporter spec

Bash tool                       Completed                [Copy]
  npm run check:types
  Tool output: ...

Claude requests permission       Bash: <exact command>
  [Allow once] [Deny] [Respond in terminal]

---------------- existing adjustable divider ----------------
Existing composer and its saved draft                   [Send]
```

The example is a proposed layout, not a new screenshot or an execution receipt. [Author's layout call: R1; D1]

### Command provenance and copying

Use the following deterministic categories rather than adding a model-based intent classifier. [Author's labeling call: E1; P1]

| Source / evidence | Label and Copy contract |
|---|---|
| Fenced command/code in Claude's explanation | **Suggested / example**, with **Not execution evidence**. Preserve the surrounding explanation. This is a provenance category, not a claim that every fence instructs the user to execute it. Other code fences remain Code examples with Copy. |
| Tool request before confirmed execution | **Requested — execution not confirmed**; Copy requested command. A tool.call or PreToolUse event alone does not establish that a process started. |
| Source-backed execution/progress evidence | **Running** with tool identity; Copy shown command until effective input is verified. |
| Successful tool result linked to effective command input | **Claude ran this · Completed**; Copy command. A shell exit failure can still establish an executed command, with **Failed** and its actual outcome. |
| Denial, cancellation, interruption or missing events | Show that specific evidenced outcome, or **Outcome unknown**. Never promote a denied/pending request to executed. |

Do not extract unmarked commands from arbitrary prose or merge identical-looking code fences and tool calls without shared identity. Keep requested and effective input distinct when hooks change a command. If the effective command cannot be verified, retain **Copy shown command** and do not promise that it is exactly what ran. Correlate tool and turn evidence; error-string parsing and one interrupt flag are insufficient authorities. [E1; E2; E3]

Copy reads the immutable source string, never rendered DOM text or xterm rows. For a code fence, exclude fence delimiters/language markers and preserve the body, including its whitespace and trailing newline. For a tool command, preserve the selected requested/effective input string. Do not trim, reindent, add a prompt prefix or join visual wraps. Store canonical logical newlines; Windows clipboard LF-to-CRLF conversion is allowed only one-for-one, preserving line count and content. Literal cross-platform byte identity is not promised. [Author's copy contract: R1; E1]

Every complete code/command block has a keyboard-accessible Copy action and nonintrusive success/failure feedback. A partial streaming fence or payload exceeding the full-copy limit must not expose a misleading complete-command Copy button. Mark it incomplete/truncated and offer Raw terminal. The UI must distinguish display truncation from availability of the full source: Copy may remain enabled only when the complete bounded source is retained. [R1; E1]

## Direct interaction contract

Normal prompts continue through the existing production composer and its acknowledgement/queue/draft rules. The disposable harness's direct PTY Send wrapper is not retained. While a structured request needs a response, show its dedicated controls and preserve the normal draft; ordinary Send follows the existing native dialog guard. A submitted question answer is not a new ordinary prompt. [#145; B3; E3]

Question/permission actions carry the renderer document identity, managed session ID, canonical Claude UUID, process generation, bridge epoch, request ID/revision and a unique action ID. Stop is a separate native-input intent: it carries document/session/generation/action identity and the observed foreground-turn identity when available, not a question or permission request ID. The host derives and validates ownership against current state immediately before dispatch; the webview cannot name an arbitrary process, command, path or permission rule. The CLI-side owner revalidates the same pending question/permission request before consuming a response. A sent transport frame is not an accepted answer. [Author's control contract: B3; E3]

### Questions

Initially handle the tested AskUserQuestion choice schema: multiple questions, single choice, multiple choice and Other/free-text answers. Show the exact question and option labels; let the user edit before an explicit **Submit answers**. No default selection is submitted automatically. Map answers to the original question strings and retain the original questions in updatedInput; the real AskUserQuestion tool consumes them. Duplicate question strings, unrecognized schemas or unsupported interaction requirements use native fallback. This avoids inventing support for number sliders, previews, plan approval or MCP elicitation from the choice-only experiment. [E3]

Keep request drafts in live memory, separate from saved composer drafts. Show **Sending**, then **Answered** only after native consumption/result evidence. If delivery is uncertain, keep the typed answer visible but disable blind resubmission and offer native verification. Do not automatically resend after timeout, reconnect or reload. [Author's acknowledgement call: B3; E3]

### Permissions

Initially support **Bash Allow once** and **Deny** only. Show the actual requested tool/input and scope; keep native policy and configured denials authoritative. Do not infer persistent approval choices from permission_suggestions, change permission modes, save rules or silently approve a request on error. Other native dialogs use Respond in terminal. [E3; W1]

PermissionRequest omits tool_use_id. The experiment linked a unique tool.check tool/input pair to its native call ID. Use that route only while the binding is unambiguous and current; duplicate/rewritten/unmatched inputs and unsupported subagent identity must stay native. Production implementation must verify where effective input and native completion invalidate that binding. A request-local nonce alone does not prove which native tool it authorizes. [E3; W1]

Several distinct requests may be pending at once. Each has independent input, answer draft, controls and lifecycle. Native-terminal completion and companion completion compete for the same request: the first native completion wins, controls become read-only, and a late action cannot affect another request. A host or CLI acknowledgement that loses this race reports stale/already resolved rather than success. [E3]

### Raw-terminal handoff

**Author's call:** selecting Raw terminal while a companion-owned request is held hands that request back to the native CLI, then focuses the same xterm. Respond in terminal performs this same handoff and toggle. Invalidate companion submission authority before releasing the hook unchanged; do not manufacture an answer, denial or permission. This is necessary for a question held before the native dialog exists. [E3]

Switching back to Companion does not retake an already native-owned request. Show its pending status and a Respond in terminal link until native completion; retain any typed companion answer read-only for reference while that request lives. A simple view toggle with no held request changes presentation only. Unsupported dialogs show a clear fallback prompt, without automatically switching views or stealing focus. Raw access must remain usable even when capture is unavailable. [Author's ownership call: D1; E3]

### Stop

Send one native Escape to the selected live CLI's existing input path, serialized with other native input after target validation. Stop is foreground-session control; it must not submit editor text, depend on content capture being healthy, or create a second process. Existing editor/menu Escape handling remains local; do not globally capture every Escape in the webview. [D1; E3; B3]

**Author's call for degraded capture:** when trusted turn identity is unavailable, label this native action **Send Escape to selected CLI** and make a fresh press explicitly process-scoped. Validate the current document, selected live session and process generation immediately before writing; do not queue it for later delivery. Never silently downgrade an already queued turn-scoped Stop to this process-scoped action. This preserves native control when semantic capture fails without pretending to know which turn is live. [B3; E3]

Show **Stop sent** until correlated native evidence confirms cancellation/interruption or makes the outcome uncertain. A turn-scoped Stop awaiting an old turn, or any Stop with an old generation, is rejected rather than retargeted to new work. Process-scoped Escape reports only that native input was sent unless completion evidence is available. Do not automatically retry keystrokes after an uncertain result. An explicit later Stop is a new action against newly observed state. [Author's Stop contract: E3]

Do not use $.turn.abort as the Stop implementation: the tested API ended the turn but backgrounded a running Bash command that subsequently finished. Native Escape actually terminated the timed shell fixture. Cancelling a native permission request can still report reason=answer/isAborted=false, so distinguish a cancelled request, an interrupted process, a completed turn and a background task. Stop does not claim to kill previously backgrounded tasks; their management remains native. [E3]

## Data, ownership and integration

Use two independent paths into the panel: unchanged PTY bytes for xterm/replay, and a validated semantic stream for the companion. The session host owns a bounded canonical companion model; a webview is a projection that can be recreated. The content/control protocol must be separate from metadata-only attention and from the current composer request schema, while reusing lifecycle and identity utilities where appropriate. Existing attention remains the single owner of activity/notifications; output observation must not emit duplicate attention transitions. [Author's integration call: B2; B3; B4; E1; E3]

For the first useful scope, finalized assistant text comes from validated append events; typed tool lifecycle/input/results drive tool cards, and the tested pre-tool/permission hooks own direct controls. Show Claude working while no finalized content is available. Token-by-token Markdown streaming and incremental tool output are not required in this first scope; identify completed-only capture and offer Raw terminal for live progress. Do not ship the prototype's broad capture of thinking blocks, signatures or arbitrary append payloads. [Author's bounded capture call: E1; E2; E3]

Each envelope has a closed schema, authenticated private-channel binding, session/generation/epoch, monotonic per-source sequence and event identity. Preserve native order within a source; correlate tool request/result by native identity, not command text. Keep assistant message identity distinct from display-batch identity. Duplicates are idempotent; a gap, unsupported schema or lost completion becomes a visible incomplete/unknown state rather than guessed content. [E1; P1; B3]

Display observers enqueue bounded observations and promptly continue native processing unchanged. They may not wait for a webview, full disk write or network response. Interaction hooks may wait only while their explicit live request is owned; they need cancellation and a finite transport-health timeout that releases unchanged to native handling. Error paths must not hang the CLI, approve a tool or swallow native output. Exact scheduling, transport and timeout values are builder-owned and must be named/tested in the implementation plan; the prototype's polling/writes are not production architecture. [Author's isolation call: E1; E3; W2]

A private same-host channel may follow the current composer lifecycle pattern, but the new content schema is independently bounded and versioned. Do not ship the test web server or expose an unauthenticated endpoint. If IPC uses files, they are transient content-bearing transport, not history: restrict access, bound bytes/count, retire consumed slots and clean only marked owned dead channels. Tokens and content must not enter ordinary diagnostics or the attention publisher. [Author's transport call: B3; B4; E3]

Render output as untrusted text/Markdown: no raw HTML, scripts or remote resources; never execute a command through Copy or a rendered link. Reuse the panel's trusted link-opening boundary and CSP. No assistant-provided URI, path or button can mint an approval/control action. [Author's rendering boundary: #52; #145; B5; E3]

## Lifecycle, retention and capability

**Author's call:** retain structured content only in bounded host memory for the live process generation. Transient IPC content may briefly reach disk as described above; no additional durable transcript database, transcript tailing, export or restart-time structured history is introduced. Webview reload rehydrates a snapshot from that live host model; it cannot replay old actionable controls. Raw terminal replay keeps its existing contract. [E1; E3; B2; B3]

On restart, /clear, in-process /resume, process replacement, plugin reload, host shutdown or UUID change, retire the old bridge epoch and pending authority before accepting new actions. A resumed CLI has a new capture boundary: show **Structured capture starts here; earlier content is available in the terminal where retained**. Do not synthesize a rich history from terminal rows. Session switches isolate content, answer drafts, scroll and control IDs; inactive sessions can accumulate bounded events without moving focus. [Author's lifecycle call: E1; E3; B4]

Evict oldest complete blocks when memory caps are reached and insert a visible history-gap marker. Never retain an unbounded queue or silently crop a copyable command. Pending actionable request metadata is not evicted as history; if it cannot be retained safely, hand it to native UI. On overflow or capture loss, keep terminal traffic and Stop usable, mark affected outcomes unknown and disable only controls whose identity/completeness is no longer trustworthy. [Author's overflow call: R1; E1; E3]

Capability is explicit and separate for output capture, question answers and each supported permission kind. Initially qualify Windows local sessions on build 2.1.317 with an authenticated protocol/schema handshake; this is a tested baseline, **not a discovered minimum version**, and does not prove all later builds compatible. Expand the qualification list through evidence. Unsupported/unknown builds or remote hosts retain ordinary raw CLI use. Do not lower or reuse the existing composer capability floor for this feature. [E3; B3]

Bridge loss while a request waits revokes companion controls, preserves the answer text in memory where possible and releases the request to native UI on the finite health timeout. Show **Respond in terminal**. A lost acknowledgement is unconfirmed, not permission to retry. Reconnection establishes a new epoch and a fresh authoritative snapshot; it cannot revive stale cards or approvals. Exact handshake/backpressure implementation is builder-owned; these outcomes are fixed. [Author's failure contract: E3; B3; W2]

## Acceptance and implementation handoff

The implementation plan must define concrete byte/block/queue budgets, request-health and acknowledgement timeouts, supported build/schema matrix and measurable responsiveness/memory regression thresholds before product code begins. Those values require baseline measurements; this design makes no unverified latency or delivery estimate. A builder can choose mechanisms and values within the fixed behavior above. [Author's qualification gate: E1; E2; E3]

Required acceptance evidence for the eventual feature:

1. Real supported subscription-backed CLI, no extra API backend, with credential precedence respected and no credential-value collection. Test the packaged VS Code feature as well as deterministic protocol tests. [R2; P1; E3]
2. Actual clipboard checks for long/wrapped and multiline commands, quoting, Unicode, trailing newlines, source/effective-input changes, incomplete content and failed clipboard writes. Verify logical content and OS newline conversion separately. [R1; E1; E2]
3. Questions with multiple fields, single/multi/free text, explicit submission, stale/duplicate answers, native handoff and unsupported schema fallback; preserve the normal composer draft and queue semantics. [D1; E3; #145]
4. Allow/Deny for distinct concurrent tools, configured native denials, identical/rewritten-input ambiguity, native-first and companion-first completion, delivery races and acknowledgement loss. No persistent rule/mode changes. [E3]
5. Native Escape with a pending question, pending permission and running foreground process; prove process termination with a delayed completion sentinel, not just turn flags. Keep background state distinct. [D1; E3]
6. Toggle while idle, working and awaiting a response; same PTY/xterm, native keyboard controls, preserved drafts, focus and scroll, and continued native commands after companion use. [D1; E3]
7. Reload, reconnect, stop/start, /clear, /resume, plugin loss, rapid session switches, gaps, duplicate/out-of-order events, malformed/oversized frames, queue saturation and truncated history. Raw terminal and native policy remain usable. [E1; E3]
8. Keyboard-only operation, screen-reader labels/order/live status, high-contrast themes, zoom/wrapping, pointer selection and no focus theft. Compare terminal responsiveness and memory with capture off/on at the declared workload/budgets. These are unqualified by the probes and required for acceptance. [R1; E1; E2; E3]

Relative scope is **medium-to-large implementation with substantial qualification**, an author's assessment rather than a calendar estimate: the experiments prove core behavior, while identity, content transport, lifecycle and accessibility require product work. The native alternative avoids a second reading model but did not remove its fullscreen/input/progress qualification risks. The maintainer selected the companion on that evidence. [D1; E1; E2; E3]

After design approval, organize implementation issues under a milestone before work begins. Suggested responsibility boundaries are semantic capture/model/transport; companion formatting/Copy/toggle; request controls/native Stop; and packaged lifecycle/accessibility/performance acceptance. These are handoff boundaries, not newly created work items or permission to implement them. Keep the spike open until the maintainer accepts its deliverables. [#215; D1]

## Sources and persistence

Issue evidence is durable; disposable worktree source paths and screenshots are not dependencies of this document. The experiment source is embedded in the linked issue archives. Runtime links below point to an already committed prerelease snapshot, not files this stable-main documentation PR claims to add. Author's calls throughout are proposed requirements grounded in those sources, not claims that the product already behaves that way.

- **D1:** [Maintainer-selected final design direction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647613612).
- **R1:** [Approved lightweight requirements](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645367194).
- **R2:** [Subscription requirement](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645377864).
- **P1:** [Prior art, authentication filter and source comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645475201); primary external links and retrieval dates are recorded there.
- **E1:** [Companion copy/rendering results](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033) and [embedded source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).
- **E2:** [Native comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408) and [embedded source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646833619).
- **E3:** [Focused controls, interruption counterexamples and limits](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988) and [embedded phases A-D, source, receipts and API excerpts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596).
- **B1:** [Experiment runtime manifest](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/package.json#L1-L19).
- **B2:** [PTY/output/replay ownership](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L615-L674).
- **B3:** [Composer identity and native acknowledgement contract](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerBroker.ts#L14-L80), [private channel/platform guard](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L32-L105), and [independent composer floor](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerTypes.ts#L1-L25).
- **B4:** [Metadata-only attention and lifecycle integration](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L114).
- **B5:** [Panel CSP](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L360-L397) and [existing xterm instance/write surface](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts#L28-L106).
- **B6:** [Runtime branch policy](https://github.com/glitchwerks/vscode-claude-workspaces/blob/38cab4e6fdeaee2159de93241f138d9bb2d1c73b/docs/versioning-policy.md#L51-L63), [documentation policy classification](https://github.com/glitchwerks/vscode-claude-workspaces/blob/38cab4e6fdeaee2159de93241f138d9bb2d1c73b/docs/versioning-policy.md#L169-L177), and PR #197's main-owned design checkpoint for #145.
- **W1:** [Hooks: questions and PermissionRequest](https://code.claude.com/docs/en/hooks#tools-that-require-user-interaction) (fetched 2026-11-04); the initially headless example was tested in the retained interactive build in E3. PermissionRequest coverage is limited as recorded there.
- **W2:** [Mod event continuation and decision behavior](https://code.claude.com/docs/en/plugins/mods/events) (fetched 2026-11-04); installed-build behavior and failed strategies are retained in E3.
