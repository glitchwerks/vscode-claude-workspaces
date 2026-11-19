# Completed-reply panel handoff

**Current direction:** the [2026-11-19 decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) selects a completed-reply copy panel for #215, retaining the subscription-backed CLI. Experiments and implementation remain stopped. Run, Run again, C2 and direct panel answers/permissions remain deferred.

## Active inputs

Read [the revised design](design_draft.md), [technical choices](technical_choices.md), [literal path contract](path-copy-contract.md) and [focused test plan](../../../manual-verification/215-companion.md). The [manifest](implementation-inputs.json) distinguishes these inputs from historical contracts and fixture candidates. Existing [path cases](evidence/path-copy-cases.json) are authored examples to adapt, not executed proof.

The former 13-input D0 overlay, fixed phase inventories and immutable Ready record applied to the earlier private-file design. Do not restore that package over this revision or treat it as the active implementation plan. [Previous handoff](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/documentation-handoff.md); [superseding decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768).

## Future implementation boundary

After separate authorization, recheck current branch/release policy and source before adapting existing code. Record numeric payload/retention caps and verify how ordinary Stop-hook configuration reaches only the intended launch. Preserve the existing CLI executable, login, cwd and input ownership. Do not add the old file publisher, reserve native-worker capacity or restart lifecycle probes to satisfy this design. [Design](design_draft.md#technical-plan); [decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768).

#225 tracks copying acceptance for this revised scope. Every new check is unrun; historical CI/native receipts stay scoped to their original source and architecture. A future installed test must read actual clipboard values and establish supported subscription/CLI behavior before claiming the panel works. #226 remains release preparation only. [Test plan](../../../manual-verification/215-companion.md); [#225](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225); [#226](https://github.com/glitchwerks/vscode-claude-workspaces/issues/226).

## Historical reference

The prior capture/provenance/view contracts and native case sets remain available for source history and selective reuse. Their supersession notices are operative; none grants execution authority or requires their former race/cleanup qualification. [c6c07c9 package](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/README.md).
