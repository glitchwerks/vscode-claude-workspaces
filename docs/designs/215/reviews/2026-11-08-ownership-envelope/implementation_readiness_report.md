# Implementation readiness — complete responses

Stage 9 completed all three requested fresh-context reviewers against Detailed Implementation 178–408 at frozen eb11873050cbcc09ece0ea3c32de1f4d39c4a345. Raw observations: **0 Blockers / 3 Majors / 0 Nits**. S9-R-1 and S9-B-1 identify the same missing exit-confirmation bridge; consolidation merges them without changing severity. S9-R-2 concerns host-issued viewId bootstrap. These are static source/contract findings, not observed product failures. No target corrections or product/native qualification were performed.

[Context and source manifest](context_manifest.md), [portable source catalog](review-context.json), [archived personas/standards/workflows/license](review_tools.json). Complete reviewer responses follow. Transient tool/materialization locators in receipts are provenance identifiers, not runtime dependencies.

# Stage 9 — Implementation Readiness Goldfish

Mode: REVIEW. Target: docs/designs/215/design_draft.md, DetailedRange L178–408; L1–177 read for scope and definitions. Review date: 2026-11-08. Frozen documentation source: eb11873050cbcc09ece0ea3c32de1f4d39c4a345. Runtime reference: ef5fd48f4b676881a8730afbf8e583e70565ca11.

## Result

Completed the requested source-based document review. **Does not pass the native Implementation Readiness Standard: 0 Blockers, 2 Majors, 0 Nits.** Two required cross-boundary integration decisions remain unselected. This is not a finding that absent future Create files should already exist, and it is not a product execution result.

The active contracts govern. Earlier approvals, resolution counts and static-check claims were not treated as correctness proof. Run, Run again, C2 and direct question/permission response controls remain deferred. The selected subscription CLI, private files, copying-only scope, native Variant A, Raw and Escape were held fixed.

## Findings

### S9-R-1 — Major — Select the confirmed managed-PTY-exit bridge needed by cleanup

**Affected scope:** Detailed Implementation item 1 inventory/phase allowlists (design_draft.md:L184–240), item 3 ownership and cleanup (L245–257), and the incorporated capture-channel-contract.md:L34–42. Planned companionCapture.ts/companionRuntime.ts and extension.ts integration; existing SessionManager/ManagedPty boundary; ownership examples O18, O19 and O27.

**Observed discrepancy:** CH requires the exact current owner, revoked binding, stopped callbacks and a confirmed managed PTY process-exit event before current-channel directory deletion. O18 explicitly expects deletion after that confirmation, while O19 rejects native session-end and O27 rejects rebuilding authority from the marker. The plan does not select the API/propagation path that supplies this confirmation to the companion runtime. At the pinned runtime, ManagedPty exposes onExit, but SessionManager owns its subscription privately and exposes only session changes/data publicly. The public snapshot states are starting/running/closing, with no exit receipt. Session removal is also used for spawn/preparation/resize/input failures and abandonment; it is not an equivalent proof of confirmed exit. ComposerRuntime.targetFor supplies an identity, not a PTY-exit event. The phase inventory includes extension.ts but does not include sessionManager.ts, sessionTypes.ts or managedPty.ts for modification, and the extension instructions select prepareLaunch composition rather than an exit bridge.

**Why this fails readiness:** A fresh implementer must choose between a new manager event/callback, an extension-level factory/PTY wrapper, another lifecycle channel, or retaining current-host directories until a later dead-host sweep. Those choices change authority propagation and cleanup behavior. Substituting record disappearance or native session.end would violate the selected safety rule; simply omitting current-process cleanup cannot implement O18's end-to-end expectation. The synthetic boolean managedProcessExitConfirmed in the ownership vector does not explain its production source.

**Required guidance:** Select one bridge before implementation and document its exact producer, callback/event signature, session/native UUID/generation correlation, subscription/disposal ordering and behavior for failed or abandoned launches. Reconcile the exact phase/write allowlist if another existing module must change. Specify an integration assertion that a real fake-PTY exit reaches the runtime and permits O18 only for its frozen owner, while native transition, close request/termination promise without acknowledgement, startup removal and late exit from an obsolete generation do not substitute for that receipt.

