# Initial Zoom Out — complete responses

Stage 5 completed both requested fresh-context reviewers against frozen eb11873050cbcc09ece0ea3c32de1f4d39c4a345, full lines 1–408. **0 Blockers / 0 Majors / 0 Nits.** No target fixes or runtime qualification were performed. This stage does not establish Detailed Implementation readiness.

[Context and source manifest](context_manifest.md), [portable source catalog](review-context.json), [archived personas/standards/workflows/license](review_tools.json). Complete reviewer responses follow. Transient tool/materialization locators in receipts are provenance identifiers, not runtime dependencies.

# Stage 5 Initial Zoom Out — Skeptical Architect

Mode: REVIEW. Native persona: egm-zoom-out. Review status: COMPLETED.

Target: docs/designs/215/design_draft.md, full lines 1–408, frozen commit eb11873050cbcc09ece0ea3c32de1f4d39c4a345, Git blob 0749048ce0e46a2b23d98d0b46b6d40c511c613a. Runtime comparisons use ef5fd48f4b676881a8730afbf8e583e70565ca11, not this checkout's older runtime.

## Result and findings

**0 Blockers, 0 Majors, 0 Nits.** No S5-Z finding IDs are issued. There is no observed architectural discrepancy requiring a finding at this persona's altitude. This is a completed high-altitude design review; it is not implementation readiness approval, a source-field audit, a product test pass or packaged qualification.

The reviewed design contains enough context to identify the root problem: copying complete commands and literal prose/inline paths while preserving Claude's explanation. The active architecture addresses that problem with one subscription-backed CLI, its existing native PTY/xterm, an observational live content path, an extension-owned bounded source model and an output view. The selected private-file transport is retained. Native questions/permissions, Raw access and Escape stay with the existing input owner. Run, Run again, C2 admission and direct companion responses remain deferred. These conclusions come from the target and actual linked contract/decision bodies, not approval or prior repair counts. [design_draft.md:L14–L49, L55–L109, L178–L182, L315–L326; concepts_brief.md:L15–L49; decision bodies P/F/L/T/A5/A10 below]

## Assessment at the native persona's altitude

### Context and root problem — passes

The problem and goals describe the original selection friction, required full context, clear versus uncertain path behavior and provenance. They do not substitute an extracted list for the explanation or mistake generic command appearance for execution evidence. The accepted concept's full-context and copying requirements remain present. The project root describes an existing embedded Claude/session-management product; augmenting that panel while keeping the same CLI fits that existing purpose. [design_draft.md:L20–L39, L83–L101; concepts_brief.md:L17–L31, L39–L49; pinned README.md:L3–L17, L62–L84]

### Simplicity and feature scope — passes

The design does not add a second inference session, a separate API backend, a durable conversation product, snapshot reconciliation, filesystem resolution or an intent-classification service. Its explicit gaps make live-only capture's limitation visible. It also avoids implementing the previously broader Run and direct-response interfaces in anticipation of later work. The private-file/HTTP comparison records file-channel costs without adding an automatic second transport. No proposed queue, retention limit or timer is represented as measured performance. These are bounded failure contracts for this selected content path, rather than a caching/sharding/background-service optimization proposal. [design_draft.md:L41–L49, L71–L81, L124–L130, L146–L176, L261–L274, L315–L332; technical_choices.md:L10–L56, L58–L104; CH:L4, L9–L13; VW:L4, L87–L111]

### Ownership, component placement and extensibility — passes

The host owns validated source and immutable Copy targets; the view addresses those targets instead of becoming a source or execution authority. Content does not enter metadata-only attention, and capture failure does not replace the native input path. Capture ownership/epoch and renderer/projection identities are separate because they govern separate lifetimes. The current CH ownership contract refuses to reconstruct authority from leftover files and distinguishes native session transitions from managed-process exit. VW supplies a native Raw/Escape binding even if capture or hydration is unavailable. Those boundaries keep the copying feature from acquiring terminal execution or native response ownership. [design_draft.md:L57–L81, L95–L109, L117–L124, L243–L259, L289–L293, L318–L326; CH:L9–L42, L61–L82; VW:L9–L25, L87, L95–L111]

