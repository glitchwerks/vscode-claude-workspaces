# #215 completed-reply copy panel

**Selected direction, 2026-11-19:** reliable command and file/folder path copying from completed assistant replies, with full captured explanation context and the existing subscription-backed CLI. **Experiments and implementation remain stopped.** [Maintainer decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Current design inputs

| Input | Purpose |
|---|---|
| [Design](implementation/design_draft.md) | Completed-reply scope, capture proposal, snapshot and Copy behavior, native Raw access |
| [Technical choices](implementation/technical_choices.md) | Current tradeoffs and unverified compatibility/configuration questions |
| [Path contract](implementation/path-copy-contract.md) | Retained literal extraction and uncertain-path Review rules |
| [Focused test plan](../../manual-verification/215-companion.md) | Prospective copying, context, session isolation and native fallback checks; all unrun |
| [Handoff](implementation/documentation-handoff.md) and [manifest](implementation/implementation-inputs.json) | Active inputs versus historical material |

The [path vectors](implementation/evidence/path-copy-cases.json) remain candidate examples; they are not runtime results. The current design and #225 govern adaptation. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Superseded architecture

The live private-file capture channel, C4 execution feed, old view protocol and lifecycle qualification are historical inputs, not the new implementation package. Their files carry supersession notices; the [previous complete package at c6c07c9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/README.md) preserves the earlier design and references. The old Ready record/D0 phase counts do not select the replacement design. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

Earlier concept/review history remains on the previously retained [archive branch](https://github.com/glitchwerks/vscode-claude-workspaces/tree/codex/archive-215-design-history-20261108/docs/designs/215/history). No new archive copy or experiment is created by this revision. [Earlier package record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831)

Run, Run again, C2 and direct panel answers/permission controls remain deferred. Streaming and executed-tool coverage are also deferred for this narrower version. Native questions, permissions and Escape remain in the CLI through Raw. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)
