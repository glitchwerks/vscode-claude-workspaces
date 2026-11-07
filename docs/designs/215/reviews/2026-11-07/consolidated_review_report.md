# #215 consolidated design review

**Outcome: revise the implementation plan before implementation.** The five-stage review completed with **1 Blocker, 8 Major findings and 5 Nits** after deduplication. Ten requested reviewers completed; none is recorded as not run. The reviewed design and its five linked local documents were unchanged throughout this pass. [Input scope](context_manifest.md).

**Reviewed checkpoint:** [2eec004, design lines 1–351](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L1-L351). **Date:** 2026-11-07. **Mode:** consolidated, read-only, single pass; no remediation or two-round convergence claim. The first architecture stage established no actionable simplicity/false-compromise issue; later stages found concrete integration and missing-contract issues below. [Initial stage](zoom_out_report.md), [feature critique](critic_report.md), [readiness](implementation_readiness_report.md).

## C1: Correct the stylesheet entry point — Blocker

The plan identifies the wrong current stylesheet-import boundary and instructs a CSS import through the module directly loaded by Node renderer tests. Put the new stylesheet import beside the existing imports in index.ts, add that Modify path and correct D2. Preserve the current renderer test boundary. The predicted test-loading failure was not executed; Blocker reflects a false current-state reference under the Codebase Details rubric. [Existing entry point](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L1-L9), [renderer harness](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/webviewRenderer.test.ts#L1-L16), [S9B-1](implementation_readiness_report.md#s9b-1--blocker-wrong-existing-stylesheet-boundary).

## C2: Define Run admission under competing native input — Major

Specify the concurrency boundary between native terminal input, changing shell state and companion dispatch, including work starting after the last idle observation. The selected API may interrupt existing work; the current observation/serialization contract does not establish the promised exclusion. This is an inferred race. Preserve persistent reuse; any residual guarantee change needs an explicit author decision. [Run contract](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L29-L33), [terminal API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration) (fetched 2026-11-07), [S7D-1](critic_report.md#s7d-1--major-runs-no-interruption-guarantee-lacks-a-concurrency-boundary).

## C3: Select the native identity-reset transition — Major

Define authenticated reset/retirement, action invalidation and gap/status behavior when native identity differs from the managed launch snapshot. Choose capture unavailable until managed relaunch versus host-authorized rebinding, and specify Run ownership and /clear/resume fixture end states. Existing targetFor reads the snapshot; it does not independently supply this transition. This does not assert that every /clear changes UUID. [Existing target](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74), [generation update](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L197-L211), [S9B-3](implementation_readiness_report.md#s9b-3--major-native-identity-reset-has-no-host-transition).

## C4: Specify the capture and provenance adapter matrix — Major

Select supported command tools, exact native events/allowlisted fields, agent-scoped correlation, completion/finality and status transitions. Include nonzero execution, denial before execution, backgrounding and missing/contradictory evidence. This determines executed-command copying and Run-again eligibility; qualification should test the selected mapping. [Current source/status instructions](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L229-L278), [preserved observer corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085), [S9R-1](implementation_readiness_report.md#s9r-1--major-native-captureprovenance-contract-is-not-implementable-yet).

## C5: Define rejected-frame acknowledgement and recovery — Major

Specify how a rejected owned middle sequence affects the cumulative cursor, gap, producer retirement, later admission and epoch retirement. Distinguish unauthenticated traffic and add an exact rejected-middle-sequence fixture. A cursor for admitted sequences plus unspecified rejection acknowledgement leaves incompatible choices. [Current transaction rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L233-L235), [S9R-2](implementation_readiness_report.md#s9r-2--major-rejectionack-recovery-transition-is-unspecified).

## C6: Select command-to-shell Run eligibility — Major

Add deterministic mappings for fence tags, untyped inline commands and supported tool origins against qualified detected shell families, with retained metadata and unavailable/unknown outcomes. Include cross-family fixtures. No implicit syntax classifier or silent translation is implied. [Recognition grammar](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L252-L263), [Run constraints](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L24-L30), [S9R-3](implementation_readiness_report.md#s9r-3--major-command-to-shell-compatibility-rule-is-missing).

## C7: Include the existing mod-entry test loader — Major

Add the attention mod-entry loader/mock to the exact inventory. Define resolution of the companion helper graph and absent/disabled capture while preserving native-continuation and metadata-only regression coverage. The current loader substitutes two known imports before a data-URL import; a new separate companion test does not adapt it. [Existing loader/mock](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts#L6-L55), [S9B-2](implementation_readiness_report.md#s9b-2--major-existing-mod-entry-loader-omitted).

## C8: Partition the inventory into stable phases — Major

Define ordered file subsets, dependencies, activation points, externally available behavior and named verification gates, each leaving a buildable/testable state. Keep separately authorized live qualification distinct. The current twelve responsibility items do not select these integration boundaries. [Implementation list](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L296), [S9R-4](implementation_readiness_report.md#s9r-4--major-no-stable-incremental-phases).

## C9: Link and identify the packaging lane — Major

Name the applicable baseline lane/check and link the existing selection procedure; recheck it before future implementation. The pinned workflow directs feature PRs to prerelease/0.11.x and supplies channel rules, so reuse those documents. [Workflow](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/CONTRIBUTING.md#L98-L103), [channel rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/docs/versioning-policy.md#L267-L286), [S6C-1](comprehension_report.md#findings), [S8Z-2](intermediate_zoom_out_report.md#s8z-2--major-repeated-s6c-1-unnamed-packaging-lane).

## Editorial Nits

| Action | Raw finding | Requested edit | Target |
|---|---|---|---|
| C10 | S7S-1 | Name the rejected alternative before stating the selected behavior. | [145–167](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L145-L167) |
| C11 | S7S-2 | Update obsolete unresolved-design wording to implementation/qualification of selected contracts. | [30–50](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L30-L50) |
| C12 | S7S-3 | Drop the redundant universal transcript-reader caveat; keep the source boundary. | [167](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L167) |
| C13 | S9S-1 | Drop the repeated future-file caveat, preserving the earlier qualification. | [189–191](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L191) |
| C14 | S9S-2 | Remove the ambiguous retrospective sentence; retain explicit amendment chronology. | [302–313](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L302-L313) |

## Stage and reviewer completion

| Stage | Reviewers completed | Raw Blockers | Raw Majors | Raw Nits | Report |
|---|---|---|---|---|---|
| 5: Initial Zoom Out | Zoom Out; Inventive Catalyst | 0 | 0 | 0 | [Report](zoom_out_report.md) |
| 6: Comprehension | Comprehension | 0 | 1 | 0 | [Complete paraphrase and findings](comprehension_report.md) |
| 7: Feature critique | Design; Structural; Style | 0 | 1 | 3 | [Report](critic_report.md) |
| 8: Intermediate Zoom Out | Zoom Out | 0 | 2 | 0 | [Report](intermediate_zoom_out_report.md) |
| 9: Readiness | Readiness; Codebase Details; Style | 1 | 6 | 2 | [Report](implementation_readiness_report.md) |
| Total | 10 completed; 0 not run | 1 | 10 | 5 | 16 raw findings |

## Traceability

| Raw ID | Stage / lens | Severity | Consolidated action | Disposition |
|---|---|---|---|---|
| S6C-1 | 6 / Comprehension | Major | C9 | Distinct |
| S7D-1 | 7 / Design Critic | Major | C2 | Distinct |
| S7S-1 | 7 / Style | Nit | C10 | Distinct |
| S7S-2 | 7 / Style | Nit | C11 | Distinct |
| S7S-3 | 7 / Style | Nit | C12 | Distinct |
| S8Z-1 | 8 / Intermediate Zoom Out | Major | C2 | Repeated S7D-1 |
| S8Z-2 | 8 / Intermediate Zoom Out | Major | C9 | Repeated S6C-1 |
| S9S-1 | 9 / Implementation Style | Nit | C13 | Distinct |
| S9S-2 | 9 / Implementation Style | Nit | C14 | Distinct |
| S9R-1 | 9 / Implementation Readiness | Major | C4 | Distinct |
| S9R-2 | 9 / Implementation Readiness | Major | C5 | Distinct |
| S9R-3 | 9 / Implementation Readiness | Major | C6 | Distinct |
| S9R-4 | 9 / Implementation Readiness | Major | C8 | Distinct |
| S9B-1 | 9 / Codebase Details | Blocker | C1 | Distinct |
| S9B-2 | 9 / Codebase Details | Major | C7 | Distinct |
| S9B-3 | 9 / Codebase Details | Major | C3 | Distinct |

Two repeated Major observations map to existing actions rather than increasing the unique count. Every raw finding is mapped exactly once. All fourteen actions remain open; no proposed fix or risk acceptance was applied by this review.

## Interpretation and next step

The companion direction and persistent-shell choice remain the author-selected scope. These results call for completing/correcting the design contracts and implementation inventory, rather than silently replacing those choices. Resolve C1–C9 before claiming implementation readiness; treat C10–C14 as editorial cleanup. Any change to the non-interruption guarantee, identity-rebinding policy or observable Run eligibility must be made explicit. [Recorded Run selection](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909), [readiness findings](implementation_readiness_report.md).

This was static design review, not executed product validation. No builds, runtime tests, native command probes or subscription/model experiments were run. API/experiment evidence retains its documented limits. Fresh conversation contexts were used, while exclusion of host instruction files is unverified. The [input manifest](context_manifest.md) records the reviewed hash, semantic split, local context and primary sources. #215 remains open; implementation and live qualification still require separate authorization.
