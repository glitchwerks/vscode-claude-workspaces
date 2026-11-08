# Stage 9 — Detailed implementation readiness

All three requested native reviewers completed: **0 Blockers, 0 Majors, 0 Nits** in their recorded static scopes. This does not erase the two Stage 7 Nits or certify full-SDK, packaged/native or runtime behavior. Full generated SDK declarations were not supplied or retrieved; retained projections and member indexes provide partial evidence only. See each complete response for actual coverage and unrun qualification.

[Context/source manifest](context_manifest.md), [portable source catalog](review-context.json), [archived personas/standards/workflow/license](review_tools.json). Complete responses follow; transient tool/cache locators in receipts are provenance, not runtime dependencies.

# Stage 9 — Implementation Readiness

Mode: REVIEW. Native Implementation Readiness Goldfish persona and Implementation Readiness Standard. Target: docs/designs/215/design_draft.md at 46219dfd8c23998ff476092d064cfd95a6d8710d, full L1–414 read; active DetailedRange L178–414, L1–177 used for feature definitions and constraints. Runtime source: ef5fd48f4b676881a8730afbf8e583e70565ca11.

## Result

Completed the assigned static document/source review. **0 Blockers, 0 Majors, 0 Nits.** No S9-R-* finding is issued. Within the active target and incorporated current contracts, I found no remaining design choice or source/API discrepancy requiring an implementer to invent an alternative contract. This conclusion is a scoped implementation-plan assessment, not an executed product test, packaged-CLI compatibility result, implementation authorization or release approval.

The current CH/VW/PC/C4 contract bodies and their actual input/expected vector bodies were reviewed directly. Historical approval, applied-fix counts and previous static-validation claims were not treated as correctness proof. No current observed document/source discrepancy or executed product failure is asserted. The conditional product effects discussed below are obligations of the proposed implementation, not observed behavior.

## Native standard assessment

| Requirement | Completed assessment and canonical scope |
|---|---|
| Exact file/write boundary | The target inventory L188–220 and phase allowlists L233–240 reconcile to 28 Create / 18 Modify / 46 unique paths. D0 is separately specified by documentation-handoff.md:L7–29 and implementation-inputs.json:L12–183. Static Git-tree comparison found all 69 distinct D0 source blobs and none at the pinned runtime; the two later documentation Modify overlaps are explicit. Union: 113 distinct paths, 97 Create / 16 already-existing Modify at that runtime. No unlisted runtime path, dependency, script or core PTY edit is required by the selected integration. |
| Incremental stable checkpoints | Target L224–240 separates documentation-only D0, P0 contract transfer, disconnected P1 transport/capability work, P2 model/content without UI activation, P3 integration, and P4 package/native qualification. P1/P2 require types, lint, full unit tests and production build; P3/P4 add extension-host integration and matching prerelease packaging. These are specified future checks; none was executed here. |
| Actionable source/identity/lifetime contract | CH:L7–173 fixes epoch authority, identity validation order, native normalization, chunk completion, byte budgets, rejection/cursor behavior, five launch keys, fixed child basenames, marker authority and bounded cleanup. The exit bridge and HTML bootstrap now name concrete new APIs and integration sites rather than depending on nonexistent SessionManager exit/bootstrap APIs. |
| Specific tests and qualification | Target L249, L257, L291–295, L301–303, L326 and L330–336 name the relevant transferred inputs/outputs, ordinary fake-clock/PTY assertions, actual clipboard read-back, native dialog/Escape/toggle checks, unsupported-build controls and package/performance receipts. Required future Create paths and separately authorized unrun qualification are intentional phase work. They are not missing artifacts or automatic findings. |

The standard was applied as a zero-design-choice bar (standard L12–18), with exact write boundaries and explicit stable phases (L20–37). Internal code arrangement still has to be authored, but the reviewed selected behavior, ownership boundaries and failure outcomes do not leave an alternative design to choose.

## Selected API and integration checks

### Producer and native source boundary

CH:L104–173 and C4:L18–48 explicitly use fixed launch credentials, scalar primitive snapshots, stored append return content, a bounded publisher and declared fs read/write/timer capabilities. They do not require producer rename/remove/crypto; host Node fs owns promotion and ack replacement. The selected frame/control maxima are below the preserved fs per-call 4 MiB bound. Existing register.js:L9–31 demonstrates literal env access and capability wrappers; composer.js:L34–40, L203–232 demonstrates write/read and cancellable clock.after use. The preserved detail-design source record (issue comment 6701284701:L5–14) supplies the inspected fs/timer limitations, not fresh CLI execution.

Read C4 native declaration/receipt projection L1–408, including append-result deny/stored return, ToolCallResult string deny, classic IDs, optional agent fields, Bash required/optional field index and explicit lack of a numeric exit-code member. The full generated SDK artifacts were not supplied or retrieved; their archived hashes are provenance reported by that archive, not newly measured full-SDK hashes. No claim of exhaustive declaration verification is made.

Read all 32 native C4 case inputs and expected objects, including returned-versus-input text, deny-before/after independent positive evidence, actual main/agent/plugin scopes, effective command rewriting, duplicate/conflicting observations, malformed/background/image guards and reset/epoch isolation. Read all 32 VW projection expectations against those actual native inputs. C4-06/C4-11 retain the distinct tool-error label with requested Copy only; C4-08 remains unknown/Execution not confirmed; C4-20 remains Unknown with no executed Copy; C4-26 preserves the independent positive pair; C4-31 suppresses media while preserving qualified command evidence. Deferred Run assertions in the preserved native cases were excluded from v1 transfer assessment as C4:L3–7 directs.

### Managed-process exit bridge

CH:L44–58 selects prepareLaunch/observeSpawn/beginShutdown/close plus opaque confirmManagedPtyExit authority. Checked against ManagedPty/Factory:L5–17, SessionManager:L143–238 and L507–525, composerRuntime:L70–92/L197–211, extension.ts:L243–257/L443–475/L593–610/L909–932, nodePtyAdapter:L94–174 and FakeManagedPty:L34–79 at the pinned runtime. The manager passes the final prepared spec object to its factory; the selected WeakMap/one-use lease can therefore retain object identity without modifying core session/PTY sources. The facade can subscribe to the returned PTY before returning that same object to the manager. Both native adapter and shared fake replay recorded exit synchronously on registration; the documented latch/dispose ordering covers that callback boundary.

