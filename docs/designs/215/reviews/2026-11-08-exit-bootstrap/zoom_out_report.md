# Initial Zoom Out — complete responses

Stage 5 completed both fresh-context reviewers against frozen 46219dfd8c23998ff476092d064cfd95a6d8710d, full L1–L414. **0 Blockers / 0 Majors / 0 Nits.** This stage is not an implementation-readiness or product-qualification verdict. No target corrections were applied.

[Context/source manifest](context_manifest.md), [portable source catalog](review-context.json), [archived personas/standards/workflow/license](review_tools.json). Complete responses follow; transient tool/cache locators in receipts are provenance, not runtime dependencies.

# Stage 5 Initial Zoom Out — Skeptical Architect

**Mode:** REVIEW. **Status:** completed. **Findings:** 0 Blockers, 0 Majors, 0 Nits.

Target: docs/designs/215/design_draft.md, all L1–414, frozen commit 46219dfd8c23998ff476092d064cfd95a6d8710d. This is an independent architecture/feature-altitude review under the native zoom_out persona and Zoom-Out Standard. Zero findings is this lens’s result, not implementation readiness or product qualification.

## Findings

No S5-Z finding IDs are issued. I found no actionable context, root-problem, YAGNI, reuse, abstraction-boundary or architectural-dead-end discrepancy in the selected design after reading the current contracts and searching the pinned runtime. I did not infer correctness from prior approval, repair status, fixture counts or reported static checks.

## Architecture assessment

| Native review vector | Assessment and actual basis |
|---|---|
| Context sufficiency / root problem | The draft explicitly identifies complete-command selection and path-only copying, retains the full explanation, and distinguishes literal copying from intent/execution claims (draft L12–49). This matches the current brief L15–49 and the project’s session-oriented CLI panel in runtime README.md L1–18, L54–84. There is enough context to review without a context-failure finding. |
| Simplicity / current scope | The observer → private channel → bounded host model → view projection supports present requirements: canonical source values, complete explanation context, immutable Copy targets and independent native access (draft L55–124). No replacement inference backend, second CLI, snapshot reconciliation, durable history, Run controller or native response broker is active (draft L41–49, L152–176, L180–182, L319–330). The explicit Variant A/Run deferrals remove substantial optional machinery. |
| Minimal data flow / boundaries | The host owns source and clipboard authority; the view supplies only current identity/target actions or explicitly reviewed path edits. Native PTY/input ownership remains separate (draft L77–109; current VW L45–67, L101–125; C4 L10–38). This is an appropriate boundary for untrusted rendered output. Source-bound revisions and finite buffering address present stream loss/recreation/concurrency risks; they are not speculative caching or a future history product. |
| Reuse | Actual pinned searches found the existing Markdown library/safe preview, composer target API, launch overlay, private-channel precedent, panel hydration and same xterm input path. Their bodies substantiate the reuse boundaries already stated in draft L87, L117–124 and L317. The composer broker exposes submit/catalog/readDraft/clearDraft request exchange, not an output stream; its cleanup helpers are private and use a different owner/deletion contract (composerBroker.ts L14–30; claudeComposerAdapter.ts L43–65, L113–160). No equivalent complete source-mapped companion renderer/model or capture-epoch stream was found in the searched runtime src/media trees. Reusing those incompatible authorities directly would not be a demonstrated simplification. |
| Lifecycle / architectural fit | Current CH L44–58 observes the existing returned ManagedPty.onExit while returning the same PTY and preserving SessionManager as owner. The actual runtime exposes that event and passes the prepared spec directly to its injected factory (managedPty.ts L5–17; sessionManager.ts L143–192; nodePtyAdapter.ts L94–174). Current VW L17–29 extends the existing HTML/ready boundary instead of restarting the CLI on toggles. These additions address current ownership/document-lifetime needs inside the already-selected components. I found no need for a second process controller or alternate runtime architecture. |
| Altitude control | The feature/Technical Plan portion L1–177 stays at objective, components, data flow, authority and alternatives. Concrete wire/budget/inventory detail is confined to Detailed Implementation and linked contracts. I have not reclassified the existence of that deliberately detailed section as a feature-level weeds finding or requested helper-level churn. |

