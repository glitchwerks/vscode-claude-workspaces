# Technical choices for the copying companion

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-06
* **Updated:** 2026-11-07
* **State:** Live capture only, private files and Variant A native controls selected. Run/dedicated original-folder destination added; its terminal lifecycle remains open. [L; T; A5; A6]
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **Design:** [Formal design with Run amendment](design_draft.md). Copying/native-control choices are recorded; [Run lifecycle](run-amendment.md) awaits selection before fresh review of the amended design. [O; T; A4; A5; A6]

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

**Mechanism:** create a private, extension-owned channel directory for each process generation. The mod asynchronously publishes bounded, sequenced content frames using temporary files and atomic publication; the host reads, validates and acknowledges them, then retires consumed files. A separate bounded producer queue keeps the observer from waiting for file I/O or a reader. Follow the existing composer's ownership/token/cleanup conventions while defining a new output protocol. File-system access controls must be qualified on Windows; POSIX mode bits alone are not proof of private Windows access. [C; proposed mechanism and qualification]

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

**Confirmed:** add a separate explicit Run action, with the dedicated shell launched in the original core folder recorded when that Claude workspace session opened. Use the host-owned launchedRootPath snapshot; never the active editor, an imported directory, an arbitrary active terminal or Claude's PTY. Copy stays non-executing, and Variant A question/permission handling stays native. This explicitly expands the previous copying-only scope. [A6]

**Open:** preserve a dedicated shell's state between Runs, or create a fresh dedicated shell from the original folder each time. [The amendment](run-amendment.md#one-remaining-lifecycle-choice) gives both mechanisms, trade-offs and failure cases. The first-launch mockup does not select either. No real command or product implementation has been run for this amendment. [A6]

## Retained constraints

* Keep the full captured explanation visible; separate commands and place Copy beside paths. Do not trade the approved context requirement for a shorter extraction list. [B:Overview]
* Copy complete source values. Clear paths stay one-click; uncertain boundaries use the approved editable preview. A gap or partial payload cannot be presented as a complete target. [B:Goals vs. Non-Goals; R:M1-M4]
* Keep source-backed execution provenance distinct from assistant examples or uncertain suggestions. Neither event capture nor snapshots automatically prove intent. [B:Copyability and intent are different claims; R:M3]
* Keep native output/input, foreground Escape and the raw-terminal toggle independent of companion capture health. The separate control decision selects native question/permission handling and explicitly defers direct controls. [A5; B:Confirmed foundation; R:M5, M7]
* Limit capture to intended explanation/command content and relevant tool evidence, with explicit privacy and retention boundaries. Do not turn a message snapshot into permission to copy every internal payload into diagnostics or storage. Detailed file-protocol and storage limits remain Detailed Implementation work. [T; R:M1, M4, M6; design boundary]

## Evidence boundaries

The event option has controlled hands-on evidence in Claude Code 2.1.317 / Pro. The snapshot option is supported as an API candidate by the current documentation and that build's generated declaration contract, but has not received a live recovery experiment. This distinction is evidence, not a ranking of the choices. The API reference itself directs authors to installed-build declarations when public types differ. [E; S; D]

The active prerelease source was rechecked on 2026-11-06 and remains ef5fd48f4b676881a8730afbf8e583e70565ca11. It already loads an extension mod but keeps attention metadata-only. A new content path must remain separate from that metadata publisher; it must not imply the current composer protocol already supports output capture. [S; P]

## Sources

* **B:** [Finalized concepts brief](concepts_brief.md), approved in A. Named B sections identify its accepted goals and still-open technical work.
* **A:** [Concept approval and egm-draft authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864).
* **O:** [Overview & Goals section approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793).
* **L:** [Author selection of live capture only](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861).
* **T:** [Author selection of private file transport, Technical Plan approval and transition to Alternatives Considered](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191).
* **A4:** [Author approval of Alternatives Considered and authorization for Detailed Implementation](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701274240).
* **A5:** [Author selection of native control Variant A and resolution of the Detailed Implementation gate](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6706751545).
* **A6:** [Run amendment and dedicated/original-core-folder destination](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707126769), with [the proposed Run contract and remaining lifecycle choice](run-amendment.md).
* **R:** [Goldfish report](goldfish_review_report.md), [committed review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md). Findings M1-M7 distinguish risks from observed defects.
* **E:** [Bounded event-based copying experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033), with [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).
* **S:** [2026-11-06 read-only source research: live events and session.messages declarations](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630). This preserves the inspected 2.1.317 interface limits and distinguishes the untested recovery path from observed behavior.
* **P:** [Committed mod and metadata-only attention boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L35).
* **C:** [Existing composer file-channel ownership and launch binding](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L32-L105), [marked dead-channel cleanup](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L113-L134) and [bounded request/response transport](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L142-L199). This is source precedent, not evidence that an output channel exists.
* **E3:** [Focused-control findings](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647481988) and [preserved probe source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596), Claude Code 2.1.317 / Pro; the source contains the localhost HTTP bridge used by that experiment.
* **D:** [Official mods reference](https://code.claude.com/docs/en/plugins/mods/reference) and [event continuation documentation](https://code.claude.com/docs/en/plugins/mods/events) (fetched 2026-11-06).
* **D2:** [Official mods API namespaces](https://code.claude.com/docs/en/plugins/mods/api) (fetched 2026-11-06). Installed-build declarations and packaged behavior still need qualification for the chosen transport.