The current plan conservatively separates factory entry/uncertain rejection, unused preparation rollback, native session transition, terminate settlement, disposal and actual onExit. Only the captured binding's onExit latch provides current-owner cleanup proof. The two-second retired/shutdown observation deadline seals late work without inventing proof; early-shutdown termination re-emission and sole SessionManager process/input authority remain selected. Read all X01–X18 event inputs and expected proof/cleanup/native-call/listener outcomes, not merely O18's supplied confirmation flag. X02/X04/X08/X10/X13/X16/X18 retain their distinct uncertainty/cancellation cases; X05 covers synchronous replay and X11 old-versus-new owner isolation. No FakeManagedPty test was executed.

### Renderer document bootstrap and root protocol

VW:L17–41 selects installCompanionDocument, the exact #app attribute, listener-generation replacement, legacy UUID pairing, ready/bind echoes, same-HTML reload renewal and empty-view registration. Checked actual provider resolve/render/action/hydrate source, browser index initialization and renderer dependency/ready emission. The new carrier and optional dependency are explicit planned edits in already-allowed P3 files; no old UUID or webview state is silently treated as host authority. Missing bootstrap intentionally retains the legacy Raw/native keyboard path.

Read H01–H18 HTML/browser/legacy-ready/companion-ready/bind inputs and expected outcomes, including reverse arrival/deadline, duplicate IDs, wrong/stale callbacks, no selected session, pairing capacity and same-HTML reload. The same-document duplicate is idempotent; a changed canonical browser document renews the HTML lease rather than acquiring the old projection/action authority.

VW's new root member has the existing type discriminant and one closed payload. Read all P01–P35 root wire objects and expected direction/dispatch outcomes and L01–L04 legacy controls. Compared the pinned root unions/decoder and actual .type narrowing in lifecycle.test.ts:L629–645, terminalDiagnostics.test.ts:L296–340 and terminalEchoWebview.ts:L52–62. No contradictory kind-only root is selected; the planned consumer compatibility assertions remain future compiler/integration obligations. No compiler was run.

### Scope, safety, Copy and qualification

PC:L7–44 selects exact lexical starts, endpoint precedence, ambiguity and omission behavior. All 29 PC vector inputs/expected source spans were read, including quoted/code one-click controls, whole-candidate Review, multiple roots, URI/command exclusions, Unicode and over-limit omission. Target L278–297 selects host literal extraction, revision-bound action validation and the single global clipboard latch through uncertainty; VW:L103–125 fixes atomic snapshot/delta state, replay and Review expiry. All V01–V18 view event/expected outcomes were read, including partial invisibility, source changes during Review, stale IDs, duplicate Escape and unresolved-write ordering. No product extractor, renderer or clipboard operation was exercised.

The source-backed Markdown safety precedent is limited to its real html:false/link/image behavior; the target explicitly does not claim the composer reference parser provides inline/prose-path mapping. Browser-entry CSS placement and the Node-loadable renderer are compatible with the inspected index/renderer/test import boundary. Existing esbuild entries and package exclusions include the selected helper location without a new build entry or plugin manifest; packageAssets remains the planned concrete guard.

Pinned package.json:L38–52 supplies the planned checks and prerelease package command for version 0.11.3. The inspected CI workflow runs types/lint/unit/production-build plus Windows integration; its release-policy subset is already included in the full test:unit glob. The target correctly keeps model-consuming/manual native cases separate and requires fresh policy/baseline checks. This review did not run CI, package enumeration, plugin compilation, native qualification or publishing.

## Completed static calculations

These calculations used read-only Node data processing and Git object reads; they did not execute a proposed product adapter, hook, decoder, browser or test suite.

- Compared the local target against its immutable Git object: blob 9a4b731446c58c8ea942751860c0b9944fb19bc0, Git bytes 91,731 / SHA-256 564d1158a393fa484169f2fa7f20a7ccbd4d992a2c374c9d3d7265a9eda989a3. Its exact CRLF materialization equals the measured 92,145-byte target; 414 CRLF / 0 bare LF.
- Recomputed normalized Git blob identity for all 13 current target/contract/vector/handoff inputs used here; all match 46219dfd8c23998ff476092d064cfd95a6d8710d. Compared the 21 read runtime materializations with their actual ef5fd48 Git blob IDs; all match. Additional runtime sources were read directly from that Git object.
- Parsed the inventory and phase table: 46 unique first-write paths, no missing/extra inventory path, no repeated first-write, no later extension before its first write. D0 source existence/baseline classification and union counts above were independently recomputed. This is not an overlay or implementation-worktree cleanliness check.
- For all 29 path fixtures, recomputed input UTF-8 lengths and exact UTF-16 slice equality for every expected target; all named spans equal their literals. P29 expands to 32,771 bytes, consistent with omission above 32 KiB. This checks authored spans/bounds, not whether an implemented scanner selects them.
- Parsed every W01–W46 frame; recomputed every serialized-frame length and decoded chunk byte length. The intentionally bad W22 chunk length and W24 total length differ exactly as their CONTENT_REJECTED expectations require. W18's eight chunks total 319 bytes and reconstruct the stated normalized object/command. Read and compared the other rejection shapes and W37–W42 assembly/order/timeout/gap/foreign/stale controls; no current semantic discrepancy found. No product decoder is implied.
- Decoded every D01/D02 deny-pipeline frame, compared normalized inputs with all expected observations and cursor endpoints, and verified their native reason strings are absent. D01 ends ack 3 / unknown with no executed target; D02 ends ack 5 / completed with the independent positive pair retained.
- Recomputed ownership marker boundaries O07/O32/O33 as 1,025 / 1,023 / 1,024 bytes. Read O01–O33 markers, actual context/base differences, operation and expected admission/deletion/diagnostic decisions. ESRCH-only prior-host proof, current frozen identity plus true exit, traversal/link/unknown-child refusal, cap/lock failure and unpublished rollback are consistently distinct. No real PID, filesystem cleanup, ACL or reparse probe was performed.
- Constructed PB1/PB2/PB3 root schema byte fixtures: actual serialized lengths 262,143 / 262,144 / 262,145, decoded lengths 43,639 / 43,640 / 43,641, matching the selected inclusive 256 KiB cap. The sample logical projection hashes to 6d964b02d70ad52359db9e5ffc5b072e4800b81c7f2b0de852fb03488a2c1f87 at 98 UTF-8 bytes, matching P04/P05/P07/P08. Recomputed all six group-example source/target span bounds, and reviewed valid/rejected status-label combinations. These are schema fixture calculations, not complete transfer executions.

