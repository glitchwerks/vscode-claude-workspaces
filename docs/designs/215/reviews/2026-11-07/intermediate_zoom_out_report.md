# Stage 8: Intermediate zoom-out review

**Status:** completed. **New findings:** 0. **Repeated findings:** 2 Major. **Blockers:** 0. The three earlier style Nits remain unchanged and are not reissued as architectural findings. [Inputs](context_manifest.md).

## S8Z-1 — Major: repeated S7D-1, persistent Run concurrency

**Scope:** [target lines 104–112](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L104-L112), [line 282](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L282), [Run contract lines 29–33](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L29-L33).

The second architecture review confirms the prior inferred race: serializing companion actions and observing shell status do not define how competing native input is excluded between observation and dispatch. No mitigation was applied in this read-only pass. Define that admission boundary or obtain an explicit decision on a residual limitation, preserving persistent reuse. More status checks alone do not establish the guarantee. See [S7D-1](critic_report.md#s7d-1--major-runs-no-interruption-guarantee-lacks-a-concurrency-boundary). [Terminal API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration), fetched 2026-11-07.

## S8Z-2 — Major: repeated S6C-1, unnamed packaging lane

**Scope:** [target lines 189–191](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L191), [294–296](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L294-L296).

The required lane and packaging check remain unnamed. The pinned runtime already documents feature PRs targeting prerelease/0.11.x and distinguishes stable/prerelease packaging, so this is a missing workflow reference, not missing infrastructure. Reuse that documentation, name the pinned baseline’s lane and require a recheck before implementation. [Pinned workflow](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/CONTRIBUTING.md#L98-L103), [channel-selection rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/docs/versioning-policy.md#L267-L286), [original S6C-1](comprehension_report.md#findings).

## Overall assessment

No additional supported reuse, YAGNI, premature-optimization or altitude discrepancy was found. The root copying problem and selected scope remain clear; exact budgets/grammar/file inventory are in the intended implementation section. Searches in the pinned runtime found the already-acknowledged Markdown, channel, session and native-input mechanisms, without establishing an equivalent source-mapped renderer or production Run controller. This does not establish packaged feasibility. [Target architecture](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L16-L129), [detailed section](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L183-L296).

## Read receipt

The reviewer completely read the EGM 0.1.1 Zoom Out persona and standard, target lines 1–351, approved catalog, five linked local documents, and the complete Stage 5, 6 and 7 reports. Target SHA-256 independently matched d589e392a78b15c805638c7c5a4936c28e565359a02b0c7a7d561ed9a5c38019. No required read was missing.

Actual primary evidence included decision comments 6684329277, 6684608334, 6700896861, 6701115191, 6706751545, 6707126769 and 6707453909; source-contract comments 6685055630/6701284701; and experiment findings 6646355033/6647481988, retrieved 2026-11-07. Experiment archives were not independently reopened.

Read-only git searches used runtime ef5fd48f4b676881a8730afbf8e583e70565ca11 for terminal execution, shell events, Markdown/reference parsing, source targets, file operations, decoding, capability handling and scheduling. Inspected source covered the composer preview/parser/resolver, channel ownership/cleanup/transport, runtime/composition, launch environment/root identity, metadata-only mod, native input, README and the workflow/channel-policy excerpts above. The [manifest](context_manifest.md) lists the original cited sources. Official mod and terminal API/support excerpts were inspected; no-match searches were not evidence. No edits, builds, example-command execution, model probes, GitHub writes or subagents were used.