### Reuse — checked against actual pinned code

I performed read-only code searches against the pinned runtime and inspected the relevant candidate bodies. I found no ready equivalent for the new source-mapped output model/extractor or observational streaming contract in the searched src/ and media/ scope. This is a scoped search conclusion, not proof that no future extraction could share a primitive.

| Candidate actually inspected | Reuse conclusion |
|---|---|
| src/panel/webview/composer/markdownPreview.ts:L1–L25 | Already uses markdown-it, disables raw HTML, restricts links and replaces images. The design explicitly reuses the library/safety conventions. Its string-to-HTML preview does not provide source-bound output actions, so a companion extraction/render layer is not an equivalent replacement of an existing ready component. [design_draft.md:L87, L101, L276, L313] |
| src/panel/webview/composer/references.ts:L1–L55 | Existing @/slash reference tokenization deliberately skips code/fences and has a different lexical contract. Reusing it as the required inline/prose path detector would miss the design's core paths. The design correctly declines that reuse. [design_draft.md:L87, L313; PC:L5–L21] |
| src/composer/claudeComposerAdapter.ts:L33–L199 and composerBroker.ts:L14–L30 | Existing channel ownership and serialized request/response transport are concrete precedent, but are coupled to submit/catalog/readDraft/clearDraft and private composer pruning. They are not an observational output stream with the selected companion ownership/epoch rules. Reusing their lifecycle pattern while keeping a separate content protocol is justified; introducing a general transport abstraction now would itself be speculative. [design_draft.md:L118, L186–L201; technical_choices.md:L38–L46; CH:L15–L42] |
| src/attention/attentionChannel.ts:L17–L187; media/attention/hooks/register.js:L4–L40, L96–L134 | Existing attention routing owns notification/metadata concerns. It does not implement the new capture contract, and its channel marker/lifecycle differ. The design preserves that ownership and extends the existing packaged mod entry through capabilities rather than sending explanation content through attention. [design_draft.md:L73, L186, L245–L247, L322; CH:L17–L42] |
| src/composer/composerRuntime.ts:L16–L110, L191–L229; src/launch/sessionLaunch.ts:L1–L86 | The read-only target tuple and generation lifecycle exist independently of the composer's canSubmit result. The proposal reuses those ownership/launch conventions while keeping Copy independent of composer submission availability. [design_draft.md:L122, L194, L203–L204, L243; C4:L12–L16] |
| src/panel/webview/xtermTerminal.ts:L81–L135; sessionPanelProvider.ts:L615–L684; sessionManager.ts:L340–L379; renderer.ts:L380–L487 | Existing xterm write/focus/input and PTY replay/input ownership are available. The plan retains these components; it does not build another native terminal or claim that replay is a semantic command source. [design_draft.md:L57–L81, L105–L109, L206–L209, L318] |
| src/panel/protocol.ts:L1–L118 | Existing root messages use type discrimination. Current VW adds one type=companion/payload envelope and preserves legacy dispatch, which fits this boundary rather than inventing a parallel root protocol. [design_draft.md:L205, L289; VW:L17–L27] |

Searches used git ls-tree and git grep at ef5fd48f4b676881a8730afbf8e583e70565ca11, scoped to src/ and media/. The inspected search expressions covered sourceRevision/observationChunk/markdown-it/writeText/ownership; channel/transport declarations; parse-path/extract-command-or-path/Companion/sourceSpan; and targetFor/onDidChangeSessions/overlayComposerEnvironment. I followed relevant search results into the bodies listed above. A preliminary unpinned grep ran against this older checkout and is excluded from all runtime conclusions; the corresponding searches were rerun against the pin.

### Altitude — passes

Technical Plan describes components, data flow, authority and failure boundaries. Detailed Implementation carries exact file placement, budgets, wire boundaries and qualification tasks in an explicitly implementation-oriented section and its linked contracts. I do not treat the existence of those execution contracts as a new speculative feature or manufacture a low-level helper/loop finding. No concrete new helper implementation or detailed pseudocode in the high-level architecture displaces the root problem. [design_draft.md:L51–L130, L178–L332]

