# Stage 9: Implementation readiness

**Result:** completed; does not yet pass zero-design-decision/stable-phase readiness. **Active scope:** [target lines 183–351](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L183-L351). **Date:** 2026-11-07. [Inputs](context_manifest.md).

## Reviewer status

| Reviewer | Standard | Status | Blockers | Majors | Nits |
|---|---|---|---|---|---|
| Implementation Readiness | Implementation Readiness | completed | 0 | 4 | 0 |
| Codebase Details | Implementation Readiness | completed | 1 | 2 | 0 |
| Style | Persona only | completed | 0 | 0 | 2 |

## S9B-1 — Blocker: wrong existing stylesheet boundary

**Target:** lines 213, 225 and 338. D2 calls renderer.ts lines 1–34 the existing stylesheet imports, while those imports are actually in [index.ts lines 1–9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L1-L9); [renderer.ts lines 1–7](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L1-L7) imports no stylesheet. The plan also explicitly places the new CSS import in renderer.ts. [Target instruction and inventory](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L208-L225), [D2](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L338).

The existing [renderer unit harness](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/webviewRenderer.test.ts#L1-L16) imports renderer directly. [Scripts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/package.json#L37-L46) and [TypeScript configuration](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/tsconfig.json#L1-L35) compile/load it in Node without a CSS loader. Following the plan would introduce a stylesheet dependency across that test boundary. The loading failure is a structural inference, not an executed test result. The Blocker severity follows this persona’s current-state-contradiction rule.

**Direction:** add Modify index.ts to the inventory, place the stylesheet import beside existing entry-point imports, retain renderer’s Node-loadable boundary and correct D2. The current browser build entry point need not change.

## S9R-1 — Major: native capture/provenance contract is not implementable yet

**Target:** [lines 229–233 and 267–278](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L229-L278). The plan selects session.append for assistant text but leaves tool sources as relevant observers/allowlisted evidence, without selecting supported tools, exact events/fields, main/subagent correlation and finality/status transitions. Ordinary nonzero completion is absent from the table. Implementers could disagree on Requested, Ran, Completed, Denied, Interrupted, Backgrounded and Run-again eligibility.

**Direction:** add a build-specific adapter matrix and synthetic expectations for success, nonzero execution, denial, backgrounding and missing/contradictory evidence. Qualification should test the selected contract rather than invent it. Prior disposable evidence already records envelope/interruption-reporting pitfalls. [Observer source/corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085), [focused findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988), fetched 2026-11-07.

## S9R-2 — Major: rejection/ack recovery transition is unspecified

**Target:** [lines 233–235](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L233-L235). Acknowledgement is allowed after explicit rejection, but the cumulative cursor covers admitted sequences. After admitting 4 and rejecting owned sequence 5, the plan does not select cursor advancement, gap replacement, rejection disposition or epoch retirement. These choices affect producer cleanup and later valid traffic.

**Direction:** define record shapes and transitions for authenticated rejected transactions versus unauthenticated traffic, including cursor, gap, retirement and subsequent admission. Add a rejected-middle-sequence fixture with exact expected state. The [existing request/response slot](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L142-L199) does not supply this streaming rule.

## S9R-3 — Major: command-to-shell compatibility rule is missing

**Target:** [grammar lines 252–263](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L252-L263), [integration line 282](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L282), [Run contract lines 24–30](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L24-L30). The grammar yields candidates from multiple fence tags and untyped inline commands; the amendment requires shell agreement without selecting required-family metadata or tag/origin/profile mappings. A fresh implementer must decide how shell/sh/cmd, untyped commands and completed tool commands qualify.

**Direction:** select a deterministic eligibility matrix, unavailable/unknown behavior and retained metadata, with cross-family/untyped fixtures. Do not add an implicit classifier or translate literal syntax. The [platform support matrix](https://code.visualstudio.com/docs/terminal/shell-integration), fetched 2026-11-07, establishes shell support, not classification of captured commands.

## S9R-4 — Major: no stable incremental phases

**Target:** [inventory and steps, lines 189–296](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L296). The twelve responsibility-oriented items do not define ordered stable phases, file subsets, activation boundaries or per-phase verification. A fresh implementer must decide when observers/consumers/UI become active and how intermediate commits remain testable.

**Direction:** group the existing inventory into phases with exact write subsets, dependencies, available behavior, activation points and named verification gates. Keep model-consuming qualification separately authorized. Existing [launch composition](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L443-L474) and [CI gates](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/.github/workflows/ci.yml#L55-L89) can anchor the checkpoints.

## S9B-2 — Major: existing mod-entry loader omitted

**Target:** [lines 208, 217–225](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L208-L225), [native checks line 292](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L292). The [attention mod-entry loader](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts#L6-L21) substitutes exactly two known imports before a data-URL import; its [SDK mock](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts#L22-L55) has a limited environment/timer surface. The new helper graph is not resolved merely by adding a separate companion test.

**Direction:** add Modify attentionCompletionMod.test.ts to the inventory. Define helper-graph loading and absent/disabled capture mocks, retaining native continuation and attention metadata-only regression coverage. Predicted unresolved imports are an integration inference; no test was run.

## S9B-3 — Major: native identity reset has no host transition

**Target:** [lines 227–235](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L227-L235), [qualification line 294](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L294). The plan reuses targetFor and requires UUID-change invalidation/reconnection, but [targetFor](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74) reads the managed snapshot; its [generation update](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L197-L211) depends on that snapshot changing. [SessionManager](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L103-L127) records launch identity, without a found native rebinding operation. The mod recognizes [/clear and /resume lifecycle starts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L103-L107), while the [composer reset](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/composer.js#L216-L228) rejects mismatched native/environment UUIDs.

**Direction:** define authenticated retirement/reset and explicitly choose capture-unavailable-until-managed-relaunch versus host-authorized rebinding. Specify stale target invalidation, gap/status, Run ownership under the unchanged process generation and exact /clear/resume end states. Add any required lifecycle files to the inventory. This is a future transition gap, not a claim that every /clear changes UUID.

## Editorial findings

* **S9S-1 — Nit, line 191:** DROP the repeated future-file sentence; line 189 already establishes that boundary. Preserve helper-placement and metadata-only substance. [Inventory introduction](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L191).
* **S9S-2 — Nit, line 313:** remove the ambiguous retrospective sentence and consolidate the architecture summary; retain the explicit amendment chronology at 302. [Reconciliation](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L302-L313).

## Read receipts and limits

All three reviewers completely read their personas, the full target, approved source catalog and five linked local documents. Both supplied Implementation Readiness standards were read. All independently matched target SHA-256 d589e392a78b15c805638c7c5a4936c28e565359a02b0c7a7d561ed9a5c38019. No required EGM input was missing.

Readiness inspected decision/source comments 6701284701, 6685055630, 6647481988, 6706751545, 6707126769 and 6707453909, plus relevant observer-source corrections in 6646341085; complete composer runtime/adapter, launch overlay, mod entry, package/CI and relevant composition/session source. Codebase Details inspected every existing Modify path in the pinned tree, renderer/build/package/test infrastructure, ownership/reset, mod-entry mocks and manual-probe conventions. Style inspected the selected approval/experiment comments, build/package/mod excerpts and official API/support excerpts. Original cited source URLs are in the [manifest](context_manifest.md); additional pinned evidence is linked at each finding above.

The Readiness reviewer reported Git Bash access denial and used successful read-only PowerShell. An ancillary Codex-wayfinder dispatch skill was unavailable, was not counted as read and blocked none of the required review inputs. No reviewer read other reports from this run, edited files, ran builds/tests/design examples/model probes, mutated GitHub or delegated. Clear future Create paths were not treated as absent-current-file defects. Budget, native Stop, packaged-support and Run-readiness qualifications were retained as evidence-calibrated acceptance boundaries, not blanket caveat findings.
