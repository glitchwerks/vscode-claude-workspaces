# Goldfish Review Report

* **Mode:** BRAINSTORM; a review of a proposed copying concept, not an audit of an approved design.
* **Date:** 2026-11-05
* **Target:** [working_hypothesis.md](working_hypothesis.md), lines 1–64 plus a trailing empty line.
* **Target SHA-256:** d8a761403b3ce25c151ec58521c72869b1f45bf17b294b1b0d44be0c1dee0963.
* **Result:** Seven completed lenses, zero not run. Thirty-three numbered risk observations and the inventive lens's judgments are consolidated into **0 Blockers, 7 Majors and 0 Nits**. M7 is conditional on adding optional controls; it is not a copying prerequisite.

No report establishes an unavoidable blocker or an observed product defect. UX's “Blocker if violated” identifies a conditional copying correctness gate: an action that copies the wrong payload would defeat the core goal. It does not establish that accurate copying is impossible. The remaining findings are inferred risks, mitigation candidates and unresolved decisions. They are not seven approved implementation projects. [H:L16–17, L30, L41–45; UX finding 1]

The shared recommendation is to evaluate a smaller source-backed companion with original context, while preserving the selected graphical direction and native CLI access. Whether that surface can meet the core prose/inline-path need is still unproven. No architecture pivot, path grammar, transformation policy, retention limit or classifier was approved by these reviews. [H:L10–12, L17–21, L39–45; M1–M5 below]

## Reviewer Status and Read Evidence

The root dispatched independent fresh-context reviewers directly after nested general-purpose dispatch was unavailable to the synthesizer. Root reports that no spawn call was denied or bypassed. At most three reviewers ran concurrently while the synthesizer was idle, within four host slots. Each reviewer received the same fixed input and no other reviewer's findings. Root verified actual completion and matching read receipts before synthesis; the synthesizer received all seven substantive reports. The orchestration constraint is not a defect in the product concept.

Fresh-parent-turn isolation was requested with fork_turns=none. **Instruction-file exclusion remains unverified.** Fresh conversation context does not prove that host instruction files were excluded. This limit is also explicit in H:L49–51 and the installed EGM 0.1.0 Codex integration guide.

Persona IDs below refer to the installed **egm@egm 0.1.0** bundle. They are read receipts, not repository file dependencies. Every reviewer reports reading its complete persona before the entire fixed target and computing the target hash printed above. Some report 64 content lines and others include the trailing empty line as line 65; their byte hashes agree.

| Actual agent identifier | Persona file / frontmatter ID | Applied BRAINSTORM lens | Status and receipt | Returned result |
|---|---|---|---|---|
| /root/egm_cost_brainstormer | agents/design_critic.md / egm-design | Cost, quota and token economics | Completed; full persona + target; hash matched | 5 numbered risks; no unavoidable blocker |
| /root/egm_ux_brainstormer | agents/comprehension.md / egm-comprehension | UX and developer ergonomics | Completed; full persona + target; hash matched | 6 numbered risks; one conditional correctness gate |
| /root/egm_simplicity_brainstormer | agents/zoom_out.md / egm-zoom-out | Simplicity, reuse and code minimization | Completed; full persona + target; hash matched | 5 numbered risks; targeted historical code reads |
| /root/egm_observability_brainstormer | agents/codebase_details.md / egm-codebase-details | Observability and debuggability | Completed; full persona + target; hash matched | 6 numbered risks; no established blocker |
| /root/egm_compatibility_brainstormer | agents/implementation_readiness.md / egm-implementation-readiness | Migration and backward compatibility | Completed; full persona + target; hash matched | 5 numbered risks; no established blocker |
| /root/egm_maintenance_brainstormer | agents/structural.md / egm-structural | Long-term maintenance and technical debt | Completed; full persona + target; hash matched | 6 numbered risks; conditional optional-control costs |
| /root/egm_inventive_brainstormer | agents/inventive_catalyst.md / egm-inventive-catalyst | Inventive contradictions and alternatives | Completed; full persona + target; hash matched | “No false compromise detected”; no inventive pattern recommended |

All seven used their BRAINSTORM lens rather than their document-audit mode. None reports reading an additional standard. Six read only the persona and fixed target. The simplicity lens additionally read the historical committed source listed under Sources and Actual Additional Reads. The target's linked issue archives were not independently opened by the reviewers; their historical experiment statements rely on the target's explicitly limited summaries. No report claims a new model experiment, installation, product change or GitHub write.

The synthesizer read its complete installed persona, the complete EGM Codex integration guide, the complete egm-brainstorm skill, all seven persona frontmatters, the entire target and all seven returned reports. The synthesizer independently confirmed the fixed target hash. Reviewer full-persona reads are reported by those reviewers, not inferred from the synthesizer's frontmatter reads.

