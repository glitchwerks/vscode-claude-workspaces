# Technical choices for the copying companion

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-06
* **Updated:** 2026-11-11
* **State:** Copying-only v1/native Variant A retained; D0 verified as identical no-op and P0 reconciled for #221. Run/Run again remain deferred. Packaged qualification and EGM convergence are not established. [A14; A15; RV; P0 reconciliation below]
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **Design:** [Corrected formal design](design_draft.md), [Run amendment](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/run-amendment.md) and [applied resolution](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-07/resolution/goldfish_review_report.md). Historical checkpoint links preserve the earlier decisions; current review limits are recorded under RV. Implementation qualification remains pending. [A8; RV]

## P0 reconciliation — 2026-11-11

Work package [#221](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221) follows the [maintainer execution authorization and D0 receipt](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221#issuecomment-6807170772). Runtime baseline: ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce, extension 0.13.0 on prerelease/0.13.x. Implementation worktree: C:/Users/chris/.codex/worktrees/policy-220-channel-migration/workspaces; branch codex/221-companion-contract-verification. This location is provenance, not a dependency. [Baseline package](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/package.json#L1-L62), [current feature route](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/CONTRIBUTING.md#L98-L103).

### D0 source identity and no-op receipt

The [Ready record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831) selects a6539b5c72cc5ed45126a6c924fa926fc9cfe10a. All 13 Git blob IDs below equal their baseline-HEAD IDs and the clean worktree hashes after Git newline filtering; D0 therefore performed zero writes. The 100 parsed local Markdown file links resolve inside this allowlist. The original manifest remains unchanged, including its historical runtime classifications. [Pinned manifest](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a6539b5c72cc5ed45126a6c924fa926fc9cfe10a/docs/designs/215/implementation/implementation-inputs.json), [recorded checks](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221#issuecomment-6807170772).

| Input, relative to this directory | Verified source and baseline blob |
|---|---|
| capture-channel-contract.md | 65a4d56bacb2486410cbdf66790079325786c4c2 |
| capture-provenance-contract.md | fdd40b60a091f279bcabf957ff2a6e6c1d869665 |
| companion-view-contract.md | 3564d8965e40ba25fd2db494f87f7fa5b3414f17 |
| design_draft.md | 3a8f0970c3c3c2f22a9b10f9c2098b812f545774 |
| documentation-handoff.md | 05358cdb54333c06bb4ca992e431d1b667c649bd |
| evidence/c4-adapter-cases.json | 1ab6f6033eeda625f2d569ffc6e66ec6c7e73069 |
| evidence/c4-native-evidence.md | 279be03d7fd863ecae6bd21ac9bd4846ac6253bc |
| evidence/capture-channel-cases.json | 89f65ac0654cda868d6d6454708f52426df5f220 |
| evidence/companion-view-cases.json | 738acaf02a3551400d8734270a57a7713c12a21e |
| evidence/path-copy-cases.json | c29eec6b4782e9ea2b198a751298109715e7613d |
| implementation-inputs.json | 0c05986817081d1a995f85ecc2aa74133ec72bbf |
| path-copy-contract.md | b2ea9d6e6d1cf93cd2600e23a84ce25b53df0052 |
| technical_choices.md | c3f73d1032bcaef5de3f4a6a7ddb9b7ef98d50e8 |

Reproduce each identity with git ls-tree SOURCE_SHA -- PATH, git ls-tree ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce -- PATH and git hash-object --path=PATH -- PATH. Context: git ls-tree ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce -- docs/designs/215/implementation/implementation-inputs.json verifies 0c05986817081d1a995f85ecc2aa74133ec72bbf; git ls-tree -r a6539b5c72cc5ed45126a6c924fa926fc9cfe10a -- docs/designs/215/implementation verifies every listed source blob. These are pre-P0 identities; the two authorized P0 documentation edits intentionally change their working blobs after this no-op checkpoint.

Ten isolated preflight mutations rejected: Pending source, mutable source, source/record mismatch, duplicate path, traversal, non-doc path, history import, missing source blob, divergent local document and changed runtime without re-audit. No mutation wrote into the real package. [Required rejection classes](implementation-inputs.json), [execution receipt](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221#issuecomment-6807170772).

### Current runtime and API reconciliation

The existing 46-path inventory remains valid at ff3720d: 28 Create are absent and 18 Modify exist. D0 contributes 11 additional existing paths after its two overlaps, producing a current union of 28 absent / 29 existing. The historical 41 Create / 16 Modify union at ef5fd48 is retained only for that snapshot. No phase first/later-write subset expands. [Phase inventory](design_draft.md#detailed-implementation), [manifest](implementation-inputs.json), [baseline audit](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221#issuecomment-6807170772).

| Boundary checked against current source | P0 disposition | Source |
|---|---|---|
| Read-only managed target and composer readiness | targetFor still returns the current sessionId/claudeSessionId/generation independently of adapter readiness. #227 adds import intent/readiness handling; companion input authority remains separate. | [target and prepareLaunch](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/composer/composerRuntime.ts#L76-L102), PR #234 |
| Final launch specification and factory identity | Existing manager passes the exact prepared spec to ManagedPtyFactory.spawn. The planned WeakMap/one-use lease facade remains a P3 addition; it must preserve returned PTY and rejection identity. | [manager](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/sessions/sessionManager.ts#L143-L163), [factory](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/launch/managedPty.ts#L5-L17), [CH](capture-channel-contract.md#managed-process-exit-bridge) |
| Exit observation and shutdown | Keep the selected synchronous-replay latch, exact-owner proof and overall two-second close bound. Session removal, terminate settlement and native session.end are not process-exit proof. No manager or PTY adapter write is added. | [CH](capture-channel-contract.md#managed-process-exit-bridge), [buffered event](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/launch/nodePtyAdapter.ts#L94-L174), [shared fake](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/test/support/fakeManagedPty.ts#L34-L79) |
| Host HTML and legacy ready | Provider still owns viewGeneration and legacy document registration. P3 must install the listener before HTML, add the host-issued attribute and pair it with the existing browser UUID; legacy-only consumers stay supported. | [provider](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/panel/sessionPanelProvider.ts#L160-L210), [browser](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/panel/webview/index.ts#L19-L40), [VW](companion-view-contract.md#host-html-bootstrap-and-document-registration) |
| Mod graph, environment and build | Capture remains a separate five-key overlay and two helpers under the existing plugin. Existing mod/loader, root envelopes, browser-entry CSS and Node-loadable renderer boundaries require the already-listed P3 changes and tests. No new dependency, entry point or package script is selected. | [entry](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/media/attention/hooks/register.js#L1-L42), [overlays](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/src/launch/sessionLaunch.ts#L1-L35), [phase write subsets](design_draft.md#detailed-implementation) |
| Native adapter and capability admission | Retain claude-code-2.1.317-c4-bash-1 and the preserved build-specific declaration/receipt mapping. This audit checks source consistency, not a fresh installed SDK or live build. Admit no real build before P4; remote/unknown builds remain unavailable for capture while native CLI launch continues. | [C4](capture-provenance-contract.md), [preserved declarations](evidence/c4-native-evidence.md), [P4 gate](design_draft.md#detailed-implementation) |
| Release checks and inherited fixes | P4 uses the existing odd-minor package:prerelease command at 0.13.0. #227/#228 remain part of the candidate and require packaged regression verification. The original #180 typing-stall report remains open. | [package commands](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/package.json#L37-L62), [feature route](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ff3720dc854ccd0dc464e4dc7d40fd8da46c19ce/CONTRIBUTING.md#L98-L103), PR #233, PR #234, #180 |

Comparing the 16 existing runtime/supporting Modify paths with ef5fd48 changes only README.md, docs/user-guide.md and test/unit/packageAssets.test.ts. The wider reused composer/capability code also changed through #227/#228 and was inspected at the specific target/launch boundaries above; it is not claimed byte-identical. [Baseline comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/221#issuecomment-6807170772), PR #233, PR #234.

### Exact vector transfer into later planned deliverables

The following target files are future implementation deliverables from the existing inventory, not files shipped by P0. Preserve every input/outcome body, ID and privacy predicate; exclude only the explicitly deferred Run eligibility assertions. These design vectors do not count as executed product tests. [Inventory](design_draft.md#detailed-implementation), [C4 v1 scope](capture-provenance-contract.md).

| Read-only input | Required phase transfer |
|---|---|
| [Capture vectors](evidence/capture-channel-cases.json): E01–E18, B01–B04, W01–W46, six boundary expectations, N01–N16, D01–D02, O01–O33, X01–X18 | P1: capture-cases.json, companionCapture/Capabilities/NativeMod tests and companionHarness; P3 may extend only capture-cases.json and companionHarness from that P1 set; put X01–X18 integration coverage in the already-listed P3 companionRuntime/activation/integration tests. The P1 capture/native/capability test files remain outside the P3 write subset. Test the actual prepare → factory → onExit path, not injected proof booleans. |
| [Native mapping vectors](evidence/c4-adapter-cases.json): C4-01–C4-32 | P1 transfers native normalization/continuation to capture-cases.json and NativeMod tests; P2 transfers source/provenance/literal outcomes to copy-cases.json and model/content tests; P3 verifies the resulting view projection. C4-20 stays unknown, executionConfirmed=false, executedCopyValue=null; pre-storage text and hidden path values remain excluded. |
| [Path vectors](evidence/path-copy-cases.json): P01–P29 | P2: copy-cases.json and companionContent tests preserve exact spans, candidates, one-click versus review actions and literal values. P3 uses those retained source targets for Copy/Review; P4 reads back the actual clipboard. |
| [View vectors](evidence/companion-view-cases.json): V01–V18, 15 status pairs, 32 C4 projections, G01–G06, root P01–P35, L01–L04, PB1–PB3 and H01–H18 | P3: companionProtocol/View/Runtime, provider/protocol/renderer/activation and companion integration tests. Exercise actual HTML/bootstrap, closed directional envelopes, atomic hydration, single-use reviews, action replay and retained Raw/native controls. P4 qualifies the packaged feature. |

### Editorial dispositions

N1 now names the existing path contract and 29 design vectors and requires their transfer to implementation tests and later qualification; general path recognition remains unproven. N2 removes exactly the four cited redundant clauses while retaining operative authorization, rendering, helper-placement, native-control and qualification boundaries. These are the two editorial actions in the [first clean review](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-exit-bootstrap/consolidated_review_report.md#traceability-and-open-editorial-actions). No new EGM round or runtime qualification is claimed.

## Decision 1: complete output source and recovery

The author selected **live capture only** after considering both sources below. Bounded CLI snapshot recovery is deferred; missed content must be shown as a gap with raw-terminal access. That source decision preceded the private-file selection and Technical Plan approval recorded in T. Both source options retain the subscription-backed interactive CLI, full explanation layout, native Escape and raw-terminal toggle. Neither requires an inference request, changed authentication or a replacement session. [L; T; B; O]

### Selected: live capture only

**Mechanism:** observe the same CLI's conversation/tool events and send allowed explanation text and tool metadata to the extension's session host. The host retains a bounded live model and sends a rendering projection to the companion. The independent PTY path continues feeding xterm. Recreating the webview can reuse what the live host still retains; this does not require re-reading a transcript or asking Claude for another answer. The experiment exercised event-based capture, not every production lifecycle case. [E; P; author-proposed mechanism]

**Trade-offs:** there is one content path to reconcile, with no snapshot-to-event matching. That avoids recovery-specific code, but it cannot supply explanation text from before capture started or restore content the host lost. Retaining the full explanation inside the active viewing window still requires source mapping, limits, failure handling and packaged verification; it is not a styling-only change. No delivery estimate is established. [R:M1, M4-M6; inference from E; author-proposed boundary]

**When it fails or falls short:** a missed event, late plugin attachment, lost host state, or eviction can leave a visible gap. The companion must say content is unavailable or incomplete and keep native access; it must not reconstruct a supposedly exact command from terminal wraps. Existing raw replay is not an unlimited rich-history guarantee. [R:M1, M4-M6; P; proposed failure contract]

**Qualification still needed:** nonblocking delivery, complete payloads, event identity/order, lifecycle gaps, source-to-Copy fidelity and host/platform compatibility. The earlier bounded success is not proof of these cases. [E; R:M1-M6]

### Deferred: live capture with bounded CLI snapshot recovery

**Mechanism:** use the same live path, plus the CLI's own session.messages read when starting/recovering the companion. Read an allowlisted message representation from that existing session, not arbitrary transcript files and not a new model turn. The extension would rebuild or reconcile its bounded reading window from the snapshot and live events. Exact ordering and reconciliation must be established before treating recovered items as authoritative. [S; author-proposed mechanism]

Recovery is conditional on a normally available CLI session and readable snapshot; this option does not promise that the existing PTY process survives an extension-host restart. Normal launch/resume behavior remains outside this copying-source choice. [B:Retained constraints; author-proposed boundary]

**Trade-offs:** this offers a candidate way to regain retained session content after attachment or host-state loss, at the cost of another read path, bounded snapshot processing and recovery/reconciliation rules. It does not create unlimited history: the reviewed API returns at most the newest 4,096 entries, and not every native progress/notice row is a conversation message. Recovery behavior has not been tested by the existing experiments. [S; D; R:M4, M6]

**When it fails or falls short:** an incomplete/compacted snapshot cannot recover missing content. Overlap with live events, identical messages or insufficient identity could duplicate, omit or misattribute items. The reviewed simple message shape does not provide an ordinary stable message handle; do not assume matching is solved. When a reliable recovery boundary cannot be established, show a gap and retain native access rather than silently joining uncertain content. Snapshot timing, compaction and reconciliation remain unverified, not observed bugs. [S; R:M1, M3-M4; proposed failure contract]

**Qualification still needed:** actual message/block contents, timing relative to events, identity and reset rules, compaction/resume behavior, payload limits, source fidelity and processing cost. This option would need separate qualification; choosing it does not itself authorize a new live experiment or prove compatibility. [S; B:Remaining formal-design work]

## Decision 2: live content transport

The author selected **A, the private file channel**, and approved the shared Technical Plan. The accepted rationale favors the existing ownership/cleanup pattern and complete source-backed copying; it is a design judgment, not evidence that files are inherently more reliable than HTTP. The comparison below remains as decision context. Both variants use a separate, versioned content protocol, session/generation binding, bounded delivery and host-owned rendering state. Neither reuses attention notifications as a content channel or treats the composer's current request/response schema as an output stream. The prior composer supplies lifecycle examples, not a completed companion transport. [T; C; P]

### Selected: A. Private file channel

**Mechanism:** create a private, extension-owned channel directory for each process generation. The mod asynchronously publishes bounded, sequenced content frames using temporary files and atomic publication; the host reads, validates and acknowledges them, then retires consumed files. A separate bounded producer queue keeps the observer from waiting for file I/O or a reader. Use CH’s explicit companion ownership.json/identity/flat-cleanup contract; the composer's private marker and pruning helpers remain source precedent, not a reusable API. [CH; A13] File-system access controls must be qualified on Windows; POSIX mode bits alone are not proof of private Windows access. [C; proposed mechanism and qualification]

**Trade-offs:** this follows a channel pattern already present in the active runtime and requires no listening network socket. It adds polling/file operations and transient content on disk, with byte/count limits, stale-channel ownership checks and crash cleanup. The current composer implementation does not establish the cost of streaming explanation content this way. [C; inference from C; R:M4, M6]

**Failure conditions:** permissions, file locks, disk limits or a missing reader can stop delivery. Saturation must produce an explicit capture gap, not block native processing or accumulate unbounded files. Failed cleanup must be reported without logging content; cleanup must never remove another live channel. [C; proposed failure contract]

### Not selected for v1: B. Authenticated loopback connection

**Mechanism:** the extension host owns an HTTP listener bound only to the local loopback interface on an ephemeral port. The mod's asynchronous publisher uses the CLI's HTTP API with a per-generation secret and sequence/acknowledgement protocol. The host validates the closed schema, size and target before accepting content. The webview receives only the host projection through VS Code messaging; it does not connect to the listener. The focused probe exercised localhost HTTP, but its disposable server is not a production transport. [E3; D2; proposed mechanism]

**Trade-offs:** no per-event transport files are needed. This adds a listener lifecycle, authentication, request limits and connection/backpressure handling. The CLI's managed fetch policy and the deployed host environment still require qualification; a successful local probe does not establish support in every organization or remote host. [E3; D2; R:M6; proposed boundary]

**Failure conditions:** denied local requests, connection loss, a retired token, a vanished host or queue saturation can stop delivery. Bound retries and retained bytes, reject stale generations, and show a gap when delivery cannot be established. Capture failure must leave native output and controls usable. [R:M4-M6; proposed failure contract]

The approval selects transport A; transport B is not an automatic fallback if files fail qualification. Any later transport change requires an explicit design decision. Neither transport adds CLI snapshot recovery, a new model service, command execution, or direct question/permission authority. The separate control-scope decision is resolved below. [T; L; B; A5]

## Decision 3: question and permission controls

**Selected: control Variant A, native handling for v1.** Questions and permissions remain owned by the same Claude CLI. The companion offers Respond in terminal when input-needed metadata is observed, while Raw access stays available independently of capture. Native foreground Escape remains the Stop route. The trade-off is switching views to respond; this prioritizes qualification of copying and full explanation context. [A5; B:Native interaction remains a real integration concern]

**Deferred: control Variant B, direct companion responses.** The earlier experiment supports specific direct question/Bash permission cases, but the private-file response wait and its helper were not qualified. The response broker, held hooks, helper process and B-only files are excluded from the v1 inventory. The [committed comparison](https://github.com/glitchwerks/vscode-claude-workspaces/blob/f761ebbd7805039517bcc29a5fa82c8684c83d84/docs/designs/215/design_draft.md#detailed-implementation) preserves that unselected proposal without making it implementation scope. Future inclusion requires a new scope decision. [A5; E3; B:Optional]

## Decision 4: Run in a dedicated native VS Code terminal

**Deferred from v1:** the author deferred Run after the C2 experiment. No Run/Run again UI, execution messages, controller, dedicated terminal or Run-only eligibility metadata is part of the active design. The earlier dedicated original-folder terminal decision is preserved in the [deferred amendment](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/run-amendment.md) for future reconsideration. [A10; C2E; A6]

**Preserved preference if execution is reconsidered:** the author previously selected one persistent dedicated shell per managed session generation, initially at the recorded core folder, carrying environment/cwd state. This is deferred context rather than a v1 component. Fresh-shell-per-Run and a weaker non-interruption guarantee remain unselected; future execution needs explicit authorization, a working admission design and fresh review. [A7; A10; C2E]

## Decision 5: native capture identity reset

**Selected:** fail closed on authenticated native UUID mismatch. Retire capture, invalidate Copy/review targets and show the identity-change pause with Raw access. Do not add host-authorized rebinding in v1; recover through a new matching managed launch. A same-UUID reset starts a fresh epoch and visible boundary. The recovery cost is a possible managed relaunch after an identity-changing /clear or resume. Capture retirement does not replace the managed process generation. Use the approved C4 mapping for native lifecycle evidence. [A8; A9; A10; design item 3; C4]

## Decision 6: rejected owned transaction

**Selected:** authenticated schema/content rejection retires the epoch instead of advancing past that sequence. The closed ack adds continue/retired disposition, unchanged last admitted ackSeq on retirement and a bounded reason. Mark loss without inventing its unknown extent, reject later old-epoch traffic, drop that old queue and require a fresh valid binding/epoch. Unauthenticated/foreign frames cannot advance the cursor or retire a valid epoch. This favors one explicit loss/recovery transition over an unspecified middle-frame repair; the cost is a capture gap and reconnection. [A8; design item 3; selected policy]

## Decision 7: Run source/shell eligibility

**Deferred with Run:** retain the earlier [declared-family matrix](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/run-amendment.md#run-eligibility-matrix) as future execution context only. V1 does not implement shell-family eligibility, profile matching, Run-again gating or requiredShellFamily/evidenceOrigin execution metadata. Copy source values and provenance remain independent of execution eligibility. [A10; A8]

## Decision 8: host-issued capture epochs

**Selected:** the host owns offer/epoch issuance through the [closed request/grant/activation exchange](capture-channel-contract.md). Keep the launch directory/token/managed tuple fixed within one generation; start seq=1/ack=0 only after a new grant is activated. Duplicate/obsolete traffic never resets or reopens a newer epoch. Bounded recovery and lost-host-state behavior are explicit. This is a design repair, not an existing composer capability or a qualified transport. [A11; CH]

## Decision 9: atomic companion projection and source-bound actions

**Selected:** use the [closed view dictionary](companion-view-contract.md) with host-issued view/projection/transfer/review IDs, snapshot/delta cuts, chunk validation and atomic commit. Bound catch-up, review expiry and action replay; keep one clipboard write latched through uncertain completion. No Run or direct native-response messages are added. [A11; VW]

## Decision 10: conservative deterministic prose-path spans

**Selected:** use the [path contract](path-copy-contract.md) and exact source-span vectors. Explicit code/quoted and isolated unquoted paths retain one-click Copy. Unquoted following prose, punctuation or spaced candidates use the full bounded Review candidate, without guessing away words or copying a truncated prefix. The cost is more Review actions for prose whose endpoint is not syntactically explicit. Full context and literal spellings remain intact. [A11; PC]

## Decision 11: exact capture data and launch binding

Select CH’s five literal environment keys, three outer data members and eight normalized C4 observation kinds, with complete chunk/byte/finalization/rejection rules. Keep producer data observational: labels are derived by the host after complete source validation, not supplied as execution authority. The existing capture/native-mod/model files absorb the contract; no new runtime module or SDK crypto API is introduced. [A12; CH]

The 42 serialized wire cases and four binding examples supplement E01–E18. A bounded counting/emission publisher avoids retaining a second escaped source history; 32 KiB metadata and a 30-second absolute/five-second no-progress assembly deadline make memory/lifetime finite within the existing queue/retention accounting. These are selected engineering limits requiring future qualification, not experiment measurements. [A12; CH]

## Decision 12: total C4 outcome projection

Add none and tool-error to the closed view status enum, plus required statusLabel from VW’s exact pair table. none/null avoids claiming a command outcome for ordinary explanation; tool-error preserves the supported error report without claiming execution or a numeric failure code. Unknown retains its selected labels. Requested Copy and effective executed Copy remain separately source-authorized; a status string alone grants neither. [A12; VW; C4]

All 32 native cases have projection assertions and C4-06/C4-11 have accepted/rejected group examples. The original native case bodies and earlier 18 view traces remain unchanged. The change adds no Run or direct-response wire kind. [A12; VW]

## Documentation prerequisite before P0

The runtime and documentation Git trees are separate. Complete the [exact documentation-only prerequisite](documentation-handoff.md) using the 13-file manifest and immutable SHA pinned in its Ready handoff record before P0. Historical reviews, concepts and deferred experiments are outside D0; the package cites them through immutable Git URLs. The package plus the 46 later phase paths has two overlaps, yielding 57 paths (41 Create / 16 existing Modify at the recorded runtime). This does not restore runtime code, select a new branch or authorize implementation. P0 Modify classifications apply only after that prerequisite; the manifest accounts for all overlay writes and the two later documentation overlaps. [A11; D0]

## Evidence-gate status

**C4 (closed as a design finding):** The read-only audit produced an [approved exact native adapter contract](capture-provenance-contract.md), [source evidence](evidence/c4-native-evidence.md) and [32 synthetic expectations](evidence/c4-adapter-cases.json). It separates requests, effective post-tool commands and stored output; errors/denials do not automatically become executed commands, and this Bash record has no numeric exit-code field. The author approved the mapping, closing C4's design gate; no live probe or adapter test was run. [A9] The source/case documents are P0 read inputs, not a new product dependency. [A8; design item 6; C4]

**C2 (deferred with Run):** the [native experiment](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/c2-experiment-results.md) reproduced partial-input loss and controlled event-delay interruption. The author instructed “Defer for now,” removing execution from v1 rather than claiming the failures were fixed. No Run admission gate remains for copying-only v1. Retain the evidence and revisit input ownership if execution returns to scope. Counts are 13 addressed / 1 deferred / 0 open v1 findings; fresh review remains required. [A10; C2E]

**Fresh-review resolution:** R1-R6 have selected textual repairs in [the resolution record](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-07-copying-v1/resolution/goldfish_review_report.md). C4-20 now expects Unknown/execution unconfirmed while retaining its privacy assertions. Six applied repairs are not proof of fresh review convergence or runtime tests. [A11; FX2]

**Corrected-design resolution:** the later 0-Blocker/2-Major/2-Nit re-review is historical; A1–A4 have accepted textual/fixture repairs recorded in [FX3](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-corrected-copying-v1/resolution/goldfish_review_report.md). No affected re-review or product qualification is claimed. [A12; FX3]

## Retained constraints

* Keep the full captured explanation visible; separate commands and place Copy beside paths. Do not trade the approved context requirement for a shorter extraction list. [B:Overview]
* Copy complete source values. Clear paths stay one-click; uncertain boundaries use the approved editable preview. A gap or partial payload cannot be presented as a complete target. [B:Goals vs. Non-Goals; R:M1-M4]
* Keep source-backed execution provenance distinct from assistant examples or uncertain suggestions. Neither event capture nor snapshots automatically prove intent. [B:Copyability and intent are different claims; R:M3]
* Keep native output/input, foreground Escape and the raw-terminal toggle independent of companion capture health. The separate control decision selects native question/permission handling and explicitly defers direct controls. [A5; B:Confirmed foundation; R:M5, M7]
* Limit capture to intended explanation/command content and relevant tool evidence, with explicit privacy and retention boundaries. Do not turn a message snapshot into permission to copy every internal payload into diagnostics or storage. The Detailed Implementation specifies file-protocol, rejection and storage limits; their implementation and qualification remain future work. [T; R:M1, M4, M6; design boundary]

## Evidence boundaries

The event option has controlled hands-on evidence in Claude Code 2.1.317 / Pro. The snapshot option is supported as an API candidate by the current documentation and that build's generated declaration contract, but has not received a live recovery experiment. This distinction is evidence, not a ranking of the choices. The API reference itself directs authors to installed-build declarations when public types differ. [E; S; D]

The active prerelease source was rechecked on 2026-11-06 and remains ef5fd48f4b676881a8730afbf8e583e70565ca11. It already loads an extension mod but keeps attention metadata-only. A new content path must remain separate from that metadata publisher; it must not imply the current composer protocol already supports output capture. [S; P]

## Sources

* **B:** [Finalized concepts brief](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/concepts_brief.md), approved in A. Named B sections identify its accepted goals and still-open technical work.
* **A:** [Concept approval and egm-draft authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864).
* **O:** [Overview & Goals section approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793).
* **L:** [Author selection of live capture only](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861).
* **T:** [Author selection of private file transport, Technical Plan approval and transition to Alternatives Considered](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191).
* **A4:** [Author approval of Alternatives Considered and authorization for Detailed Implementation](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701274240).
* **A5:** [Author selection of native control Variant A and resolution of the Detailed Implementation gate](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545).
* **A6:** [Run amendment and dedicated/original-core-folder destination](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707126769), with [the Run contract and selected persistent lifecycle](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/run-amendment.md).
* **A7:** [Author selection of the same persistent shell for Run](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909).
* **C2E:** [Native Run experiment and observed admission failures](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/c2-experiment-results.md).
* **C4:** [Approved source mapping](capture-provenance-contract.md), [preserved evidence](evidence/c4-native-evidence.md) and [synthetic cases](evidence/c4-adapter-cases.json); design approval and runtime qualification remain distinct. [A9]
* **A12:** [Four-finding auto accept](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972512).
* **FX3:** [Applied A1–A4 resolution](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-corrected-copying-v1/resolution/goldfish_review_report.md).
* **A11:** [Auto-accept of all six fresh-review corrections](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465).
* **A14:** [Author instruction to fix both integration Majors](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6725620301).
* **FX5:** [Applied integration corrections](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-ownership-envelope/resolution/goldfish_review_report.md).
* **A13:** [Auto-accept of all six wire/outcome findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6724605631).
* **FX4:** [Applied F1–F6 corrections](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-wire-outcomes/resolution/goldfish_review_report.md).
* **FX2:** [Applied R1-R6 resolution](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-07-copying-v1/resolution/goldfish_review_report.md).
* **CH:** [Capture epoch handshake](capture-channel-contract.md).
* **VW:** [Projection/review/action messages](companion-view-contract.md).
* **PC:** [Exact path candidates and values](path-copy-contract.md).
* **D0:** [Immutable documentation handoff](documentation-handoff.md).
* **A10:** [Author deferral of Run from v1](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).
* **A9:** [Author approval of the C4 source contract](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6711102784).
* **A8:** [Auto accept of all annotated correction proposals](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6709462362).
* **R:** [Goldfish report](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/goldfish_review_report.md), [committed review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md). Findings M1-M7 distinguish risks from observed defects.
* **E:** [Bounded event-based copying experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033), with [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).
* **S:** [2026-11-06 read-only source research: live events and session.messages declarations](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630). This preserves the inspected 2.1.317 interface limits and distinguishes the untested recovery path from observed behavior.
* **P:** [Committed mod and metadata-only attention boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L35).
* **C:** [Existing composer file-channel ownership and launch binding](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L32-L105), [marked dead-channel cleanup](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L113-L134) and [bounded request/response transport](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L142-L199). This is source precedent, not evidence that an output channel exists.
* **E3:** [Focused-control findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988) and [preserved probe source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596), Claude Code 2.1.317 / Pro; the source contains the localhost HTTP bridge used by that experiment.
* **D:** [Official mods reference](https://code.claude.com/docs/en/plugins/mods/reference) and [event continuation documentation](https://code.claude.com/docs/en/plugins/mods/events) (fetched 2026-11-06).
* **D2:** [Official mods API namespaces](https://code.claude.com/docs/en/plugins/mods/api) (fetched 2026-11-06). Installed-build declarations and packaged behavior still need qualification for the chosen transport.

## Current contract corrections

The accepted six-finding repair recognizes native deny:string without publishing its reason, selects the closed type=companion/payload root wrapper, and pins the separate companion ownership marker and conservative dead-host cleanup rules. The exact behavior is in [CH](capture-channel-contract.md) and [VW](companion-view-contract.md); no new runtime path, transport, native control or Run scope is added. Historical source comparisons and native fixture bodies remain unchanged. This is design resolution, not a fresh-review or qualification result. [A13; FX4]

The subsequent integration correction selects a factory-bound onExit observer using the frozen prepared-spec owner, with original PTY/error identity and conservative bounded shutdown, and a host HTML viewId field paired with the existing browser UUID. Ready/bind echo the document UUID; same-HTML reload renews the host lease. These decisions are specified in [CH](capture-channel-contract.md#managed-process-exit-bridge) and [VW](companion-view-contract.md#host-html-bootstrap-and-document-registration), within the existing runtime write inventory. They do not introduce Run, a process controller or another transport. [A14; FX5]

* **A15:** [Author-approved implementation/history separation and current source handoff](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).
* **RV:** [First clean static review of the preceding source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-exit-bootstrap/consolidated_review_report.md); its two editorial Nits are addressed in the P0 reconciliation above; no subsequent EGM convergence or runtime qualification is claimed.
