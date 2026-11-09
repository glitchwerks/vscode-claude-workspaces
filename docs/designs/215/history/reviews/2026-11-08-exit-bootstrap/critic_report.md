# Feature critique — complete responses

Stage 7 completed all three requested reviewers against FeatureRange L1–L177 at frozen 46219dfd8c23998ff476092d064cfd95a6d8710d. **0 Blockers / 0 Majors / 2 Nits.** S7-S-1 concerns path-vector checkpoint wording; S7-S-2 concerns repeated defensive clauses. No design edits were applied. This is not a full-flow readiness or convergence verdict.

[Context/source manifest](context_manifest.md), [portable source catalog](review-context.json), [archived personas/standards/workflow/license](review_tools.json). Complete responses follow; transient tool/cache locators in receipts are provenance, not runtime dependencies.

# Stage 7 — Design Critic (Mode REVIEW)

## Result and scope

Completed the scoped feature-specification design audit. Findings: **0 Blocker / 0 Major / 0 Nit**. No S7-D-* finding is raised. This is a design-review result for the active feature range, not an implementation-readiness, runtime, packaging, accessibility, security-qualification or release result.

Active target: `docs/designs/215/design_draft.md:L1–L177`, frozen at `46219dfd8c23998ff476092d064cfd95a6d8710d`. Runtime reference: `ef5fd48f4b676881a8730afbf8e583e70565ca11`. The working target matches the supplied 92,145-byte CRLF SHA-256 receipt and matches the frozen Git content after newline equivalence. Current linked contracts governed the review; historical approval, repair status, vector counts and prior static-check claims were not treated as proof.

The review retained the selected copying-only subscription CLI/private-file architecture, native Variant A, Raw access and native Escape. It did not reopen Run, Run again, C2 or direct companion answers/permissions. Detailed Implementation was consulted only to resolve high-level cross-references and safeguards, not audited for inventory completeness or implementation readiness.

## Completed design checks

| Standard / risk vector | Active scope | Review conclusion and canonical evidence |
|---|---|---|
| Problem, goals and scope | L12–L49 | The command/path-selection problem, full explanation requirement, clear/uncertain copying and native controls are stated. The architecture does not depend on a replacement inference session or on deferred execution/response controls. Compared with the actual intake body in `concepts_brief.md:L15–L49`, rather than inferring requirements from its approval status. |
| Components, ownership and data flow | L53–L81; L111–L124 | A single managed CLI retains its PTY/input owner; semantic content has a separate host-owned path and does not become attention notification content. Current `capture-channel-contract.md:L7–L58,L104–L173` supplies the identity, publication, retirement and process-exit boundary. Actual pinned mod/launch/session source supports the stated reuse boundary; the design explicitly adds the missing capture mechanism. |
| Complete values, gaps and revisions | L71–L97 | Values originate in retained source, revisions invalidate stale actions, incomplete content cannot acquire complete-value Copy, and loss/eviction is visible. Current CH and VW provide bounded atomic admission/projection, stale-source rejection and recovery limits. E01–E18 and V01–V18 actual expectation bodies agree with those high-level rules; they were not executed. |
| Path ambiguity | L26; L33–L35; L87–L91 | The selected deterministic rules preserve explicit clear code/quoted/isolated paths and use editable Review for ambiguous prose instead of trimming a possibly spaced path. `path-copy-contract.md:L7–L66` and P01–P29 bodies specify literal spans, including Unicode, punctuation, spaces, URI exclusions and an oversized omission. The conservative Review cost is explicit in the current source decision. General detector coverage remains unclaimed. |
| Truthful provenance and privacy | L36; L73; L93–L101 | Assistant-displayed source, requested commands, effective commands and tool completion are distinct. C4 requires scoped native evidence; errors, withholding, background hints and an abort acknowledgement do not automatically become execution or process-termination proof. Compared the current C4/CH/VW bodies with archived declaration/receipt bodies and the selected native/wire/projection expectations listed below. Hidden reasoning, context, private paths and arbitrary tool envelopes are excluded. |
| Native access and Stop | L18; L38; L103–L109 | Native input ownership survives capture failure, toggle does not create a CLI, and sent Escape is separated from confirmed interruption. The actual pinned xterm/input/replay bodies support that boundary. The focused historical experiment explicitly reports the turn-abort/backgrounding counterexample; the feature preserves its evidence limits and makes no universal background-stop claim. |
| Rendering and clipboard safety | L79; L85–L101; L128–L130 | Untrusted content does not supply control authority; raw HTML/remote resources remain disabled and host/source-bound actions own clipboard writes. Current VW specifies document registration, atomic transfers, single-use Review, action replay high-water marks and an uncertain-write latch. The pinned Markdown/reference parser bodies substantiate the limited reuse claim: they do not already implement this renderer or inline/prose path extraction. |
| Scalability, operations and costs | L28; L47; L81; L124–L130; L148–L156 | Polling, transient disk content, Windows privacy/locking/cleanup, bounded retention and native-source compatibility are identified. Referenced detail L263–L276 supplies finite queue/storage/content/transfer budgets and visible capacity refusal. No extra model classification call is selected; no measured throughput, delivery estimate or subscription-billing conclusion is invented. ACL, packaged performance and actual clipboard qualification remain required. |
| Alternatives rule | L132–L176 | Native/hybrid output, extraction-only presentation, HTTP, snapshot/durable recovery, terminal-row parsing, alternate inference/session backends, intent/path transformation and direct controls have concrete mechanism/scope trade-offs. Native/hybrid is not dismissed as impossible; files are not claimed intrinsically more reliable; snapshot and direct controls remain explicit deferrals. The historical native experiment body supports the stated classic/fullscreen qualification costs. |

