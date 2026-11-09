# #215 implementation package

The author confirmed a 14-document boundary for PR #216: this entry index and the 13 implementation inputs, with history preserved separately. Run remains deferred. [Scope and archive record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215), [unchanged source handoff](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).

## Start here: implementation

Read [the main design and P0–P4 plan](implementation/design_draft.md), then use [the handoff procedure](implementation/documentation-handoff.md) and its [exact 13-input manifest](implementation/implementation-inputs.json). The manifest's Ready record selects an immutable source commit; this index and the archive are not D0 inputs.

| Input group | Package files |
|---|---|
| Main design and implementation phases | [Design](implementation/design_draft.md) |
| Behavior contracts | [Capture channel](implementation/capture-channel-contract.md), [native provenance](implementation/capture-provenance-contract.md), [companion projection and controls](implementation/companion-view-contract.md), [literal path copying](implementation/path-copy-contract.md) |
| Authored test inputs and outcomes | [Channel](implementation/evidence/capture-channel-cases.json), [view](implementation/evidence/companion-view-cases.json), [paths](implementation/evidence/path-copy-cases.json), [C4 native mapping](implementation/evidence/c4-adapter-cases.json) |
| Decisions and handoff | [Technical choices](implementation/technical_choices.md), [handoff](implementation/documentation-handoff.md), [manifest](implementation/implementation-inputs.json) |
| Native source evidence and its limits | [Preserved declarations and receipt projections](implementation/evidence/c4-native-evidence.md) |

This is **13 files: 8 Markdown / 5 JSON**. Local package links stay within this set. Historical source citations use immutable Git URLs, so review archives are not copied into the implementation worktree. [Manifest](implementation/implementation-inputs.json).

## Historical context

The separately retained [history index](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a6539b5c72cc5ed45126a6c924fa926fc9cfe10a/docs/designs/215/history/README.md) describes the 65 preserved concept/review/experiment files. It includes the [approved concept](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a6539b5c72cc5ed45126a6c924fa926fc9cfe10a/docs/designs/215/history/concepts_brief.md), the [latest pre-separation review](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a6539b5c72cc5ed45126a6c924fa926fc9cfe10a/docs/designs/215/history/reviews/2026-11-08-exit-bootstrap/consolidated_review_report.md), earlier rounds and deferred proposals. Those records describe their original checkpoints; they do not override the active package. They are retained on [archive branch codex/archive-215-design-history-20261108](https://github.com/glitchwerks/vscode-claude-workspaces/tree/codex/archive-215-design-history-20261108/docs/designs/215/history) at immutable commit a6539b5c72cc5ed45126a6c924fa926fc9cfe10a. Keep that archive ref: its ancestry also preserves the original sources cited by the implementation package. [Archive decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).

Run, Run again, C2 and direct companion responses remain deferred. Subscription-backed CLI/private files, copying with full explanations, native Variant A, Escape and Raw remain selected. [Current scope](implementation/design_draft.md#non-goals), [author instruction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831). No runtime implementation or qualification is included in this reorganization.

The Ready record continues to pin the same 13 implementation inputs at a6539b5c72cc5ed45126a6c924fa926fc9cfe10a; those blobs and earlier Ready records are unchanged. Artifact context: git ls-tree HEAD -- docs/designs/215/implementation/implementation-inputs.json docs/designs/215/history/README.md at that commit verifies the package and separately retained archive.