**Evidence:** [active inventory and phases](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/design_draft.md#L184-L240); [selected ownership requirement](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/capture-channel-contract.md#L34-L42); [O18/O19 inputs and outcomes](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/evidence/capture-channel-cases.json#L2983-L3090); [O27 authority-loss input](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/evidence/capture-channel-cases.json#L3475-L3530); [public manager surface and private exit subscription](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L59-L87), [subscription](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L143-L191), [multiple non-exit removal paths](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L194-L238), [private exit/removal](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L458-L517); [snapshot states](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionTypes.ts#L4-L30); [actual PTY event](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/managedPty.ts#L5-L16); [current extension factory/composition](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L243-L256); [target API](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L91).

**Evidence classification:** The missing selected bridge and the stated runtime interfaces are observed source/document facts. Cleanup leakage, unsafe deletion or capacity exhaustion are conditional implementation consequences; none was observed by executing the product.

### S9-R-2 — Major — Specify delivery and registration of the host-issued renderer viewId

**Affected scope:** Detailed Implementation item 1 P3 provider/renderer/browser/protocol modifications (design_draft.md:L196–209, L239), item 5 root and view integration (L289–291), incorporated companion-view-contract.md:L7–11, L59–62 and L87–99; root vectors P01/P02 and document-recreation trace V05.

**Observed discrepancy:** VW selects a host-created hex32 viewId for every renderer document and says it is supplied through the existing trusted bootstrap. The first companion.ready already requires this value. At the pinned runtime, browser index.ts instead creates its legacy documentId locally with crypto.randomUUID(); provider renderHtml supplies presentation attributes/assets/CSP but no host document identity. Provider hydration learns the legacy documentId from the webview's ready message. No existing host-to-browser identity bootstrap is present in those bodies. The closed companion dictionary also contains no pre-ready bootstrap message: companion.bind itself requires viewId. The proposed root wrapper correctly preserves type discrimination but does not provide the missing first identity transfer. P01/P02 begin with a prepopulated viewId, so their schema expectations do not settle how that ID reaches and becomes associated with the actual document.

**Why this fails readiness:** The implementer must choose a new HTML/bootstrap field, a new initial message/exchange or a change in identifier authority, and decide how it relates to the legacy webview-generated documentId and provider viewGeneration. Adopting the legacy UUID or accepting the first arbitrary viewId from companion.ready would contradict the selected host-issued hex32/current-document rule. This is a missing startup/lifecycle protocol decision, beyond the already-selected wrapper and payload schema.

**Required guidance:** Select the exact bootstrap carrier and field(s), host allocation point, browser read/validation point, renderer dependency and provider binding check. State how missing/malformed bootstrap behaves, when the host rotates/revokes viewId on document recreation/disposal, and how the legacy documentId path remains compatible. Keep the dictionary/allowlist reconciled with that choice. Add provider→HTML/initialization→browser→companion.ready integration expectations, including an obsolete document sending a validly shaped ready after recreation and a renderer without the bootstrap. Reuse the existing planned P3 tests/files where sufficient; do not leave schema-only P01/P02 as bootstrap proof.

**Evidence:** [active root/view integration](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/design_draft.md#L289-L291); [host-issued identity claim](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/companion-view-contract.md#L7-L11); [first ready/bind messages](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/companion-view-contract.md#L59-L62); [trusted binding and recreation behavior](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/companion-view-contract.md#L87-L99); [P01/P02 prefilled wrappers](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/evidence/companion-view-cases.json#L1124-L1164); [browser-generated legacy ID](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L19-L40); [actual host HTML shell](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L359-L398); [legacy hydration registration](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L615-L647); [renderer dependency and ready](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L54-L70), [ready emission](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L722-L726).

**Evidence classification:** The absent existing bootstrap and the startup dependency are observed document/source discrepancies. Failed admission or stale-document acceptance are conditional implementation consequences; neither was observed in a running renderer.

## Standard and checkpoint assessment

| Native requirement | Assessment |
|---|---|
| Exact target/write scope | The inventory computes to 46 unique paths, 28 Create/18 Modify after D0. Pinned Git classification confirms every Create is absent and only the two explicitly overlaid documentation Modify paths are absent. D0 has 59 unique documentation paths, all present as blobs in the frozen correction commit and absent at the runtime baseline. S9-R-1 may require an explicit integration/allowlist reconciliation; no automatic extra path was assumed. |
| Incremental stable phases | D0 and P0–P4 have dependencies, first/later write subsets, activation boundaries and checkpoints. Transport/model work remains disconnected until P3, and unqualified builds fail closed. The two startup/lifecycle bridges above prevent declaring the complete plan zero-decision ready. No compiler/build was run to claim those phase states are actually stable. |
| Actionable source/data/API rules | Current CH, VW, PC and C4 specify closed shapes, finite bounds, admission/rejection, source keys, atomic visibility, literal values, replay/uncertainty and provenance. The two findings concern how their authorities reach existing components, not a request to redesign the selected transport or control scope. |
| Test instructions | Exact fixture transfers, phase commands, boundary tests and native/manual outcomes are stated. Actual native-return, deny-pipeline, ownership, root and C4 projection inputs/expectations were inspected; their existence was not equated with implementation. Findings request integration expectations for the missing bridges. |
| Build/package/compatibility | The pinned package is 0.11.3, VS Code ^1.128.0. Existing scripts and CI bodies support check:types/lint/test:unit/build:production, with Windows test:integration; the full unit glob includes release-policy tests. The plan's odd-minor package:prerelease command matches the pinned versioning rule. Browser CSS import placement, direct Node renderer import and packaged helper graph are explicitly addressed. Legacy consumers inspected still narrow on type. This is a source-level compatibility assessment, not a compilation/package result. |
| Migration/rollout/fallback | No new durable conversation schema or inference/authentication backend is selected. Capability admission remains receipt-backed exact-build/schema qualification, unsupported capture retains native CLI/Raw/Escape, live-only losses are explicit, and future model/native qualification remains separately authorized. Future Create files and the absence of future qualification receipts are expected, not additional findings. |

## Actual body-read coverage

The review read the full native persona and standard first (after one Bash launch was denied), then used Node filesystem reads and read-only Git object reads. It did not retrieve parent transcript/history/memory. Host-injected session instructions remain present; no stronger isolation claim is made.

| Current documentation | Actual extent read |
|---|---|
| design_draft.md | L1–408 in full; active L178–408, scope L1–177. |
| capture-channel-contract.md | L1–177 in full, including exact ownership, control/data dictionaries, deny normalization and assembly. |
| companion-view-contract.md | L1–156 in full, including root envelope, all nineteen kinds, replay/review/hydration and complete C4 status/label table. |
| path-copy-contract.md | L1–75 in full. |
| capture-provenance-contract.md | L1–93 in full. |
| evidence/c4-native-evidence.md | L1–408 in full: preserved declaration shapes, all Bash top-level members, declaration semantics and selected receipt projections. |
| technical_choices.md | L1–171 in full. |
| documentation-handoff.md; implementation-inputs.json | L1–37 and L1–171 in full. Ready source comment 6724623895 L1–19 and native detail comment 6701284701 L1–16 in full. |

Actual vector-body coverage, rather than index/count-only checks:

- capture-channel-cases.json: all E01–E18 state/event/outcome bodies; all four binding examples; all W01–W46 serialized frames, decoded outer/normalized input bodies and expected outcomes (including the eight raw text chunks in W18 and partial/order/timeout/rejection controls); all six boundary expectations; all sixteen nativeReturnExamples, including own-undefined setup and privacy assertions; both complete D01/D02 serialized deny pipelines and expected observation/model/view outcomes; full ownershipPolicy/baseContext and all thirty-three ownership marker/context/expected bodies. The large repeated ownership JSON was inspected as the complete shared base plus every exact context/marker delta and serialized-byte lengths after a combined raw display was truncated. No ownership case was accepted from its note alone.
- companion-view-cases.json: all V01–V18 event/outcome bodies; all fifteen status/label pairs; all thirty-two C4 projection expected groups/effects/literal assertions; all six accepted/rejected group examples; full rootEnvelopePolicy; all P01–P33 actual serialized wrappers/directions/expected dispatch outcomes; all four legacy wire controls; all three constructive wrapper-byte boundary inputs/expectations.
- path-copy-cases.json: all P01–P29 source/pattern/scope/expected spans/actions/literal values, including Unicode and the over-limit construction.
- c4-adapter-cases.json: binding/notes and all thirty-two full native event/returned/expected bodies. Main/agent isolation, returned stored text, requested/effective command separation, errors/denial/withholding, conflicting/background/media guards, resets and continuation cases were read directly. Deferred Run fields were recognized as excluded historical evidence assertions, not transferred into v1 scope.

The runtime source ranges actually displayed and inspected are listed below. All runtime entries refer to ef5fd48f4b676881a8730afbf8e583e70565ca11, not the older runtime files in this documentation checkout. Supplied materializations were hash/byte checked against their context entries. Additional read-only Git source bodies were used for ManagedPty/session types, CI and the three explicitly named legacy consumers.

| Source body | Inspected lines |
|---|---|
| src/panel/protocol.ts | L1–140 |
| package.json | L1–65 |
| CONTRIBUTING.md | L90–120 |
| docs/versioning-policy.md | L260–295 |
| src/composer/composerRuntime.ts | L1–115, L175–230 |
| src/extension.ts | L120–265, L430–510 |
| src/launch/sessionLaunch.ts | L1–87 |
| media/attention/hooks/register.js | L1–135 |
| src/sessions/sessionManager.ts | L1–390, L450–525 |
| esbuild.js | L1–48 |
| .vscodeignore | L1–28 |
| test/unit/packageAssets.test.ts | L75–140 |
| test/unit/attentionCompletionMod.test.ts | L1–80 |
| src/panel/sessionPanelProvider.ts | L25–120, L330–450, L615–690 |
| src/panel/webview/index.ts | L1–48 |
| https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724623895 | L1–19 |
| https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701 | L1–16 |
| src/panel/webview/renderer.ts | L45–90, L710–810 |
| test/integration/composer.test.ts | L1–70 |
| test/unit/webviewRenderer.test.ts | L1–28 |
| test/integration/lifecycle.test.ts | L620–650 |
| test/integration/terminalDiagnostics.test.ts | L290–345 |
| test/manual/terminalEchoWebview.ts | L45–64 |
| src/launch/managedPty.ts | L1–18 |
| src/sessions/sessionTypes.ts | L1–68 |
| .github/workflows/ci.yml | L1–90 |
| src/panel/webview/composer/markdownPreview.ts | L1–26 |
| src/panel/webview/composer/references.ts | L1–56 |
| src/panel/webview/xtermTerminal.ts | L80–145 |

Full-text lexical occurrence searches additionally located relevant methods in extension.ts, sessionPanelProvider.ts, renderer.ts and sessionManager.ts; these are discovery searches, not claims that their entire bodies were semantically reviewed.

## Read-only calculations and verification status

**Completed:** measured input byte/hash receipts; direct source/expectation comparison; immutable Git blob existence/classification for D0 and the 46 later paths; fixture-only byte/span calculations. All explicit source slices in the 28 concrete path cases match their literal expectations; P29 is the explicit over-limit pattern. Parsed all serialized frames in W01–W46 and D01/D02 and calculated chunk and complete-observation UTF-8 totals. Only W22's intentional 1-versus-152 decoded-length mismatch and W24's intentional 2-versus-152 total mismatch appear; both expect retirement. The nineteen positive root wrappers' payloads equal their expected records. Constructed PB1/PB2/PB3 produce exactly 262143/262144/262145 serialized bytes and 43639/43640/43641 decoded bytes as declared. The ownership 1023/1024/1025 marker boundaries were calculated from the actual strings. These calculations did not execute a product decoder, adapter, observer or cleanup implementation.

**Not run:** product compiler, lint, unit/integration tests, builds, packaging or publishing; native Claude/model/subscription operations; clipboard access; filesystem permission/ACL/reparse probes; process.kill liveness probes; real channel publication/deletion; renderer/browser execution. No Git/GitHub writes, fixes or implementation occurred. The sole write is this authorized report.

**Limits/exclusions:** Runtime inspection is limited to the explicit source ranges above; no whole-repository semantic audit or raw third-party declaration/archive re-derivation is claimed. The native evidence archive's preserved projections were fully read, but the original 676417-byte core declaration and 208904-byte focused-control archive were not independently materialized/replayed. Historical review reports, C2/Run experimental bodies and unselected B mechanisms were not re-reviewed; parent transcripts/memory were not retrieved. D0's 59 Git blobs and counts were verified, but a fresh exhaustive audit of all historical local-link closures was not performed. No supported-build/native-copy claim follows from this review. These exclusions do not convert into a zero-findings pass or an assertion of product correctness.

## Measured full-read receipts

SHA-256 is over actual file bytes, including CRLF. The frozen target measured 408 CRLF line endings and one final newline; its hash matches the requested frozen receipt. Persona and standard were read in full, not from summaries.

| Input | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/implementation_readiness.md | 3991 | 62 | 5e9da8c6f7d22c6f0835393475f81aba670d37c5468e109122e01207f09ef5e0 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/implementation-readiness-standard.md | 1691 | 37 | f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d |
| C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md | 89549 | 408 | 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be |

Current incorporated input receipts (all full bodies read to the extents specified above):

| Input | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| docs/designs/215/capture-channel-contract.md | 36795 | 177 | bfa48b5f4bdab607ef610b09a5c7901f5f0c00ff58a5e4e5eeaa5908a5ed8259 |
| docs/designs/215/companion-view-contract.md | 28409 | 156 | f1fba888940ca92d36350336d0d3d2260d81d0600227f9edd89082b16ed20e2b |
| docs/designs/215/path-copy-contract.md | 8153 | 75 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| docs/designs/215/capture-provenance-contract.md | 20616 | 93 | d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922 |
| docs/designs/215/evidence/capture-channel-cases.json | 158267 | 3845 | 7c03cb2bf755315e1810b85e6f68f988015e0c5b94e825bba4a9a475d5ed4e76 |
| docs/designs/215/evidence/companion-view-cases.json | 60402 | 1843 | c4c6602593036e3423121316de0cbafcf3a89c44d16d09b507609a198bb8ff9c |
| docs/designs/215/evidence/path-copy-cases.json | 8909 | 387 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| docs/designs/215/evidence/c4-adapter-cases.json | 97827 | 3380 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |
| docs/designs/215/evidence/c4-native-evidence.md | 14940 | 408 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| docs/designs/215/documentation-handoff.md | 6155 | 37 | c22f88780039e8c3d71cee57e1e438b6c76b26e4b56847c0b4cca90d6824c8cb |
| docs/designs/215/implementation-inputs.json | 11513 | 171 | 4c7cc0ef554535479288e654917e508314a23910eb7a8c594b27e61df2262054 |
| docs/designs/215/technical_choices.md | 27298 | 171 | 215f8fe5f1d80c4b0c3563b14cd3d1d1d9999ad582f348bd93b15dbd2cdb8e06 |

Findings retain the native severity labels Major and the IDs S9-R-1/S9-R-2. No finding is represented as an observed running-product failure.


---

# Stage 9 — Codebase Details Goldfish

Mode: REVIEW. Native persona severities retained.

Result: **0 Blockers, 1 Major, 0 Nits.** One integration decision remains unresolved. This is a static pinned-source/contract review, not an observed compiler, runtime, packaging, native, clipboard or ACL result.

## S9-B-1 — Major — Select the managed-process exit confirmation bridge required by current-owner cleanup

**Affected scope:** `docs/designs/215/design_draft.md:L191-L205`, `L220-L240`, `L247-L259`; incorporated `capture-channel-contract.md:L34-L40`; proposed `src/companion/companionCapture.ts`, `src/companion/companionRuntime.ts`, and existing `src/extension.ts`.

**Discrepancy:** The selected channel contract requires revoking the frozen current owner, stopping callbacks/timers and waiting for the host's confirmed PTY process-exit event for that managed generation before whole-directory deletion. The implementation inventory assigns lifecycle integration to the new runtime and extension, excludes any SessionManager/ManagedPty change, and provides no selected bridge that delivers that proof to capture cleanup.

At the pinned runtime, SessionManager exposes session-snapshot and data events, not a public process-exit event. It privately subscribes to ManagedPty.onExit and handles the event internally. The public snapshot is insufficient evidence: removal also occurs after preparation/spawn/startup failures and disposal; closing and disappearance therefore cannot be substituted for confirmed PTY exit. The public targetFor API rejects closing sessions and loses its generation when the record disappears, so the ordinary current-target lookup cannot recover the retired generation's exit proof. Nor does waiting for close/terminateAll establish that proof: those methods await terminate(), while the shared FakeManagedPty deliberately separates terminate() from emitExit().

**Rationale:** A fresh implementer must choose an architecture that the plan has not selected: an explicit lifecycle API/allowlist change, a generation-correlated PTY-factory wrapper in extension composition, or another specified existing callback boundary. Merely treating onDidChangeSessions removal or terminate() settlement as exit would weaken the newly selected ownership rule; never supplying confirmation would leave the O18 current-owner deletion path unreachable in production. Select the exact bridge, its target/generation capture, listener lifetime, startup-failure handling and shutdown ordering, then reconcile any required source/test paths with the exact P3 allowlist. Preserve CH's conservative retention on uncertain exit. Add the corresponding provider/runtime integration expectations using actual fake PTY exit delivery, including terminate-without-exit, real exit, disposal/startup removal without exit, and native session transition without process exit. This is a missing implementation dependency, not a request to change CH's ownership policy.

**Evidence and canonical ranges:**

- Frozen design: [inventory and phase boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/design_draft.md#L188-L247); [CH exact cleanup authority](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/capture-channel-contract.md#L34-L40).
- Actual public manager events and private exit registration: [SessionManager L59–L87](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L59-L87), [L143–L213](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L143-L213), [L267–L324](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L267-L324), [L458–L525](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L458-L525).
- Target lifetime: [ComposerRuntime L70–L92](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L92), [L197–L211](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L197-L211). Composition currently supplies only the factory/logger and prepare/flush callbacks: [extension L245–L257](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L245-L257); shutdown is [L593–L610](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L593-L610) and [L909–L932](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L909-L932).
- Existing lower-level exit contract and shared fake: [ManagedPty L5–L17](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/managedPty.ts#L5-L17), [FakeManagedPty L34–L79](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/support/fakeManagedPty.ts#L34-L79). A lifecycle logger callback does exist at [sessionTypes L56–L66](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionTypes.ts#L56-L66); using it as a cleanup bridge is not selected by the plan.
- Actual current expectations: `docs/designs/215/evidence/capture-channel-cases.json`, O18 at L2983, O19 at L3037, O27 at L3475. O18 explicitly expects deletion after confirmed managed exit; O19 rejects native session.end as that proof; O27 rejects reconstruction after in-memory authority loss.

**Consequence classification:** Static/inferred integration gap. No product cleanup failure, deadlock, unsafe deletion or compiler failure was executed or observed. The existence of possible implementation routes is acknowledged; the defect is that none is selected under the exact allowlist and zero-decision standard.

## Review scope and completion

The complete frozen target L1–L408 was semantically read. L178–L408 was the active DetailedRange; L1–L177 supplied definitions/context only. Current incorporated CH/VW/PC/C4 contracts and expectation bodies took precedence over historical approval/resolution claims. No parent transcript/history or memory was retrieved. Planned Create files were treated as future deliverables, not missing-current-source findings. Deferred Run/Run again/C2/direct companion responses were excluded from v1 correctness requirements.

Completed checks:

- Read the current CH ownership marker, liveness/deletion rules, offer/request/grant/activation/retirement flow, literal five-key environment binding, outer and nested dictionaries, native deny normalization, chunk/ack/gap semantics, size budgets and assembly deadlines. Read E01–E18, B01–B04, W01–W46, all six boundary expectation bodies, N01–N16, D01–D02, ownershipPolicy and O01–O33. Ownership examples were inspected as the full shared base plus every per-case context difference, exact marker string, expected outcome and note; no real process-liveness/deletion probe ran.
- Read the current VW identity/root envelope, every direction-specific kind and nested node/target/group field, C4 label table, hydration/catch-up/review/action transitions. Read V01–V18, all 15 status-label pairs, all 32 C4 projection cases, G01–G06, all 33 root examples (19 positive, 14 negative), all four legacy controls and PB1–PB3. Compared the actual pinned type-based protocol, provider/renderer/index and lifecycle/diagnostic/manual consumers. The selected wrapper preserves the existing `.type` narrowing boundary; no kind-only-root contradiction remains in the inspected consumers. This is source reasoning, not compilation.
- Read current C4 contract and full preserved native-evidence archive L1–L408, including exact ToolCallResult/append/classic shapes and actual receipt projections. Read every event input/returned body and expected object in all C4-01–C4-32 cases. Compared C4-08 withholding, C4-26 completed-pair precedence, C4-06/C4-11 error outcomes, C4-20 background hint, agent/plugin scope isolation, rewriting, replay, conflicts, image output and lifecycle cases against CH/VW. No numeric Bash exit-code channel or executed action was inferred from prose.
- Read PC's complete lexical/endpoint/precedence rules and all P01–P29 actual inputs/expectations, including the oversized input construction. Compared source spans, Unicode scalar boundaries, literal values, UNC/device spelling and the clear/review/exclusion controls.
- Read D0 handoff and complete exact manifest, the Ready materialization, and pinned Git tree/blob existence. Parsed the actual active inventory and phase write lists against the pinned runtime. All 59 D0 inputs exist as blobs at the frozen correction source and are absent at the pinned runtime. The later inventory is 28 Create / 18 Modify / 46 distinct paths; its 28 Create paths are absent and its 16 runtime Modify paths exist. The other two Modify paths are D0 documentation overlaps. The union is 103 paths. For all 46 manifest Markdown blobs, checked 467 nonempty relative-path link occurrences against the manifest/source tree; no missing/outside-manifest path was found. Also enumerated nine anchor-only links (476 local links total); anchor-target headings were not independently validated by this calculation.
- Read actual build/package/test-discovery/CSS import and packaging-exclusion bodies. Pinned package is 0.11.3, VS Code engine ^1.128.0; odd-minor prerelease packaging and existing build entries match the plan. The integration glob discovers the proposed test path; TypeScript includes source/tests and the unchanged manual consumer. Existing renderer unit tests directly import renderer.ts, making the explicit browser-entry-only stylesheet decision material. The packaged helper subfolder is not excluded by `.vscodeignore`. Actual helper inclusion still requires the planned package/asset qualification.
- Read relevant shared infrastructure bodies: combined attention data-URL loader/mocks, provider integration fixture, Node renderer import boundary, FakeManagedPty and composer harness. Simple unit assertions were inspected only where they establish these infrastructure contracts, not as an exhaustive unit-suite review.

## Read-only calculations actually performed

- All 46 W cases' 57 serialized frame strings parsed as JSON. Recomputed each observationChunk's decoded UTF-8 byte length; the only byteLength mismatch was deliberately invalid W22 (152 actual versus 1 declared). W24 deliberately mismatches totalByteLength. No product schema decoder was run and this calculation does not establish every expected reject disposition.
- Parsed/reassembled D01 and D02's eight complete one-chunk observations. Each decoded observation equalled its actual expected observation object; decoded lengths matched 181/125/95 and 181/125/407/163/95 bytes. Checked the expected unknown/completed distinction against the read original native cases, not just frame counts.
- All 29 expected path targets slice exactly from their case inputs at the specified UTF-16 offsets; ranges and scalar boundaries were valid. P29 constructs 32,771 UTF-8 bytes and is above 32 KiB. These are fixture arithmetic results, not detector/clipboard passes.
- Ownership marker byte calculations: O01 261; O07 1,025; O32 1,023; O33 1,024. Those match their selected rejection/boundary expectations.
- Positive root wrapper payloads P01–P19 equal their actual expected payload objects. PB1/PB2/PB3 construct 262,143 / 262,144 / 262,145 serialized bytes with 43,639 / 43,640 / 43,641 decoded data bytes. The P04/P05 sample logical projection is 98 bytes and hashes to 6d964b02d70ad52359db9e5ffc5b072e4800b81c7f2b0de852fb03488a2c1f87, matching its declaration. No product decoder, renderer state machine or browser crypto path was executed.
- Decoded the supplied E3 gzip archive entirely in memory, without executing archive source. Gzip: 34,143 bytes, SHA-256 ed11cdc72a2130f0f3cc57be264c1c5a06d04b057c7ba27706ceda4a7f36f4ca. Decoded JSON: 208,904 bytes, SHA-256 1d901db9c858a345766a88e9b31e13ddd69f15baf0f1a3d886de21adddcddea5. Read its actual typeExcerpts (turnAbort and backgrounding) and limits; archived host/client/mod source was not semantically audited or run.

## Evidence limits and work not run

The full original generated SDK/core/Bash declaration artifacts are not supplied at a selected accessible path for this pass. The C4 evidence archive contains exact selected declaration bodies but only a Bash member index; D1 preserves a read-only fs/clock/append summary, not the full fs/clock declaration bodies. These were not represented as full SDK-body verification. The decoded E3 archive provides only two relevant type excerpts. Per the parent source-scope instruction, no new external or local SDK artifacts were retrieved to fill this gap. This limits independent verification of the complete original SDK surface; the explicit source-contract integration finding above does not depend on that missing surface.

No implementation/repair, compiler, lint, unit/integration test, build, package, native/Claude/model/subscription experiment, clipboard, Windows ACL/reparse, process.kill, real file cleanup, Git/GitHub write, branch switch or documentation overlay was performed. The absence of those separately authorized future qualifications is not itself reported as a finding. All runtime consequences remain static/inferred. No broad passing-product or full-SDK conformance claim is made.

Two guessed read-only source paths returned ENOENT (`test/integration/index.ts` and `src/extensionLifecycle.ts`). The actual discovery configuration `.vscode-test.js` and actual registerEarlyShutdown body in extension.ts were then read. Neither absent guessed path is cited as an existing plan reference or finding.

## Measured full-input receipts

Byte counts and hashes below are from the actual full files read, not copied approval claims. The target exactly matches the supplied frozen CRLF receipt.

| Input | Semantic read | Bytes | SHA-256 |
|---|---|---:|---|
| Native `agents/codebase_details.md` | Full L1–L69 | 4,752 | a19676acc9bf53d155b7b0a9c63d6b63c39bd43393bcb503d2f3a5fe62c6cd42 |
| `implementation-readiness-standard.md` | Full L1–L37 | 1,691 | f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d |
| `docs/designs/215/design_draft.md` | Full L1–L408; active L178–L408 | 89,549 | 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be |

Target commit: eb11873050cbcc09ece0ea3c32de1f4d39c4a345; target Git blob: 0749048ce0e46a2b23d98d0b46b6d40c511c613a. Runtime source bodies were read with read-only `git show` at ef5fd48f4b676881a8730afbf8e583e70565ca11, not from the older runtime in the documentation checkout.

### Current incorporated input receipts

All paths in the following table are relative to the workspace root; complete contract bodies were semantically read. JSON vector sections and read/calculation limits are specified above.

| Input | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| `docs/designs/215/capture-channel-contract.md` | 177 | 36795 | bfa48b5f4bdab607ef610b09a5c7901f5f0c00ff58a5e4e5eeaa5908a5ed8259 |
| `docs/designs/215/companion-view-contract.md` | 156 | 28409 | f1fba888940ca92d36350336d0d3d2260d81d0600227f9edd89082b16ed20e2b |
| `docs/designs/215/path-copy-contract.md` | 75 | 8153 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| `docs/designs/215/capture-provenance-contract.md` | 93 | 20616 | d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922 |
| `docs/designs/215/evidence/c4-native-evidence.md` | 408 | 14940 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| `docs/designs/215/implementation-inputs.json` | 171 | 11513 | 4c7cc0ef554535479288e654917e508314a23910eb7a8c594b27e61df2262054 |
| `docs/designs/215/documentation-handoff.md` | 37 | 6155 | c22f88780039e8c3d71cee57e1e438b6c76b26e4b56847c0b4cca90d6824c8cb |
| `docs/designs/215/technical_choices.md` | 171 | 27298 | 215f8fe5f1d80c4b0c3563b14cd3d1d1d9999ad582f348bd93b15dbd2cdb8e06 |
| `docs/designs/215/evidence/capture-channel-cases.json` | 3845 | 158267 | 7c03cb2bf755315e1810b85e6f68f988015e0c5b94e825bba4a9a475d5ed4e76 |
| `docs/designs/215/evidence/companion-view-cases.json` | 1843 | 60402 | c4c6602593036e3423121316de0cbafcf3a89c44d16d09b507609a198bb8ff9c |
| `docs/designs/215/evidence/path-copy-cases.json` | 387 | 8909 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| `docs/designs/215/evidence/c4-adapter-cases.json` | 3380 | 97827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |

### Actual pinned-runtime semantic source extents

These are inspected line ranges, not a claim that every loaded file was semantically read end-to-end. Full source buffers fetched for `git show` do not enlarge the recorded semantic extent. Each blob is at the runtime commit above.

| Path | Inspected lines | Git blob |
|---|---|---|
| `src/composer/composerRuntime.ts` | 1–229 | eb8fe2331b61976e5386210769de914a18361bd3 |
| `src/launch/sessionLaunch.ts` | 1–86 | 3de09e3eca7c4fa73b929a3890724b104d0f9a46 |
| `src/panel/protocol.ts` | 1–442 | e0c929f52456719cd38eac3efcc52f8e7ba2051c |
| `media/attention/hooks/register.js` | 1–134 | b2ad9c2a1c0e6822ae8c7207bcc547b10364207d |
| `test/unit/attentionCompletionMod.test.ts` | 1–125 | 9c0a9cee433c44426237257765d6fdeccd52f51d |
| `src/extension.ts` | 245–338, 370–635, 875–959 | 5fbf34ef8c040889b8bc891db3f5ac3400e5807d |
| `src/sessions/sessionManager.ts` | 1–410, 450–625 | 02cc06c2964c522fa2aba90165c5faf55d51fcf8 |
| `src/launch/managedPty.ts` | 1–17 | 6aab20c47582c10d4a2d94404df8448b74c00987 |
| `package.json` | 1–80 | 2ad2bfef9577d6d3fec03cb0344ead899077a749 |
| `esbuild.js` | 1–47 | 3f7f6f86896908de1ac637f304c2d398273c1247 |
| `.vscodeignore` | 1–27 | 285f267eccb56c4c31b2ad41933bd5b5f4a0cdf4 |
| `test/unit/packageAssets.test.ts` | 1–145 | 68ee87a3c1eabf09fdf8248497de43fc307ddc72 |
| `test/integration/composer.test.ts` | 1–125 | b53b778a9d7911554a1fe1ea3cd840c5666260f5 |
| `test/unit/webviewRenderer.test.ts` | 1–60 | 4c2b8efb7cb3eb3d83953c0231b08438c8eb7619 |
| `.vscode-test.js` | 1–55 | fadbb5c34daaf2b8fdf137eed5ca50695554636b |
| `tsconfig.json` | 1–35 | 198e0aef019c79508aa282c2c836841aee3743e1 |
| `src/panel/webview/index.ts` | 1–47 | 5ef63ed2280481e4dbff58727768cfcbe66a54ec |
| `test/integration/lifecycle.test.ts` | 610–655 | de2fc1d4b1593dd1c75f2aa4eb0a68ea11f59553 |
| `test/integration/terminalDiagnostics.test.ts` | 280–347 | 21f173eb3589c05168e36f36573c0424c3b42684 |
| `test/manual/terminalEchoWebview.ts` | 1–63 | 7db014053d8b364711035a490a190704bceab8a7 |
| `src/panel/webview/composer/markdownPreview.ts` | 1–25 | 791cf39630fa01a6d0330c337763cfe1cbe8df50 |
| `src/panel/webview/composer/references.ts` | 1–55 | 73462d40ea40b8c7ddb1d92a85ab22cbd33cf636 |
| `src/panel/sessionPanelProvider.ts` | 1–215, 290–490, 615–725 | 23243468f3880b283396e7780be29e8736990250 |
| `src/panel/webview/renderer.ts` | 1–160, 350–500, 720–1005 | 96921b4920b43e1576a0d5fb462d0062f0993856 |
| `CONTRIBUTING.md` | 90–108 | 3f04b9cbc15ffd89715b6564e67e33a056b19637 |
| `docs/versioning-policy.md` | 260–290 | f31f802fc107e7160c84d4cb410821690ed27f02 |
| `src/composer/claudeComposerAdapter.ts` | 1–155 | 711c0cfa2ec73d2bd224a198822dd7cdbc739c76 |
| `src/panel/webview/xtermTerminal.ts` | 70–140 | 9b2a02f88aa375056a230cb6887f9e39f76f6050 |
| `src/sessions/sessionTypes.ts` | 1–67 | fbb8e857ed51e8bac47e349a7378325c47eb3e7f |
| `test/support/fakeManagedPty.ts` | 1–110 | b26964297a6de0208035f6a389cdc9a5ec744254 |
| `test/support/composerHarness.ts` | 1–44 | 08dcc695102cff14dc191bd603d31f19d2932b31 |
| `test/unit/activation.test.ts` | 1–80 | 4b691942ba234b10f0a0ecff41c649ee1fadc9a4 |
| `.github/workflows/ci.yml` | 1–89 | 5362eb1c83f32511ddd4c3b6a20f2d0b56c4a64d |

Report is the sole written artifact for this role. No other agent's files were changed or reverted.


---

# Stage 9 — Style Goldfish

Mode: REVIEW. Native persona: egm-style. No separate style standard was supplied.

## Native review response

No style findings were identified in the active target, docs/designs/215/design_draft.md:L178-L408. Counts: 0 Blocker, 0 Major, 0 Nit. There are no S9-S finding records.

The implementation instructions distinguish selected contracts, synthetic expectations, historical observations and future package/native qualification. The inspected current channel, view, path and provenance bodies support those distinctions. No subjective code-quality/performance judgment, marketing language, synonym redundancy, or removable defensive caveat was identified that warrants a finding under the native persona.

The repeated scope and evidence qualifications name implementation or operator decisions: which files/actions to exclude, which builds to admit, when to require managed relaunch, which targets/statuses to withhold, which values the user must review, and which qualification failures block a copying claim. They should remain. Paragraph density and repeated references to the same constraint at different implementation boundaries are not, by themselves, grounds to remove those constraints.

This is a style/claim-calibration result for the frozen text, not product qualification or authorization to implement. The orchestrator should retain the separately required review and runtime qualification gates.

## Active scope and caveat decisions

The reviewed v1 scope is subscription-backed CLI, copying only, private files, native Variant A questions/permissions, native Escape and Raw access. Run, Run again, C2 admission work and direct companion responses remain deferred.

The following are KEEP decisions, not findings:

| Active scope | Concrete reader/operator decision and calibration | Inspected support |
|---|---|---|
| L180-L184, L220-L240, L315, L324, L340-L351 | Exclude deferred execution/response files and complete the separate D0 prerequisite before P0. These are write/activation boundaries, not general disclaimers. The 28 Create/18 Modify count is stated after D0, with the documentation overlap explained. | documentation-handoff.md:L7-L29; implementation-inputs.json:L138-L163; comment-6724623895.txt:L3-L17; comment-6715993295.txt:L3-L7 |
| L243-L251 | Admit only explicitly qualified builds; keep Raw available; require a matching managed launch after identity mismatch/lost authority. The Windows ACL/reparse qualification statement determines whether privacy and capture admission can be claimed. | capture-channel-contract.md:L7-L42, L61-L82; capture-provenance-contract.md:L12-L16, L24-L26; evidence/c4-native-evidence.md:L291-L300 |
| L253-L259 | Observe canonical stored rows without awaiting delivery; normalize deny:string and invalid deny shapes without forwarding reasons; distinguish an owned rejection from foreign traffic. These statements determine actual source admission/retirement behavior. | capture-channel-contract.md:L104-L157; capture-provenance-contract.md:L20-L38, L79-L85; evidence/c4-native-evidence.md:L58-L147; capture-channel-cases.json nativeReturnExamples N01-N16 and selected nativeDenyPipelines expected bodies |
| L261-L274, L330 | Treat byte/count/timer/latency values as selected budgets or proposed qualification gates, rather than measurements. The implementation must enforce the bounds and qualification must decide whether to revise the design. | capture-channel-contract.md:L137-L157; companion-view-contract.md:L13-L15, L89-L109; the target expressly says these are budgets, not measurements |
| L276-L287 | Offer Review for a full ambiguous raw candidate and withhold oversized/unmapped targets; do not guess a shorter path or claim semantic path-boundary recognition. This determines whether a user gets Copy, Review or unavailable. | path-copy-contract.md:L9-L44, L48-L70; path-copy-cases.json contains 29 design vectors |
| L289-L293 | Preserve root type discrimination, atomic visibility and immutable host Copy values. Clipboard timeout must produce uncertainty while the ordering guard remains held. These select decoder/action behavior, not a tested safety guarantee. | companion-view-contract.md:L17-L27, L55-L111; pinned protocol.ts:L30-L118; pinned browser index.ts:L11-L47 |
| L295-L311 | Withhold executed Copy without the full C4 predicate; preserve tool-error, Unknown, denial, interruption and last-reported background distinctions. C4 approval is explicitly a design-gate decision, not passing adapter tests. | capture-provenance-contract.md:L40-L69, L87-L93; companion-view-contract.md:L113-L141; evidence/c4-native-evidence.md:L254-L300, L302-L408; inspected C4-06/08/11/20/26 and their matching view outcomes |
| L318-L330 | Route native Escape once to a current running owner; do not equate input sent with process termination; keep questions/permissions native and Raw reachable. The unqualified interaction matrix remains an acceptance decision. | companion-view-contract.md:L83-L111; comment-6647481988.txt:L12-L40; pinned sessionManager.ts:L343-L365 and xtermTerminal.ts:L85-L130 |
| L330-L357, L389-L399 | Recheck lane/build policy, do not publish, and do not treat standalone experiments, author approval or prior review status as current packaged qualification. Historical source claims stay dated/pinned. | pinned package.json:L38-L52; pinned versioning-policy.md:L267-L286; comment-6701284701.txt:L5-L14; comment-6646355033.txt:L7-L38; current contract headers expressly say not implemented/product-qualified |

The C2 admission failures mentioned at L182/L315 are reported historical counterexamples, not failures observed by this review. The report at c2-experiment-results.md:L10-L54 describes the failed boundary and its limits; the later decision at comment-6715993295.txt:L3-L7 defers execution work. The target preserves that distinction.

## Completed inspection and evidence limits

Completed:
- Read the full native Style persona before target analysis. Applied its tone, objective-claim, redundancy and DROP/CALIBRATE/RELOCATE/KEEP tests; no separate brevity standard was imposed.
- Inspected the complete active target L178-L408 in bounded, untruncated reads. Read target L1-L44 only for definitions/scope; L45-L177 were not reviewed.
- Parsed the GoldfishContext index for locations, source policy and scope. Its metadata, approval status and repair/static-check claims were not treated as correctness proof. An initial combined index/target output was truncated; the active target was subsequently re-read in full ranges.
- Read actual current contract bodies and preserved declaration/receipt projections listed below. Current contracts controlled calibration over historical descriptions.
- Read pinned source bodies for the existing root protocol, target API, browser import boundary, build/package scripts and native input/focus ownership.
- Parsed the four vector files to inspect keys and array counts. Inspected full native case bodies C4-06, C4-08, C4-11, C4-20 and C4-26, their five view projection expectations, and all sixteen nativeReturnExamples. Inspected the two nativeDenyPipelines expected bodies and absence assertions, not their full serialized frame inputs. Other vector bodies were not exhaustively audited or executed.
- Re-read and hashed the target at the end; its bytes remained equal to the initial read.
- Wrote only this report.

Not run:
- No target repairs, product implementation, compiler, tests, builds, packaging, native/Claude/model calls, clipboard probes, ACL/reparse probes, filesystem-race probes, or Git/GitHub mutations.
- No fresh native compatibility or experimental reproduction; preserved source/receipts were read as historical evidence.
- No independent requalification of every historical review count, original archived full SDK artifact, or complete downstream integration consumer. Source calibration here does not establish those results.
- No parent transcript, conversational history or memory was consulted. Host-level instruction-file exclusion cannot be independently established from this read-only pass.

Tool limits:
- The initial Bash read was denied with Bash/E_ACCESSDENIED before reading the persona; Node filesystem reads then supplied the full persona and subsequent inputs.
- One functions JavaScript wrapper had a syntax error before executing its Node read; the corrected call completed. Neither failure changed a file.

## Actual read ranges

Paths below are relative to the supplied workspace root unless otherwise noted. L refers to the displayed local text lines. Pinned repository bodies are the local source copies named in review-context.json, not live-head claims.

| Source | Actual inspected range |
|---|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/style.md | Full, L1-L67 |
| docs/designs/215/design_draft.md | L1-L44 for definitions; L178-L408 active audit |
| docs/designs/215/path-copy-contract.md | Full, L1-L75 |
| docs/designs/215/capture-channel-contract.md | Full, L1-L177 |
| docs/designs/215/companion-view-contract.md | Full, L1-L156 |
| docs/designs/215/capture-provenance-contract.md | Full, L1-L93 |
| docs/designs/215/evidence/c4-native-evidence.md | Full, L1-L408 |
| docs/designs/215/c2-experiment-results.md | Full, L1-L82; reproduction commands read, not executed |
| docs/designs/215/documentation-handoff.md | Full, L1-L37 |
| docs/designs/215/implementation-inputs.json | L1-L95 and L130-L171; whole JSON parsed for keys, not a claim of inspecting the skipped list lines |
| .tmp/215-ownership-envelope-review-20261108/comment-6701284701.txt | Full, L1-L16; D1 installed-contract/source check |
| .tmp/215-ownership-envelope-review-20261108/comment-6646355033.txt | Full, L1-L47; E bounded experiment |
| .tmp/215-ownership-envelope-review-20261108/comment-6647481988.txt | Full, L1-L51; E3 bounded controls experiment |
| .tmp/215-ownership-envelope-review-20261108/comment-6715993295.txt | Full, L1-L9; Run deferral decision |
| .tmp/215-ownership-envelope-review-20261108/comment-6724623895.txt | Full, L1-L19; Ready source record, not correctness proof |
| .tmp/215-ownership-envelope-review-20261108/repo-20.txt | L1-L50; pinned media/attention/hooks/register.js |
| .tmp/215-ownership-envelope-review-20261108/repo-18.txt | L1-L60; pinned package.json |
| .tmp/215-ownership-envelope-review-20261108/repo-8.txt | L1-L60; pinned test/unit/attentionCompletionMod.test.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-9.txt | L1-L22; pinned test/unit/webviewRenderer.test.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-13.txt | L1-L145; pinned src/panel/protocol.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-10.txt | L63-L100; pinned src/composer/composerRuntime.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-14.txt | Full, L1-L47; pinned src/panel/webview/index.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-7.txt | L267-L286; pinned docs/versioning-policy.md |
| .tmp/215-ownership-envelope-review-20261108/repo-15.txt | Full, L1-L47; pinned esbuild.js |
| .tmp/215-ownership-envelope-review-20261108/repo-16.txt | Full, L1-L27; pinned .vscodeignore |
| .tmp/215-ownership-envelope-review-20261108/repo-21.txt | L85-L132; pinned src/panel/webview/xtermTerminal.ts |
| .tmp/215-ownership-envelope-review-20261108/repo-25.txt | L340-L378; pinned src/sessions/sessionManager.ts |

Vector reads were structural/count inspection plus the exact semantic selections stated above. Reading/parsing file bytes is not represented as reviewing every contained case.

## Measured input receipts

| Input | Bytes | Lines / encoding receipt | SHA-256 |
|---|---:|---|---|
| Full native persona, style.md | 4,946 | 67 lines, UTF-8 text read in full | 325f211c3e4c327c220be0723745ea6df915bf027e3987b9fb60b845b5c936e2 |
| Full frozen design_draft.md | 89,549 | 408 lines; 408 CRLF pairs; full-file hash, active audit L178-L408 | 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be |
| evidence/capture-channel-cases.json | 158,267 | Selected reads/counts only | 7c03cb2bf755315e1810b85e6f68f988015e0c5b94e825bba4a9a475d5ed4e76 |
| evidence/companion-view-cases.json | 60,402 | Selected reads/counts only | c4c6602593036e3423121316de0cbafcf3a89c44d16d09b507609a198bb8ff9c |
| evidence/path-copy-cases.json | 8,909 | Structural/count inspection only | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| evidence/c4-adapter-cases.json | 97,827 | Five full cases plus structural/count inspection | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |

Frozen source identifier supplied by the caller: eb11873050cbcc09ece0ea3c32de1f4d39c4a345. The measured target bytes/hash match the caller's frozen receipt. No Git command was run to independently verify the commit association. The final target re-read matched the initial byte buffer exactly.
