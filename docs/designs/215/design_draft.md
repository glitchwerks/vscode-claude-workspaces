# Copy-friendly Claude Code companion

* **Author:** Christopher Beaulieu
* **Status:** Draft — Overview & Goals approved; Technical Plan awaiting the capture-source decision. [O]
* **Date:** 2026-11-06
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **Predecessor:** [Finalized concepts brief](concepts_brief.md), approved for this first-version scope and formal drafting. [A]

Overview, The Problem, Goals and Non-Goals were approved on 2026-11-06. Technical Plan drafting has started with [the capture-source choice](technical_choices.md); no option is selected yet. Architecture, alternatives and detailed implementation remain to be drafted. This document is not product implementation or release authorization. [A; O]

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

## Open Questions

These are remaining design decisions, not questions the author is being asked to answer together. The already approved copying priority, full-explanation layout, uncertainty preview and optional-control status are not reopened. [A; B:Key Decisions & Staging for Next Steps]

* **Output source and ownership:** choose between [live capture only and live capture with bounded CLI snapshot recovery](technical_choices.md). Both retain the same native session; neither is selected by Overview & Goals approval. The chosen mechanism must supply complete explanation/command text and trustworthy execution evidence. [O; B:Remaining formal-design work; R:M1, M3-M4]
* **Path-copy contract:** define supported recognition forms, boundary rules, quotes/line suffixes and any explicit transformations. Preserve the approved one-click/uncertainty interaction. [B:Remaining formal-design work; R:M2]
* **Stable copy targets and labels:** define identity across updates, clipboard/newline semantics, source-to-render mapping and provenance wording. [B:Remaining formal-design work; R:M1, M3-M4]
* **Capture/history and privacy limits:** define retention, gaps, oversized content, diagnostics and failure behavior while keeping complete visible explanations and native access. [B:Remaining formal-design work; R:M4, M6]
* **Native integration and optional controls:** define focus/Stop routing and whether direct question/permission controls are included or deferred. [B:Remaining formal-design work; R:M5, M7]
* **Qualification:** define the supported CLI/host combinations and packaged tests for source fidelity, ordinary and ambiguous paths, accessibility, lifecycle and performance. The probes establish only their recorded cases. [B:Evidence supports further consideration; R:M1-M6]

## Additional Resources

* **B:** [Finalized concepts brief](concepts_brief.md), with [the accepted intake content at commit 3b096d8](https://github.com/glitchwerks/vscode-claude-workspaces/blob/3b096d8de36f596d42276e78bcf60c25c7d3a0bb/docs/designs/215/concepts_brief.md). Named B sections refer to that accepted intake; earlier headings such as Proposed safeguards distinguish requirements from still-open technical choices. A records the subsequent approval/finalization.
* **H:** [Fixed Goldfish working hypothesis](working_hypothesis.md), [committed at the review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/working_hypothesis.md). Historical review input; its frozen content predates later confirmed context and preview decisions.
* **R:** [Seven-lens Goldfish review report](goldfish_review_report.md), [committed at the review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md). M1-M7 identify the consolidated findings and their evidence limits; it was not rerun to imply review of later decisions.
* **A:** [Maintainer approval of the first-version brief and authorization for egm-draft](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864).
* **P:** [Approved path-copy uncertainty behavior](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277).
* **F:** [Approved full-explanation and Copy layout](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334).
* **O:** [Overview & Goals approval and transition to Technical Plan](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793).
* **C:** [Capture-source choices and current source evidence](technical_choices.md), awaiting the author's choice.

*Drafted with EGM*
