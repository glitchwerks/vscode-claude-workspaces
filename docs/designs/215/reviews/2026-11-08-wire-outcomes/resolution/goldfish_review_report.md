# Goldfish Annotated Review Report

**Status:** resolved — six auto-accepted design/fixture corrections applied; fresh review pending.

**Target:** docs/designs/215/design_draft.md (full file; source feature 1–180, Detailed Implementation 181–405), with incorporated CH/VW contracts and fixtures. Source checkpoint: db59576beb8841cd2c9629dcb3c18bd164e1c29e; reviewed design content remains feef3a2995e679b4ab56785aad2fb81e0d298656. [Frozen findings](../consolidated_review_report.md), [full readiness evidence](../implementation_readiness_report.md).

**Authorization:** [Author auto accept of all six findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631). No repeat approval gate is needed. Run/Run again/C2 and direct companion responses remain deferred. This batch corrects documents/synthetic expectations; it does not implement or qualify the feature.

## Prioritized findings and accepted proposals

### F1 — Native deny type [Codebase Details; Implementation Readiness] — Blocker

* **Affected scope:** reviewed design lines 254–256/296–298; CH native callReturn row, preserved ToolCallResult declaration and C4-08/C4-26 projection expectations.
* **Discrepancy:** CH checks r.deny===true, while the pinned declaration and both native cases use deny:string. The source reports rate the same observation Blocker (S9-B-1) and Major (S9-R-1); retain Blocker here. [Original reports](../implementation_readiness_report.md).
* **Rationale:** the literal adapter predicate cannot recognize a conforming deny branch; no serialized valid-deny example exposes the mismatch. This is static contract analysis, not an observed runtime failure.
* **AI suggestion:** PROPOSE FIX — accepted by the author's batch instruction.
* **Justification:** use the declared string type, retaining withholding precedence and privacy rather than changing preserved native inputs. [Native declaration](../../../evidence/c4-native-evidence.md#toolcallresult), [C4 state table](../../../capture-provenance-contract.md#state-finality-and-copyrun-again-evidence).
* **Proposed edit:** replace the boolean predicate with explicit defined-string/undefined/invalid-type/mixed-branch rules; never forward the reason. Add serialized deny/unknown and rejected-extra/flags examples, native normalization cases and C4-08/C4-26 complete pipeline expectations. Preserve all 32 original C4 case bodies.

### F2 — Root protocol integration [Codebase Details] — Major

* **Affected scope:** reviewed design lines 199/208–211/216/242; VW closed message schema and pinned root protocol/consumers.
* **Discrepancy:** the plan does not select integration between exact kind-only VW records and type-based root unions/decoders. [S9-B-2](../implementation_readiness_report.md).
* **Rationale:** literal kind-only root union additions would invalidate .type consumers; unchanged root decoders reject them. These are conditional static consequences, not an observed build failure.
* **AI suggestion:** PROPOSE FIX — accepted.
* **Justification:** select a closed type=companion/payload root envelope in both directions. The nested VW record retains its exact closed kind schema and legacy .type consumers retain a common discriminant. [Root protocol](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L30-L118).
* **Proposed edit:** define envelope/direction/dispatch/size/rejection rules and all nineteen positive message-kind fixtures plus malformed/direction/legacy controls. Update already-listed provider/renderer/index/protocol test responsibilities. Explicitly reconcile lifecycle, terminalDiagnostics and terminalEchoWebview as unchanged consumers, with compatibility checks and no new runtime paths.

### F3 — Channel ownership and cleanup [Codebase Details] — Major

* **Affected scope:** reviewed design lines 194/248/256–258/327; CH ownership marker; selected technical choice.
* **Discrepancy:** ownership.json lacks an exact schema, identity binding and dead-owner test; the ready marker is a different record. [S9-B-3](../implementation_readiness_report.md).
* **Rationale:** admission and deletion authority require selected behavior; composer-specific private helpers are not a public companion API.
* **AI suggestion:** PROPOSE FIX — accepted.
* **Justification:** specify a new companion marker and conservative cleanup policy in the existing capture module, drawing only on the pinned precedent. [Composer ownership and cleanup](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L43-L54), [liveness rule](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L113-L138).
* **Proposed edit:** select bounded closed marker keys, a host-issued channel basename, in-memory full-identity admission, fixed-name flat-file deletion and ESRCH-only dead-host proof; preserve malformed/foreign/live/uncertain candidates. Distinguish active-generation file retirement from whole-directory cleanup. Add exact accepted/rejected marker, liveness, identity and cleanup cases in the existing design fixture.

### F4 — Repeated pre-Overview history [Style] — Nit

* **Affected scope:** reviewed design lines 4/11–13, overlapping 19–21.
* **Discrepancy and rationale:** repair counts, scope and superseded shell history repeat before the feature explanation. [S7-S-1](../critic_report.md).
* **AI suggestion:** PROPOSE FIX — accepted.
* **Proposed edit:** retain a short current status; remove the two repeated pre-Overview paragraphs. Keep scope/authorization statements in Overview/Detailed Implementation and the existing reconciliation/deferred history links.

### F5 — Authorization wording [Style] — Nit

* **Affected scope:** reviewed design line 187.
* **Discrepancy and rationale:** “its authorization/tracking” has an ambiguous referent and conflates two concepts. [S9-S-1](../implementation_readiness_report.md).
* **AI suggestion:** PROPOSE FIX — accepted.
* **Proposed edit:** state “Obtain implementation authorization and record implementation tracking (with a milestone if split)” consistently with handoff item 1. This is wording repair, not another gate.

### F6 — Historical IDs in operational headings [Style] — Nit

* **Affected scope:** reviewed design lines 225/250/290/298 and resource R2 at 384.
* **Discrepancy and rationale:** C8/R1/R2/A2 headings are ambiguous across historical review namespaces. [S9-S-2](../implementation_readiness_report.md).
* **AI suggestion:** PROPOSE FIX — accepted.
* **Proposed edit:** use behavioral headings: Ordered phase write allowlists; Epoch authority and admission; Closed view/action interface; C4 projection translation. Retain qualified review links in resources/history.

## Context

Context: git ls-tree HEAD -- docs/designs/215/reviews/2026-11-08-wire-outcomes/consolidated_review_report.md docs/designs/215/reviews/2026-11-08-wire-outcomes/implementation_readiness_report.md at db59576beb8841cd2c9629dcb3c18bd164e1c29e verifies the source findings and full evidence. Final validation and disposition follow after edits.

## Applied disposition

**6 accepted / 6 applied / 0 contested / 0 escalated / 0 declined / 0 unaddressed textual corrections.** Original finding severities remain 1 Blocker / 2 Majors / 3 Nits. This is the resolution result, not a fresh reviewer pass, convergence or product qualification. The earlier frozen reports remain unchanged. [Author instruction](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631), [source findings](../consolidated_review_report.md).

| Action | Applied location and exact behavior |
|---|---|
| F1 | [CH native return selection](../../../capture-channel-contract.md#native-call-return-branch-selection): defined string deny including empty; absent/undefined allowed for other variants; invalid defined type or contradictory populated deny fields becomes unknown/null without fallthrough. No reason serialized. Added 16 native normalization examples, four W43–W46 serialized examples and two C4-08/C4-26 full pipelines in [capture expectations](../../../evidence/capture-channel-cases.json). [C4 transfer](../../../capture-provenance-contract.md#native-withholding-transfer) preserves the original native bodies and outcome precedence. |
| F2 | [VW root envelope](../../../companion-view-contract.md#root-envelope-and-dispatch): exact type=companion/payload wrapper around each closed direction-specific VW payload, before legacy dispatch; whole-wrapper cap includes overhead. Added 19 positive/14 rejected wrappers, four legacy controls and three constructive byte-boundary cases in [view expectations](../../../evidence/companion-view-cases.json). Existing three additional consumers remain read-only; the 46-path runtime allowlist is unchanged. |
| F3 | [CH ownership](../../../capture-channel-contract.md#exact-ownership-marker-and-cleanup): eight required fields, 1,024-byte cap, full in-memory binding, exact channel/fixed child names, confirmed process exit for current cleanup or ESRCH-only dead-host proof, bounded flat-file deletion and conservative retention on ambiguity/failure. Added 33 exact marker/liveness/cleanup cases in the existing capture fixture. [Selected transport](../../../technical_choices.md#selected-a-private-file-channel) now names this new contract instead of implying reuse of private composer helpers. |
| F4 | [Main design](../../../design_draft.md): short status and immediate Overview; removed the two repeated pre-Overview paragraphs. Scope/authority and superseded shell history remain in Overview, Detailed Implementation and reconciliation/deferred records. |
| F5 | Main baseline item now says “Obtain implementation authorization and record implementation tracking (with a milestone if split)”; no extra approval gate added. |
| F6 | Four operational headings now describe behavior without C8/R1/R2/A2 repair IDs. Historical review citations remain qualified in resources and the resolution records. |

## Handoff synchronization

The [exact input manifest](../../../implementation-inputs.json) now has **59 files: 46 Markdown / 13 JSON**, all Create against the unchanged pinned runtime ef5fd48f4b676881a8730afbf8e583e70565ca11. The ten additional inputs are this resolution and the nine source-review records needed by new local references. P0–P4 remain **28 Create / 18 Modify = 46**, with the same two documentation overlaps; union **103 = 87 Create / 16 existing Modify**. The [handoff procedure](../../../documentation-handoff.md) uses the [new source record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724623895), which becomes Ready only after commit/blob verification. Earlier Ready records are historical and unchanged. No runtime overlay or branch/base change is included. [Current authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631).

## Validation and limits

Read-only static checks passed for 16 native normalization cases, four added wire cases, both native→normalized-wire→model/view pipelines, 19 positive/14 rejected root envelopes, four literal legacy controls, three full-wrapper byte boundaries and 33 ownership examples. Checks compare synthetic inputs/declared expectations, serialized bytes/privacy and selected predicates; they are not execution of a product adapter or existing runtime decoder. Existing W01–W42, E01–E18, B01–B04, six earlier boundaries, V01–V18, 32 C4 projections, 15 label pairs and six group examples are preserved. All 32 native C4 case bodies, 29 path vectors, the brief, original goals, frozen hypothesis and historical evidence/reports are unchanged. The exact runtime first/later phase paths and their pinned Create/Modify classifications were rechecked. [Capture cases](../../../evidence/capture-channel-cases.json), [view cases](../../../evidence/companion-view-cases.json), [manifest](../../../implementation-inputs.json).

No compiler, lint, product unit/integration/build/package, native Claude/subscription, clipboard or Windows ACL/reparse/lock qualification was run. No implementation, merge or release occurred. Run, Run again, C2 and direct companion answers remain deferred. The next step is affected fresh review of the corrected contracts and plan integration; source readiness is not implementation authorization. [Active design](../../../design_draft.md#detailed-implementation), [current authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631).

Artifact/source audit: all 59 inputs passed JSON/CRLF/whitespace/fence validation and local-reference closure (**476 local links / 78 anchors**). The ten changed/new documents have **44 verified pinned references across 31 source blobs**. The patch updates nine existing documents/fixtures and adds this one resolution record; 49 of the 58 existing artifacts remain byte-for-byte unchanged. Final committed-tree/source-blob verification is recorded on #215 after publication.
