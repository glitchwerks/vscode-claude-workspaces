# Consolidated exit/bootstrap correction re-review

**Result: 0 Blockers, 0 Majors, 2 Nits.** All ten requested fresh-context reviewers completed. The two original editorial findings remain open; no finding was suppressed, reclassified or repaired. This is the **first clean round**, because no unsettled Blocker/Major remains within this scoped review. It is **not two-round convergence**: the preceding full pass had two Majors. [Complete responses](#completed-reviewers), [prior result](../2026-11-08-ownership-envelope/consolidated_review_report.md), [native workflow/standards](review_tools.json).

Frozen target: 46219dfd8c23998ff476092d064cfd95a6d8710d, design blob 9a4b731446c58c8ea942751860c0b9944fb19bc0; feature L1–177 and Detailed Implementation L178–414. Runtime comparisons use ef5fd48f4b676881a8730afbf8e583e70565ca11. [Context/source manifest](context_manifest.md), [execution and hash receipts](review-context.json).

The subscription-backed CLI, private-file capture, full explanation with command/path copying, native Variant A, native Escape and Raw toggle remain selected. Run, Run again, C2 and direct companion responses remain deferred. This invocation authorized one consolidated review, not repairs or product implementation. [Review authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6725835463), [frozen scope](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L14-L49).

## Completed reviewers

| Stage | Requested/completed | Original findings: Blocker / Major / Nit | Full responses |
|---|---:|---|---|
| 5 — Initial Zoom Out | 2/2: Zoom Out, Inventive Catalyst | 0 / 0 / 0 | [Initial reports](zoom_out_report.md) |
| 6 — Comprehension | 1/1 | 0 / 0 / 0 | [Complete paraphrase](comprehension_report.md) |
| 7 — Feature critique | 3/3: Design Critic, Structural, Style | 0 / 0 / 2 | [Critic reports](critic_report.md) |
| 8 — Intermediate Zoom Out | 1/1 | 0 / 0 / 0 new | [Intermediate report](intermediate_zoom_out_report.md) |
| 9 — Detailed readiness | 3/3: Readiness, Codebase Details, Style | 0 / 0 / 0 | [Readiness reports](implementation_readiness_report.md) |
| Total | **10/10; zero not run** | **0 / 0 / 2 raw and consolidated** | [Per-reviewer metadata](review-context.json) |

## Traceability and open editorial actions

| Original finding | Original severity | Consolidated action | Disposition |
|---|---|---|---|
| S7-S-1 | Nit | N1 — distinguish existing path vectors from future implementation qualification | Open; no edit |
| S7-S-2 | Nit | N2 — remove the four specified repeated defensive clauses | Open; no edit |

No overlap required merging and no severity changed. Stage 8 acknowledged the two Nits without reporting them again. All other completed reviewers issued no findings. [Original findings and exact quotations](critic_report.md), [Stage 8 disposition](intermediate_zoom_out_report.md).

### N1 — Nit — Name existing path vectors and remaining qualification

At frozen main L91, “need fixtures before implementation” leaves unclear that the contract and 29 exact design vectors already define source spans, actions and literals. Calibrate that sentence to name the existing vectors and their remaining transfer into implementation tests and qualification. Preserve “General path recognition remains unproven.” This is a checkpoint-clarity finding, not evidence that extraction failed or that the document explicitly claims no fixtures exist. [S7-S-1](critic_report.md), [frozen sentence](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L87-L91), [path contract](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/path-copy-contract.md), [actual vectors](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/path-copy-cases.json).

### N2 — Nit — Remove repeated defensive clauses while retaining decisions

The four specified edits concern the assurances at main L53, L101 and L113 and “delivery estimate or release claim” at L130. Their operative scope/evidence rules already appear in the same feature section. Remove only the quoted redundant clauses; retain implementation authorization, rendering/control boundaries, inventory/helper precedence and capability/Raw/qualification decisions. Meaningful caveats elsewhere were explicitly kept. [S7-S-2 with exact clauses and KEEP decisions](critic_report.md), [frozen technical section](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L51-L130).

## Exit/bootstrap correction assessment

Readiness and Codebase independently inspected the selected prepareLaunch/observeSpawn/beginShutdown/close and confirmManagedPtyExit bridge against the actual factory, final-spec identity, synchronous exit replay and shutdown boundaries. Both found no remaining substantiated discrepancy in that source envelope. They also examined the host-issued HTML ID, legacy UUID pairing, ready/bind echoes, reload renewal, missing-bootstrap fallback and actual root consumers. All 18 exit and 18 bootstrap input/expected traces were examined by both; these remain authored design expectations, not executed production integration. The earlier two Major gaps no longer appear as unsettled findings in this round. [Complete independent assessments and exact read extents](implementation_readiness_report.md), [prior findings](../2026-11-08-ownership-envelope/consolidated_review_report.md), [applied correction record](../2026-11-08-ownership-envelope/resolution/goldfish_review_report.md).

## Evidence and execution limits

All ten original responses are published completely and unchanged, with 27 measured target/persona/standard hash receipts and per-response read limits. The comprehension paraphrase is retained in full. Dispatch used fork_turns=none without parent transcript or memory; host instruction-file exclusion is unverified. Reading an index or measuring a whole file does not imply semantic review of every body. [Execution metadata](review-context.json), [context](context_manifest.md).

Readiness and Codebase independently checked current CH/VW/PC/C4 bodies, actual expanded inputs/outcomes and pinned runtime boundaries. Neither received or retrieved the full generated native SDK declaration artifacts; preserved selected projections/member indexes provide partial evidence only. No exhaustive SDK verification, current installed-build compatibility or blanket runtime pass is claimed. The detailed Style reviewer recorded narrower vector/source sampling. [All three detailed reports](implementation_readiness_report.md).

No product implementation, compiler, lint, tests, build, package, native/Claude/model invocation, clipboard or ACL probe ran. Future phase/package/native/accessibility/performance qualification remains required by the selected plan. A clean static review does not authorize implementation or release. [Frozen phase and qualification gates](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L224-L243), [qualification matrix](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L326-L336).

## Publication and handoff

The 69 design inputs remain byte-for-byte frozen. Nine review publication artifacts are added separately; they do not expand D0, change the 46 later planned paths or replace/edit the current Ready record. That record continues to identify source 46219dfd8c23998ff476092d064cfd95a6d8710d. [Frozen-input receipts](review-context.json), [69-input manifest](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/implementation-inputs.json), [current Ready source](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6725620876).

Context: git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/capture-channel-contract.md docs/designs/215/companion-view-contract.md docs/designs/215/evidence/capture-channel-cases.json docs/designs/215/evidence/companion-view-cases.json docs/designs/215/implementation-inputs.json at 46219dfd8c23998ff476092d064cfd95a6d8710d verifies those corrected inputs. Publication/source-tree persistence and tracking checks are reported on #215 after commit; future Create files remain implementation work.

The review pass is finished. The two editorial Nits await disposition; a second consecutive clean round would be needed for EGM convergence. No further round or correction was run under this invocation. [Original findings](critic_report.md), [workflow](review_tools.json).