Within the selected subscription CLI/private-files/copying-only/native Variant A/Escape/Raw constraints, the searches did not establish a smaller replacement that preserves the required behavior. This is a bounded review conclusion, not proof that every possible alternative was exhausted.

## Evidence limits and residual qualification exposure

No product defect or new product success was observed in this review. All activity was static reading/searching. The preserved experiment reports describe bounded standalone behavior; they were not rerun, and their full compressed source/receipt bundles were not decoded here. The current synthetic vectors are expectations, not tests that passed.

| Classification | Remaining exposure already acknowledged by the design |
|---|---|
| Static/inferred, not a new finding | Pinned-build native coupling and main/Bash-only evidence can leave content/outcomes unavailable. Current C4 L6–16, L36–48 and L87–93, CH L130–155, and draft L243, L301–315 explicitly limit admission and provenance. The inspected stored-row declarations and selected C4 cases support the intended boundary, not its runtime correctness. |
| Static/inferred, not a new finding | Private-file streaming carries polling, transient disk content, access-control, locks and conservative cleanup costs. These are explicitly selected and still require Windows/package qualification (technical_choices.md L36–56; CH L15–58; draft L245–276, L334–336). Native continuation is specified independently of delivery. No ACL, filesystem-race or latency result is claimed here. |
| Static/inferred, not a new finding | Conservative unquoted prose boundaries can require Review of trailing words/punctuation. The current PC L23–66 and actual P01–P29 bodies preserve explicit clear code/quoted/isolated forms while exposing the exact uncertain candidate. This selected trade-off is visible; it is not evidence of broad detector coverage or grounds to add a language classifier/filesystem resolver. |

The draft already makes packaged copy fidelity, native access, accessibility and bounded performance qualification gates (L126–130, L330–336, L359–361). This review does not reopen deferred Run/Run again/C2/direct answers or promote Raw fallback into a passing Copy result.

## Full-read input receipts

These measurements were calculated from the actual local bytes read, not copied from the context index.

| Input | Actual read extent | Bytes | SHA-256 |
|---|---|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/zoom_out.md | FULL L1–74 | 4,977 | 1b164f669c7bc74ea778fa505f9fc29ef5a3a4f251c4ff0c8ad27f3f109302d1 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md | FULL L1–60 | 2,944 | 5ca59c1666659c2d5c3a74bd9cc53a358385080ec916b65235c6687f02bdd105 |
| docs/designs/215/design_draft.md | FULL L1–414 | 92,145 | fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9 |

The target contains 414 CRLF line endings and a final newline. Git blob 9a4b731446c58c8ea942751860c0b9944fb19bc0 was resolved at the frozen commit; the read-only Git object and local target match after CRLF/LF representation normalization. Target body reads covered L1–100, L101–177, L178–240, L241–288, L289–340 and L341–414.

review-context.json was read and parsed in full: 60,118 bytes, SHA-256 4caf9fbdffc31c5a7d66d97d72fbdaedacb2362db6d747ac3a2d8cfa1f4e6bfd. Its source map was navigation only. An initial combined index/draft tool output was truncated; all target lines were visible, and later source output truncation in VW L31–68 was reread explicitly. No omitted output is counted as a body review.

## Actual linked/current source reads

All paths in the following local-body table are relative to the project root. “Full” means the body was actually displayed/read to its end. A loaded/parsed JSON file is not claimed fully reviewed unless explicitly listed as full.

