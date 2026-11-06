# Easy copying of Claude's suggested commands and file/folder paths

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-05
* **Updated:** 2026-11-06 — path-copy uncertainty behavior and full-explanation layout confirmed.
* **Parent work:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **State:** Refined concepts brief awaiting maintainer alignment; not finalized or approved.

## Overview

The unresolved difficulty is choosing the right text: a complete suggested command can span lines, while a file/folder path can sit inside an explanation or inline code. The first version should make those items easy to copy without terminal-wrap artifacts or surrounding prose/Markdown. It retains the same subscription-backed Claude Code CLI, native foreground Escape for Stop and a raw-terminal toggle. Direct question/permission controls are optional. [H:L10, L16–21]

The maintainer selected a companion that keeps the full Claude explanation visible, puts commands in separate blocks, and places Copy buttons beside file/folder paths in explanations or inline code. An extracted-item list or short context snippet must not replace the explanation. Path boundaries, command intent and packaged behavior remain unproven; the chosen presentation does not by itself establish reliable capture or copying. [A2; H:L30, L39–45; R:M1–M4]

## Analysis

**Evidence supports further consideration, not a universal copying claim.** The historical companion experiment copied controlled long, multiline and executed commands using the actual repository xterm adapter in a standalone browser. It observed logical-content preservation with Windows newline conversion. It did not establish packaged-extension behavior, unconstrained suggestion/path detection, long sessions, accessibility or performance. No review establishes an unavoidable blocker or observed product defect. [H:L26–35; R:Result, M1, M6]

**Keep the full explanation; copy from source rather than presentation.** Preserve the explanation with its readable headings/lists/code, separate command blocks and adjacent path Copy actions. The Goldfish concern that extraction could remove useful context is now resolved by the maintainer's layout choice. Source identity, stable actions, visible capture limits and bounded retained content still need design work; the rendering/retention cost is unmeasured. Showing the full explanation is a presentation requirement, not a new promise of unlimited history or every native interface feature. Executed-command provenance remains an earlier need. [A2; H:L18, L30, L44–45; R:M1, M3–M4]

**Prose/inline paths remain core.** The maintainer approved one-click Copy for clear paths. When a boundary is uncertain, show the exact candidate text and let the user correct it before copying, instead of silently guessing. This settles the uncertainty interaction, not a particular detection grammar. No normalization, expansion, absolute conversion or filesystem validation is approved. Quotes, punctuation, spaces and line suffixes still require recognition rules. Conservative recognition can omit useful paths; aggressive recognition can copy the wrong text. Correction must remain an exception: requiring it for ordinary paths would recreate the selection friction being addressed. Restricting support to fenced blocks would miss the core requirement. [A1; H:L10, L17, L41–42; R:M2]

**Copyability and intent are different claims.** Keep the full explanation around separate command blocks so the user can read Claude's intended context. Use source evidence for known execution provenance and avoid making uncertain examples look like verified instructions or completed executions. Exact labels remain design work; full context alone is not proof that an automatic intent classifier is reliable. Additional model requests would introduce usage and maintenance questions; actual subscription impact is unverified, and a separately billed backend conflicts with the confirmed boundary. [A2; H:L18–19, L30, L43, L53; R:M3]

**Native interaction remains a real integration concern.** The tested Escape behavior and API turn-abort behavior differed: the latter allowed the Bash fixture to finish. Preserve the native route and make focus/surface transitions understandable; do not equate a turn flag with command termination or promise universal background-work stopping. Leaving questions/permissions native may avoid optional bridge ownership and races, but retains switching friction and does not remove copying/focus work. [H:L20–21, L32–33, L40; R:M5, M7]

The inventive lens found **no false compromise** and recommended no inventive pattern. Its conceptual Ideal Final Result was the smallest source-backed copying surface preserving whole commands/path-only spans and native interactions. The later full-explanation requirement now constrains that simplification: minimize added machinery without removing the user's context. The original review was not rerun or rewritten to imply it had reviewed this later decision. [A2; H:L39–45, L53; R:Lens-Specific Results]

## Goals vs. Non-Goals

| Status | Scope |
|---|---|
| Confirmed core | Easy copying of complete suggested commands, preserving intended quoting/newlines without visual wrapping. [H:L16] |
| Confirmed core | Path-only copying from prose and inline code, including file/folder paths. No grammar or transformations are approved. [H:L10, L17] |
| Confirmed interaction | Clear paths get one-click Copy. Uncertain boundaries show the exact candidate and allow correction before copying. [A1] |
| Confirmed layout | Keep the full explanation visible, commands in separate blocks, and Copy buttons beside file/folder paths. Do not substitute an extraction-only list or short snippets for the explanation. [A2] |
| Retained constraints | Same subscription-backed interactive CLI; native foreground Escape; raw-terminal toggle. [H:L19–21] |
| Earlier needs retained | Executed-command copying, execution provenance and readable output; any deferral must be explicit. [H:L18] |
| Proposed safeguards | Stable source-backed items, keyboard-usable actions, visible partial/stale capture and copy feedback within the full-explanation view. These remain mitigation candidates, not an approved implementation design. [A2; R:M1, M4–M6] |
| Optional | Direct question/permission controls. Their omission or inclusion still needs a maintainer choice. [H:L20; R:M7] |
| Outside this authorization | Product implementation, new live experiments, authentication changes, dependency installation or release. [H:L22] |