## Actual semantic read extents

All ranges below are one-based inclusive. JSON arrays were parsed and displayed as complete input/expected objects, sometimes decoded or with inherited ownership context shown as an explicit base plus exact differences to avoid repeated boilerplate. Escaped wire strings were additionally parsed for the static calculations. Reading/indexing bytes is not being substituted for semantic review.

| Current design input | Semantic extent completed |
|---|---|
| design_draft.md | Full L1–414, in contiguous batches 1–90, 91–177, 178–225, 226–274, 275–344, 345–414. Active DetailedRange 178–414. |
| capture-channel-contract.md | Full L1–196. |
| companion-view-contract.md | Full L1–173. |
| path-copy-contract.md | Full L1–75. |
| capture-provenance-contract.md | Full L1–93. |
| evidence/c4-native-evidence.md | Full L1–408, including selected declaration bodies/member indexes/receipt fields and their limits. |
| technical_choices.md | Full L1–175. The initial long tool display was truncated after the early portion; L120–175 was reread without truncation. |
| documentation-handoff.md | Full L1–37. |
| implementation-inputs.json | Full L1–191. Every listed source path was checked against immutable trees; historical file bodies outside the current contracts were not independently semantically re-reviewed. |
| capture-channel-cases.json | E01–E18 L7–368; B01–B04 L371–417; W01–W46 L418–1469; boundaryExpectations L1470–1503; N01–N16 L1506–1816; D01/D02 L1817–1989; ownershipPolicy/O01–O33 L1991–3844; managedExitBridgePolicy/X01–X18 L3846–4550. |
| companion-view-cases.json | V01–V18 L7–372; all 15 statusLabelPairs L374–435; all 32 c4ProjectionCases L437–866; G01–G06 L867–1110; rootEnvelopePolicy/P01–P35 L1112–1720; L01–L04 L1721–1783; PB1–PB3 L1784–1866; bootstrapPolicy/H01–H18 L1868–2584. |
| path-copy-cases.json | All P01–P29 inputs/pattern and expected arrays L7–386. |
| c4-adapter-cases.json | Binding/notes L6–20 and all 32 native case event-input/returned/expected/note bodies L21–3377. Historical Run-only expectation members were read as preserved context, excluded from v1 assessment. |
| Ready handoff record | Materialized issue comment 6725620876, full L1–21; direct SHA/manifest source claims checked against Git trees rather than accepting the prior static-validation paragraph. |
| Producer declaration-detail record | Materialized issue comment 6701284701, full L1–16; selected fs/timer constraints used within its stated evidence limits. |

Runtime semantic ranges at ef5fd48f4b676881a8730afbf8e583e70565ca11:

| Canonical repository path | Actual semantic range relied on |
|---|---|
| src/composer/composerRuntime.ts | L1–220, especially targetFor/prepareLaunch/synchronize. |
| src/extension.ts | L225–270, L430–475, L585–615, L897–940. |
| src/sessions/sessionManager.ts | L100–245, L335–380, L470–535. |
| src/launch/managedPty.ts | Full L1–17. |
| src/launch/nodePtyAdapter.ts | L1–185 of 186. |
| test/support/fakeManagedPty.ts | Full L1–110. |
| src/panel/sessionPanelProvider.ts | L1–215, L350–450, L610–705. |
| src/panel/protocol.ts | L1–150. Other decoder branches were not independently exhaustively audited. |
| src/panel/webview/index.ts | Full L1–47. |
| src/panel/webview/renderer.ts | L1–110, L370–500, L700–745. |
| media/attention/hooks/register.js | Full L1–134, reread after the first combined output truncated. |
| media/attention/hooks/composer.js | L1–90 and L170–275. Existing submission logic outside those extents was not reviewed as part of the companion design. |
| src/launch/sessionLaunch.ts | Full L1–86. |
| src/launch/claudeCapabilities.ts | L1–190 of 254; metadata probe API source only, no probe execution. |
| src/composer/claudeComposerAdapter.ts | L25–145 of 199; ownership/liveness precedent, not reused private helper API. |
| test/unit/attentionCompletionMod.test.ts | L1–60. A longer initial combined display truncated; no review claim is made for the rest of the file. |
| test/unit/webviewRenderer.test.ts | L1–40. |
| test/integration/lifecycle.test.ts | L615–650. |
| test/integration/terminalDiagnostics.test.ts | L285–345. |
| test/manual/terminalEchoWebview.ts | L40–63. |
| src/panel/webview/xtermTerminal.ts | L75–140. |
| src/panel/webview/composer/markdownPreview.ts | Full L1–25. |
| src/panel/webview/composer/references.ts | Full L1–55. |
| package.json | L1–82. |
| esbuild.js | Full L1–47. |
| .vscodeignore | Full L1–27. |
| test/unit/packageAssets.test.ts | L1–120. |
| test/integration/composer.test.ts | L1–50. |
| CONTRIBUTING.md | L90–110. |
| docs/versioning-policy.md | L260–289. |
| .github/workflows/ci.yml | Full L1–89. Other workflow bodies were only enumerated, not semantically audited. |

Canonical runtime references resolve under https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/ followed by the listed path and line fragment. Current design references resolve under https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/. Source inspections were performed 2026-11-08; no live source refresh was requested.

## Measured receipts

Persona, standard and target were measured from complete file bytes, not copied from the review index. The target receipt matches the requested frozen bytes/hash. Source receipts below are full-artifact byte/hash identities; they do not imply whole-artifact semantic review beyond the extents above.