| Current source body | Actual read extent |
|---|---|
| docs/designs/215/concepts_brief.md | Full L1–93 |
| docs/designs/215/technical_choices.md | L1–133 and L171–175; intervening source-reference list not reviewed as a body |
| docs/designs/215/capture-channel-contract.md | Full L1–196, including the current exit bridge, ownership and normalized data contract |
| docs/designs/215/companion-view-contract.md | Full L1–173; L31–68 reread after truncation |
| docs/designs/215/path-copy-contract.md | Full L1–75 |
| docs/designs/215/capture-provenance-contract.md | Full L1–93 |
| docs/designs/215/evidence/c4-native-evidence.md | L1–121 and L254–326 only; declaration excerpts/member index/semantics and beginning of receipt projection |
| docs/designs/215/evidence/path-copy-cases.json | Full L1–387, P01–P29; no detector executed |

| Parsed vector source | Full object bodies actually inspected (exact JSON collection/IDs) |
|---|---|
| evidence/capture-channel-cases.json | cases: E01, E04, E06, E09, E11, E12. managedExitBridgeCases: X01, X04, X08, X12, X17, X18. |
| evidence/companion-view-cases.json | cases: V01, V04, V05, V14, V15, V17, V18. bootstrapExamples: H01, H05, H08, H12, H16, H18. |
| evidence/c4-adapter-cases.json | cases: C4-01-stored-text, C4-03-block-allowlist, C4-05-completed-rewrite, C4-14-agent-key-isolation, C4-20-no-hidden-output-fields, C4-28-native-continuation. Deferred Run eligibility fields were read only as preserved context, not accepted as v1 scope. |

The three vector files were read/parsed to select those bodies; their other collection entries were inventoried by ID only and are excluded from full-body coverage. File identities measured from the loaded bytes:

| Vector source | Bytes | SHA-256 |
|---|---:|---|
| docs/designs/215/evidence/capture-channel-cases.json | 174,074 | 2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff |
| docs/designs/215/evidence/companion-view-cases.json | 81,843 | 5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be |
| docs/designs/215/evidence/c4-adapter-cases.json | 97,827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |

Materialized canonical source bodies read in full (snapshot retrieval 2026-11-08 per index; no new network fetch):

| Canonical source | Actual local body extent |
|---|---|
| https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701 | comment-6701284701.txt L1–16: installed fs/timer/append API inspection and host-promotion boundary |
| https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033 | comment-6646355033.txt L1–47: controlled copying experiment report and exclusions |
| https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988 | comment-6647481988.txt L1–51: native Escape/turn-abort experiment report and exclusions |

## Native-mandated codebase reuse search and body reads

Read-only Git objects were used at runtime baseline ef5fd48f4b676881a8730afbf8e583e70565ca11, not the older checkout runtime. Canonical prefix for every runtime path below: https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/.

Completed actual searches: git grep -n -I -E for clipboard, markdown-it, prepareLaunch, onExit, session.append, ownership.json and captureEpoch across baseline src/ and media/; a focused second search for sourceRevision, copyTarget, sourceMap, captureEpoch, createChannel, prune, mkdtemp, writeText, renderMarkdownPreview and exported function/class/interface declarations in the attention channel, composer broker/adapter and Markdown/reference/renderer components. Also inspected git ls-tree component paths under src/attention, src/composer, media/attention and src/panel/webview/composer. All returned matches were inspected; no runtime or documentation mutation was made by these searches.

| Actual runtime body | Read extent |
|---|---|
| README.md | Full L1–117 |
| src/composer/claudeComposerAdapter.ts | L1–160 |
| src/composer/composerBroker.ts | L1–72 |
| src/composer/composerRuntime.ts | L69–113 |
| src/attention/attentionChannel.ts | L1–112 |
| media/attention/hooks/register.js | Full L1–134 |
| src/panel/webview/composer/markdownPreview.ts | Full L1–25 |
| src/panel/webview/composer/references.ts | Full L1–55 |
| src/launch/managedPty.ts | Full L1–17 |
| src/launch/nodePtyAdapter.ts | L94–174 |
| src/launch/sessionLaunch.ts | L1–70 |
| src/sessions/sessionManager.ts | L143–238, L340–378, L507–525 |
| src/extension.ts | L243–257, L593–610 |
| src/panel/sessionPanelProvider.ts | L160–210, L359–398, L615–681 |
| src/panel/webview/renderer.ts | L54–95, L380–487, L722–726 |
| src/panel/webview/xtermTerminal.ts | L85–130 |
| src/panel/webview/index.ts | Full L1–47 |