No active-scope discrepancy requiring a recommendation was established. In particular, planned future modules and unperformed runtime qualification were not recast as missing documentation deliverables, and selected design limits were not treated as measured performance.

## Read extents and evidence limits

**Target:** semantically read all L1–L177. Context consulted: L178 and L184; L243–L305; L317, L322, L324, L332, L334, L336, L338 and L357; L360–L414. A heading/numbered-item index was inspected across L178–L359. Other Detailed Implementation bodies were not reviewed. Full-file byte reads/hashing do not mean a semantic audit of all 414 lines.

**Current local bodies:** full `technical_choices.md:L1–L175`, `capture-channel-contract.md:L1–L196`, `companion-view-contract.md:L1–L173`, `path-copy-contract.md:L1–L75`, `capture-provenance-contract.md:L1–L93`, and `evidence/c4-native-evidence.md:L1–L408`; `concepts_brief.md:L1–L70` only. `review-context.json` was parsed as an index for selecting sources, not used as correctness evidence.

**Actual expectation bodies inspected:**

- `evidence/capture-channel-cases.json`: `.cases` E01–E18; `.managedExitBridgeCases` X01–X18; `.nativeDenyPipelines` D01–D02, including serialized frames and expected normalized observations/outcomes. Other wire/ownership example families were not exhaustively reviewed.
- `evidence/companion-view-cases.json`: `.cases` V01–V18; `.bootstrapExamples` H01–H18; `.c4ProjectionCases` corresponding to the ten native cases below. Other root/group/compatibility example families were not exhaustively reviewed.
- `evidence/path-copy-cases.json`: full document, P01–P29.
- `evidence/c4-adapter-cases.json`: full native-input/returned/expected bodies for C4-01, C4-05, C4-06, C4-08, C4-09, C4-20, C4-26, C4-28, C4-31 and C4-32. Other case IDs were indexed only; no all-32 native-case audit is claimed. Deferred Run fields in preserved native fixtures were not adopted as v1 scope.

**Pinned runtime bodies inspected** (all at `ef5fd48f4b676881a8730afbf8e583e70565ca11`; materialized source hashes matched their index receipts):