| Full measured file | Bytes | SHA-256 |
|---|---:|---|
| `docs/designs/215/design_draft.md` | 92145 | `fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9` |
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/implementation_readiness.md` | 3991 | `5e9da8c6f7d22c6f0835393475f81aba670d37c5468e109122e01207f09ef5e0` |
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/implementation-readiness-standard.md` | 1691 | `f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d` |
| `docs/designs/215/capture-channel-contract.md` | 45605 | `146f0712580d815540e580d138f6da40d5e7416cacd02446a7b2f78a0ee14891` |
| `docs/designs/215/companion-view-contract.md` | 36180 | `6cbd29c9ee1189bcb76aa5f983126263c478598ee986b841f9610d3614f93ae1` |
| `docs/designs/215/path-copy-contract.md` | 8153 | `a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc` |
| `docs/designs/215/capture-provenance-contract.md` | 20616 | `d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922` |
| `docs/designs/215/evidence/c4-native-evidence.md` | 14940 | `80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029` |
| `runtime materialization: src/composer/composerRuntime.ts` | 15402 | `c11c70f4c2f2ed79aaaa6c09f70451853bd50ce437f6e938737ddb192b7bcde7` |
| `runtime materialization: src/extension.ts` | 40859 | `de3958693f55bb45c7806299896e144b53106ee416036232bdae8095994bda34` |
| `runtime materialization: src/sessions/sessionManager.ts` | 23387 | `3fdbf3df63d1e89bc6be6274e1bdda9f18a7ca96344af3d7be7b39645ea75cea` |
| `docs/designs/215/documentation-handoff.md` | 6156 | `0ac247fe11555edfbf255ded37ea63b2c0c7aa79cda84e0a338dc28589467b8f` |
| `docs/designs/215/implementation-inputs.json` | 13331 | `b84febd9e413c7d2e9c7eada07792f49dec1e9aed5c0d95e29f5c703a5b65e1c` |
| `C:\Users\chris\.codex\worktrees\215-disposable-output-experiment\workspaces\.tmp\215-exit-bootstrap-review-20261108\comment-6701284701.txt` | 3372 | `b9db1958ee9d44c3e04dc0e0a87b30c4f26e519d48976209128550abd04aa7a4` |
| `runtime materialization: src/panel/sessionPanelProvider.ts` | 42796 | `7a2c4d97b7414941e5ca739ffce45e531f81cb49029b579d7e660bfaf575ba56` |
| `runtime materialization: src/panel/webview/index.ts` | 1406 | `6f6ea8df1811ada1f80cbb9c7f6dc3575c9e2f27a3ae107aa18a559d819de5dc` |
| `runtime materialization: src/panel/protocol.ts` | 21629 | `1f44db1edb0adb9aae4177001fe8c5ed442cb1bfdfe069dde9a2580efdf902ef` |
| `docs/designs/215/technical_choices.md` | 28232 | `0645085da906ba7f9310eb5e0c3c54c9a4edb40b43e113fe48006e72a1e4a1ed` |
| `runtime materialization: media/attention/hooks/register.js` | 5352 | `63dc8aaa42f7436803afd292bdc341c2ead2aef69a630ee1707d9a4e2db545da` |
| `runtime materialization: test/unit/attentionCompletionMod.test.ts` | 20335 | `af7f01b38f0fca338121887213d378878fac2ec1c5c41d852508e82d19b5e335` |
| `runtime materialization: test/unit/webviewRenderer.test.ts` | 116263 | `65152d5e3b5935915b6d031d01951ea4b8f8b849ca36e56d13c5fd2d9285de2d` |
| `runtime materialization: src/panel/webview/renderer.ts` | 51672 | `a506de0fed6f97cf6e4111bacaf4b3d454abbd1c482482693b519c196d1c9136` |
| `runtime materialization: package.json` | 12601 | `ad4dee06448d7424218a08f71e41e639a85304d2cc2a049e75cae13a92e36b9b` |
| `runtime materialization: esbuild.js` | 1181 | `81cf3d74583d18b911f460dd759072312620a1e1435fcfc6858aced8cef46b48` |
| `runtime materialization: .vscodeignore` | 442 | `d19b5e322661724c36d04bdef527890739d49353c59edc0437c1740f3247cc50` |
| `runtime materialization: test/unit/packageAssets.test.ts` | 23012 | `6a8a28d48c7dd9c9900fd4f48316b62d8c37cd307193c312f552cbf6e2a439a4` |
| `runtime materialization: test/integration/composer.test.ts` | 22536 | `b25d69a143fda2ed072569bc76068ba693e5c0cb5ffafc21766cbd11e168cc93` |
| `runtime materialization: src/launch/sessionLaunch.ts` | 3057 | `bd0b1ea2163207cb492e9d5bdb24f163e40f37bd8f56ae4b469bb69dfe8c5e86` |
| `runtime materialization: CONTRIBUTING.md` | 10671 | `0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6` |
| `runtime materialization: docs/versioning-policy.md` | 20296 | `176852c1951bec676cdd784f5a924071742a05517b8c4718f51fba65d250bfbe` |
| `runtime materialization: src/panel/webview/xtermTerminal.ts` | 8566 | `ad9a88a7a60f0ecf79a2f19b7913b9de706bde9b47fad5f0ee35243f6c795a39` |
| `runtime materialization: src/panel/webview/composer/markdownPreview.ts` | 1588 | `e9068f6146633cd2a318b976dbc6f0595fef80b6739b0221904afb0f7529fbca` |
| `runtime materialization: src/panel/webview/composer/references.ts` | 3645 | `f6eb2df8d218b7a865bd78429ac2925f8005eb2a9b5863b6557317e562b4c2ad` |
| `C:\Users\chris\.codex\worktrees\215-disposable-output-experiment\workspaces\.tmp\215-exit-bootstrap-review-20261108\comment-6725620876.txt` | 3983 | `fe836106da4d4b4df39b56d0955ca1464632c4005b0f21769fb1f4dd43103a58` |

Measured JSON vector artifacts:

| File | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| `docs/designs/215/evidence/capture-channel-cases.json` | 174074 | 4551 | `2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff` |
| `docs/designs/215/evidence/companion-view-cases.json` | 81843 | 2585 | `5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be` |
| `docs/designs/215/evidence/path-copy-cases.json` | 8909 | 387 | `f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc` |
| `docs/designs/215/evidence/c4-adapter-cases.json` | 97827 | 3380 | `942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20` |

Additional source files read directly from immutable Git objects (LF object bytes):