## Completed / not run / exclusions

- Completed: native persona and standard full reads; frozen target full read and measured identity check; context-index parse; actual current contract/source/vector body reads above; mandatory runtime reuse searches; architecture-level assessment and this complete report.
- Not run: product implementation, compiler, unit/integration tests, build, package, publisher, native/Claude/model/clipboard/ACL probes, or Git/GitHub mutations. No performance, accessibility, packaged continuation, cleanup or copy-fidelity pass is claimed.
- Excluded from body review: historical approval/repair/review reports, full issue thread, original compressed experiment archives, deferred run-amendment.md and C2 experiment, documentation overlay manifest/handoff verification, unlisted runtime regions, unselected vector bodies and exhaustive decoder/fixture/readiness auditing. Their links/counts/status statements were not used as correctness proof.
- No parent transcript/history or memory was retrieved. Host instruction-file exclusion remains unverified; this is not a claim of hermetic isolation.
- Sole write: this assigned s5-zoom.md report. No target, source, vector or other agent file was edited or reverted.


---

# Stage 5 — Inventive Catalyst — Mode REVIEW

**No false compromise detected.**

Completed the native high-altitude contradiction audit of the frozen design. Findings: **0 Major, 0 Nit**. No S5-I-* finding is issued; there is no finding severity, discrepancy or proposed transform to preserve. This result concerns this persona’s strategic question, not implementation readiness or product qualification.

## Scope and authority

Examined the whole design, L1–414, at 46219dfd8c23998ff476092d064cfd95a6d8710d. The active feature is copying-only: full retained explanation, command/path Copy, uncertainty Review, the same subscription-backed interactive CLI, live-only capture, private files, native Variant A, Escape and Raw. Run/Run again, C2 admission and direct companion answers remain deferred. The source choices are confirmed by the actual recorded decision bodies, not inferred from earlier approval counts. [Live source](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861), [file transport](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191), [Variant A](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545), [Run deferral](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).