## Inferred risks and evidence limits — not new findings

The private-file stream, renderer/source mapping, conservative prose recognition, Windows privacy/cleanup behavior and native capability admission still require implementation and packaged qualification. These are prospective risks, not failures observed in this review. The target explicitly makes those tests future gates, refuses to count Raw fallback as successful Copy and leaves unqualified builds capture-unavailable. Therefore their unmeasured status does not establish a missing high-altitude architecture decision. This review does not independently validate the exact native declaration mapping, every wire/vector permutation or numeric feasibility of the chosen budgets. [design_draft.md:L28, L126–L130, L243–L274, L328–L332, L357; CH:L32–L42, L137–L157; VW:L13–L15, L149; C4:L87–L93]

## Complete-read receipts

Measured directly from the bytes read in this review; hashes are SHA-256. Persona was read first in full, then the full standard, then the target. The target was emitted in bounded line ranges after an initially oversized combined output; every target line 1–408 was actually read. The final re-read retained the same target receipt, with 408 CRLFs and zero bare LFs. Read-only git rev-parse confirmed the frozen target blob.

| Complete input | Actual extent | Bytes | SHA-256 |
|---|---:|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/zoom_out.md | L1–L74 | 4977 | 1b164f669c7bc74ea778fa505f9fc29ef5a3a4f251c4ff0c8ad27f3f109302d1 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md | L1–L60 | 2944 | 5ca59c1666659c2d5c3a74bd9cc53a358385080ec916b65235c6687f02bdd105 |
| docs/designs/215/design_draft.md | L1–L408 | 89549 | 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be |

## Actual source-body extents

Paths in this section are rooted at C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces unless stated otherwise. The GoldfishContext JSON at .tmp/215-ownership-envelope-review-20261108/review-context.json was parsed as a discovery index; its metadata, prior review counts, repair status and author approvals were not used as correctness proof.

Current local bodies read:

- docs/designs/215/concepts_brief.md:L1–L93, complete (15005 bytes, SHA-256 707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5).
- docs/designs/215/technical_choices.md:L1–L171, complete (27298 bytes, SHA-256 215f8fe5f1d80c4b0c3563b14cd3d1d1d9999ad582f348bd93b15dbd2cdb8e06).
- docs/designs/215/capture-channel-contract.md:L1–L177, complete (36795 bytes, SHA-256 bfa48b5f4bdab607ef610b09a5c7901f5f0c00ff58a5e4e5eeaa5908a5ed8259).
- docs/designs/215/companion-view-contract.md:L1–L156, complete (28409 bytes, SHA-256 f1fba888940ca92d36350336d0d3d2260d81d0600227f9edd89082b16ed20e2b).
- docs/designs/215/path-copy-contract.md:L1–L75, complete (8153 bytes, SHA-256 a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc).
- docs/designs/215/capture-provenance-contract.md:L1–L93, complete (20616 bytes, SHA-256 d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922).

Decision bodies read completely from the index's materializations in .tmp/215-ownership-envelope-review-20261108/:

- comment-6684329277.txt:L1–L9 — P, clear/uncertain paths: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277
- comment-6684608334.txt:L1–L12 — F, full explanation/layout: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334
- comment-6700896861.txt:L1–L11 — L, live-only/gaps: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861
- comment-6701115191.txt:L1–L13 — T, private file choice: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191
- comment-6706751545.txt:L1–L13 — A5, native Variant A: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545
- comment-6715993295.txt:L1–L9 — A10, Run deferral: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295

Pinned runtime source-body reads (all ef5fd48f4b676881a8730afbf8e583e70565ca11):

