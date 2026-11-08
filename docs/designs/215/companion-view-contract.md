# Companion projection, review and action protocol

* **State:** Six-finding correction selects the exact root envelope/dispatch while retaining the existing VW payload and C4 outcomes. Not implemented or product-qualified. [Current auto accept; Current review]
* **Scope:** The planned host/view decoder and runtime files. No Run/Run again discriminant, executable command payload, permission response or terminal-selection authority.
* **Basis:** [R2 finding](reviews/2026-11-07-copying-v1/consolidated_review_report.md#r2--major-specify-projection-hydration-and-reviewaction-messages), [main rendering/clipboard budgets](design_draft.md#detailed-implementation), [explicit existing decoder precedent](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L30-L135). The exact protocol below is the selected repair. [A]

## Identity, limits and closed decoding

The host creates a viewId (hex32) for each renderer document and supplies it through the existing trusted bootstrap. It creates a projectionId (hex32) each time that document selects a session or resynchronizes. Bind projectionId to the host's current sessionId/claudeSessionId/generation tuple; never accept a destination chosen by captured text or a webview path. These identifiers are nonsecret correlation values, not the private capture token.

Every nested companion payload has v=1, kind and viewId; it travels only inside the closed root envelope below. Projection/action messages also have projectionId, sessionId and generation. Session/generation and generic opaque IDs are 1–128 UTF-8 bytes; view/projection/transfer/review IDs are host-issued hex32. Revision, actionId, chunkIndex/count, lengths and sequence values are nonnegative safe integers, with positive actionId/chunkCount. Reject unknown keys, unknown kinds, malformed values and invalid state before acting. Revision exhaustion detaches the projection rather than wrapping.

Use the main limits: nonempty UTF-8 payload chunks at Unicode scalar boundaries, each at most 64 KiB decoded; split further when JSON escaping/envelopes would exceed 256 KiB serialized message. chunkCount is 1–8,192 and chunkIndex is less than chunkCount; at most 8 MiB serialized logical projection; 20,000 nodes/2,000 targets per session; path candidate/edited Review value at most 32 KiB; one in-flight clipboard write with two-second feedback deadline. Source and derived/pinned serialization text count toward the existing retention budget; never allocate an unbounded second history. Reject NUL in Copy values. UTF-8 text must contain complete Unicode scalar values; invalid source is unavailable rather than silently repaired. Source text/code is at most 1 MiB per assistant/command group or 256 KiB per tool group; node text uses slices of those bounded values. Labels, language, image alt and fixed notice text are at most 256 UTF-8 bytes; link href is at most 2,048 bytes. All arrays obey the session message/node/target limits and the logical-projection byte bound.

A transfer may reference immutable retained groups, but any pinned old revisions and pending changes count against the same budgets. On capacity failure abort that transfer with a bounded notice and request a newer cut; never commit partial groups. One transfer is in flight per projection. A transfer/ack deadline is two seconds and a complete hydration deadline is five seconds. These are proposed budgets requiring qualification, not measured latency.

## Root envelope and dispatch

VW’s dictionary describes the **nested companion payload**, with its exact kind/v/viewId and direction-specific fields. On the VS Code host/webview boundary, wrap it in exactly {type:companion, payload:VW-record}. Both fields are required; there are no additional root keys. The TypeScript discriminant is the literal string companion. Do not add type to the VW payload, remove its kind or send an unwrapped VW record. This selects wrapping while preserving the closed nested dictionary and the existing type-based root consumers. [Current auto accept; Current review:F2]; [pinned root union/decoder](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L30-L118).

In src/panel/protocol.ts add exactly one new member per existing root union: HostMessage includes {readonly type:"companion"; readonly payload:CompanionHostMessage}, and WebviewMessage includes {readonly type:"companion"; readonly payload:CompanionWebviewMessage}. The two imported companion types are the existing direction-specific VW dictionaries, not new arbitrary JSON. In the already-planned src/panel/companionProtocol.ts, export decodeCompanionHostMessage and decodeCompanionWebviewMessage returning DecodeResult for those closed payload types. Root decodeHostMessage/decodeWebviewMessage recognize type===companion, check the two exact keys and full serialized-message bound, invoke the matching payload decoder, then return an accepted typed envelope only if payload validation succeeds. Other type branches and the current rejected result contract remain unchanged; a malformed companion wrapper cannot fall through as a legacy message. [Current auto accept]; [decoder precedent](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L104-L118).

Provider actionFor and renderer handleMessage first narrow message.type===companion, forward only message.payload to the corresponding companion handler, and return before composer/terminal dispatch. Existing provider posting and the browser index/dependency postMessage callback send the typed envelope unchanged; no cast of a kind-only record to a root type and no second serializer is selected. Runtime/controller emits host wrappers; companion view action callbacks emit webview wrappers. The entire serialized wrapper, including type/payload overhead, is at most 256 KiB; split payload chunks further as needed. Logical projection hash/byteLength still cover only the exact concatenated logical JSON, not the root wrapper. [Current auto accept]; [provider dispatch/post](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L440-L445); [browser boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L11-L47).

**Consumer and write-scope reconciliation:** protocol.ts, sessionPanelProvider.ts, renderer.ts and browser index.ts are already listed P3 Modify paths. Existing lifecycle.test.ts, terminalDiagnostics.test.ts and terminalEchoWebview.ts remain read-only compatibility consumers: their .type checks still operate on every root variant and narrow legacy payloads; companion envelopes cannot become terminal data. No additional write path is selected. Run check:types over the existing consumers; transfer rootExamples and legacyCompatibilityCases into already-listed protocol/companionProtocol/renderer tests and companion integration coverage, then run the full existing integration suite. The unchanged manual echo consumer must continue to type-check; its existing manual/bundle qualification remains separate. Do not modify it just to accommodate kind-only roots. If an actual baseline mismatch requires another file, reconcile the allowlist explicitly first. [Lifecycle helper](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/integration/lifecycle.test.ts#L629-L645), [diagnostic harness](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/integration/terminalDiagnostics.test.ts#L296-L340), [manual consumer](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/manual/terminalEchoWebview.ts#L52-L62); [Current auto accept].

The schema vectors include all nineteen valid direction-specific kind wrappers, unknown/extra/missing/mixed fields, opposite-direction payloads, malformed IDs, unwrapped kind-only records and whole-wrapper size boundaries. They are synthetic expected decoder/dispatch outcomes, not executed product tests or renderer state qualification. Existing V01–V18 state traces remain unchanged. [Vectors](evidence/companion-view-cases.json); [Current review:F2].

## Logical projection payloads

A snapshot has exactly groups (ordered complete message groups), historyBoundary (boolean) and captureStatus. A delta has exactly changes (at most 64), each a closed union: {kind:upsertGroup, group}, {kind:removeGroup, groupId}, {kind:historyBoundary, value:boolean} or {kind:captureStatus, value:captureStatus}. Apply them in order. Upserts replace the entire immutable group revision; removals invalidate its targets. No change can attach source across a capture gap.

A captureStatus has exactly state (starting/active/unavailable/retired/unsupported) and reason (null or INITIALIZING/UNSUPPORTED_BUILD/CAPACITY/GAP/IDENTITY_CHANGED/CHANNEL_RETIRED/CONTROL_REJECTED/HANDSHAKE_TIMEOUT/SCHEMA_REJECTED/CONTENT_REJECTED/TRANSACTION_TIMEOUT). provenanceStatus is none/suggested/example/code/pending/completed/backgrounded/interrupted/denied/tool-error/unknown/notice, as determined by the existing source-backed recognition/C4 rules; it cannot be inferred from a successful transfer. A notice-node reason is GAP/HISTORY_EVICTED/CAPTURE_UNAVAILABLE/UNSUPPORTED_CONTENT/RENDER_LIMIT. These are presentation enums, not additional native evidence.

A group has exactly groupId, captureEpoch (hex32, or null only for host notices), sourceRevision, speaker (assistant/tool/notice), sourceText, nodes, targets, provenanceStatus and statusLabel. statusLabel is required and is exactly null or the fixed label selected by the outcome table below. Text/body limits remain the main per-message/tool-result limits. sourceRevision is a host-issued safe-integer revision; native row/block IDs and source spans remain host records, not authority supplied back by the view.

A target descriptor has targetId, targetRevision (host-issued positive safe integer), groupId, sourceStart/sourceEnd (UTF-16 offsets), kind (command/code/path), action (copy/review), accessibleLabel and displayLabel. Literal Copy values and native evidence stay host-owned. The view displays the projected source; a target descriptor cannot override the value or cause native execution.

Render nodes are the following closed union; nodeId and sourceSpan (start/end or null for derived notices) are common:

| kind | Other fields |
|---|---|
| text | text |
| paragraph, emphasis, strong, blockquote, listItem | children |
| list | children, ordered:boolean, startNumber (positive integer or null) |
| heading | level 1–6, children |
| code | text, language (bounded string or null), block:boolean, targetId (or null) |
| softBreak, hardBreak | none |
| link | children, href (host-validated allowed URL or null) |
| imagePlaceholder | alt; no resource URL |
| notice | reason (bounded enum), text; no action target |

A non-null sourceSpan has exactly start/end UTF-16 offsets, zero-based and end-exclusive, with start ≤ end ≤ sourceText.length. Each target uses the same span convention. nodeId, groupId and targetId use the bounded opaque-ID type. Child spans must remain within their parent/source group, depth is at most 32 and all node/target counts are checked. If decoded Markdown cannot map a path exactly, emit an explicit Review target using retained raw source. If node depth/complexity cannot be represented, show the complete bounded source as inert text with a notice; do not silently drop explanation text or invent targets. Existing CSP/link restrictions still apply.

## Complete message dictionary

Extra fields below are beyond the required common envelope. There are no other v1 message kinds.

| Direction / kind | Fields and effect |
|---|---|
| view → host: companion.ready | viewId only; register the current trusted renderer document. Host supplies its actual selected-session projection. |
| host → view: companion.bind | projection/session/generation; claudeSessionId; modelRevision; reset view transfer/review state. No capture token. |
| view → host: companion.resync | projection envelope; appliedRevision; reason=decode/order/timeout/capacity. Request a new host-issued projectionId and snapshot. |
| host → view: companion.transferBegin | projection envelope; transferId; mode=snapshot/delta; baseRevision (null for snapshot); revision (snapshot cut or delta head); byteLength; chunkCount; sha256 of the exact concatenated UTF-8 JSON payload. |
| host → view: companion.transferChunk | projection envelope; transferId; chunkIndex; data (UTF-8 text, at most 64 KiB decoded); chunk byteLength. |
| view → host: companion.transferAck | projection envelope; transferId; nextChunkIndex (next expected); received byteLength. Only the next outstanding chunk may advance the sender. |
| host → view: companion.transferEnd | projection envelope; transferId; revision; byteLength; sha256. Marks complete emission, not visibility. |
| view → host: companion.transferReady | projection envelope; transferId; revision; validated byteLength/sha256. Sent only after complete schema/hash/count checks. |
| host → view: companion.transferCommit | projection envelope; transferId; revision. Atomically replace the visible snapshot or apply the complete delta at its exact baseRevision. |
| host → view: companion.transferAbort | projection envelope; transferId; reason=stale/order/decode/timeout/capacity/closed. Discard only pending transfer state; preserve last committed reading window with notice. |
| view → host: companion.copy | projection envelope; actionId; appliedRevision; targetId; targetRevision. Resolve host literal value after current source checks. |
| view → host: companion.reviewOpen | same action/target fields as copy. Host issues a Review only for a current action=review target. |
| host → view: companion.reviewOpened | projection envelope; actionId; reviewId; targetId/targetRevision; value (exact candidate); byteLength. Show editable local dialog, not native input. |
| view → host: companion.reviewCopy | projection envelope; actionId; appliedRevision; reviewId; targetId/targetRevision; value (explicit displayed edited value, within 32 KiB). |
| view → host: companion.reviewCancel | projection envelope; actionId; reviewId. Retire that live review once, then restore focus locally. The terminal result is cancelled/null. |
| host → view: companion.reviewInvalidated | projection envelope; reviewId; reason=sourceChanged/evicted/reset/closed/expired. Close/disable stale modal. |
| view → host: companion.toggleRaw | projection envelope; actionId. Reveal/focus the same selected CLI; never create a terminal or submit text. |
| view → host: companion.escape | projection envelope; actionId. Validate current running session/generation and send one native Escape through its existing input owner. |
| host → view: companion.actionResult | projection envelope; actionId; status; reason (closed bounded enum or null); targetId/reviewId (only when relevant). No echoed path/command or clipboard value. |

Every dictionary field is required unless explicitly null or described as relevant-only; all other keys are rejected. sha256 is lowercase hex64. byteLength always counts UTF-8 bytes, including the entire logical JSON for transferBegin/End/Ready and the decoded chunk data for transferChunk/Ack. nextChunkIndex ranges from 0 through chunkCount; revision must exceed baseRevision for a delta. Field names such as targetId/targetRevision denote two separate fields, not a slash-named key. No timestamp from the view determines expiry.

Statuses are ok, invalid, stale, busy, unavailable, cancelled, duplicateExpired, inputSent, uncertain and settledAfterUncertain. Reasons are SOURCE_CHANGED, EVICTED, RESET, DOCUMENT_CLOSED, WRONG_BINDING, INVALID_MESSAGE, NOT_READY, COPY_PENDING, PLATFORM_ERROR, EXPIRED_ACTION or EXPIRED_REVIEW. Fixed feedback strings are generated by the extension, never interpreted from assistant text.

Decode/rejection results use invalid/INVALID_MESSAGE for structurally invalid messages with a trusted current actionId; ignore messages with no safely correlatable action ID. Use stale/WRONG_BINDING or SOURCE_CHANGED, busy/COPY_PENDING, unavailable/NOT_READY or PLATFORM_ERROR, cancelled/null for an accepted cancellation, duplicateExpired/EXPIRED_ACTION, inputSent/null for native Escape and ok/null for completed Copy/Review-open/Raw. A timer-expired Review returns unavailable/EXPIRED_REVIEW; a consumed or invalidated review returns stale/EXPIRED_REVIEW unless a more specific SOURCE_CHANGED/EVICTED/RESET reason is retained. A still-pending write returns uncertain/null at its deadline, followed only by settledAfterUncertain/null or unavailable/PLATFORM_ERROR for that original action.

Host binding exists even when capture/hydration is unavailable. Native Raw/Escape validate the current trusted view and selected running session/generation but do not require capture admission, transfer completion or a Copy target; Copy/Review require committed target authority. No-input-yet detection remains existing metadata plus Respond in terminal; direct answers/permissions are not new messages. Capture health/gap notices travel through projection data, not a second authority for native activity.

## Atomic hydration and updates

The host increments modelRevision once per admitted mutation batch. At ready/selection/resync it binds a new projectionId and freezes snapshot cut R. Stream that immutable snapshot with one acknowledged chunk at a time. Receiver order is begin → chunks 0..N-1/acks → end → ready → commit. Before commit, only the old committed reading window is visible/actionable; a partial new snapshot is never rendered as complete.

While a transfer is pending, retain ordered changes after R within at most 64 pending changes or 1 MiB, counted in retention. Coalesce untransmitted upserts of the same group to its last revision; retain removals and all gap boundaries. Once snapshot R commits, send a delta with baseRevision=R and revision=the chosen queued head. A delta is validated/committed atomically through the same transfer sequence; the view applies it only when baseRevision equals its appliedRevision.

Source replacement/eviction immediately invalidates host Copy/review authority even while its UI delta is pending. Unrelated newer groups do not make an unchanged target stale: Copy validates target identity/revision and current retained source, not equality of the entire view/model revision. appliedRevision must be no greater than the host's revision and belong to this projection. Host authority therefore cannot silently substitute a new value under an old button.

An identical already-received chunk is acknowledged with the current nextChunkIndex/total received byteLength, without re-appending it. A future index, conflicting duplicate, wrong hash, missing chunk, wrong revision or capacity/timeout aborts the transfer and resyncs. Late messages from old view/projection/transfer IDs cannot replace current state. Resync cancels pending transfer and all live review IDs for that projection; it does not restart xterm/CLI or erase the composer.

If pinned data or catch-up changes exceed budgets, abort and bind a new projection at the latest complete retained window. Keep a bounded capture/view-unavailable notice and Raw access if repeated transfer failure prevents hydration. Do not queue endless retries; after one automatic resync failure leave Raw/notice until the next explicit ready/selection/toggle cycle.

## Review and action lifetime

Maintain at most one live review per renderer document. ReviewOpen consumes an action ID and binds a host-issued reviewId to view/projection/session/generation/target/revision/current source span and original candidate. A second ReviewOpen invalidates the first. Source revision, eviction, capture reset, session selection, document disposal or projection resync invalidates it. It expires after five minutes; this timer does not affect ordinary Copy.

ReviewCopy must carry the currently displayed edited value and matching live review identity. Validate before consuming the review. If another clipboard write is pending, return busy without consuming the review; the user can retry with a new action ID. A valid accepted ReviewCopy consumes the review before invoking the clipboard API, so replay cannot write again.

Action IDs are monotonically increasing positive safe integers per viewId, shared by all user actions. Host retains the latest 128 result records plus a high-water mark. A ReviewOpen sends reviewOpened then actionResult=ok; a duplicate returns only its cached actionResult and never creates/reopens a modal. Other identical duplicate ID/payload returns its existing result without acting; conflicting payload for the same ID is invalid. An ID older than the cache but no greater than the high-water mark returns duplicateExpired without acting. Never allow cache eviction to make an old Copy executable again.

The host allows one clipboard operation across all projections. Set the busy latch before calling the platform API; after two seconds emit uncertain and keep the latch until that same write settles. Later requests are busy, not queued. A late settlement updates only its original action as settledAfterUncertain or PLATFORM_ERROR; it must not claim a later action succeeded or overwrite feedback in another document. A disposed view suppresses UI feedback while the global latch still clears on actual settlement. Never retry an uncertain write automatically.

For Escape, inputSent means exactly one dispatch, not confirmed interruption; duplicate IDs do not resend. A stale document/session cannot address a newly selected CLI. Toggle/Review/Copy never edit the composer or send command text.

## C4-to-view outcome and label mapping (A2)

Select the following total translation after the host applies the unchanged C4 correlation/precedence rules. It covers both qualified native outcomes and non-outcome groups. Add none and tool-error to provenanceStatus, and add required statusLabel (null or one of the exact strings below) to every group. The decoder validates the status/label pair; arbitrary labels or unlisted combinations are rejected. The view renders the fixed label from this pair, never a native error string or assistant-supplied action. No executionConfirmed/exitCode/Run field is added to the view. [A2; C4; F2]

| Host state / source | provenanceStatus | Exact statusLabel |
|---|---|---|
| Ordinary explanation, generic non-command text/tool output, or a group without one command outcome | none | null |
| Exact affirmative instruction cue under the existing grammar | suggested | Suggested command |
| Other command-shaped shell block without a strict instruction cue | example | Command shown by Claude |
| Generic code block | code | Code shown by Claude |
| C4 requested; also a retained main request without a qualified engine/core binding | pending | Requested by Claude; execution not confirmed |
| C4 awaiting-stored-result | pending | Awaiting stored result; execution not confirmed |
| C4 completed-reported | completed | Claude ran this / Tool completed |
| C4 backgrounded-reported | backgrounded | Claude started this / Backgrounded (last reported) |
| C4 interruption-reported | interrupted | Interruption reported; execution not confirmed |
| C4 denied-reported | denied | Permission denied; execution not confirmed |
| C4 tool-error (including C4-06 and C4-11) | tool-error | Tool reported error; execution not confirmed |
| C4 unknown caused by a deny/withholding without positive evidence | unknown | Execution not confirmed |
| C4 unknown caused by conflicting native evidence | unknown | Conflicting native evidence |
| Other C4 unknown, including incomplete/malformed background evidence | unknown | Outcome unknown |
| Host-generated capture/history/unsupported notice | notice | Capture notice |

A completed group also renders the fixed secondary note Exit code unavailable. This note is generated from status, not a guessed exit code. Backgrounded remains last reported; interrupted is a report, not universal process termination. C4's error state is distinct from Unknown and from Failed/Ran; neither tool-error nor denied/interrupted/pending/unknown can acquire a confirmed executed Copy. Requested literal Copy may remain if its source is retained. Completed/backgrounded effective Copy still requires the full source-backed C4 predicate and live target revision; the status field alone never authorizes it.

A missing source observation or non-Bash/plugin/agent event creates no new C4 execution group. Existing main explanation and its requested command remain source-backed; a plugin call cannot supply the missing engine/core binding. Unsupported content may be ordinary none text or a bounded notice, never a Bash execution label. Preserve one group/outcome per native call key rather than collapsing identical commands. Assistant groups with several independently labelled code/command blocks use none at group level and the existing target/node display labels per block; no group-level outcome is invented for the whole explanation.

Native reset, identity mismatch, gap or eviction invalidates current targets using the existing capture/removal messages. Keep the last reading context as already specified, with unavailable/history notice; do not rewrite historical completed evidence into a fresh current execution claim. A no-observation case produces no new outcome rather than inventing Unknown evidence. These are lifecycle effects, not extra C4/native event kinds.

The [view expectation file](evidence/companion-view-cases.json) retains V01–V18 and adds c4ProjectionCases for all 32 source cases, valid tool-error group examples for C4-06/C4-11, and rejected status/label/unknown-field examples. Each projection case points to the unchanged native events in c4-adapter-cases.json, records group fields/Copy eligibility or a no-outcome lifecycle effect, and excludes all deferred Run eligibility assertions. Transfer them through the planned native-adapter → model → protocol → view tests, including rendered labels and absence of an executed button for the error cases. These are design expectations, not executed end-to-end tests. [A2; C4]


## Acceptance and sources

* **Current auto accept:** [All six F1–F6 corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631).
* **Current review:** [F2 root integration finding](reviews/2026-11-08-wire-outcomes/consolidated_review_report.md#f2--major--select-the-companion-message-integration-with-the-root-protocol), [full source comparison](reviews/2026-11-08-wire-outcomes/implementation_readiness_report.md).

Transfer the [exact design traces](evidence/companion-view-cases.json) into the planned protocol/runtime/model/view tests. Cover partial hydration invisibility, queued update/eviction, recreation, wrong base, duplicate/conflicting chunks, source change during Review, consumed/expired IDs, concurrent Copy, uncertainty/late completion and native action replay. These are source/expectation fixtures, not a product test pass.

* **A2:** [Four-finding auto accept](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972512).
* **F2:** [C4/view mapping finding](reviews/2026-11-08-corrected-copying-v1/implementation_readiness_report.md).
* **C4:** [Source outcomes and unchanged native cases](capture-provenance-contract.md).
* **A:** [Author auto-accept](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465).
* **R2:** [Detailed readiness finding](reviews/2026-11-07-copying-v1/implementation_readiness_report.md).
* **Selected existing boundaries:** [native/Copy design](design_draft.md), [capture epoch authority](capture-channel-contract.md), [provenance source contract](capture-provenance-contract.md).
