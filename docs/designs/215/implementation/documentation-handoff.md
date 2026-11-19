# Completed-reply panel handoff

**Current direction:** the [2026-11-19 decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) selects a completed-reply copy panel for #215, retaining the subscription-backed CLI. Experiments and implementation remain stopped. Run, Run again, C2 and direct panel answers/permissions remain deferred.

## Active inputs

This handoff is the input index for the completed-reply design. Use the following committed documents together.

- [Package overview](../README.md) describes the selected scope.
- [Revised design](design_draft.md) defines capture, presentation and copying behavior.
- [Technical choices](technical_choices.md) records tradeoffs and open compatibility questions.
- [Literal path contract](path-copy-contract.md) defines extraction and Review behavior.
- [Focused test plan](../../../manual-verification/215-companion.md) defines the acceptance checks.

## Candidate fixtures

The [path cases](evidence/path-copy-cases.json) are authored examples to adapt during implementation. Their results remain unverified.

The former 13-input D0 overlay, fixed phase inventories and immutable Ready record applied to the earlier private-file design. Do not restore that package over this revision or treat it as the active implementation plan. [Previous handoff](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/documentation-handoff.md); [superseding decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768).

## Future implementation boundary

After separate authorization, recheck current branch/release policy and source before adapting existing code. Record numeric payload/retention caps and verify how ordinary Stop-hook configuration reaches only the intended launch. Preserve the existing CLI executable, login, cwd and input ownership. Do not add the old file publisher, reserve native-worker capacity or restart lifecycle probes to satisfy this design. [Design](design_draft.md#technical-plan); [decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768).

#225 tracks copying acceptance for this revised scope. Every new check is unrun; historical CI/native receipts stay scoped to their original source and architecture. A future installed test must read actual clipboard values and establish supported subscription/CLI behavior before claiming the panel works. #226 remains release preparation only. [Test plan](../../../manual-verification/215-companion.md); [#225](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225); [#226](https://github.com/glitchwerks/vscode-claude-workspaces/issues/226).

## Historical reference

The [in-tree JSON manifest](implementation-inputs.json) records the earlier private-file overlay. Its [pinned copy at c6c07c9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/implementation-inputs.json) preserves the historical inputs and phase counts.

- Historical contracts cover the [capture channel](capture-channel-contract.md), [capture provenance](capture-provenance-contract.md) and [companion view](companion-view-contract.md).
- Historical reference cases include the [capture channel](evidence/capture-channel-cases.json), [companion view](evidence/companion-view-cases.json), [C4 adapter](evidence/c4-adapter-cases.json) and [C4 native evidence](evidence/c4-native-evidence.md).

Use their supersession notices when consulting these materials. [c6c07c9 package](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/README.md).