| Source | Actual inspected extent | Access |
|---|---|---|
| README.md | L1–L117, complete | read-only git show |
| src/composer/claudeComposerAdapter.ts | L1–L199, complete | read-only git show |
| src/attention/attentionChannel.ts | L1–L187, complete | read-only git show |
| src/composer/composerBroker.ts | L1–L68 | read-only git show |
| src/composer/composerRuntime.ts | L1–L110 and L191–L229 | repo-10.txt |
| media/attention/hooks/register.js | L1–L134, complete | repo-20.txt |
| src/panel/webview/composer/markdownPreview.ts | L1–L25, complete | repo-23.txt |
| src/panel/webview/composer/references.ts | L1–L55, complete | repo-24.txt |
| src/launch/sessionLaunch.ts | L1–L86, complete | repo-12.txt |
| src/panel/webview/xtermTerminal.ts | L81–L135 | repo-21.txt |
| src/panel/sessionPanelProvider.ts | L615–L684 | repo-22.txt |
| src/sessions/sessionManager.ts | L340–L379 | repo-25.txt |
| src/panel/webview/renderer.ts | L380–L487 | repo-26.txt |
| src/panel/protocol.ts | L1–L118 | repo-13.txt |

The current CH/VW/PC/C4 bodies govern the design assessment; historical draft/review snapshots do not override them. Linked fixture arrays, old repair reports, native receipt archives and the documentation overlay were not exhaustively audited at this Stage 5 altitude. No conclusion here treats their index entries or their reported counts as a verified test outcome.

## Execution status and exclusions

Completed: full native persona and standard read; full frozen target read; GoldfishContext parsing; current linked architectural contract and selected decision-body reads; pinned code searches and candidate-body reuse comparison; final target byte/hash and frozen blob checks; this report.

Not run, by instruction: target fixes; product implementation; compiler/build/test/package commands; native/Claude/model calls; clipboard read/write probes; ACL/reparse probes; a live transport or renderer experiment; a new web retrieval or GitHub mutation. No parent transcript, conversation history or memory was retrieved. Host instruction-file exclusion was not independently verified.

Git Bash was denied before any file body was returned. Node read-only filesystem operations and direct read-only git calls supplied the required reads instead; this caused no remaining source-read gap. The inherited dispatch SKILL.md was absent at its listed local directory; the parent explicitly directed continuation of this delegated native review with Node reads and no nested delegation. No runtime probe or new task issue was created.

Sole writable artifact: .tmp/215-ownership-envelope-review-20261108/s5-zoom.md. No target, product file or other agent's report was changed. Report encoding: UTF-8, CRLF, one final newline.

Completion: Stage 5 native Zoom Out REVIEW completed; 0 Blockers / 0 Majors / 0 Nits. No new architectural action is requested by this lens; other EGM lenses and eventual product qualification retain their own gates.


---

# Stage 5 — Initial Zoom Out — Inventive Catalyst

Mode: REVIEW. Reviewer: native EGM Inventive Catalyst (`inventive_catalyst.md`). Date: 2026-11-08.

## Result

**No false compromise detected.**

The current design already separates native interaction from observational capture, literal copying from command-intent claims, and full explanation presentation from unlimited history. It declares the operational liabilities of its selected transport, conservative recognition and fail-closed recovery policies. I found no high-altitude contradiction requiring an additional inventive transform.

Findings: **0 Major, 0 Nit**. No finding severity was downgraded or consolidated. There is no affected-scope/discrepancy entry and no `S5-I-*` finding ID to assign. This is the Inventive Catalyst result, not a declaration that the implementation, every detailed contract or the package is qualified.

## Scope and architectural rationale

The objective is sufficiently stated: preserve the full captured explanation while making complete commands and prose/inline paths convenient to copy in the same subscription-backed interactive CLI. The pinned runtime README describes an embedded-terminal, workspace/session-oriented extension; this design extends that surface without replacing its native process/session ownership. Current selected scope controls: live capture, private files, copying-only, native Variant A, Escape and Raw. Run, Run again, C2 and direct companion answers/permissions remain deferred. The accepted intake's historical Run note does not override the later explicit deferral.

These are review conclusions from the specified documents and source bodies, not observed behavior of the proposed companion:

| Audit vector / scope | Current structural answer | Liabilities acknowledged by the design | Canonical basis |
|---|---|---|---|
| Copy convenience versus preserving explanation | Host-owned immutable source values and source-mapped actions sit inside the full reading stream. Copy targets are not reconstructed from DOM text or terminal wraps. This addresses selection friction without deleting explanatory context. | A separate bounded source model, source mapping, target invalidation and a renderer must be maintained and qualified. | `docs/designs/215/design_draft.md:L55-L101,L276-L293,L313`; current path/view contracts. |
| Better presentation versus unchanged native interaction | The PTY/xterm remains the native owner; capture observers enqueue without waiting for transport. Native Raw/Escape authority is independent of capture admission and projection transfer. The design therefore does not accept blocking native work as the cost of rich copying. | Maintaining two presentation paths requires lifecycle/focus/toggle checks. Variant A retains switching friction. Native Escape reports input sent, not universal background-process termination. | `docs/designs/215/design_draft.md:L57-L81,L103-L109,L318-L326`; `companion-view-contract.md`, Host binding / atomic hydration / action lifetime; pinned runtime input/hydration bodies below. |
| Fast literal Copy versus uncertain path/command interpretation | Explicit code/quote boundaries retain one-click path Copy; uncertain prose uses an editable literal candidate. Conservative command labels and the C4 evidence table separate readable examples, requests and confirmed effective commands. Copy does not require an added inference service, filesystem resolution or command execution. | More prose candidates require Review; supported recognition is deliberately limited. The full current PC vectors preserve clear-path controls and document the uncertain cases. | `docs/designs/215/design_draft.md:L168-L172,L276-L311`; full current PC and C4; P01-P29 and selected C4 bodies. |
| Complete source values versus finite memory/delivery | Whole bounded groups and atomic observations/projections, explicit gaps, stale-target rejection and Raw access replace silent truncation. Finite capacity and unavailable source are real bounds; the design does not promise that extra queueing or a helper can recover unobserved information. | Oversized blocks, eviction and failed capture can make copying unavailable. The proposed limits and latency gate need measurements. Raw fallback is explicitly insufficient to pass Copy qualification. | `docs/designs/215/design_draft.md:L71-L81,L261-L274,L328-L332`; full CH/VW. |
| File reuse versus new transport ownership | The existing composer provides a channel precedent, public target tuple and composition boundary. CH defines separate content-channel ownership and does not import private composer pruning/marker helpers. Host Node promotion covers the recorded mod-fs rename limitation without adding a publisher process. | Polling, disk content, ACL/reparse and locking qualification, strict cleanup, capacity refusal and loss/recovery remain explicit costs. Files are a selected integration judgment, not asserted inherently superior to HTTP. | `docs/designs/215/design_draft.md:L146-L156,L184-L208,L243-L259`; `technical_choices.md` Decisions 2, 5, 6, 8; CH authority/ownership sections; full pinned adapter source. |
| Failure handling versus native availability | Epoch retirement, bounded recovery, discarded incomplete assembly, explicit loss and source/action invalidation are active mitigation. Cleanup distinguishes consumed transactions from deleting the channel and does not infer process death from native session transition or heartbeat. | Fail-closed UUID changes or lost host authority can require managed relaunch; uncertain/live/foreign channels may be retained and consume capacity. These are stated trade-offs rather than hidden or supposedly unavoidable performance laws. | `docs/designs/215/design_draft.md:L247-L259`; `capture-channel-contract.md:L7-L82,L149-L157`; exact E01-E18 and O01-O33 bodies. |

No new pattern is recommended. In particular, the evidence supplies no proven architectural bottleneck justifying an additional queue, service, helper process, second CLI, snapshot-recovery path or transport change. This result does not infer that any unselected alternative is infeasible. It assesses the current separation of responsibilities and explicit trade-offs within the selected scope.

## Canonical sources supporting the conclusion

The target's frozen Git object is `eb11873050cbcc09ece0ea3c32de1f4d39c4a345:docs/designs/215/design_draft.md`, blob `0749048ce0e46a2b23d98d0b46b6d40c511c613a` (independently resolved using read-only `git rev-parse`). Source citations to the target above refer to the fully read, hash-matched CRLF working copy.

