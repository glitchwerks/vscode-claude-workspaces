# Technical choices for the copying companion

* **Author:** Christopher Beaulieu
* **Date:** 2026-11-06
* **State:** Capture-source options for author selection; neither selected or ranked.
* **Parent:** [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215)
* **Draft:** [Formal design](design_draft.md). Overview & Goals is approved; Technical Plan is not yet drafted. [O]

## Decision 1: complete output source and recovery

The companion needs logical explanation/command text rather than reconstructed terminal rows. The first source decision is whether it displays only what it observes live or also asks the same CLI for a bounded current message snapshot when recovery is needed. Both options below retain the subscription-backed interactive CLI, full explanation layout, native Escape and raw-terminal toggle. Neither adds an inference request, changes authentication or replaces the session. These are proposed mechanisms within the approved goals, not new capability claims. [B; O; E]

### Live capture only

**Mechanism:** observe the same CLI's conversation/tool events and send allowed explanation text and tool metadata to the extension's session host. The host retains a bounded live model and sends a rendering projection to the companion. The independent PTY path continues feeding xterm. Recreating the webview can reuse what the live host still retains; this does not require re-reading a transcript or asking Claude for another answer. The experiment exercised event-based capture, not every production lifecycle case. [E; P; author-proposed mechanism]

**Trade-offs:** there is one content path to reconcile, with no snapshot-to-event matching. That avoids recovery-specific code, but it cannot supply explanation text from before capture started or restore content the host lost. Retaining the full explanation inside the active viewing window still requires source mapping, limits, failure handling and packaged verification; it is not a styling-only change. No delivery estimate is established. [R:M1, M4-M6; inference from E; author-proposed boundary]

**When it fails or falls short:** a missed event, late plugin attachment, lost host state, or eviction can leave a visible gap. The companion must say content is unavailable or incomplete and keep native access; it must not reconstruct a supposedly exact command from terminal wraps. Existing raw replay is not an unlimited rich-history guarantee. [R:M1, M4-M6; P; proposed failure contract]

**Qualification still needed:** nonblocking delivery, complete payloads, event identity/order, lifecycle gaps, source-to-Copy fidelity and host/platform compatibility. The earlier bounded success is not proof of these cases. [E; R:M1-M6]

### Live capture with bounded CLI snapshot recovery

**Mechanism:** use the same live path, plus the CLI's own session.messages read when starting/recovering the companion. Read an allowlisted message representation from that existing session, not arbitrary transcript files and not a new model turn. The extension would rebuild or reconcile its bounded reading window from the snapshot and live events. Exact ordering and reconciliation must be established before treating recovered items as authoritative. [S; author-proposed mechanism]

Recovery is conditional on a normally available CLI session and readable snapshot; this option does not promise that the existing PTY process survives an extension-host restart. Normal launch/resume behavior remains outside this copying-source choice. [B:Retained constraints; author-proposed boundary]

**Trade-offs:** this offers a candidate way to regain retained session content after attachment or host-state loss, at the cost of another read path, bounded snapshot processing and recovery/reconciliation rules. It does not create unlimited history: the reviewed API returns at most the newest 4,096 entries, and not every native progress/notice row is a conversation message. Recovery behavior has not been tested by the existing experiments. [S; D; R:M4, M6]

**When it fails or falls short:** an incomplete/compacted snapshot cannot recover missing content. Overlap with live events, identical messages or insufficient identity could duplicate, omit or misattribute items. The reviewed simple message shape does not provide an ordinary stable message handle; do not assume matching is solved. When a reliable recovery boundary cannot be established, show a gap and retain native access rather than silently joining uncertain content. Snapshot timing, compaction and reconciliation remain unverified, not observed bugs. [S; R:M1, M3-M4; proposed failure contract]

**Qualification still needed:** actual message/block contents, timing relative to events, identity and reset rules, compaction/resume behavior, payload limits, source fidelity and processing cost. This option would need separate qualification; choosing it does not itself authorize a new live experiment or prove compatibility. [S; B:Remaining formal-design work]

## Constraints shared by both choices

* Keep the full captured explanation visible; separate commands and place Copy beside paths. Do not trade the approved context requirement for a shorter extraction list. [B:Overview]
* Copy complete source values. Clear paths stay one-click; uncertain boundaries use the approved editable preview. A gap or partial payload cannot be presented as a complete target. [B:Goals vs. Non-Goals; R:M1-M4]
* Keep source-backed execution provenance distinct from assistant examples or uncertain suggestions. Neither event capture nor snapshots automatically prove intent. [B:Copyability and intent are different claims; R:M3]
* Keep native output/input, foreground Escape and the raw-terminal toggle independent of companion capture health. Direct question/permission controls are optional and are not selected by either source choice. [B:Confirmed foundation; R:M5, M7]
* Limit capture to intended explanation/command content and relevant tool evidence, with explicit privacy and retention boundaries. Do not turn a message snapshot into permission to copy every internal payload into diagnostics or storage. Exact transport and storage mechanics remain design work. [R:M1, M4, M6; author-proposed boundary]

## Evidence boundaries

The event option has controlled hands-on evidence in Claude Code 2.1.317 / Pro. The snapshot option is supported as an API candidate by the current documentation and that build's generated declaration contract, but has not received a live recovery experiment. This distinction is evidence, not a ranking of the choices. The API reference itself directs authors to installed-build declarations when public types differ. [E; S; D]

The active prerelease source was rechecked on 2026-11-06 and remains ef5fd48f4b676881a8730afbf8e583e70565ca11. It already loads an extension mod but keeps attention metadata-only. A new content path must remain separate from that metadata publisher; it must not imply the current composer protocol already supports output capture. [S; P]

## Sources

* **B:** [Finalized concepts brief](concepts_brief.md), approved in A. Named B sections identify its accepted goals and still-open technical work.
* **A:** [Concept approval and egm-draft authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684810864).
* **O:** [Overview & Goals section approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685022793).
* **R:** [Goldfish report](goldfish_review_report.md), [committed review checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/blob/fe9d42be1890b060fd0522d956f28082b6018861/docs/designs/215/goldfish_review_report.md). Findings M1-M7 distinguish risks from observed defects.
* **E:** [Bounded event-based copying experiment](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646355033), with [preserved source/receipts](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).
* **S:** [2026-11-06 read-only source research: live events and session.messages declarations](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6685055630). This preserves the inspected 2.1.317 interface limits and distinguishes the untested recovery path from observed behavior.
* **P:** [Committed mod and metadata-only attention boundary](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L35).
* **D:** [Official mods reference](https://code.claude.com/docs/en/plugins/mods/reference) and [event continuation documentation](https://code.claude.com/docs/en/plugins/mods/events) (fetched 2026-11-06).