| Canonical repository path | Semantic extent |
|---|---|
| `media/attention/hooks/register.js` | Full body |
| `src/composer/composerRuntime.ts` | L69–L96 |
| `src/launch/sessionLaunch.ts` | L1–L38 |
| `src/panel/webview/xtermTerminal.ts` | L1–L170 |
| `src/panel/sessionPanelProvider.ts` | L160–L210, L359–L398, L615–L681 |
| `src/sessions/sessionManager.ts` | L109–L168, L340–L378 |
| `src/panel/webview/renderer.ts` | L380–L487 |
| `src/panel/protocol.ts` | L1–L135 |
| `src/panel/webview/index.ts` | Full body |
| `src/panel/webview/composer/markdownPreview.ts` | Full body |
| `src/panel/webview/composer/references.ts` | Full body |
| `src/composer/claudeComposerAdapter.ts` | Full body via read-only `git show` |
| `src/launch/managedPty.ts` | Full body via read-only `git show` |

Canonical pinned runtime links use `https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/<repository-path>`. The older working checkout runtime was not substituted. `src/extension.ts` was loaded in a batch but its body was not semantically inspected or used to support a conclusion.

**Materialized canonical issue evidence:** full bodies of [source/snapshot research](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630), [controlled copy experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033), [focused controls and Stop experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988), [native alternative experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408), and [fs/publication contract inspection](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701), retrieved by the supplied context on 2026-11-08. These are historical bounded evidence; no current native capability was inferred from them.

**Not run:** product implementation/repairs; compiler, tests, build or packaging; native CLI/model, clipboard, ACL, filesystem-race or process-liveness probes; live remote-source refresh; Git/GitHub writes. No parent transcript/history or memory was retrieved. One Bash read invocation failed with `Bash/E_ACCESSDENIED`; read-only Node fs and read-only Git succeeded. The sole write is this report. No incomplete tooling block remains for the stated feature-spec review; unreviewed lower-level families and unperformed product qualification are explicit limits, not zero-findings claims about those surfaces.

## Measured input receipts

Raw byte SHA-256 values below were computed during this run. UTF-8 lengths are file byte lengths; the target contains 414 CRLF endings, zero bare LF endings and one final newline. The target was re-read and its hash rechecked before report creation.