Current linked contracts read in full take precedence over dated comparisons or approval reports: [CH](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/capture-channel-contract.md), [VW](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/companion-view-contract.md), [PC](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/path-copy-contract.md), [C4](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/capture-provenance-contract.md), and [technical choices](https://github.com/glitchwerks/vscode-claude-workspaces/blob/eb11873050cbcc09ece0ea3c32de1f4d39c4a345/docs/designs/215/technical_choices.md). Local read/hash extents are recorded below; hyperlinks identify the source family, not a claim that link existence proves correctness.

The actual selected-decision comment bodies were read for context, not used as proof of feasibility: [path uncertainty](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277), [full explanation](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334), [live capture](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861), [private files](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191), [native Variant A](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545), and [Run deferral](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).

Reuse conclusions come from source, not from those approval/index claims: [runtime README](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/README.md), [composer target/lifecycle API](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts), [composer adapter](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts), [mod entry](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js), [safe Markdown preview](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts), and [reference parser](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts). The renderer preview lacks source mapping and the reference parser skips inline code; the design correctly treats them as bounded precedents rather than a ready-made output/path implementation.

## Actual status and read receipts

Completed: native-persona Stage 5 REVIEW against the full frozen target, the full Zoom Out Standard, current linked architectural contracts and the source extents below. No target repair occurred. The sole written artifact is this report.

Not run: implementation, compiler, build, unit/integration tests, package checks, static correctness checks, native/Claude/model probes, clipboard reads/writes, ACL/reparse/liveness probes, Git/GitHub mutation, dependency changes or publishing. Reading synthetic vectors is not running them. Reading the preserved native declaration/receipt projection is not inspecting the current installed binary or establishing current runtime compatibility. No parent transcript, history or memory was retrieved. Instruction-file exclusion at the host level remains unverified.

The initial two Bash read attempts were denied before returning content. PowerShell then returned the complete persona/standard and source bodies with exit 0, despite a nonfatal InitializeDefaultDrives diagnostic. One oversized combined target/index response was truncated; the target was reread in separately bounded line ranges until all lines 1-408 were visible. Index parsing is recorded separately and never counted as a full linked-source read.

### Mandatory full-input byte/hash receipts

Byte counts and SHA-256 values were measured directly from file bytes with `ReadAllBytes` / `Get-FileHash`; line counts came from `ReadAllLines`.

| Input | Completed read extent | Bytes | SHA-256 |
|---|---|---:|---|
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/inventive_catalyst.md` | Full, L1-L101 | 7456 | `fb64555a61aaeb0469c148d01a26493972c93093c0ed92acfc2dba6b3de1f19f` |
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md` | Full, L1-L60 | 2944 | `5ca59c1666659c2d5c3a74bd9cc53a358385080ec916b65235c6687f02bdd105` |
| `docs/designs/215/design_draft.md` | Full, L1-L408; bounded rereads cover L1-L130, L121-L215, L216-L300, L301-L408 | 89549 | `2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be` |

The target measured hash exactly matches the caller's CRLF freeze receipt. This is an input-identity check, not a product-correctness check.

### Current linked source bodies and measured identities

Paths in this table are relative to `docs/designs/215/`. A full-file hash for a partially read JSON fixture identifies its container; it does not mean every entry was inspected.

| Body | Actual read extent | File bytes | Measured full-file SHA-256 |
|---|---|---:|---|
| `concepts_brief.md` | Full current L1-L93; also full accepted intake snapshot at 3b096d8, L1-L86 | 15005 | `707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5` |
| `technical_choices.md` | Full L1-L171 | 27298 | `215f8fe5f1d80c4b0c3563b14cd3d1d1d9999ad582f348bd93b15dbd2cdb8e06` |
| `capture-channel-contract.md` | Full L1-L177 | 36795 | `bfa48b5f4bdab607ef610b09a5c7901f5f0c00ff58a5e4e5eeaa5908a5ed8259` |
| `companion-view-contract.md` | Full L1-L156 | 28409 | `f1fba888940ca92d36350336d0d3d2260d81d0600227f9edd89082b16ed20e2b` |
| `capture-provenance-contract.md` | Full L1-L93 | 20616 | `d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922` |
| `path-copy-contract.md` | Full L1-L75 | 8153 | `a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc` |
| `evidence/c4-native-evidence.md` | Full L1-L408, including archived declaration shapes and selected historical receipt fields | 14940 | `80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029` |
| `evidence/path-copy-cases.json` | Full L1-L387, P01-P29 | 8909 | `f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc` |
| `evidence/capture-channel-cases.json` | Parsed container/top-level inventory; actual complete E01-E18 bodies, ownershipPolicy, O01-O33 bodies read. Other wire/binding/native-return/deny entries not independently read. | 158267 | `7c03cb2bf755315e1810b85e6f68f988015e0c5b94e825bba4a9a475d5ed4e76` |
| `evidence/companion-view-cases.json` | Parsed container/top-level inventory; actual complete V01-V18 bodies read. Other projection/group/root examples not independently read. | 60402 | `c4c6602593036e3423121316de0cbafcf3a89c44d16d09b507609a198bb8ff9c` |
| `evidence/c4-adapter-cases.json` | Parsed container/top-level inventory; complete expanded C4-06, C4-08, C4-20 and C4-26 native-event/expected bodies read. Other 28 cases not independently read. | 97827 | `942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20` |

### Pinned runtime source reads

All runtime references below use **ef5fd48f4b676881a8730afbf8e583e70565ca11**, not this docs checkout's older runtime. Files numbered repo-* are supplied materializations mapped by the parsed index; their actual bodies were opened. Git object reads for the two additional reuse sources were read-only.

| Runtime body | Actual completed extent |
|---|---|
| `README.md` | Full Git blob `9523d7c14b4f5f1f284355d62c72482403b042aa`, 4599 bytes (`git cat-file -s`) |
| `src/composer/claudeComposerAdapter.ts` | Full Git blob `711c0cfa2ec73d2bd224a198822dd7cdbc739c76`, 10477 bytes (`git cat-file -s`) |
| `src/composer/composerRuntime.ts` | Full L1-L229, materialization repo-10 |
| `src/launch/sessionLaunch.ts` | Full L1-L86, repo-12 |
| `media/attention/hooks/register.js` | Full L1-L134, repo-20 |
| `src/panel/webview/xtermTerminal.ts` | Full L1-L228, repo-21 |
| `src/panel/webview/composer/markdownPreview.ts` | Full L1-L25, repo-23 |
| `src/panel/webview/composer/references.ts` | Full L1-L55, repo-24 |
| `src/extension.ts` | L436-L470 only, repo-11: composition and dependency injection |
| `src/panel/sessionPanelProvider.ts` | L615-L681 only, repo-22: hydration and live PTY replay/output |
| `src/sessions/sessionManager.ts` | L340-L378 only, repo-25: native write/starting-buffer distinction and resize |
| `src/panel/webview/renderer.ts` | L380-L487 only, repo-26: same-session terminal/input/focus boundary |

### Supplied external/history body reads and limitations

Full supplied comment bodies read: 6684329277 (9 lines), 6684608334 (12), 6700896861 (11), 6701115191 (13), 6706751545 (13), 6715993295 (9), 6701284701 (16), 6685055630 (21), 6646355033 (47), and 6647481988 (51), all under issue #215. The latter two are historical experiment reports; the native evidence archive's selected receipt projection was also read in full. Their complete compressed source/receipt bundles were **not** independently decoded or rerun. No fresh external retrieval or installed-declaration inspection occurred.

The GoldfishContext index was parsed for its target, scope, local links, source inventory, baseline and policy. The remaining indexed sources, older review reports, the deferred Run/C2 documents, implementation manifest/handoff, unrelated runtime/tests/build files, official plugin-reference materialization and unselected fixture entries were not read in full. They are not prerequisites for the present high-altitude no-transform result, and no statement here certifies their detailed consistency or execution readiness.

This conclusion is an architectural inference from the inspected material. The proposed observer/transport/renderer is still unimplemented and unqualified; no new runtime observation was made in this review.