## Prioritized Findings

### M1. Exact copying needs inspectable payloads and usable delivery — Severity: Major

**Lenses:** Cost 1; UX 1 and 4; simplicity 4; observability 1 and 4; compatibility 2; maintenance 1; inventive judgments.

**Evidence:** Whole commands with intended quoting/newlines and path-only copying are core. Packaged clipboard behavior, path extraction and accessibility remain unproven. The historical Windows newline conversion is an observation, not an approved universal policy. [H:L10, L16–17, L30]

**Risk / proposal:** Rebuilding text from wrapped terminal rows or rendered Markdown could change what is copied. Tie each action to the logical source value the user inspected, with payload inspection where necessary. Make Copy keyboard reachable, visibly focused and distinguishable among multiple targets; prevent streaming from stealing focus and provide perceivable success/failure feedback. A clipboard write reporting success does not establish that extraction chose the right payload. These are inferred correctness/usability risks, not observed product bugs. [H:L16–17, L30, L45; UX 1/4; observability 1]

**Costs / counterargument:** Source mappings, inspection and feedback add state and visual space. Bounded local metadata could distinguish capture/extraction/delivery failures, but exact diagnostic payloads should be deliberately selected rather than stored by default. This is a proposed proportionate diagnostic approach, not evidence of a current logging leak or a requirement for central telemetry. Payload preservation alone does not solve path boundaries. The inspected historical clipboard helper is reusable plumbing, not proof of error handling. [Observability 1/4; C5]

### M2. Prose and inline path boundaries need a bounded contract — Severity: Major

**Lenses:** Cost 4; UX 1; simplicity 2; observability 3; compatibility 2; maintenance 2; inventive judgments.

**Evidence:** Prose/inline paths are core. No grammar, normalization or absolute/relative conversion is approved. Spaces, quotes, UNC forms and line suffixes are review examples, not an agreed support matrix. [H:L10, L17, L41–42]

**Risk / proposal:** Punctuation heuristics could truncate a path or include prose; filesystem searches would add interpretation costs without proving intended boundaries. Separate selecting a source span from resolving, validating or opening it. Consider literal copying of the chosen path value and a visible ambiguous state or explicit boundary correction. Quotes and line suffixes still need a policy. Do not quietly reduce the feature to fenced blocks. [H:L17, L41–42; inference]

**Costs / counterargument:** Conservative recognition misses paths; aggressive recognition risks wrong payloads. Manual correction can recreate the selection friction being addressed, so it cannot substitute for ordinary-case coverage. The historical @ reference parser skips inline/fenced code, and its file helper resolves/validates files and reformats references: these are different contracts. Explicit span offsets are a reuse idea, not a proven path-copy solution. [C2–C3]

### M3. Copyability cannot imply recommendation or execution — Severity: Major

**Lenses:** Cost 2; UX 2; simplicity 3; observability 3; compatibility 3; maintenance 3; inventive judgments.

**Evidence:** Executed-command copying and provenance remain earlier needs unless explicitly deferred. The experiment used controlled suggestions; unrestricted intent classification remains unproven. [H:L18, L30, L43]

**Risk / proposal:** Removing context could turn an example or executed command into an apparent instruction. Keep original context and source-backed execution provenance; use neutral/uncertain labels when intent is unknown. Evaluate exact candidate copying without routine additional model requests. A separately billed backend conflicts with the confirmed boundary; actual incremental subscription usage for extra classification turns is unverified. [H:L19, L43, L53; cost 2 inference]

**Costs / counterargument:** Neutral candidates require more reading and may not fully satisfy quick discovery of suggestions. Reliable provenance signals remain unknown. A neutral label or limited detector cannot silently defer executed-command copying/readability. Classification reasons and any future accuracy claim should be distinguishable from payload fidelity; click counts alone would not establish accuracy. [H:L18; observability 3]

### M4. A smaller companion still needs context, stable items and visible limits — Severity: Major

**Lenses:** Cost 3; UX 2–3; simplicity 1 and 4; observability 2–3; compatibility 3; maintenance 4; inventive judgments.

**Evidence:** A small extraction panel is an option within the selected graphical direction. History volume, long sessions and partial/stale/capped capture remain unresolved. [H:L12, L18, L30, L35, L39, L44–45]

**Risk / proposal:** Full transcript mirroring can duplicate storage/processing; a smaller list can lose useful context or change an action under the user's pointer. Evaluate stable items with enough original context and source/session identity. Consider bounded retained state/processing and visible gaps, eviction or unknown freshness; do not show a capped command as complete. Replayed old content can remain copyable when its origin is honest. A small local diagnostic trail may help identify capture loss without retaining every raw payload. [H:L44–45; reviewer inferences]