Unlimited stored history, general command-intent inference, path resolution/Open behavior and universal background-task termination are not established prerequisites. Keep these separate from the confirmed requirement to show each captured explanation in full; do not use scope reduction to discard its context. [A2; H:L21, L39–45; R:M2–M7]

## Alternatives Weighed

These are review alternatives and counterarguments. The subsequent maintainer decision about explanation visibility is identified explicitly; other unchosen alternatives remain proposals.

| Alternative | Review judgment and strongest limitation |
|---|---|
| Full-explanation companion with focused Copy actions | Selected presentation: keep the full explanation, separate commands and attach Copy to paths. Source capture, history limits and packaged correctness remain design/qualification work. [A2; R:M1–M4, M6] |
| Extraction-only list or short-context replacement | Does not meet the maintainer's full-explanation requirement as the main view. Its proposed state/space savings do not justify discarding context. [A2; R:M3–M4] |
| Full conversation product with durable history and direct controls | Goes beyond retaining full explanation text. Its additional history/interaction ownership remains optional or unestablished scope; the broader design is not first-version approval. [H:L12, L20, L44; R:M4, M7] |
| Lighter native or hybrid approach | Historical keyboard helpers worked; inline clickable actions used the fullscreen mouse path. The narrower goal warrants reconsideration, but no native/hybrid pivot is authorized or proven cheaper. [H:L31, L39] |
| Strong intent classifier | Might improve suggestion discovery; general accuracy/source signals are unproven. Prefer investigating context/provenance before extra inference. [H:L19, L43; R:M3] |
| Normalize/resolve paths | Would choose semantics beyond literal copying. No transformation policy is approved; resolution is not evidence of intended text boundaries. [H:L17, L41–42; R:M2] |
| Include direct controls now | Could reduce native switching. Adds request correlation, ownership and compatibility costs unrelated to most copying correctness. Proposed deferral remains a maintainer decision. [H:L20, L32, L40; R:M7] |

Historical source reuse is possible but narrowly evidenced: the existing Markdown preview is a context candidate; the @ reference parser and file resolver have different contracts; bounded replay and selection Copy do not prove semantic extraction. Exact committed-source links and limits are preserved in the report. None is treated as a ready-made solution. [R:Sources C1–C6]

## Key Decisions & Staging for Next Steps

**Confirmed foundation:** prioritize command and prose/inline path copying; retain the subscription-backed CLI, native foreground Escape and raw-terminal access; treat direct controls as optional and earlier readability/provenance needs as retained. Review recommendations do not authorize implementation or replace the broader existing design. [H:L10–22]

**Confirmed refinement, 2026-11-06:** clear paths get one-click Copy; uncertain paths show the exact candidate and allow correction before copying. This is a behavior decision, not proof that a detector is reliable or approval of the complete brief. The original hypothesis and seven-lens report remain unchanged historical review evidence. [A1]

**Confirmed layout refinement, 2026-11-06:** retain the full explanation, render commands in separate blocks and place Copy beside file/folder paths. This replaces the proposed extracted-item/short-context presentation. It does not settle capture/history mechanics or approve all of the earlier broader design. [A2]

**Proposed safeguards for the selected view:** source-backed complete copy values, stable actions, honest uncertainty and native interaction fallback. Keep optional response controls separate. Fallback/manual selection cannot be counted as satisfying easy copying wherever the surface fails to identify ordinary paths, and an unexplained capture limit must not be presented as a complete explanation. [A2; R:M1–M5, M7; inventive result]

The remaining formal-design work includes:

1. Path recognition/support rules, including quotes/suffixes and transformations. The user-facing uncertainty behavior is now settled above. [A1; H:L17, L41–42; R:M2]
2. Source-backed command/provenance labels and any explicit first-version deferral of earlier needs. Full explanation visibility and adjacent Copy layout are settled. [A2; H:L18, L43; R:M3–M4]
3. Capture/history limits, native-focus behavior and whether direct controls are deferred. No retention number or compatibility matrix is approved. [A2; H:L20–21, L30, L44–45; R:M4–M7]

The proposed handoff is maintainer alignment with this refined concept, then a formal design covering the technical choices above. This brief supplies no implementation plan or new experiment authorization. [H:L6, L22, L49]

## Reviewer Status and Sources

All seven BRAINSTORM lenses completed: cost, UX, simplicity/reuse, observability, compatibility, maintenance and inventive alternatives. The report consolidates 33 numbered risk observations into **0 Blockers, 7 Majors and 0 Nits**, with one Major conditional on optional controls. UX's conditional correctness gate is not an observed failure. Full read/status receipts, actual agent identifiers, source reads and secondary costs are in R. Instruction-file exclusion remains unverified. [R:Reviewer Status and Read Evidence]

* **H:** Fixed [working hypothesis](working_hypothesis.md), SHA-256 d8a761403b3ce25c151ec58521c72869b1f45bf17b294b1b0d44be0c1dee0963. H:Lx–Ly identifies reviewed lines; its Sources section preserves durable requirements and historical evidence.
* **R:** [Goldfish review report](goldfish_review_report.md), especially M1–M7, the inventive result and committed historical source links C1–C6. Linked experiment archives were not independently reopened during these reviews.
* **A1:** [Maintainer-approved path-copy uncertainty behavior, 2026-11-06](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277).
* **A2:** [Maintainer-selected full-explanation and Copy layout, 2026-11-06](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334).