Current CH/VW/PC/C4 contracts governed the inspection. Prior review reports, applied-repair status, approval counts and static-check claims were not used as correctness proof. The pinned runtime is ef5fd48f4b676881a8730afbf8e583e70565ca11; the older checkout runtime was not substituted. Its README describes managed Claude sessions in one panel, and the design retains that ownership rather than adding an inference backend or second CLI. [Runtime README](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/README.md#L1-L17), [design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L12-L49).

## Strategic assessment

The architecture does not accept an unexplored law that rich copying must discard explanation, replace subscription inference, block native output, guess command execution, or surrender native interaction. It separates those concerns: retained source owns Copy values, the view supplies presentation, the existing PTY remains the input/output owner, and capture has its own bounded failure state. This is an inference from the inspected design/source contracts; it is not an executed demonstration of those future components. [Data flow/model](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L55-L101), [native access](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L103-L109), [current C4](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/capture-provenance-contract.md#L10-L48).

| Examined tension | Existing structural resolution and secondary liabilities | Judgment |
|---|---|---|
| Easy selection and full explanation | Immutable host source values and adjacent controls preserve the reading stream. Separate source mapping/rendering adds maintenance and bounded retained/derived state. | No context-sacrificing compromise is accepted. [Design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L79-L97) |
| Native continuity and asynchronous content delivery | Independent PTY and observational publisher; finite queues, retirement, gaps and bounded recovery isolate capture failure. Costs include lost rich content at a boundary, recovery/relaunch in selected cases, timers and protocol maintenance. | Failure is an active state transition rather than passive logging or native backpressure. [CH](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/capture-channel-contract.md#L7-L98), [assembly](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/capture-channel-contract.md#L163-L173) |
| Private-file reuse and transport cost | Files follow a present runtime ownership pattern but add polling, transient disk content, ACL/lock/capacity/cleanup work. HTTP and its listener/authentication costs are explicitly compared; file failure requires a decision, not an automatic fallback. | The choice is revisable and qualified, not declared intrinsically reliable or unavoidable. [Choices](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/technical_choices.md#L36-L56), [design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L146-L150) |
| Literal path fidelity and one-click convenience | Syntactically clear code/quoted and isolated paths keep Copy; unresolved prose boundaries expose the complete candidate for Review. More Review interactions are an explicit liability. | The document does not claim that missing boundary information can be recovered with certainty. A new classifier, filesystem resolver or transformed value would not eliminate that information limit while retaining the selected literal-copy contract. [PC](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/path-copy-contract.md#L7-L66) |
| Full explanation and finite resource use | Complete bounded groups are retained or explicitly unavailable; eviction exposes a history boundary and invalidates actions. Older rich history can be unavailable, and retained/derived data must be accounted for. | Full captured explanation is not silently replaced with an extracted list or command tail, and unlimited history is not promised. [Design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L71-L81), [budgets](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L263-L276), [VW](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/companion-view-contract.md#L103-L113) |
| Rich reading view and native question/permission ownership | Raw keeps the same xterm/CLI; Variant A deliberately retains native responses and sends one validated Escape. Switching friction remains; direct controls would add correlation/response ownership. | This is explicit first-version scope, not an asserted unavoidable architectural conflict or grounds to reintroduce deferred controls. [Design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L322-L330), [choice](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/technical_choices.md#L58-L62) |

No additional catalog pattern is recommended. Segmentation/extraction and the host intermediary are already present where they resolve the relevant coupling. Recommending another transport, worker, response broker, inference service, snapshot reconciler or generic self-healing loop would add liabilities without a demonstrated remaining contradiction in this scope.

## Reuse evidence inspected

The pinned source search was `git grep -n -E "markdown-it|parseComposerReferences|createClaudeComposerAdapter|copySelection" ef5fd48f4b676881a8730afbf8e583e70565ca11 -- src`. It located the active composer adapter, Markdown preview/reference consumers and terminal selection-copy helper. The actual bodies below were then inspected. Search matches alone were not treated as reusable APIs.

* The existing file adapter really creates host-owned directories, binds targets and a random token, uses a private request/response transport, and conservatively detects dead hosts. Its functions/marker are private and its single request/response slot is not the proposed streaming capture protocol. CH explicitly treats it as precedent and supplies a distinct companion contract. No false reuse shortcut or mandatory abstraction extraction was found. [Adapter](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L33-L199), [CH](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/capture-channel-contract.md#L15-L42).
* The existing preview really uses markdown-it with raw HTML disabled, limited links and image placeholders; its output is rendered HTML without the new source-map/action model. The reference parser explicitly skips fences and inline code and recognizes composer references. Reusing conventions/library while adding a purpose-specific source mapping layer respects those boundaries. [Preview](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts#L1-L25), [parser](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts#L10-L55), [design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L87-L91).
* Attention really publishes metadata and passes capability drivers to helpers; the design keeps explanation content in a separate channel. Composer target/launch integration supplies session/UUID/generation and immutable overlays, while xterm/provider/session manager supply the existing terminal owner. The existing selection-copy helper copies selected terminal text; it does not solve complete semantic targets. [Entry](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L134), [target](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L92), [overlay](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/sessionLaunch.ts#L4-L35), [native input](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L343-L365), [selection copy](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L1135-L1145).

These are source-observed reuse boundaries. Stability, package compatibility, Windows privacy, exact source/copy behavior and native continuation of the future integration remain qualification questions; existing code is not evidence that the new components work.

## Completed work and limits

Completed: full persona and standard reads before target inspection; full frozen target read; current feature/contract body inspection at the extents below; actual decision-body reads; selected synthetic failure/body inspection; pinned-runtime reuse search and source-body inspection; byte/hash measurement and newline-insensitive Git body comparisons. All seven current document bodies inspected from the checkout matched their frozen Git content, and the three vector files also matched. All ten runtime materializations inspected matched `git show` at the pinned runtime after CRLF/LF equivalence. These comparisons establish source identity, not behavior.

The selected synthetic bodies specify active mitigation: E06 retains ack 4 and retires rejected sequence 5, E11 exposes health loss, E15 requires a matching relaunch after host-authority loss; X02/X04/X06/X13 keep uncertain cleanup proof from overriding native ownership or indefinite shutdown; V08/V10/V14/V15 reject stale review, retain uncertain clipboard ordering, prevent duplicate Escape and prevent partial hydration; H02/H11/H16 keep Raw/native access through missing bootstrap, toggles and capacity failure. These are inspected expected outcomes, not executed tests.

Not run: product compiler, type/lint/unit/integration checks, build, package, implementation, native CLI/Claude/model/clipboard/ACL/reparse/performance probes, or any Git/GitHub mutation. No repairs were made. Historical experiment source/receipts and prior review/resolution reports were not re-audited. No parent transcript/history or memory was retrieved; exclusion of all host instruction context is unverified. Only this report is written.

The native strategic review is complete at this stated scope. Detailed wire-dictionary/vector conformance, integration readiness and runtime qualification were not performed and receive no clean result from this report. The design’s own qualification gates remain in force. [Qualification](https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L332-L361).

## Full mandatory read receipts

Hashes are measured SHA-256 over each complete original byte stream. Line totals below count content lines; each file has its final newline. The original CRLF target is preserved.

| Input | Full body extent | Bytes | SHA-256 |
|---|---|---:|---|
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/inventive_catalyst.md` | L1–101 | 7456 | `fb64555a61aaeb0469c148d01a26493972c93093c0ed92acfc2dba6b3de1f19f` |
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md` | L1–60 | 2944 | `5ca59c1666659c2d5c3a74bd9cc53a358385080ec916b65235c6687f02bdd105` |
| `C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md` | L1–414 | 92145 | `fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9` |

The target was presented without truncation in eight contiguous reads: L1–82, L83–177, L178–217, L218–246, L247–285, L286–327, L328–374 and L375–414. The frozen Git LF body is 91,731 bytes, SHA-256 564d1158a393fa484169f2fa7f20a7ccbd4d992a2c374c9d3d7265a9eda989a3; it equals the measured target after CRLF/LF equivalence.

## Actual body-read ledger

All current design paths below are beneath `docs/designs/215/` at the frozen commit. “Parsed/hashed” is not a claim of complete body analysis. Line ranges are the exact body text presented to the reviewer; exclusions name what received no full body audit.

| Body | Body text inspected | Explicit exclusions |
|---|---|---|
| `technical_choices.md` | L1–90, L91–175 (full) | None |
| `concepts_brief.md` | L1–93 (full) | None |
| `capture-channel-contract.md` | L1–99; L163–196 | L100–162 detailed launch/data dictionaries and native-return normalization were not independently body-audited |
| `companion-view-contract.md` | L1–68; L103–173 | L69–102 detailed direction-specific message dictionary was not independently body-audited |
| `path-copy-contract.md` | L1–75 (full) | None |
| `capture-provenance-contract.md` | L1–93 (full) | Native declaration archive and all-32 native case transfer were not independently re-audited |
| `evidence/path-copy-cases.json` | L1–387 (full), parsed all 29 cases | No extractor or generated-input/clipboard execution |
| `evidence/capture-channel-cases.json` | E06 L112–132; E11 L214–231; E15 L292–309; X02 L3912–3946; X04 L3990–4020; X06 L4053–4083; X13 L4305–4349 | Full file parsed and case/index summaries inspected; other complete case bodies, wire/root serialization dictionaries, ownership sets and cross-case conformance were not audited |
| `evidence/companion-view-cases.json` | V08 L155–178; V10 L198–219; V14 L284–301; V15 L302–318; H02 L1940–1967; H11 L2308–2356; H16 L2500–2530 | Full file parsed and case/index summaries inspected; other complete case bodies, wire/root serialization dictionaries, ownership sets and cross-case conformance were not audited |

The JSON index summaries inspected for orientation included all E01–E18 event/expected fields, V01–V18 event/expected fields, P01–P29 input/expected fields, X01–X18 notes and H01–H18 notes. Complete selected objects, including their initial/event/expected data, were read at the exact ranges above. Other nested bodies shown only as abbreviated tool object previews are not counted as full reads.

| Pinned runtime body | Actual body text inspected | Excluded body text |
|---|---|---|
| `README.md` | L1–117 (full, direct Git) | None |
| `src/composer/claudeComposerAdapter.ts` | L1–199 (full, direct Git) | None |
| `src/composer/composerRuntime.ts` | L69–96; L197–211 | All unlisted ranges |
| `src/extension.ts` | L443–464 | All unlisted ranges |
| `src/launch/sessionLaunch.ts` | L1–38 | All unlisted ranges |
| `media/attention/hooks/register.js` | L1–80; L81–134 (full) | None |
| `src/panel/webview/xtermTerminal.ts` | L85–130 | All unlisted ranges |
| `src/panel/sessionPanelProvider.ts` | L615–681 | All unlisted ranges |
| `src/panel/webview/composer/markdownPreview.ts` | L1–25 (full) | None |
| `src/panel/webview/composer/references.ts` | L1–55 (full) | None |
| `src/sessions/sessionManager.ts` | L340–378 | All unlisted ranges |
| `src/panel/webview/renderer.ts` | L380–487; L1135–1169 | All unlisted ranges |

| Decision/source body | Full extent inspected | Canonical source |
|---|---|---|
| `comment-6684329277` | L1–9 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277 |
| `comment-6684608334` | L1–12 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334 |
| `comment-6700896861` | L1–11 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861 |
| `comment-6701115191` | L1–13 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191 |
| `comment-6706751545` | L1–13 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545 |
| `comment-6715993295` | L1–9 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295 |
| `comment-6701284701` | L1–16 | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701 |

GoldfishContext: `C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/.tmp/215-exit-bootstrap-review-20261108/review-context.json`, 60118 bytes, SHA-256 `4caf9fbdffc31c5a7d66d97d72fbdaedacb2362db6d747ac3a2d8cfa1f4e6bfd`. Entire JSON parsed; target/scope/runtime/source inventory, source policy and authority fields inspected. Its hashes/IDs guided lookup and were not evidence that the linked body was correct. The initial broad metadata display was truncated and was not counted as a full body read.

Unopened linked bodies include the issue’s complete body, historical snapshots/reviews/resolutions, Run amendment and C2 source, documentation handoff/manifest internals, native experiment/declaration archives and official external-page materializations. Other pinned build/package/test/protocol/managed-PTY internals were not evaluated. They are outside this persona’s completed high-altitude false-compromise assessment; this report makes no correctness claim about them.

## Supporting-source byte receipts

Full-file hashes measure bytes loaded; the preceding ledger controls the actual reviewed extent. Materialized source bodies are identified by their canonical URL, and runtime materializations were also compared to the pinned Git body.

| Body | Bytes | SHA-256 | Canonical identity |
|---|---:|---|---|
| `technical_choices.md` | 28232 | `0645085da906ba7f9310eb5e0c3c54c9a4edb40b43e113fe48006e72a1e4a1ed` | docs/designs/215/technical_choices.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `concepts_brief.md` | 15005 | `707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5` | docs/designs/215/concepts_brief.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `capture-channel-contract.md` | 45605 | `146f0712580d815540e580d138f6da40d5e7416cacd02446a7b2f78a0ee14891` | docs/designs/215/capture-channel-contract.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `companion-view-contract.md` | 36180 | `6cbd29c9ee1189bcb76aa5f983126263c478598ee986b841f9610d3614f93ae1` | docs/designs/215/companion-view-contract.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `path-copy-contract.md` | 8153 | `a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc` | docs/designs/215/path-copy-contract.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `capture-provenance-contract.md` | 20616 | `d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922` | docs/designs/215/capture-provenance-contract.md@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `README.md@runtime` | 4599 | `7302d47c672866e0d24ad4718242a1352c8916ac75d153b04af581f07b2d0582` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/README.md |
| `src/composer/claudeComposerAdapter.ts@runtime` | 10477 | `7b88e5a2591309da61c783e4fe4e29fa18dd06d392a99bc72546f2fa7bbe545a` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts |
| `repo-10` | 15402 | `c11c70f4c2f2ed79aaaa6c09f70451853bd50ce437f6e938737ddb192b7bcde7` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts |
| `repo-11` | 40859 | `de3958693f55bb45c7806299896e144b53106ee416036232bdae8095994bda34` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts |
| `repo-12` | 3057 | `bd0b1ea2163207cb492e9d5bdb24f163e40f37bd8f56ae4b469bb69dfe8c5e86` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/sessionLaunch.ts |
| `repo-20` | 5352 | `63dc8aaa42f7436803afd292bdc341c2ead2aef69a630ee1707d9a4e2db545da` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js |
| `repo-21` | 8566 | `ad9a88a7a60f0ecf79a2f19b7913b9de706bde9b47fad5f0ee35243f6c795a39` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts |
| `repo-22` | 42796 | `7a2c4d97b7414941e5ca739ffce45e531f81cb49029b579d7e660bfaf575ba56` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts |
| `repo-23` | 1588 | `e9068f6146633cd2a318b976dbc6f0595fef80b6739b0221904afb0f7529fbca` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/markdownPreview.ts |
| `repo-24` | 3645 | `f6eb2df8d218b7a865bd78429ac2925f8005eb2a9b5863b6557317e562b4c2ad` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/composer/references.ts |
| `repo-25` | 23387 | `3fdbf3df63d1e89bc6be6274e1bdda9f18a7ca96344af3d7be7b39645ea75cea` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts |
| `repo-26` | 51672 | `a506de0fed6f97cf6e4111bacaf4b3d454abbd1c482482693b519c196d1c9136` | https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts |
| `comment-6684329277` | 662 | `4dde929a678d73cce801d5b8a04bb57181152e64704be8c68735a8afd26a0fae` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277 |
| `comment-6684608334` | 1093 | `979b0344610a3e884be09173cc072d216fda75171fee58851271879212a45330` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334 |
| `comment-6700896861` | 1044 | `b888ae1ee3f38605b2b80e239076024da20662b53f03ae82c478a6d934aa28dc` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861 |
| `comment-6701115191` | 2005 | `e42fe1dedd43d3a95e8715bbb0ce926d3d64723f3dd4e29e085910f75814149f` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191 |
| `comment-6706751545` | 1804 | `d40933f1d26f94eca4be8c7f0569b1bb53cf720ec895ad4d575f485cc8705edc` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545 |
| `comment-6715993295` | 1354 | `45b7010ced1f62cf2c93de1c0d6c55f3b4fdc3dd233383afd8964fb4a70354be` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295 |
| `comment-6701284701` | 3372 | `b9db1958ee9d44c3e04dc0e0a87b30c4f26e519d48976209128550abd04aa7a4` | https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701 |
| `capture-channel-cases.json` | 174074 | `2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff` | docs/designs/215/evidence/capture-channel-cases.json@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `companion-view-cases.json` | 81843 | `5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be` | docs/designs/215/evidence/companion-view-cases.json@46219dfd8c23998ff476092d064cfd95a6d8710d |
| `path-copy-cases.json` | 8909 | `f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc` | docs/designs/215/evidence/path-copy-cases.json@46219dfd8c23998ff476092d064cfd95a6d8710d |