**Costs / counterargument:** Caps remove history, context consumes space, and waiting for stability delays copying. A compact surface may need native-context lookup and still owes an explicit treatment of retained readable-output/provenance needs. Native fallback preserves access but does not itself fulfill easy copying. No size or performance envelope is established. Historical Markdown preview, bounded replay and terminal-selection copying are reuse candidates, not proof of semantic extraction. [H:L18, L30; C1, C4–C5; inventive judgments]

### M5. Native focus, access and Stop remain part of copying — Severity: Major

**Lenses:** Cost 5; UX 5; simplicity 5; observability 5; compatibility 4; maintenance 4; inventive judgments.

**Evidence:** The same subscription-backed CLI, raw-terminal toggle and native foreground Escape remain selected. Native Escape interrupted the tested fixture; the tested turn-abort API let it finish. Universal background-work stopping is unproven. [H:L19–21, L33]

**Risk / proposal:** A companion could consume Escape, leave focus elsewhere or mistake turn completion for command termination; none is an observed new focus bug. Preserve a predictable keyboard route to the same native session and the inspected copy position on return. Make clear where Escape applies, and keep native input usable if copying fails or is disabled. Distinguish input delivery, observed interruption and unknown work state. [H:L20–21, L33, L45; inference]

**Costs / counterargument:** Switching has real friction. Forwarding Escape or adding another Stop control might reduce it but needs separately established semantics. Neither a new process monitor nor universal cancellation is implied. The historical native input path exists; companion-toggle focus behavior remains unverified. [C5–C6]

### M6. Historical success is not a build/platform guarantee — Severity: Major

**Lenses:** Compatibility 1 and 4; maintenance 5; supporting cost 1 and UX 4.

**Evidence:** The observation covers Claude Code 2.1.317 / Pro in a standalone browser using the repository adapter, not universal packaged/future-build support. [H:L26–35]

**Risk / proposal:** Changed capture or host behavior could leave confident actions backed by incomplete content. Qualify compatibility to verified combinations, expose unavailable/partial capture and preserve native fallback without authentication changes or a second CLI session. Keep direct-control support claims separate from copying support. [H:L19–22, L30, L45; inference]

**Costs / counterargument:** A bounded release matrix needs continuing verification and unsupported states limit availability. No stable capture-interface guarantee, supported-platform matrix, persistent schema migration, mandatory build pinning or speculative multiple-backend abstraction is established by this input.

### M7. Direct question/permission controls are separately chosen scope — Severity: Major if included

**Lenses:** Cost 5; UX 6; simplicity 5; observability 6; compatibility 5; maintenance 6; inventive judgments.

**Evidence:** Direct handling is optional; native switching is acceptable. Identical-input correlation, all dialogs, subagents, transport loss and broader builds remain unproven. [H:L20, L32, L40]

**Risk / proposal:** Making copying depend on a response bridge would import request ownership and competing native/companion completions. Propose native question/permission handling for the first copying version with a predictable return route. If direct controls are retained, choose their request identity, ownership, completed/expired/unknown states and fallback contract independently. [H:L32, L40; inference]

**Costs / counterargument:** Native switching costs attention; direct controls could reduce that friction and have bounded positive experiment evidence. Omitting them may avoid bridge/race work, but that saving is not a verified packaged-extension result. It does not remove capture, clipboard or native-focus obligations. These are conditional optional-control costs, not copying blockers. [H:L20–21, L30, L32–33, L40]

## Lens-Specific Results and Deduplication Trail

This preserves the distinct emphasis of all 33 numbered observations without treating overlaps as separate implementation work.

| Lens | Original findings → consolidated destination; distinct emphasis |
|---|---|
| Cost / egm-design | 1 → M1/M4; 2 → M3; 3 → M4; 4 → M2; 5 → M5/M7. Exact-source retention and repeated processing have unmeasured resource costs; classifier quota impact is unverified. |
| UX / egm-comprehension | 1 → M1/M2; 2 → M3/M4; 3 → M4; 4 → M1; 5 → M5; 6 → M7. Inspected target, stable actions, accessible feedback and predictable return position matter. |
| Simplicity / egm-zoom-out | 1 → M4; 2 → M2; 3 → M3; 4 → M1/M4; 5 → M5/M7. Historical source reuse has specific limits; a new complete transcript is not established as necessary. |
| Observability / egm-codebase-details | 1 → M1; 2 → M4; 3 → M2/M3/M4; 4 → M1; 5 → M5; 6 → M7. Separate fidelity/detection/delivery; expose unknown capture; avoid a default raw-content diagnostic store. |
| Compatibility / egm-implementation-readiness | 1 → M6; 2 → M1/M2; 3 → M3/M4; 4 → M5/M6; 5 → M7. Historical text can remain copyable with honest origin; fallback should preserve the same native workflow. |
| Maintenance / egm-structural | 1 → M1; 2 → M2; 3 → M3; 4 → M4/M5; 5 → M6; 6 → M7. Avoid coupling presentation, interpretation, transcript ownership and request-response state. |
| Inventive / egm-inventive-catalyst | No numbered severity findings. **No false compromise detected; no inventive pattern recommended.** The conceptual Ideal Final Result is the smallest source-backed copying surface that preserves whole commands/path-only spans and native interactions. It is not proof of equivalent capability or an approved pivot. |