| Runtime Git source | Bytes | SHA-256 |
|---|---:|---|
| `src/launch/managedPty.ts` | 619 | `88e38d800c36e12ae3b173ca8b7b773c92405fdab18478862bde7b9b4100cf5e` |
| `src/launch/nodePtyAdapter.ts` | 5883 | `ae45b0bea46f2c983d13c04944acdf947862f44e04c1f909d3cc51fbd864125e` |
| `test/support/fakeManagedPty.ts` | 3533 | `744098af1070489d93c9369b6a9845ffcb957b915549f2d59c6fa69440281bfc` |
| `test/integration/lifecycle.test.ts` | 61824 | `56a1754712bb947c5f83d79df95eea658e5297bedc62198dffd8fb1687e17ab2` |
| `test/integration/terminalDiagnostics.test.ts` | 21071 | `53afde53db82b4ba1f8acd715d3e93426d89d731a301e9849242251744083305` |
| `test/manual/terminalEchoWebview.ts` | 3191 | `72c7cd69a665db945f2702d9572747312edef3e59c3d3ad24f13a5b9bb530703` |
| `.github/workflows/ci.yml` | 2472 | `d9f0cba183bddb8e9b301b24f4f602d87f5a998dfe1c102cef845ba75779f0c7` |
| `src/composer/claudeComposerAdapter.ts` | 10477 | `7b88e5a2591309da61c783e4fe4e29fa18dd06d392a99bc72546f2fa7bbe545a` |
| `src/launch/claudeCapabilities.ts` | 10395 | `5a3349207e8967445231098c875834d93ae5d26c5d2747d295bbf7bd844f84fa` |
| `media/attention/hooks/composer.js` | 16488 | `53ee184930f9eb685b70c78ffbaa80bd9d96208f4699a72cd61a5cb537da67df` |

## Exclusions and remaining execution obligations

No target fix, product implementation, compilation, lint, unit/integration/build/package command, native/Claude/model call, clipboard action, PID liveness/ACL/reparse probe, Git mutation or GitHub write occurred. Only this authorized report file is written. No parent transcript, conversation history or memory was retrieved. review-context.json was used as a source locator/index, not as a correctness finding. Historical approvals, resolution reports, older design versions, C2/Run implementation, direct native-response proposals, the full SDK artifacts, all unrelated runtime methods and all historical D0 report contents were not independently audited.

Future implementation still has to execute every selected phase check and separately authorized native/package/accessibility/performance matrix before a build is added to capabilities or reliable Copy is claimed (target L243/L330–336). That unrun work is explicitly required by the plan; this scoped review neither reports it as an observed failure nor waives it.


---

# Stage 9 — Codebase Details Goldfish

Mode: REVIEW. Native persona severities: Blocker / Major / Nit.

## Outcome and evidence boundary

No substantiated codebase-drift finding was found in the inspected pinned runtime boundaries or current CH/VW/PC/C4 vector bodies: 0 Blockers, 0 Majors, 0 Nits. No S9-B finding IDs are assigned. This is a bounded static review, not a blanket zero-finding implementation-readiness verdict. Independent verification of the full generated native SDK remains incomplete because neither complete generated declaration artifact was supplied; their hashes and preserved projections/member index are identification and partial evidence, not the missing bodies themselves. No new SDK artifact was retrieved.

The full target was read: docs/designs/215/design_draft.md L1–414, with L178–414 audited as the active Detailed Implementation and L1–177 used for scope/definitions. Target is frozen at 46219dfd8c23998ff476092d064cfd95a6d8710d; runtime comparisons use ef5fd48f4b676881a8730afbf8e583e70565ca11 through read-only Git object reads. The documentation checkout was not substituted for that runtime. Current contracts and actual expanded input/expected bodies were used; previous approvals, resolution reports, vector counts and Ready-record validation claims were not treated as correctness proof.

## Scope mapping and completed comparisons

| Active target scope | Actual source/contract comparison and result |
|---|---|
| L184–240: D0 and phase inventory | Parsed the actual 46 later paths, then checked frozen Git trees: 28 Create / 18 Modify, with no misclassification after the two D0 documentation overlaps; all 69 D0 source paths exist in the selected immutable source and none exists in the pinned runtime; the union is 113 unique paths. No planned Create absence is reported as a defect. The handoff remains a documentation prerequisite, not runtime restoration or implementation authorization. |
| L245–261: ownership and managed exit | CH L15–58 is a selected addition, not an invented existing manager event. Actual ManagedPtyFactory.spawn returns Promise<ManagedPty>; onExit is a VS Code-shaped event; SessionManager passes the prepared final spec directly to the factory. NodeManagedPty and FakeManagedPty synchronously replay buffered exits, so the contract's latch-before-subscription/dispose-after-replay rule is pertinent. Actual terminate/dispose/remove/abandon paths do not furnish interchangeable proof. CH's captured owner, same returned PTY/original rejection, activation-local facade, one-use spec lease, bounded late-result/listener guard and no core-manager write are consistent with these inspected boundaries. |
| L245–274: transport/schema | Inspected the closed ownership/control/data/normalized dictionaries and actual E/B/W/N/D/O/X inputs and expected outcomes. Owned malformed traffic retires without falsely advancing admission; foreign/stale traffic does not acquire owner/epoch authority. Native deny is string, including empty, in the preserved ToolCallResult projection. N01–N16 and both deny pipelines preserve withholding-versus-positive-pair precedence without leaking reason text. Five literal capture keys and host-side rename avoid assuming mod rename/delete. |
| L278–297: literal paths, root wrapper and bootstrap | All P01–P29 actual path inputs/expected spans/actions/literals were examined, not just their index. All ordinary expected source slices match their literal values, including newline/UNC/device/Unicode controls. The closed root type/payload wrapper preserves the existing type-discriminated consumers. Provider HTML has no existing companion ID; VW L17–29 explicitly adds it, listener-before-HTML installation, optional renderer dependency, legacy UUID pairing and renewal instead of claiming it already exists. H01–H18 cover those actual selected transitions, including no-session, early expiry, stale callback, same-HTML reload and old-document bind. |
| L299–315: C4 provenance and projection | Read all 32 expanded native-shape event bodies and expected fields, all 32 projection outcomes, group examples and both normalized deny pipelines. Checked returned-stored source, rewritten effective command, engine/core binding, main/agent/plugin distinction, error/denial/interruption/background/unknown/positive-pair precedence, duplicate/conflicting IDs, privacy and image guard cases against current C4/CH/VW text. C4-20's actual backgroundOutputPath-without-task-ID input expects Unknown/no executed value; C4-08 remains execution-unconfirmed, while C4-26 retains its independent completed pair. C4-06/C4-11 project the distinct tool-error label with requested Copy only. Deferred Run assertions were not made v1 obligations. |
| L317–334: existing renderer, native input and tests | Actual markdown-it preview disables HTML, restricts links and replaces images; actual reference scanner skips inline code. The plan correctly describes a reuse boundary rather than an already sufficient source mapper. SessionManager owns PTY writes and can queue starting-session input; the plan's running/generation check before one Escape is therefore significant. Existing xterm stays the raw input/output/focus boundary. Direct Node imports of renderer in its DOM harness and browser-entry stylesheet imports substantiate the CSS boundary. Existing attention data-URL loader has fixed imports and composes middleware; the selected fixed helper-graph/mock extension addresses that infrastructure rather than assuming relative imports resolve from a data URL. |
| L220–240, L326–336: build/package/discovery | Read actual package scripts, tsconfig, VS Code integration config, esbuild entries, ignore rules, hook/module/plugin assets and packageAssets infrastructure. New ordinary unit/integration paths are covered by existing discovery globs. Existing entry bundling can reach new TS imports and browser CSS; companion JS helpers stay under the already packaged plugin, so no extra plugin manifest/build entry is assumed. The pinned manifest is 0.11.3 and guard/release-policy code uses odd/even minor parity, matching package:prerelease at that snapshot. These are static compatibility conclusions, not an observed compile, build or package pass. |