| Input | Bytes | Semantic read extent | SHA-256 |
|---|---:|---|---|
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/design_critic.md` | 3906 | Full L1–L63, read first | `fa91d7ef07f2657f810c556f823dd4ab299cd0c211433933056eda5ca981a716` |
| `C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/feature-spec-standard.md` | 1698 | Full L1–L39, read with persona before target | `e14db193d62e856917f17a5a69872e19a1f4efa914e6d2d1e627f45464fab750` |
| `docs/designs/215/design_draft.md` | 92145 | Active L1–L177; context extents above | `fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9` |
| `docs/designs/215/path-copy-contract.md` | 8153 | Full L1–L75 | `a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc` |
| `docs/designs/215/capture-channel-contract.md` | 45605 | Full L1–L196 | `146f0712580d815540e580d138f6da40d5e7416cacd02446a7b2f78a0ee14891` |
| `docs/designs/215/technical_choices.md` | 28232 | Full L1–L175 | `0645085da906ba7f9310eb5e0c3c54c9a4edb40b43e113fe48006e72a1e4a1ed` |
| `docs/designs/215/companion-view-contract.md` | 36180 | Full L1–L173 | `6cbd29c9ee1189bcb76aa5f983126263c478598ee986b841f9610d3614f93ae1` |
| `docs/designs/215/concepts_brief.md` | 15005 | L1–L70 | `707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5` |
| `docs/designs/215/capture-provenance-contract.md` | 20616 | Full L1–L93 | `d9276f1cf848b2fa6b7ce16415468e85ec3a11e2129bd68c862808cc06e4f922` |
| `docs/designs/215/evidence/c4-native-evidence.md` | 14940 | Full L1–L408 | `80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029` |
| `docs/designs/215/evidence/capture-channel-cases.json` | 174074 | JSON selectors above | `2cc2558c9a3d20b8fbc1796b6f2cc311482c86b5acc3236d75eb0e4848b2ffff` |
| `docs/designs/215/evidence/companion-view-cases.json` | 81843 | JSON selectors above | `5a74942596f2d1a4be94236e69d6656a5e81affce98df4396aee6e7f420ca9be` |
| `docs/designs/215/evidence/path-copy-cases.json` | 8909 | Full P01–P29 | `f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc` |
| `docs/designs/215/evidence/c4-adapter-cases.json` | 97827 | Ten exact native case bodies above | `942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20` |

| Materialized issue source | Bytes | Raw SHA-256 |
|---|---:|---|
| [comment-6685055630](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630) | 2951 | `4016923f918ddb13956eb6a8aa8a91b71fc800aeeec0ea80d8747fed52a63177` |
| [comment-6646355033](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033) | 7872 | `ddf1fa062e8ce2ff3efd7e0b5afab1a416c43ba5e2feaf97bbffa3af0138b630` |
| [comment-6647481988](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988) | 8374 | `9dd762893e9951ae527efb372daeafe97d8312e38972451282b2586c70c74d26` |
| [comment-6646855408](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408) | 9993 | `5a2a2fcf7b66d6d6953fe3a92428dd0fa04339be7a2249366ee8522bff659cfb` |
| [comment-6701284701](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701) | 3372 | `b9db1958ee9d44c3e04dc0e0a87b30c4f26e519d48976209128550abd04aa7a4` |


---

# EGM Stage 7 — Structural Goldfish

Mode: REVIEW. Status: completed. Active scope: docs/designs/215/design_draft.md:L1–177 (Feature Specification). L178–414 is contextual only.

## Result

No structural findings. Original severity counts: 0 Blocker, 0 Major, 0 Nit. No S7-T-* finding IDs are assigned. This result covers document organization, heading hierarchy, Markdown layout and source-link organization; it is not a product correctness or runtime qualification result.

## Standard comparison

The full feature-spec standard was read before the target. It requires an understandable problem, goals/non-goals, architecture where applicable, evaluated alternatives with concrete rejection reasons, and explicit constraints/risks/mitigations. Its Requirements section calls its entries non-exhaustive examples; it does not prescribe an exact heading template. Accordingly, The Problem and Technical Plan are valid structural locations for the problem and architecture, and distributed risk coverage is not a missing mandatory Risks & Mitigations header.

| Required subject / audit vector | Active scope inspected | Structural result |
|---|---|---|
| Purpose and problem | Overview L12–18; The Problem L20–28 | Present and separated from proposed mechanisms. |
| Goals and exclusions | Goals L30–39; Non-Goals L41–49 | Eight numbered goals and a consistently formatted exclusion list. |
| Architecture and integration | Technical Plan L51–130 | Seven H3 subsections cover data flow, model, rendering, actions, native access, components and qualification. |
| Alternatives | Alternatives Considered L132–176 | Eight H3 alternatives carry mechanisms/trade-offs and explicit decision, rejection, deferral or non-selection language. Source aliases resolve through the contextual resource directory. |
| Constraints, risks and mitigations | L28, L47–48, L71–81, L87–101, L105–109, L128–130 | Capture gaps, bounded retention, source uncertainty, untrusted content, native-control limits and pending qualification have explicit homes. No standalone risk heading is mandated by the standard. |
| Heading hierarchy | L1–176 | One H1; six H2 main sections; H3 subsections nested under their H2. No skipped level or out-of-order parent section. |
| Tables, lists and fences | L3–9, L30–49, L59–69, L115–122 | Consistent lists; closed Mermaid fence; valid two-column component table. No malformed Markdown found in the active scope. |
| Active Markdown links | L8, L9, L124 | Canonical issue URL is well formed; concepts_brief.md exists and was read; technical_choices.md#decision-2-live-content-transport resolves to its actual L36 heading and L38–56 decision body. |
| Citation and numbered cross-reference organization | Active bracket aliases; contextual L363–412; selected Detailed Implementation items | Aliases identify a resource directory rather than unresolved Markdown reference-link definitions. The cited implementation item numbers exist with matching subjects. No requirement in the supplied standard mandates a different citation syntax. |

The structural mapping follows the actual target text and linked decision bodies. Prior approval, applied-repair status, static-check claims, source-index counts and fixture counts were not used as correctness proof. Future Create files and unrun later qualification are not structural deficiencies of this feature specification.

## Heading map

- H1 L1: Copy-friendly Claude Code companion.
- H2 L12: Overview.
- H2 L20: The Problem.
- H2 L30: Goals.
- H2 L41: Non-Goals.
- H2 L51: Technical Plan. H3 headings: L55, L75, L83, L93, L103, L111, L126.
- H2 L132: Alternatives Considered. H3 headings: L136, L142, L146, L152, L158, L164, L168, L174.

## Measured full-input receipt

All hashes below are SHA-256 over the entire file byte buffer, not an excerpt or a reported upstream count.

| Input | Bytes | Lines | Full SHA-256 |
|---|---:|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/structural.md | 4,019 | 65 | 0910c45b02618a7aa017f3adcaf7c6866c35668bd2aaef1db30a0c3d9b6b522e |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/feature-spec-standard.md | 1,698 | 39 | e14db193d62e856917f17a5a69872e19a1f4efa914e6d2d1e627f45464fab750 |
| docs/designs/215/design_draft.md, CRLF working-tree bytes | 92,145 | 414 | fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9 |

Read-only git show of 46219dfd8c23998ff476092d064cfd95a6d8710d:docs/designs/215/design_draft.md returned 91,731 repository bytes, SHA-256 564d1158a393fa484169f2fa7f20a7ccbd4d992a2c374c9d3d7265a9eda989a3. Comparison after in-memory CRLF/LF equivalence was identical. No working-tree line ending was changed.

Canonical frozen target: https://github.com/glitchwerks/vscode-claude-workspaces/blob/46219dfd8c23998ff476092d064cfd95a6d8710d/docs/designs/215/design_draft.md#L1-L177

## Actual semantic read extents

- structural.md: full L1–65, before any target evaluation.
- feature-spec-standard.md: full L1–39, before any target evaluation.
- design_draft.md: full active L1–177. Contextual full paragraphs L178–184 and L338–414. Additionally read the complete individual numbered/bold item paragraphs at L222, L243, L245, L247, L249, L251, L253, L261, L263, L278, L291, L293, L295, L299, L301, L303, L317, L319, L322, L324, L332, L334, L336; all file headings were extracted. Other L185–337 bodies were not semantically read. This is not a detailed-implementation audit.
- Current concepts_brief.md: full L1–93 (15,005 bytes; SHA-256 707a7a606a44788f8c2377a93a37aaa8dcf6fc7fc8c0d9cd6bfd0047a920bbb5).
- Accepted-intake concepts brief at 3b096d8de36f596d42276e78bcf60c25c7d3a0bb: full L1–86 through supplied repo-2.txt, with its ending re-read separately after a long-string display truncation. Canonical: https://github.com/glitchwerks/vscode-claude-workspaces/blob/3b096d8de36f596d42276e78bcf60c25c7d3a0bb/docs/designs/215/concepts_brief.md . The historical not-yet-approved state was not treated as current authority; the target explicitly separates that intake from subsequent approval.
- Current technical_choices.md: L1–134 and L171–175 semantically read; headings extracted across all 175 lines. The source-directory bodies L135–170 were not semantically read. Full byte measurement: 28,232 bytes; SHA-256 0645085da906ba7f9310eb5e0c3c54c9a4edb40b43e113fe48006e72a1e4a1ed.
- capture-channel-contract.md, companion-view-contract.md, path-copy-contract.md and capture-provenance-contract.md: full buffers measured and heading maps extracted only. Their behavioral bodies and vector JSON were not semantically reviewed by this structural lens. No behavioral conformance conclusion relies on their index, counts or heading map.
- review-context.json: parsed for source locations and canonical identities. Metadata is an index, not source proof.
- Supplied canonical issue-comment materializations: full bodies of P, F, L, T, A5 and A10, listed below. These records were used to check source-link organization and retained/deferred scope, not as substitutes for technical correctness.

Canonical decision records actually read:

- P: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277
- F: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334
- L: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861
- T: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191
- A5: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545
- A10: https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295

## Completed and not run

Completed: native Structural REVIEW persona and feature-standard reading; active-scope semantic reading; hierarchy/Markdown/subject mapping; actual relevant linked intake/transport/decision-body reads; contextual resource and numbered-item lookup; full-input byte/hash measurements; read-only frozen-target comparison.

Not run: any target repair; product implementation; compiler, tests, build or packaging; native/Claude/model/clipboard/ACL probes; live URL reachability; GitHub operations; Git mutations; evaluation of checkout runtime as if it were the pinned ef5fd48f4b676881a8730afbf8e583e70565ca11 runtime. No parent transcript/history or memory was retrieved. No other worker file was changed.

The selected scope remains copying-only, private files, subscription CLI, Variant A native question/permission handling, Escape and Raw. Run, Run again, C2 and direct companion answers remain deferred. This report makes no qualification, release, merge or convergence claim beyond this completed structural review.


---

# Stage 7 — Style Goldfish

Mode: REVIEW. Native persona: egm/0.1.1/agents/style.md. No separate style standard was supplied.

Result: 0 Blockers, 0 Majors, 2 Nits. These are editorial findings, not observed product failures. No design repair or implementation was performed.

## Scope and receipts

Active target: docs/designs/215/design_draft.md:L1-L177, frozen source supplied as 46219dfd8c23998ff476092d064cfd95a6d8710d. Lines after 177 were used only for definitions and selected technical context; findings below affect the active range exclusively.

Selected scope remains the existing subscription-backed CLI, live-only private-file capture, copying-only v1, native Variant A, Escape and Raw access. Run, Run again, C2 and direct companion answers remain deferred.

| Input | Measured bytes | Measured lines | Measured SHA-256 | Read extent |
|---|---:|---:|---|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/style.md | 4,946 | 67 | 325f211c3e4c327c220be0723745ea6df915bf027e3987b9fb60b845b5c936e2 | Full persona, before substantive review |
| docs/designs/215/design_draft.md | 92,145 | 414 | fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9 | Entire file read for byte/hash receipt; L1-L177 examined in full; contextual L178-L184, L264-L317, L350-L414 examined; heading/numbered-item excerpts scanned in L178-L349 |
| .tmp/215-exit-bootstrap-review-20261108/review-context.json | 60,118 | Not used as a review coverage measure | 4caf9fbdffc31c5a7d66d97d72fbdaedacb2362db6d747ac3a2d8cfa1f4e6bfd | Parsed input metadata, source mappings, scope, sourcePolicy, authorization, inputManifest and isolation fields |

The persona has 67 CRLF terminators; the target has 414 CRLF terminators and no lone LF. The measured target hash matches the caller's frozen receipt. The supplied commit identity was not independently resolved through Git.

## Findings

### S7-S-1 — Nit — Name the existing path vectors and the remaining qualification step

Affected active scope: Full explanation, command blocks and path controls, docs/designs/215/design_draft.md:L91.

Exact wording: “Supported Windows/POSIX, relative, quoted, spaced and line-suffixed forms need fixtures before implementation. General path recognition remains unproven.”

Discrepancy: “need fixtures” does not distinguish design vectors already present from implementation tests still to be transferred and executed. The current path contract specifies the boundary algorithm, names the exact span/literal vectors, and explicitly calls for their transfer into the planned tests. The current vector bodies include clear Windows/POSIX/relative cases, quoted/code paths with spaces, uncertain spaced prose and line suffixes. The detailed context already states that 29 exact vectors supply source spans/actions/literals.

Style rationale and action: CALIBRATE the fixture sentence to name the existing selected design vectors and the remaining transfer/qualification step. The concrete implementer decision is whether to define a missing grammar/vector set or implement and qualify the one already selected. Preserve the statement that general recognition is unproven: synthetic expectations are not measured detector coverage. This is a checkpoint-clarity issue, not proof that the sentence falsely asserts no fixtures exist or that extraction has failed.

Citations: docs/designs/215/path-copy-contract.md:L3-L5, L23-L44, L48-L70; docs/designs/215/evidence/path-copy-cases.json:L1-L5, L8-L46, L104-L168, L208-L232; contextual docs/designs/215/design_draft.md:L278-L289.

### S7-S-2 — Nit — Remove repeated defensive clauses without removing decisions

Affected active scope: Technical Plan L53; Provenance and clipboard actions L101; Components and API changes L113; Qualification before a product change L130, all in docs/designs/215/design_draft.md.

Exact affected clauses and recommended editorial action:

| Active line | Clause | Action and rationale |
|---|---|---|
| L53 | “This records design intent; untested behavior is not claimed to work” | DROP this repeated assurance. Status L4 and the concrete evidence/qualification distinction at L28 already establish the checkpoint; the clause adds no separate reader choice. Keep the immediately following implementation-authorization requirement. |
| L101 | “it is not a claim that the composer preview already meets the output feature” | DROP this repeated denial. L87 already names the concrete reuse decision and the missing source mapping/inline-path behavior. Keep the untrusted-content, rendering and control-ownership requirements at L101. |
| L113 | “not missing deliverables of this documentation PR” | DROP this defensive phrase. “component locations for future implementation,” the New/proposed component labels and the exact inventory reference already tell the reader what to implement. Keep those scope/inventory statements and the helper-placement precedence rule. |
| L130 | “delivery estimate or release claim” within its final negative list | DROP these two inactive categories. The paragraph already gives the operator's capture-unavailable/Raw decision and requires copying qualification. No delivery estimate or release decision is presented in the active scope. Keep the actual recorded-baseline, unsupported-floor and qualification boundaries at L128-L130. |

Style rationale: these clauses defend against unstated interpretations after the document has already given the relevant operative rule. Removing only those clauses preserves every selected constraint and every meaningful qualification gate. This is an observed redundancy/no-independent-decision finding; no runtime failure or measured reading-time impact is asserted.

Citations: docs/designs/215/design_draft.md:L4, L28, L53, L87, L101, L113-L124, L128-L130; current docs/designs/215/companion-view-contract.md:L3-L5, L51-L67; current docs/designs/215/path-copy-contract.md:L3-L5, L70; existing preview/parser bodies archived as .tmp/215-exit-bootstrap-review-20261108/repo-23.txt:L9-L25 and repo-24.txt:L20-L32.

## Caveats and claims retained after calibration

KEEP the bounded-experiment qualification at L28/L57/L128: the recorded copy experiment is a standalone fixture, and its findings separately identify unqualified production, accessibility, performance and lifecycle behavior. Its actual Windows clipboard results permit LF-to-CRLF equivalence for the tested browser-copy cases, rather than universal literal LF identity. L89 therefore matches its cited evidence. Sources: comment-6646355033.txt:L7-L12, L17-L31, L33-L41 in the supplied source archive; canonical https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033.

KEEP L71/L77/L79/L81/L91/L95/L97: gaps, native identity, stale target revisions, bounded retention, uncertain-path review and evidence-specific labels determine enabled Copy/Review actions and recovery behavior. The current contracts distinguish selected design expectations from runtime qualification. Sources: capture-channel-contract.md:L7-L13, L79-L98, L163-L173; companion-view-contract.md:L45-L67, L115-L155; path-copy-contract.md:L23-L44; capture-provenance-contract.md:L10-L16, L50-L77.

KEEP the preview reuse boundary at L87 and the native Stop distinctions at L109. The preview disables raw HTML, restricts links and replaces images; the current reference parser skips inline code. The focused experiment observed turn-abort backgrounding and separately observed native Escape stop the timed fixture. These are concrete renderer-reuse and Stop-routing decisions, not generic safety prose. Sources: archived repo-23.txt:L9-L25, repo-24.txt:L20-L32; comment-6647481988.txt:L21-L32; canonical https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988.

KEEP the alternative-specific qualification and scope distinctions at L138-L176. Their costs/evidence boundaries explain why the selected file/live/native-Variant-A baseline is retained and what would require a later explicit decision. Native pointer copying was mode-dependent in the recorded trial; snapshot recovery was bounded and unqualified; neither observation establishes universal inability. Sources: technical_choices.md:L10-L62, L70-L92; comment-6646855408.txt:L12-L27, L41-L49; comment-6685055630.txt:L7-L15. No new inference, Run or direct-response scope is recommended.

## Completed reads and limits

The following actual bodies were examined, rather than relying on input-manifest counts, prior repair labels or static-check summaries:

| Body | Exact examined extent |
|---|---|
| docs/designs/215/path-copy-contract.md | L1-L75, full |
| docs/designs/215/evidence/path-copy-cases.json | L1-L387, full actual vector bodies |
| docs/designs/215/technical_choices.md | L1-L112 |
| docs/designs/215/capture-provenance-contract.md | L1-L93, full; requested upper bound 115 ended at EOF 93 |
| docs/designs/215/capture-channel-contract.md | L1-L99, L163-L181; remaining headings located, remaining bodies not examined |
| docs/designs/215/companion-view-contract.md | L1-L68, L115-L173; remaining headings located, remaining bodies not examined |
| Source archive comment-6646355033.txt | L1-L47, full |
| Source archive comment-6647481988.txt | L1-L51, full |
| Source archive comment-6646855408.txt | L1-L60, full |
| Source archive comment-6685055630.txt | L1-L21, full |
| Source archive repo-20.txt, media/attention/hooks/register.js | L1-L35 |
| Source archive repo-21.txt, src/panel/webview/xtermTerminal.ts | L85-L130 |
| Source archive repo-22.txt, src/panel/sessionPanelProvider.ts | L615-L681 |
| Source archive repo-23.txt, composer/markdownPreview.ts | L1-L25, full |
| Source archive repo-24.txt, composer/references.ts | L1-L55, full; requested upper bound 85 ended at EOF 55 |
| Source archive repo-25.txt, src/sessions/sessionManager.ts | L340-L378 |
| Source archive repo-26.txt, src/panel/webview/renderer.ts | L380-L487 |

“Source archive” means .tmp/215-exit-bootstrap-review-20261108/. Runtime source bodies are the pinned ef5fd48f4b676881a8730afbf8e583e70565ca11 snapshots supplied by the context. Cached source bodies were not freshly fetched from GitHub. Source-index metadata and references to prior reviews were used for navigation only, not as correctness evidence; prior review/repair reports were not opened. Parent transcripts, conversational history and memory were not retrieved.

Not run: product implementation, compiler, tests, build/package, native CLI/model calls, clipboard/ACL/live transport probes, Git commands or GitHub mutation. No claim is made that synthetic path vectors pass a product detector, that all capture/view vectors were examined, or that unexamined source/contract regions are conformant. Bash read access returned E_ACCESSDENIED once; subsequent reads used Node filesystem access. Only this authorized review report was written.