The inventive lens argues against adding coordination/classifier machinery when the input already invites scope reduction. It preserves the irreducible boundary/intent questions and warns that raw-terminal fallback alone cannot fulfill easy copying. This is a substantive result, not an absent or clean-by-default review. [H:L39–45, L53; inventive report]

## Unresolved Decisions for Maintainer Input

1. Minimum prose/inline path recognition and ambiguity behavior, including quotes/suffixes and transformations. Literal copying remains proposed. [H:L17, L41–42; M1–M2]
2. Original context and source-backed command distinctions, with any deferral of earlier needs made explicit. [H:L18, L43; M3–M4]
3. Companion surface, retention/availability limits and keyboard/native-focus behavior. No size, cap or compatibility matrix is approved. [H:L20–21, L30, L39, L44–45; M4–M6]
4. Whether direct controls are deferred or separately retained. Optional status does not settle that choice. [H:L20, L32, L40; M7]

## Sources and Actual Additional Reads

**H** means the fixed [working_hypothesis.md](working_hypothesis.md). H:Lx–Ly refers to its line numbers in the reviewed hash. Its Sources section, H:L55–64, contains durable maintainer requirements, earlier needs, experiment archives and the broader proposal. These links were supplied by H, not independently fetched in this review. This report preserves H's evidence limits rather than presenting those archives as newly reverified.

The following **C** sources were actually read by the simplicity reviewer at historical commit **ef5fd48f4b676881a8730afbf8e583e70565ca11**, the tested prerelease runtime named in H:L35. They are not claims about current stable-main files. The synthesizer relies on that reviewer's source inspection and does not claim a second inspection. GitHub line links identify committed source rather than a local runtime path.

* **C1 — Markdown context candidate:** Full [markdownPreview.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts#L1-L25) read. The reviewer verified the existing markdown-it preview disables HTML, linkification and typographic rewriting, restricts links, replaces images and bounds preview size. Suitability for assistant content, source spans or exact Copy remains unverified.
* **C2 — Reference parsing candidate/limit:** Full [references.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts#L1-L48) read; source spans at lines 1–8, code skipping/@ recognition at lines 20–32 and 44–48. Full [composerReferences.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerReferences.ts) also read; no additional capability claim is made from it.
* **C3 — File resolution is a different contract:** Full [composerFiles.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerFiles.ts#L19-L81) read. The reviewer located working-directory resolution, canonical-root/exclusion/file checks and relative forward-slash formatting. Those behaviors are not an approved Copy or folder-span policy.
* **C4 — Bounded historical replay:** Excerpts of [sessionPanelProvider.ts, lines 1–36](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L1-L36), [615–684](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L615-L684) and [949–968](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L949-L968) read. The reviewer reports a 256 KiB replay cap, dropping leading complete lines and potentially an oversized unterminated line. This is not an approved companion retention limit.
* **C5 — Terminal and selection Copy plumbing:** Full [xtermTerminal.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts#L85-L130) read; renderer excerpts [380–487](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L380-L487) and [1125–1162](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L1125-L1162) read. Selection Copy appears at lines 1134–1145 and discards its clipboard-write promise at lines 1140–1143. The reviewer treats this as plumbing to assess, not proof of reliable automatic copying.
* **C6 — Existing native input route:** Excerpt of [sessionManager.ts, lines 340–378](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L340-L378) read, alongside xtermTerminal.ts:116–119 and renderer.ts:404–412 in C5. The reviewer verified the terminal-input/session-owned PTY path; companion focus/toggle behavior is unverified.

The simplicity reviewer also inspected the historical Git tree and targeted text-search results. No additional source or standard was read by the other six reviewers. The synthesis has created only this report and the proposed [concepts brief](concepts_brief.md); it does not alter the fixed hypothesis or the broader existing design.
