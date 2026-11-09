# #215 implementation package and history

The author selected a separate implementation package and historical archive for PR #216, keeping Run deferred. [Authorization and source handoff](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).

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

The [history index](history/README.md) describes the 65 preserved concept/review/experiment files. It includes the [approved concept](history/concepts_brief.md), the [latest pre-separation review](history/reviews/2026-11-08-exit-bootstrap/consolidated_review_report.md), earlier rounds and deferred proposals. Those records describe their original checkpoints; they do not override the active package.

Run, Run again, C2 and direct companion responses remain deferred. Subscription-backed CLI/private files, copying with full explanations, native Variant A, Escape and Raw remain selected. [Current scope](implementation/design_draft.md#non-goals), [author instruction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831). No runtime implementation or qualification is included in this reorganization.

Context: git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/implementation-inputs.json at a9818b4e811bae0cb833914ad90c4ce49243e100 verifies the preceding layout. The current Ready record pins the new package after commit; earlier Ready records remain unchanged.