The unchanged root consumers examined include test/integration/lifecycle.test.ts's narrowed session helpers, test/integration/terminalDiagnostics.test.ts's narrowed diagnostics/data mock and test/manual/terminalEchoWebview.ts. A pinned-tree HostMessage/WebviewMessage search additionally exposed the narrowed diagnostic API and the legacy nativeAgentInputWebview consumer; their relevant bodies were read. No kind-only record needs to masquerade as legacy terminal data under the selected wrapper. Any future compile/runtime consequence remains conditional static inference.

## Actual vector read coverage

All four JSON files were parsed in full, and the following actual input/expected bodies were inspected. Repetitive ownership records were compared as full base context plus exact changed marker/context fields; serialized strings were decoded for inspection without changing files. This is static fixture examination, not execution of future decoders/adapters.

- capture-channel-cases.json: E01–E18; B01–B04; W01–W46 (including complete reconstructed W18 chunk content and all malformed/private/member/order/length/expiry/gap controls); six boundary expectations; N01–N16; D01–D02; ownershipPolicy and O01–O33; managedExitBridgePolicy and X01–X18.
- companion-view-cases.json: V01–V18; complete 32 C4 projection rows; G01–G06; rootEnvelopePolicy and P01–P35 serialized wrapper bodies; L01–L04; PB1–PB3 construction inputs/expectations; bootstrapPolicy/html examples and H01–H18.
- path-copy-cases.json: P01–P29, including the over-limit constructive input and empty exclusion expectations. Static source-slice comparison found no mismatch in the 28 explicit-string cases.
- c4-adapter-cases.json: binding, harness notes and C4-01 through C4-32 complete native event/return/expected bodies. Harness phases and sourceEnvelope/nextOrigin metadata were distinguished from native event fields. No synthetic event was described as a new live receipt.

Additional static calculations: every W example's outer serialized frame parsed as JSON; the only chunk byteLength mismatch was W22's deliberately rejected actual 152 / declared 1. W24 deliberately declares the wrong total and expects retirement. PB1/PB2/PB3 reconstruct to 262,143 / 262,144 / 262,145 serialized bytes, with decoded lengths 43,639 / 43,640 / 43,641, matching their documented boundary expectations. G01/G02 code/target spans end at the actual 26-character source boundary. Ownership marker cases O07/O32/O33 measure 1,025 / 1,023 / 1,024 bytes as intended. These calculations do not constitute schema-state, event-delivery, clipboard or filesystem qualification.

## Source verification receipts and exclusions

The native source evidence read was docs/designs/215/evidence/c4-native-evidence.md L1–408 in full, including preserved declared shapes, the complete top-level Bash member index, exact selected receipt projections and explicit evidence limits. D1's materialized comment-6701284701.txt L1–16 was read in full: its fs/timer/version statements remain a preserved inspection summary. It does not substitute for unprovided declaration bodies. In particular this audit cannot independently revalidate every generated signature, compiler capability-flow rule, all API overloads or nested Bash member bodies from the original full artifacts. The complete generated core (676,417 bytes) and built-in tools (204,865 bytes) were not supplied or retrieved. Their archive hashes were not freshly verified against unavailable bytes.

The materialized Ready record comment-6725620876.txt L1–21 was read to identify the exact immutable source, then the source-tree path classifications were checked independently. Historical repair/review reports were not used to decide correctness; their local paths were checked as references only. A path-existence scan across the eight active Markdown contract/decision/handoff documents found all 146 encountered relative link destinations in the frozen source tree. That scan is a path check, not a complete anchor or claim-content audit of historical referenced reports. The 69-file D0 inventory was verified as existing Git paths; historical report bodies and all transitive external claims were not fully re-reviewed.

No full generated SDK, current-installed-build compatibility, native event delivery or packaged product behavior is certified here. The unimplemented Create files, unrun future qualification, deferred Run/Run again/C2/direct response controls, and the absence of a new live experiment were not findings. No execution of product/compiler/lint/unit/integration/build/package scripts, native/Claude/model/clipboard/ACL probes, process-liveness probes, destructive cleanup, Git/GitHub mutation or new SDK retrieval occurred. One read-only lookup for tsconfig.test.json found it absent; the actual tsconfig.json supplies the inspected compile discovery, and the plan does not cite that nonexistent file.

The native persona and standard were read in full before the target/source review. Supplied byte/hash receipts were remeasured locally. Raw target has 414 CRLF line endings, no bare LF, and exactly the supplied 92,145-byte SHA-256. Full-document receipt extents below describe actual content read; source excerpts follow separately.

| File | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| docs/designs/215/design_draft.md | 414 | 92145 | fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9 |
| docs/designs/215/capture-channel-contract.md | 196 | 45605 | 146f0712580d815540e580d138f6da40d5e7416cacd02446a7b2f78a0ee14891 |
| docs/designs/215/companion-view-contract.md | 173 | 36180 | 6cbd29c9ee1189bcb76aa5f983126263c478598ee986b841f9610d3614f93ae1 |
| docs/designs/215/path-copy-contract.md | 75 | 8153 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| docs/designs/215/capture-provenance-contract.md | 93 | 20616 | d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922 |
| docs/designs/215/evidence/c4-native-evidence.md | 408 | 14940 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| docs/designs/215/evidence/capture-channel-cases.json | 4551 | 174074 | 2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff |
| docs/designs/215/evidence/companion-view-cases.json | 2585 | 81843 | 5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be |
| docs/designs/215/evidence/path-copy-cases.json | 387 | 8909 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| docs/designs/215/evidence/c4-adapter-cases.json | 3380 | 97827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |
| docs/designs/215/documentation-handoff.md | 37 | 6156 | 0ac247fe11555edfbf255ded37ea63b2c0c7aa79cda84e0a338dc28589467b8f |
| docs/designs/215/technical_choices.md | 175 | 28232 | 0645085da906ba7f9310eb5e0c3c54c9a4edb40b43e113fe48006e72a1e4a1ed |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/codebase_details.md | 69 | 4752 | a19676acc9bf53d155b7b0a9c63d6b63c39bd43393bcb503d2f3a5fe62c6cd42 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/implementation-readiness-standard.md | 37 | 1691 | f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d |
| docs/designs/215/implementation-inputs.json | 191 | 13331 | b84febd9e413c7d2e9c7eada07792f49dec1e9aed5c0d95e29f5c703a5b65e1c |

