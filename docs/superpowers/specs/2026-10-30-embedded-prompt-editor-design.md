# Embedded prompt composer with session drafts

Date: 2026-10-30. Parent work item: [#145](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145).

## Status and authority

The maintainer selected the adjustable split layout and confirmed the behavior below in the #145 design conversation. The decisions are recorded in #145. This document finalizes the product design; it does not authorize runtime implementation, select a release, or close #145. Implementation feasibility gates remain explicit. A design-only PR must reference #145 without an issue-closing keyword. [#145]

Repository observations in this document use `07060dbeafb7942573a701512ca46686ef87bedd`, the main-branch baseline used to author it. Recheck the active development line before implementation: the versioning policy separates feature development from stable promotion. This design-only branch does not add the feature to stable. (`docs/versioning-policy.md:L35-L46`; #183)

## Intent and agreed scope

Make a persistent, comfortable editor the normal place to compose Claude prompts while leaving the session terminal visible above it. The editor belongs inside Claude Workspaces, not in a separate window. The maintainer selected **Adjustable split** after comparing Compact, Adjustable split, and Command browser mockups. [#145]

The first version includes:

- Multiline editing, selection, clipboard operations, undo/redo, find/replace, and wrapping.
- A draggable horizontal divider, show/hide control, and keyboard-accessible composer actions.
- Customizable shortcuts: Ctrl+Enter sends or queues; Enter inserts a newline; Ctrl+G shows/hides the composer.
- One unsent draft per session, restored on tab switches, application restart, and session resume.
- A searchable picker for user-invocable skills and built-in slash commands.
- Four bounded extras: file-reference insertion, recent composer prompts, favorite skills/commands, and basic Markdown preview.
- Claude's normal queuing and existing terminal queue display. There is no custom composer queue counter or queue manager in this version. [#145]

Selecting a skill or command only edits the draft. Submission remains an explicit user action. The terminal remains available for ordinary direct input, permission dialogs, questions, and other native interactions. [#145; D2]

## Layout

The existing session tabs and session-action sidebar remain. The terminal and composer share the main session column; the picker opens on demand rather than permanently taking a column away from the editor. This is the selected layout, not the permanent Command browser alternative. [#145]

```text
Session tabs
+----------------------------------------------------+------------------+
| Claude session terminal                            | Session actions  |
|                                                    | Resume sessions  |
| Claude's native output and queue display            |                  |
+---------------- draggable divider -----------------+                  |
| Session name                Draft saved   Expand v |                  |
| Skills & commands   File   Recent  Shortcuts Preview|                  |
|                                                    |                  |
| Prompt editor                                      |                  |
|                                                    |                  |
| Enter: new line   Ctrl+G: hide  Send / Queue message |                  |
+----------------------------------------------------+------------------+
```

**Design defaults, author's calls:** start the composer at approximately one third of the available session height; remember the split per workspace. Constrain resizing so both regions remain usable. An expand control gives more space to writing and restores the previous split when toggled again. At narrow widths, wrap the toolbar and use a bounded picker overlay. Exact minimum dimensions are builder-owned and must be checked in real panel layouts. These defaults implement the chosen adjustable split without adding another window. [#145; D1]

Hiding leaves a small, visible Show prompt editor action. Showing focuses the composer; hiding returns focus to the session terminal. Both actions preserve the draft. Background output, activity changes, unread markers, and autosave must not steal editor focus. The current renderer explicitly focuses the terminal during render, so focus ownership needs to become intentional. (`src/panel/webview/renderer.ts:L282-L312`; #145)

The existing terminal resize observer is reusable as the layout boundary changes. Do not rebuild or detach the active terminal or recreate the text editor for each draft change. (`src/panel/webview/renderer.ts:L430-L451`; #145)

## Keyboard behavior

| Default | Behavior and scope |
| --- | --- |
| Ctrl+Enter | Submit from the composer. If Claude is busy, use normal Claude input queuing. |
| Enter | Insert a newline in the editor. |
| Ctrl+G | Toggle the composer while Claude Workspaces has focus, including when the composer is hidden. |

Expose composer commands through VS Code's Keyboard Shortcuts editor and provide a Configure shortcuts action in the composer. Ordinary embedded-editor actions also need an intentional binding adapter; do not assume all main-editor bindings or keymap extensions automatically apply. Scope commands to the relevant focused view and composer/picker state, and validate command delivery from the webview. [#145; D1; D3]

Ctrl+G deliberately overrides Claude's native external-editor shortcut inside Claude Workspaces. Outside this view, preserve the user's normal VS Code bindings. Ctrl+Enter is a composer action: **do not forward the raw native Ctrl+Enter sequence**, which Claude documents as send-now behavior that may interrupt work. Invoke the ordinary submission path instead. Do not submit during IME composition or while the skill picker is using Enter to accept an item. [#145; D2; D3]

## Session identity and draft lifecycle

Persist composer state in extension-owned workspace storage associated with the canonical Claude session UUID, with the root identity and path needed to validate recovery. Do not use the temporary managed PTY ID as the durable draft key. The existing saved-session store is keyed by `claudeSessionId`, and new/resumed launch planning already preserves that identity. (`src/sessions/resumableSessionStore.ts:L8-L25`; `src/launch/sessionLaunch.ts:L22-L49`; #145)

**Design default, author's call:** use a versioned companion composer-state document keyed by that UUID, keeping the existing saved-session document compatible. Draft state is logically part of the saved session; no draft is written into Claude's own transcript or project files. Existing saved-session parsing accepts only its recognized schema version, so changing its schema requires an explicit migration rather than silently replacing old data. (`src/sessions/resumableSessionStore.ts:L24-L25,L150-L160`; #145)

Draft behavior:

1. Each session owns its draft text and editor selection. Switching tabs saves the old session's latest edit and restores the target session's state.
2. Persist changes through the extension host while editing. A Saved indicator means the backing write succeeded; while a write is pending or failed, show that state truthfully.
3. Flush on explicit hide, tab switch, submission, and normal close where possible. Recovery must not rely solely on a webview unload handler.
4. Restarting VS Code or resuming a conversation restores the last successfully persisted unsent draft. Abrupt termination cannot promise persistence of a keystroke whose storage write never succeeded.
5. Closing a live session retains the draft. Forget Session removes its composer state and per-session history as well as its saved metadata.
6. A failed submission retains the draft. A successful submission clears only the revision that was accepted; text entered while submission was pending must survive.
7. Serialize writes and reject stale updates by session/generation/revision so old asynchronous work cannot replace a newer draft or recreate a forgotten session. [#145; D1; `src/sessions/resumableSessionStore.ts:L65-L85,L114-L145`]

**Design default, author's call — draft-only recovery:** a newly opened session may have an unsent draft but no resumable conversation yet. Keep that draft discoverable rather than hiding it behind conversation eligibility. Present Restore draft alongside the saved-session area. If there is no confirmed resumable transcript, restoring validates the original workspace root, starts a fresh managed session only after that explicit action, and transfers the draft to its new durable identity after launch succeeds. On failure, keep the original recovery record. This is draft recovery, not a promise to resume a nonexistent conversation. The existing eligibility filter can exclude sessions that have no conversation; the new draft UI must account for that distinction. (`src/panel/sessionPanelProvider.ts:L509-L564`; #77; #145)

If a session has no supported durable Claude identity, keep ordinary terminal use available and clearly report that durable composer recovery is unavailable. Do not silently advertise restart-safe drafts for that session. Exact capability fallback presentation is builder-owned. (`src/launch/sessionLaunch.ts:L23-L34`; #145)

## Skills and commands

Use an on-demand searchable list showing the actual invocation, description, and reliable source information. Preserve namespaces and duplicate-name distinctions supplied by the running session. Favorites provide a small filter within this picker. Initially use a unified list; separate Skills and Commands categories are not required unless the live API can classify them reliably. The reviewed `CommandInfo` carries name, description, source, and optional plugin identity, but does not itself provide a skill-versus-command discriminator. [#145; D4]

Prefer Claude's supported live command listing through the extension-owned mod over reproducing discovery by scanning all skill folders. The documented API includes `command.list`, and the reviewed declarations describe the commands available to the person in that session. This is a candidate integration, not a verified claim that the current managed-session bridge already supports it. Validate installed-version behavior and refresh on session changes, picker opening, and explicit refresh. A failed refresh must not send text or remove a draft. [D4; D5; #145]

Choosing a row inserts its exact invocation at the beginning of the prompt, or replaces an incomplete invocation there, with the remaining prompt as arguments. Typing `/` at the beginning may open the same picker. Preserve editable text and do not execute on selection. Claude distinguishes a skill at the start of a message from a skill mentioned in body text; the submission route must retain normal terminal skill expansion and command semantics. Do not silently convert a selected command into prose sent to the model. [#145; D6]

When command discovery is unavailable, show that state and retain manual prompt editing and direct terminal use. Do not present a guessed list as the running session's authoritative capabilities. [#145; D4; D5]

## Four bounded extras

### File references

Open a small searchable file picker for the selected session's launch root and explicitly imported directories; insert a supported `@path` reference at the cursor. Resolve scope from host-owned session state, not arbitrary filesystem paths supplied by the webview. Follow normal workspace exclusions and keep results bounded. Validate spaces, Windows paths, imports, and the reference's behavior through the chosen native submission route. Do not upload file contents, build a new repository index, or add attachment handling. The session snapshot already records the launched root and imported paths. [#145; `src/sessions/sessionTypes.ts:L12-L27`]

### Recent prompts

Store a bounded, per-session history of prompts successfully accepted from this composer. Show snippets; selecting one copies it into an editable draft without sending. If the current draft is nonempty, offer Replace or Append before changing it. Do not read or search Claude transcripts, capture direct-terminal keystrokes, or include failed submissions. History survives reopening the saved session and is removed when that session is forgotten. Exact entry and storage caps are builder-owned; drafts must never be silently truncated to meet a history cap. [#145]

### Favorites

Persist favorite invocation names in workspace-level extension state so they are useful across sessions. Revalidate favorites against the selected session's live list. Keep unavailable favorites stored but visibly unavailable; do not execute a different command that happens to have a similar display name. No cloud synchronization or ranking system is included. This workspace-level scope is an author's default, not a separate maintainer request. [#145; D4]

### Markdown preview

Provide an optional Edit/Preview toggle in the same composer area, retaining the draft and selection. Limit rendering to headings, emphasis, lists, links, and fenced code. Disable raw HTML and scripts; do not load remote images or add an interactive document renderer. Link navigation follows the extension's existing supported external-link boundary. The original Markdown text is what gets submitted. This is the bounded preview accepted under #145; parser selection is builder-owned. [#145; D1]

## Submission, native queue, and failures

The UI binds each action to the intended live session generation and durable UUID. A request has a unique submission ID and draft revision. The host validates identity, state, payload limits, and session ownership immediately before delivery. Repeated clicks, repeated webview messages, or a restored document must not create duplicate submissions. The current input protocol carries a session ID and submission intent, while `SessionManager.write` returns no acceptance result. A successful PTY write is not enough to clear a draft. (`src/panel/protocol.ts:L30-L38,L119-L130`; `src/sessions/sessionManager.ts:L319-L331`; #145)

Distinguish **accepted by Claude's normal input path** from processed by the model. Clear the accepted draft revision once, after acknowledgment; do not wait for a completed response. If delivery is uncertain, preserve the draft and show Delivery unconfirmed. Do not automatically retry a possibly accepted request or label it Failed when it may have been queued. A rejected request may be explicitly retried with the user's action after its cause is addressed. [#145; D5]

While Claude works, ordinary prompts follow Claude's native queue timing; they may be consumed during a turn. Some built-in commands run immediately, while others queue until a turn ends. Keep that command-specific behavior. Claude owns the queue and displays it in the terminal. Do not maintain an inferred queue count, promise send-only-after-completion semantics, add an extension-owned durable queue, or replay queued prompts on restart. Unsent drafts and submitted queued messages are distinct. [#145; D2]

Permission/question dialogs remain native terminal interactions. The composer must not turn a prompt into dialog keystrokes. When a dialog owns input and normal submission cannot be safely accepted, keep the draft and direct focus to the terminal. Likewise retain drafts when a session closes, changes generation, loses its bridge, or rejects a request. This boundary must be demonstrated, not inferred from the broad idle/working/waiting indicator alone. [D4; D5; #145]

## Implementation boundaries and feasibility gates

Build on the existing TypeScript extension host, closed message protocol, and webview view. Add a composer controller, versioned persistence, command-discovery adapter, and an embedded editor view with explicit focus ownership. These are responsibilities, not prescribed new filenames. [#145; `src/extension.ts:L635-L677`; `src/panel/protocol.ts:L29-L80`]

**Author's proposed editor default:** evaluate CodeMirror 6 first, configured for prompt writing and Markdown. Its existing building blocks include editing history, search, and completion; Monaco is another available browser-editor option. The final package/version and bundled footprint remain builder-owned and need a small packaging check; no performance advantage is claimed without measurement. No library has been installed for this design. [D7; D8]

Before product implementation depends on the bridge, validate on an actual managed Windows session:

1. Obtain the running session's supported command listing, including user skills, plugins, namespaces, and built-in commands, without model calls.
2. Submit multiline text through the normal input path, preserving slash expansion, `@file` handling, pending terminal-input safety, dialogs, and native busy-session queuing.
3. Obtain an acceptance result and correlate it with one submission ID/revision. Prove rejected, accepted, dropped, and ambiguous outcomes where supported.
4. Show that input from one session cannot reach another after tab switches, restarts, stale callbacks, or concurrent activity.
5. Verify the chosen APIs and capability fallback against the project's supported Claude versions; do not silently raise the minimum version. [#145; D4; D5; D6]

The mods API provides promising operations for command listing and reading/filling/submitting a prompt. They do not establish that direct programmatic prompt submission passes through the same parsing stage as typed terminal commands. Choosing a route requires the tests above. If a supported route cannot meet the contract within the agreed scope, bring back the demonstrated constraint before changing product behavior. [D4; D5; D6; #145]

Any transport carrying composer text is separate from the attention channel, whose current reporter explicitly excludes prompt and transcript content. Use a private same-host, per-session/generation boundary; validate messages, limit payloads, and clean up temporary resources on completion or disposal. Do not expose an unauthenticated network listener, send prompt content to telemetry/logs, or add an external service. Transport details are builder-owned subject to these requirements. (`media/attention/hooks/register.js:L1-L24`; #145)

## Acceptance and verification

The feature is complete only when #145's criteria are met, including these checks:

- Editor and picker keyboard behavior, selection, clipboard, undo/redo, find/replace, and Markdown preview.
- Split resizing, narrow panel widths, show/hide, and focus retention while output and status events arrive.
- Per-session drafts across tab switches, delayed writes, reload, restart, resume, draft-only recovery, close, Forget, and storage failures.
- New edits surviving acceptance of an older draft revision; duplicate messages and stale acknowledgments causing no extra send or draft loss.
- Actual skill, built-in-command, multiline, file-reference, native-queue, direct-terminal-input, and permission/question behavior through a real managed CLI.
- Composer-only recent history, favorite availability, bounded file scope, unsafe preview content, and no prompt text in diagnostics.
- Documentation for the shipped composer, shortcut customization, draft/history storage and cleanup, capability limitations, and native queue behavior. README changes belong with implementation, once those behaviors are verified. [#145]

Use meaningful unit/integration coverage and real Windows keyboard/PTY evidence. The existing repository already has protocol, session-manager, renderer, and extension integration tests; mocked browser behavior alone is not proof of CLI acceptance. (`test/unit/protocol.test.ts`; `test/unit/sessionManager.test.ts`; `test/unit/webviewRenderer.test.ts`; `CONTRIBUTING.md:L24-L47`; #145)

## Non-goals and builder-owned choices

Out of scope: pop-out windows, a permanent command-browser column, a custom queue display/manager, image or document attachments, transcript search, a general template system, cross-device draft sync, changing activity authority, and executing commands when selected. [#145]

The builder may choose concrete modules, parser/editor packages, bridge transport satisfying the gates, debounce intervals, history caps, picker result limits, and exact responsive dimensions. The builder may not drop restart-safe drafts, change shortcut intent, substitute an inferred queue, broaden capture to terminal history, or change the approved scope without a new maintainer decision. [#145]

## Sources

- **[#145]** [Embedded prompt composer issue](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145). Contains the confirmed product decisions and scope as updated on 2026-10-30.
- **D1:** https://code.visualstudio.com/api/extension-guides/webview (fetched 2026-10-30). Webview boundaries, state, theming, messaging, and content restrictions.
- **D2:** https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works (fetched 2026-10-30). Normal queue behavior, command-specific timing, Ctrl+Enter, and terminal interactions.
- **D3:** https://code.visualstudio.com/docs/configure/keybindings and https://code.visualstudio.com/api/references/when-clause-contexts (fetched 2026-10-30). Rebinding and focused context conditions.
- **D4:** https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts (fetched 2026-10-30; retrieved Git blob SHA `e3636ade596e23aa9d8786dd21b42a9840e3191f`), declarations identifying themselves as generated by Claude Code 2.1.277. Relevant declarations: `CommandInfo`, `CommandSource`, `command.list`, `prompt.read`, `prompt.fill`, and `PromptSubmitResult`. These are research evidence, not installed-version validation.
- **D5:** https://code.claude.com/docs/en/plugins/mods/reference#mods-api-methods and https://code.claude.com/docs/en/plugins/mods/api (fetched 2026-10-30). Current documented operations and refused/dropped prompt behavior; installed-build declarations take precedence.
- **D6:** https://code.claude.com/docs/en/skills#where-you-write-the-skills-name (fetched 2026-10-30). Invocation placement and terminal skill/command semantics.
- **D7:** https://github.com/codemirror/basic-setup/blob/main/src/codemirror.ts and https://github.com/codemirror/dev (fetched 2026-10-30). Existing CodeMirror editor building blocks and the project's move from GitHub to its new source host. These archived source examples establish candidate capabilities, not a claim about the latest package version or bundle size.
- **D8:** https://github.com/microsoft/monaco-editor and https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md (fetched 2026-10-30). Browser-editor models and integration/bundling requirements.

Repository paths cited above are committed source references at the stated baseline. Issue/PR references are durable tracking sources. The temporary interactive mockups are not required artifacts: the selected layout and all approved behavior are reproduced in this document and #145.
