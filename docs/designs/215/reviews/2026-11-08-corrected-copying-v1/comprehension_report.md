## What this proposes

The document proposes a readable companion view beside the existing Claude Code terminal, preserving the full retained explanation while adding complete command Copy blocks and adjacent path Copy or editable Review actions. A live observer sends only allowed assistant text and tool evidence over a separate private file channel into a bounded extension-owned source model; rendered controls copy revision-bound literal values and distinguish displayed commands from confirmed execution. The native terminal remains available for questions, permissions and Escape, while Run, direct question/permission controls, transcript recovery and durable history stay outside v1. The detailed section sets out documentation prerequisites, staged file ownership, channel and view contracts, recognition rules, limits and future qualification rather than claiming that implementation or qualification has already happened.

## How the existing system works, per this document

The extension already manages a subscription-backed interactive Claude Code process whose PTY feeds the same xterm terminal and whose session owner handles native input. Existing attention machinery publishes metadata and owns notifications, while an existing mod entry provides the integration point for the proposed observer. The composer already has a safe Markdown preview and reference parser, but the preview lacks the source mapping required here and the parser skips inline code. Earlier controlled experiments provide limited event-copying and native-interaction evidence; the document expressly distinguishes that evidence from the proposed companion, file-channel implementation and packaged-product qualification.

## Findings

No comprehension findings. Counts: **0 Blockers, 0 Majors, 0 Nits**.

Both FeatureRange 1-180 and DetailedRange 181-401 can be paraphrased from the target alone. The explanation connects the user-visible Copy behavior to the live source channel, host model, view actions and native fallback; the active copying-only scope and deferred execution scope remain distinguishable throughout. Project-specific detailed contracts and historical labels are either explained locally or accompanied by documentation links. Those links were acknowledged as pointers, not followed or treated as independently verified evidence.

## Completion status

| Activity | Status |
|---|---|
| Mode REVIEW comprehension audit | Completed |
| FeatureRange 1-180 | Completed |
| DetailedRange 181-401 | Completed |
| Whole-target scan for definitions and cross-section explanation | Completed, lines 1-401 |
| Frozen target identity check | Completed; normalized worktree blob equals the requested frozen commit's target blob |
| Linked documents, standards, GoldfishContext, other reports, source catalog, memory, browser and GitHub | Not read/accessed |
| Code-detail or implementation-readiness review | Not run; outside this review's scope |
| Tests, builds, native or Claude calls | Not run |
| Corrections to the target or any other work | Not performed |

## Required-read receipt

| Input | Complete read range | Bytes | SHA-256 |
|---|---|---:|---|
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md` | 1-69, including frontmatter and all REVIEW instructions | 4,817 | `2a2bd8ee584bec96b9470ca53191efb68a01e5d4f8e3c668d60201f368499f8e` |
| `C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md` | 1-401; FeatureRange 1-180 and DetailedRange 181-401 | 86,462 | `40243636f6f837f0ac0d682ffc0a2c0cf99074632da33e8d6d14bb662e7734bd` |

Requested frozen commit: `6a8c268503a74f1971081535dfbc4be374c81152`. Both `git hash-object -- docs/designs/215/design_draft.md` and the frozen commit's `docs/designs/215/design_draft.md` object resolved to `353df43ce8d337a99e779b490face53cb393fc4a`. The content review used only the persona and this target; repository object identifiers were used solely to verify the frozen target, not to supply context.


---

**Publication scope:** EGM Stage 6, frozen design 6a8c268503a74f1971081535dfbc4be374c81152; feature 1–180, Detailed Implementation 181–401. Completed 1/1; not run 0. Complete paraphrase and reviewer response are preserved above. Stage 6 had no GoldfishContext or standard. [Archived persona](review_tools.json), [run scope](context_manifest.md).