## Pinned runtime body read extents

Every row below is from runtime commit ef5fd48f4b676881a8730afbf8e583e70565ca11, retrieved with read-only git show; no checkout source was silently substituted. Ranges are the bodies examined, not a claim to have read every line of each large runtime file. Simple unit assertions outside necessary loader/mock/package/renderer infrastructure were not audited.

| Source path | Examined lines |
|---|---|
| src/launch/managedPty.ts | L1–17 |
| src/launch/nodePtyAdapter.ts | L1–186 |
| test/support/fakeManagedPty.ts | L1–110 |
| src/sessions/sessionManager.ts | L1–260, L335–385, L465–540, L260–335, L540–620 |
| src/composer/composerRuntime.ts | L1–229 |
| src/launch/sessionLaunch.ts | L1–86 |
| src/extension.ts | L220–270, L425–470, L580–625, L890–940, L470–580 |
| src/panel/webview/index.ts | L1–47 |
| src/panel/sessionPanelProvider.ts | L1–215, L345–470, L600–700, L825–900 |
| src/panel/protocol.ts | L1–185, L210–320 |
| src/panel/webview/renderer.ts | L1–150, L345–490, L690–755 |
| media/attention/hooks/register.js | L1–134 |
| test/unit/attentionCompletionMod.test.ts | L1–105 |
| esbuild.js | L1–47 |
| .vscodeignore | L1–27 |
| package.json | L1–98 |
| tsconfig.json | L1–35 |
| .vscode-test.js | L1–55 |
| test/unit/packageAssets.test.ts | L1–145 |
| test/unit/webviewRenderer.test.ts | L1–75, L2225–2290 |
| test/integration/composer.test.ts | L1–85 |
| test/integration/lifecycle.test.ts | L625–650 |
| test/integration/terminalDiagnostics.test.ts | L290–345 |
| test/manual/terminalEchoWebview.ts | L1–63 |
| CONTRIBUTING.md | L90–110 |
| docs/versioning-policy.md | L267–286 |
| scripts/guard-channel.js | L1–44 |
| src/panel/webview/composer/markdownPreview.ts | L1–25 |
| src/panel/webview/composer/references.ts | L1–55 |
| src/panel/webview/xtermTerminal.ts | L1–225 |
| src/composer/claudeComposerAdapter.ts | L1–199 |
| src/diagnostics/webviewTerminalDiagnostics.ts | L1–100 |
| test/manual/nativeAgentInputWebview.ts | L1–19 |
| media/attention/hooks/hooks.json | L1–3 |
| media/attention/.claude-plugin/plugin.json | L1–6 |
| src/launch/launchPlanner.ts | L1–70 |
| src/sessions/sessionTypes.ts | L1–67 |
| scripts/release-policy.js | L1–81 |

## Disposition

The inspected exit/bootstrap/root-envelope/ownership/native-normalization changes have no newly substantiated S9 code-drift discrepancy in this source envelope. Keep the missing full-SDK verification and all deliberately unrun product qualification as explicit evidence limits when consolidating; do not convert this bounded result into a global readiness or runtime pass.


---

# Stage 9 — Style Goldfish

Mode: REVIEW. Persona: native egm-style, read in full before substantive review. No separate style standard was supplied.

## Result

**0 Blockers, 0 Majors, 0 Nits.** No S9-S-* findings are issued for the active scope, `docs/designs/215/design_draft.md:L178-L414`.

The active text distinguishes selected requirements, historical evidence, synthetic expectations and future qualification. I did not establish a sentence whose tone, redundancy or evidence calibration warrants DROP, CALIBRATE or RELOCATE. The technical density alone is not a style defect, and I have not imposed an additional brevity preference.

## Native caveat and objectivity decisions

These are KEEP decisions, not findings.

| Active target scope | Decision and concrete reader/operator choice | Canonical calibration sources actually inspected |
|---|---|---|
| L180-L184, L220-L243, L319, L324-L330, L342-L355 | KEEP. Copying-only scope, Variant A, Run/C2 deferral and separate implementation authorization tell the implementer which interfaces/files to exclude and when work may begin. Their repetition occurs at inventory, activation, controls and reconciliation boundaries. | Variant A decision: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545; Run deferral: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295; current CH:L3-L5 and VW:L3-L5. |
| L245-L253 | KEEP. Privacy, ownership, native-transition versus process-exit distinctions and finite listener lifetime govern admission, deletion and relaunch choices. These are reachable failure policies rather than blanket disclaimers. | `capture-channel-contract.md:L15-L58`, L77-L98. The source explicitly identifies the bridge as selected, unimplemented design. |
| L263-L276, L334-L336, L361 | KEEP. Budgets are labelled proposed/selected rather than measured. Failure changes admission, Copy availability or the qualification decision. The performance threshold is a future gate with requested measurement context. | CH:L163-L178; `companion-view-contract.md:L7-L15`; pinned `package.json:L38-L52` at ef5fd48f4b676881a8730afbf8e583e70565ca11. No runtime performance result is inferred. |
| L274, L297, L322 | KEEP. Clipboard uncertainty retains the busy guard; Escape reports dispatch separately from interruption and is not retried. These statements tell the operator what feedback means and constrain the implementation after timeout/staleness. | VW:L115-L125. No platform clipboard write or native Escape was exercised here. |
| L278-L289 | KEEP. Exact source mapping, uncertain-path Review, unsupported forms and oversize omission govern whether a target is Copy, Review or unavailable. They preserve the selected literal-copy constraints. | `path-copy-contract.md:L1-L75`; actual P01-P05 expectation bodies in `evidence/path-copy-cases.json`. These are design vectors, not measured recognition coverage. |
| L299-L315, L398-L399 | KEEP. C4 approval is explicitly separated from adapter/package qualification. “Ran”, background, error, deny and Unknown labels are scoped to declared predicates; synthetic cases are named as expectations. | `capture-provenance-contract.md:L1-L93`; `evidence/c4-native-evidence.md:L110-L149,L254-L408`; actual C4-08/C4-20/C4-26 native-shape bodies and matching VW projection bodies. The archived declaration and receipt projections have narrower coverage than future packaged qualification. |
| L291-L295, L400-L401 | KEEP. Root wrapping, HTML bootstrap and helper placement are selected implementation requirements supported by current contract/source bodies. The inventory and package qualification steps still require compilation, asset checks and packaged verification; I have not treated a declared schema or an existing asset assertion as a passed product test. | VW:L17-L41; current CH:L44-L58; pinned `esbuild.js:L1-L47`, `.vscodeignore:L1-L27`, `test/unit/packageAssets.test.ts:L80-L103`. |

