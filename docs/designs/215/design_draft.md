# Copy-friendly Claude Code companion

* **Author:** Christopher Beaulieu
* **Status:** Draft — Overview & Goals and Technical Plan approved; live-only capture and private files selected; Alternatives Considered awaiting section approval. [O; L; T]
* **Date:** 2026-11-06
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **Predecessor:** [Finalized concepts brief](concepts_brief.md), approved for this first-version scope and formal drafting. [A]

Overview, The Problem, Goals and Non-Goals were approved on 2026-11-06. The author subsequently selected live capture only, selected the private file channel and approved the Technical Plan. Alternatives Considered is now drafted for review; Detailed Implementation remains to be drafted. The [transport comparison](technical_choices.md#decision-2-live-content-transport) preserves the decision context. This document is not product implementation or release authorization. [A; O; L; T]

## Overview

Provide a companion view for the existing subscription-backed Claude Code CLI that keeps Claude's full explanation readable while making commands and file/folder paths easy to copy. Show commands in separate blocks with Copy actions, and place Copy buttons beside paths in prose or inline code. Do not replace the explanation with an extracted-item list or short context snippets. [B:Overview; B:Goals vs. Non-Goals]

The same native CLI remains available through a raw-terminal toggle, including its question/permission interactions and native foreground Escape behavior. Direct question and permission controls are optional, rather than prerequisites for the copying feature. The technical design must keep these existing access paths usable while defining how complete, source-backed copy targets reach the companion. [B:Confirmed foundation; B:Native interaction remains a real integration concern]

## The Problem

Selecting a command from a terminal is awkward when it wraps across visual rows. File/folder paths are also mixed into Claude's explanation or inline code, so selecting them can accidentally include surrounding words or formatting. The user wants a direct Copy action for the complete command or just the path. [B:Overview; H:Anchored hypothesis and user problem]

Removing the explanation would make those items easier to isolate but would discard context the user explicitly wants to retain. The required experience therefore combines full explanation text with distinct command blocks and adjacent path controls. [B:Keep the full explanation; copy from source rather than presentation; F]

Copy targets also need honest boundaries. A path with spaces, quotes or punctuation may be uncertain; a command-shaped example is not automatically an instruction or an executed command. Clear paths must remain one-click, while uncertain paths must show the exact candidate and permit correction before copying. Source-backed provenance must distinguish what Claude displayed from what it actually ran. [B:Prose/inline paths remain core; B:Copyability and intent are different claims; P]

The experiments support feasibility for controlled command copying and the tested native interactions. They do not prove general prose-path recognition, reliable command-intent classification, packaged-extension behavior, accessibility or long-session performance. These remain acceptance and technical-design work, not capabilities this draft claims already exist. [B:Evidence supports further consideration; R:M1-M6]

## Goals

1. **Copy complete commands.** A Copy action returns the full intended command, preserving meaningful quoting and newlines without introducing terminal visual-wrap artifacts. Keep copying available for commands Claude displays and, where established by source evidence, commands it executed. [B:Goals vs. Non-Goals]
2. **Copy just file/folder paths.** Recognize paths within explanations and inline code, and put Copy beside the relevant path. The resulting value excludes surrounding prose and Markdown formatting. Clear paths require a single Copy action. [B:Goals vs. Non-Goals; P]
3. **Preserve full explanation context.** Keep the entire captured explanation visible and readable, including headings, lists and code; show commands in separate Copy blocks. An extraction-only view or shortened context is not a substitute. [B:Overview; F]
4. **Make uncertain path copying explicit.** Before copying an uncertain candidate, show exactly what would be copied and allow the user to correct it. Do not silently guess, and do not impose correction on ordinary clear paths. [B:Confirmed refinement, 2026-11-06; P]
5. **Retain trustworthy provenance.** Distinguish assistant-displayed examples/suggestions from source-confirmed tool execution. Do not let a Copy button imply that a command was recommended or ran merely because it looks like a shell command. Exact labels are a later design decision. [B:Copyability and intent are different claims]
6. **Keep the subscription-backed session.** Use the same interactive Claude Code CLI without requiring a separate API key, separately billed inference backend or replacement session for the companion. [B:Retained constraints; H:Confirmed needs and boundaries]
7. **Preserve native interaction and Stop.** The raw-terminal toggle remains usable for answering questions, approving/denying requests and other native interactions. Retain native foreground Escape semantics and do not equate a turn-abort acknowledgement with stopping a running command. Direct controls may be included separately if selected later. [B:Native interaction remains a real integration concern; B:Goals vs. Non-Goals]
8. **Make Copy usable and its limits visible.** Support keyboard-reachable actions, identifiable targets and perceivable success/failure feedback. Partial or unavailable capture must not masquerade as a complete copy target or full explanation. The exact acceptance checks and operating limits belong to the technical plan. [B:Proposed safeguards for the selected view; R:M1, M4-M6]

## Non-Goals

* Replacing the full explanation with a path/command list or small excerpts. The maintainer explicitly selected full context. [F]
* Automatically executing commands when they are copied. The tracked work is an output/copying feature, not command-execution automation. [#215; H:Confirmed needs and boundaries]
* Replacing subscription sign-in/inference with a separate API backend, or starting another CLI process solely for formatted output. [B:Retained constraints; R:M6]
* Making direct question/permission controls mandatory for first-version copying. Optional status is confirmed; whether to include them is still a technical-scope choice. [B:Goals vs. Non-Goals; R:M7]
* Treating full explanation visibility as a promise of unlimited retained history, complete native-interface replication or universal cancellation of background work. Capture/history limits still need to be designed without quietly discarding visible context. [B:Goals vs. Non-Goals; B:Native interaction remains a real integration concern]
* Adding path-opening/resolution, silent path transformations or a general intent-classification service as hidden prerequisites for Copy. Such behavior has not been selected; any proposed transformation or added dependency must be an explicit technical-design decision. [B:Prose/inline paths remain core; B:Alternatives Weighed]
* Implementing or releasing product changes during this drafting workflow. This authorization covers design documents. [A]

## Technical Plan

The author approved this section with live-only capture and the private file channel. This establishes the design below, not that its untested behavior works. Detailed Implementation must resolve the remaining recognition rules, operating limits, file inventory and acceptance fixtures before implementation could begin. References to proposed mechanisms below describe design intent, not shipped capabilities. [T; L; B:Remaining formal-design work; R:M1-M6]

### Data flow and ownership

Keep one subscription-backed CLI with two output paths. Its existing PTY continues feeding the same xterm. An observational mod sends allowed live content through a separate channel to an extension-owned companion model; the webview renders that model. Capture must continue native event processing unchanged and must not wait for a webview, transport acknowledgement or user action. The experiments support the event approach only within their recorded cases. [L; E; X; C; proposed integration]

```mermaid
flowchart LR
  CLI[Same subscription-backed Claude CLI] --> PTY[Existing PTY and session owner]
  PTY --> RAW[Same xterm / Raw terminal]
  CLI --> MOD[Read-only live event observer]
  MOD --> CHANNEL[Private file channel]
  CHANNEL --> MODEL[Validated, bounded host model]
  MODEL --> VIEW[Companion: full explanation and Copy]
  VIEW --> COPY[Validated source value to clipboard]
  STOP[Native input / Stop] --> PTY
```

The host retains the current reading window independently of the webview. Recreating a webview can project that retained model again; this is not CLI snapshot recovery. Do not call session.messages, tail transcript files or reconstruct commands from terminal rows. On late attachment, loss or eviction, insert a visible boundary explaining what is unavailable. Do not silently join text across a gap. [L; C; R:M1, M4; proposed failure contract]

Observe only assistant-visible explanation text and the tool command/result evidence needed for the displayed output. Do not forward hidden reasoning, signatures, arbitrary internal payloads or the whole session environment. Keep content out of the metadata-only attention publisher and ordinary diagnostics. Attention retains its existing notification ownership; the companion does not introduce a second activity-state authority. [B:Retained constraints; R:M6; M; proposed capture boundary]

### Protocol and retained model

Define a separate versioned content protocol. Each accepted frame is bound to the managed session, canonical CLI session identity, process generation and capture epoch, with sequence/revision information and native message/tool identities where available. The host derives current ownership from its own session state, validates payload shape/size, rejects stale or duplicate frames and exposes missing sequences as gaps. A local sequence number cannot establish a native message identity that the source did not provide. Identity and update behavior need qualification against the installed CLI declarations. [C; S; R:M1, M3-M4; proposed protocol]

The host owns ordered explanation blocks, source text revisions, associated tool evidence and immutable copy targets. A target records its source block/revision/range, complete literal value, kind and provenance. Rendering may wrap or add controls, but cannot manufacture the copied value. Any revision that changes a target invalidates its earlier action rather than silently copying a newer value under an old button. Incomplete payloads have no enabled complete-value Copy action. [B:Keep the full explanation; copy from source rather than presentation; R:M1, M3-M4; proposed model]

Transport queues, frames, retained content and view updates must have finite limits. Evict complete older blocks with an explicit history boundary; do not silently retain only the tail of a command or explanation. Oversized/incomplete blocks must be visibly unavailable for exact Copy, with raw access. Detailed Implementation will name byte/count/time limits, queue overflow behavior and slow-reader tests for the selected transport. The current PTY replay limit is not a rich-history retention policy. [X; R:M1, M4, M6; proposed limits]

### Full explanation, command blocks and path controls

Render the full retained explanation with headings, lists and code, preserving its order and context. Put command content in distinct blocks within that reading stream; place path actions beside their spans in prose and inline code. Keep tool requests/results visibly separate from Claude's explanation. Use text labels, keyboard-reachable buttons and perceivable Copy feedback rather than relying on color. Do not replace explanation paragraphs with extracted snippets. [B:Overview; F; R:M1-M3, M6; proposed presentation]

Use a source-mapped rendering/extraction layer so every action refers to retained source text, not DOM text or terminal selection. The runtime already uses markdown-it with raw HTML disabled, restricted links and image placeholders; those safety conventions are candidates for reuse. Its composer preview is not a ready-made source-mapped output renderer, and its reference parser deliberately skips inline code, so neither establishes the required path-copy behavior. [K; proposed reuse boundary]

For commands, copy the complete retained command body, excluding Markdown fence delimiters and added UI. Preserve meaningful quoting, spaces and logical newlines; never add visual-wrap breaks or silently trim the value. The Windows clipboard qualification permits only the previously tested one-to-one LF-to-CRLF newline conversion. Suggested/example identification must not change the value. A finalized command can become copyable while the surrounding explanation continues, provided its own source boundary is complete. Exact command-recognition forms remain Detailed Implementation work. [B:Goals vs. Non-Goals; E; R:M1, M3; proposed copy contract]

For paths, store the source span and literal path value separately from nearby Markdown/prose. Clear boundaries get one-click Copy. Uncertain boundaries get an editable preview of exactly the candidate value, with Copy after review; editing this preview changes only the local copy value. Do not resolve against the file system, expand variables, normalize slashes, remove quotes or strip line suffixes without an explicit agreed boundary rule. Supported Windows/POSIX, relative, quoted, spaced and line-suffixed forms need fixtures before implementation. General path recognition remains unproven. [P; B:Prose/inline paths remain core; R:M2; proposed extraction boundary]

### Provenance and clipboard actions

Keep assistant-displayed commands distinct from tool execution evidence. Proposed labels are **Suggested command** only when the supported source/context rule establishes an instruction, otherwise **Command shown by Claude**. A tool request alone is **Requested by Claude**, not proof of execution. Use an execution label only when correlated native evidence establishes it, with separate completion/interruption/unknown status; a single turn-abort flag is insufficient. No additional model call classifies intent. Detailed Implementation must specify the evidence table and ambiguity fixtures. [B:Copyability and intent are different claims; E3; R:M3; proposed labels]

A webview Copy action names the current target and revision; it cannot supply an arbitrary native input action. The host validates that the target still belongs to the displayed session and remains complete, then writes its stored literal value to the clipboard. For an uncertain path, the explicitly reviewed edited value is the value shown and copied. Failed or stale actions report failure and do not silently switch targets. Copy never submits to the composer, writes to the PTY or opens a path. [B:Goals vs. Non-Goals; P; R:M1-M3; proposed action contract]

Treat captured content as untrusted text: disable raw HTML/scripts and remote resource loading, use the panel's controlled link boundary and CSP, and create Copy controls only from extension-owned rendering logic. Assistant text cannot create permission or Stop actions. This extends the existing safe-preview conventions to the new renderer; it is not a claim that the composer preview already meets the output feature. [K; R:M6; proposed rendering boundary]

### Native access, Stop and optional controls

An always-available Companion / Raw terminal toggle switches presentation while retaining the same live PTY/xterm and composer draft. Preserve each view's scroll position. Selecting Raw terminal focuses that terminal; incoming output or capture failure must not steal focus. Questions and permissions remain answerable through native access regardless of capture health. The copying plan does not require a new question/permission owner. Direct controls retain their approved optional status and need a separate explicit inclusion decision before Detailed Implementation is final. [B:Confirmed foundation; R:M5, M7; X; proposed integration]

Stop sends one native Escape through the selected CLI's existing input path after checking the current session/generation. It must not depend on the content channel, globally capture editor Escape or queue a stale keystroke for another generation. Report input sent separately from confirmed interruption, and do not claim to stop already backgrounded work. Do not use turn.abort for Stop: the focused experiment observed a running shell become backgrounded and later finish, whereas native Escape stopped the timed fixture. Detailed Implementation must cover target freshness and pending native-dialog cases. [E3; N; B:Native interaction remains a real integration concern; proposed Stop integration]

### Components and API changes

These are proposed component locations for future implementation, not missing deliverables of this documentation PR. Detailed Implementation will enumerate every actual source, test and documentation file once the remaining choices are settled. [B:Remaining formal-design work]

| Component | Proposed responsibility / existing integration |
|---|---|
| New `media/companion/` observer | Capture allowlisted semantic events without changing their continuation; load through the existing mod entry without adding content to attention. [M; proposed] |
| New `src/companion/` host components | Own the chosen transport, schema/target checks, bounded source model, gaps and lifecycle cleanup. Reuse lifecycle conventions from the composer, with a separate content protocol. [C; proposed] |
| New `src/panel/companionProtocol.ts` | Define the host/webview projection and revision-bound Copy actions. Native input remains a separately validated action. [B:Remaining formal-design work; proposed] |
| New `src/panel/webview/companion/` components | Render full explanations, command blocks, source-bound path actions and uncertainty previews; handle focus and Copy feedback. [F; P; proposed] |
| Existing panel provider and renderer | Add companion projection/toggle routing while retaining xterm hydration/live output and the current input owner. [X; N; proposed] |
| Existing launch/session lifecycle | Provision and retire capture bindings with the owning process generation; do not change subscription authentication or launch a second CLI. [C; L; proposed] |

No Claude inference/API backend is added. The new APIs are local mod-to-host content frames and host-to-webview projections/actions. The selected transport is the private file channel described in [Decision 2](technical_choices.md#decision-2-live-content-transport), including its mechanism, costs and failure cases. Authenticated loopback HTTP is retained there as an alternative, not an automatic fallback. [T; L; C]

### Qualification before a product change

The recorded baseline is Claude Code 2.1.317 / Pro on the tested local Windows setup, not a general minimum or a supported-version matrix. Qualify the chosen source/transport in a packaged extension before declaring copying reliable. Required cases include long/multiline commands and actual clipboard values, clear/uncertain inline and prose paths, full explanation preservation, source updates/stale actions, denied and interrupted tools, gaps/overflow, session replacement, webview recreation, multiple sessions, keyboard/screen-reader use and native Stop/toggle behavior. Test the selected file channel's access controls, file locks, bounds and cleanup. [T; E; E3; R:M1-M7; proposed qualification]

If capture is unavailable or incompatible, present its status and raw-terminal access. A working terminal is a fallback, not evidence that the promised rich copying works. No new live experiment, supported CLI floor, delivery estimate or release claim is established by this design checkpoint. [B:Evidence supports further consideration; R:M6; proposed failure boundary]

## Alternatives Considered

This section is drafted for approval. It carries forward the brief's Alternatives Weighed and the later source/transport decisions. **Rejected by author** identifies a documented selection or constraint; **not selected** and **open** do not imply that an untested alternative failed or that an optional feature was rejected. The selected baseline is the full-explanation companion, live capture only, private file transport, source-backed Copy and native access. [B:Alternatives Weighed; F; L; T]

### Native terminal improvements or a hybrid as the main output view

Native formatting and keyboard copy helpers worked in the recorded classic-mode experiment; clickable inline Copy used the fullscreen mouse path. This could preserve more native presentation and avoid a second renderer, but the experiment did not establish ordinary prose/inline path copying across modes. Fullscreen preview behavior, grouped tool output and clipboard/focus compatibility remained qualification costs. A native or hybrid approach was not proven cheaper for the narrowed requirements. [V; B:Alternatives Weighed; R:M2, M5-M6]

**Rejected by author:** use the companion as the first-version presentation, with complete explanation context, separate command blocks and adjacent path Copy. Keep the native terminal as an accessible toggle. This is a selected UX direction, not a finding that native improvements cannot work. A raw-terminal-only baseline retains the original awkward-selection problem. [F; B:Overview; J]

### An extracted command/path list or shortened context

An extraction-only surface could reduce the amount of rendered explanation and retained presentation state, but removes context the author explicitly wants. **Rejected by author:** the companion must keep the full captured explanation visible, with commands and path actions within that context. A future auxiliary index would need separate scope and could not replace the explanation. No measured memory/performance advantage was established for this alternative. [F; B:Keep the full explanation; copy from source rather than presentation; R:M3-M4]

### Authenticated loopback HTTP instead of files

Loopback HTTP avoids per-event transport files, and the focused probe demonstrated a working local HTTP bridge. It would require a listener lifecycle, authentication, bounded requests/retries and environment-policy qualification. Files instead carry polling, transient disk-content, access-control and cleanup costs; neither transport by itself establishes exact copying. [C:Decision 2; E3; T]

**Rejected by author:** for v1, follow the existing private-channel ownership/cleanup pattern and concentrate qualification on complete source-backed copy values. This accepted integration-risk judgment does not establish that files are intrinsically more reliable. Reconsider HTTP if file-channel qualification exposes unacceptable delay, disk activity or operating constraints; changing transport is a new decision, not an automatic fallback. [T; C:Decision 2]

### CLI snapshot recovery or durable conversation history

Reading a bounded message snapshot could recover some content missed by live capture, but adds reconciliation with concurrent events. The inspected API is bounded, and snapshot identity, timing, compaction and source fidelity have not been qualified. A durable conversation-history product adds storage and lifecycle work beyond the requirement to display each captured explanation in full. [S; C:Decision 1; B:Goals vs. Non-Goals]

**Rejected by author:** use live capture only for v1 and defer CLI snapshot recovery. Show gaps for unavailable content and retain native access. This is a scope decision, not proof that recovery is infeasible. Durable history is not selected; temporary file transport is not a history feature. [L; T; B:Alternatives Weighed]

### Parsing terminal rows as the authoritative copy source

This could observe the existing PTY without a semantic content channel, but the terminal view includes wrapping and native UI behavior that do not establish complete command/path boundaries or execution provenance. The controlled experiment established copying from captured logical content, not a general terminal-row reconstruction algorithm. [Q; E; R:M1, M3]

**Rejected by author:** the approved Technical Plan copies complete retained source values and uses semantic events; terminal rows remain the raw fallback. Missed events cannot be repaired by presenting guessed terminal extraction as an exact source value. Transcript-file tailing is also outside the approved source path; no claim is made here that every possible transcript reader is infeasible. [T; L; Technical Plan:Data flow and ownership]

### A separate API/SDK or headless output session

A different structured-output backend was an earlier research candidate, but its subscription/product eligibility and live-interaction equivalence were not established by the research. Do not generalize that uncertainty into a claim that every SDK invocation requires an API key. **Rejected by author:** replacing the existing subscription-backed interactive CLI, adding a separately billed inference backend, or starting a second CLI solely for formatted output conflicts with the approved foundation. The selected event/file path observes the same CLI. [Q; B:Retained constraints; Goals 6; Non-Goals; T]

### Strong command-intent inference and automatic path transformation

A classifier could try to distinguish instructions from examples, and resolution/normalization could try to make paths immediately usable. Neither proves the user's intended literal copy value. Extra model requests introduce usage/compatibility questions, while path transformations could alter quoting, slashes, variables or suffixes. The brief did not establish these as prerequisites. [B:Copyability and intent are different claims; B:Prose/inline paths remain core; R:M2-M3]

**Not selected as first-version mechanisms:** the approved Technical Plan uses source/context-backed labels, preserves literal values, and keeps the editable preview for uncertain paths. Do not introduce extra inference or filesystem resolution as an unapproved copying dependency. Exact recognition/boundary rules still need author decisions during Detailed Implementation; this section does not silently settle them. [T; P; B:Remaining formal-design work]

### A full conversation interface with direct question/permission controls

Direct controls could reduce terminal switching, and the focused experiment supports particular question/permission cases. They add request correlation, response ownership, stale-action and native-handoff work; feasibility in those cases is not general packaged support. **Open, not rejected:** include or defer direct controls only through an explicit later scope decision. Their optional status does not reduce the required native question/permission access, foreground Escape or raw-terminal toggle. The broader historical proposal is not blanket v1 approval. [B:Alternatives Weighed; E3; T; R:M5, M7]

## Open Questions

These are remaining design decisions, not questions the author is being asked to answer together. The already approved copying priority, full-explanation layout, uncertainty preview and optional-control status are not reopened. [A; B:Key Decisions & Staging for Next Steps]

* **Alternatives section approval:** approve or revise the rationale above before drafting Detailed Implementation. Live-only capture, private files and the Technical Plan are already approved and are not reopened here. [L; T]
* **Path-copy contract:** define supported recognition forms, boundary rules, quotes/line suffixes and any explicit transformations. Preserve the approved one-click/uncertainty interaction. [B:Remaining formal-design work; R:M2]
* **Stable copy targets and labels:** detail the approved revision-bound target contract, clipboard/newline rules and proposed provenance labels, including the source evidence table and ambiguity fixtures. [T; B:Remaining formal-design work; R:M1, M3-M4]
* **Capture/history and privacy limits:** define retention, gaps, oversized content, diagnostics and failure behavior while keeping complete visible explanations and native access. [B:Remaining formal-design work; R:M4, M6]
* **Native integration and optional controls:** detail the approved toggle/native-Escape routing and decide whether direct question/permission controls are included or deferred. [T; B:Remaining formal-design work; R:M5, M7]
* **Qualification:** define the supported CLI/host combinations and packaged tests for source fidelity, ordinary and ambiguous paths, accessibility, lifecycle and performance. The probes establish only their recorded cases. [B:Evidence supports further consideration; R:M1-M6]

## Additional Resources

* **B:** [Finalized concepts brief](concepts_brief.md), with [the accepted intake content at commit 3b096d8](https://github.com/glitchwerks/vscode-claude-workspaces/blob/3b096d8de36f596d42276e78bcf60c25c7d3a0bb/docs/designs/215/concepts_brief.md). Named B sections refer to that accepted intake; earlier headings such as Proposed safeguards distinguish requirements from still-open technical choices. A records the subsequent approval/finalization.
* **H:** [Fixed Goldfish working hypothesis](working_hypothesis.md), [committed at the review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/working_hypothesis.md). Historical review input; its frozen content predates later confirmed context and preview decisions.
* **R:** [Seven-lens Goldfish review report](goldfish_review_report.md), [committed at the review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md). M1-M7 identify the consolidated findings and their evidence limits; it was not rerun to imply review of later decisions.
* **A:** [Maintainer approval of the first-version brief and authorization for egm-draft](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864).
* **P:** [Approved path-copy uncertainty behavior](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277).
* **F:** [Approved full-explanation and Copy layout](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334).
* **O:** [Overview & Goals approval and transition to Technical Plan](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793).
* **L:** [Author selection of live capture only and explicit gaps](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861).
* **T:** [Private file channel selection, Technical Plan approval and authorization to draft Alternatives Considered](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191).
* **C:** [Source decision and transport choices](technical_choices.md), including pinned runtime channel sources and dated official API documentation.
* **S:** [Read-only live/snapshot interface research](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630), preserving the inspected CLI declaration limits; snapshots remain deferred.
* **E:** [Controlled event/copy experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033) and [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).
* **E3:** [Focused native/direct-control and Stop findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988), with [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596). Direct-control feasibility is not a first-version inclusion decision.
* **V:** [Native-mod findings and comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408), with [preserved native experiment source/evidence](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646833619).
* **J:** [Original companion/native-Escape/raw-toggle direction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647613612). Its broader direct-control scope was subsequently made optional in the approved brief; F and T control the current v1 design.
* **Q:** [Initial prior-art and subscription/source feasibility research](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6645475201). This is historical research, not a new assertion about current SDK eligibility.
* **M:** [Existing mod entry and metadata-only attention boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L35).
* **X:** [Existing xterm input/output/focus adapter](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts#L85-L130) and [panel PTY replay/live hydration](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L615-L681).
* **K:** [Existing safe Markdown preview](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts#L1-L25) and [composer reference parser, including skipped inline code](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts#L1-L48).
* **N:** [Existing session-owned PTY input](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L340-L378) and [panel renderer input handling](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L380-L487).

*Drafted with EGM*