No hyperbole, marketing claim, subjective code-quality judgment, obscuring buzzword or synonym redundancy was established in L178-L414. Historical approval/fix-count language was not used as proof that a runtime or correction passes.

## Completed inspection and read extents

All file bytes listed below were loaded for receipt measurement. Semantic inspection was limited to the extents stated; loading or parsing an entire file is not a claim that every body was reviewed.

| Input | Actual inspected extent |
|---|---|
| Native `agents/style.md` | Full L1-L67, including REVIEW instructions, native DROP/CALIBRATE/RELOCATE/KEEP test and output format. |
| Active `design_draft.md` | Full L178-L414, reread in untruncated sections after the initial combined output was truncated. Earlier L1-L177 was not needed or reviewed. |
| `review-context.json` | Parsed in full for source lookup. Inspected target/scope/runtime baseline, source policy, authorization/isolation fields, local-source metadata and canonical source index. Index metadata was not correctness proof. |
| `capture-channel-contract.md` | L1-L98 and L157-L190, plus heading locations. L99-L156 and L191-L196 were not semantically inspected. |
| `companion-view-contract.md` | L1-L68 and L103-L167, plus heading locations. L69-L102 and L168-L173 were not semantically inspected. |
| `path-copy-contract.md` | Full L1-L75. |
| `capture-provenance-contract.md` | Full L1-L93. |
| `evidence/c4-native-evidence.md` | L1-L17, L110-L149 and L254-L408. Other declaration projections were not inspected. |
| `evidence/capture-channel-cases.json` | Status/event-policy fields; complete X01/X02 managed-exit bodies; D01/D02 serialized frames and top-level expected summaries. Nested D01/D02 observation/group bodies were not fully displayed or audited. |
| `evidence/companion-view-cases.json` | Status/event-policy fields; complete H01/H02 bootstrap bodies; complete C4-08/C4-20/C4-26 projection bodies. Other cases were not audited. |
| `evidence/c4-adapter-cases.json` | Complete C4-08/C4-20/C4-26 bodies, including events and expectations; status metadata. Other cases were not audited. |
| `evidence/path-copy-cases.json` | Complete P01-P05 input/span/action/value bodies and status metadata. Other cases were not audited. |
| Cached pinned sources `repo-15.txt`, `repo-16.txt` | Full source bodies: `esbuild.js` L1-L47 and `.vscodeignore` L1-L27, at ef5fd48f4b676881a8730afbf8e583e70565ca11. |
| Cached pinned `repo-17.txt`, `repo-18.txt` | `test/unit/packageAssets.test.ts:L80-L103`; `package.json:L1-L58`, at the same pinned runtime. |
| Cached author decisions | Full bodies of issue comments 6706751545 and 6715993295, used only to verify scope decisions. |

## Measured identity receipts

The full persona and full target were measured from actual bytes at initial read and again before report creation; both measurements matched. CRLF counts equal line counts; neither has a lone LF.

| Input | Full bytes | Lines / CRLF | SHA-256 |
|---|---:|---:|---|
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/style.md` | 4,946 | 67 / 67 | `325f211c3e4c327c220be0723745ea6df915bf027e3987b9fb60b845b5c936e2` |
| `C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md` | 92,145 | 414 / 414 | `fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9` |
| `review-context.json` | 60,118 | 997 / 997 | `4caf9fbdffc31c5a7d66d97d72fbdaedacb2362db6d747ac3a2d8cfa1f4e6bfd` |

The target matches the caller's frozen byte/hash identity. Frozen commit `46219dfd8c23998ff476092d064cfd95a6d8710d` and blob `9a4b731446c58c8ea942751860c0b9944fb19bc0` are supplied context identities; I did not independently resolve them through Git.

Current contract/vector full-byte measurements also matched the context:

| File under `docs/designs/215/` | Bytes | SHA-256 |
|---|---:|---|
| `capture-channel-contract.md` | 45,605 | `146f0712580d815540e580d138f6da40d5e7416cacd02446a7b2f78a0ee14891` |
| `companion-view-contract.md` | 36,180 | `6cbd29c9ee1189bcb76aa5f983126263c478598ee986b841f9610d3614f93ae1` |
| `path-copy-contract.md` | 8,153 | `a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc` |
| `capture-provenance-contract.md` | 20,616 | `d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922` |
| `evidence/c4-native-evidence.md` | 14,940 | `80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029` |
| `evidence/capture-channel-cases.json` | 174,074 | `2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff` |
| `evidence/companion-view-cases.json` | 81,843 | `5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be` |
| `evidence/c4-adapter-cases.json` | 97,827 | `942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20` |
| `evidence/path-copy-cases.json` | 8,909 | `f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc` |

## Not run and limits

This was an editorial document review with source calibration. No product implementation, compiler, tests, build, package, native/Claude/model invocation, clipboard or ACL probe, Git/GitHub mutation, parent transcript/history retrieval or memory retrieval was performed. Historical raw archives and original installed private declaration files were not reopened. Current contracts superseded historical review summaries.

The initial Bash read failed with access denied; Node read-only file access supplied the successful reads. Only this requested report was written. No target or other agent's file was changed.

The operational failures discussed above are design risks or future qualification conditions, not newly observed execution. Use this result for the Stage 9 editorial assessment; retain the design's separate implementation and packaged/native qualification gates.
