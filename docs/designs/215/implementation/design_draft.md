# Completed-reply copy panel (#215)

**Status: revised design; experiments and implementation stopped.** The maintainer selected this narrower direction on 2026-11-19. It replaces the live private-file capture design for v1; it does not authorize implementation, CLI execution, CI, merge or release. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Overview

Keep the existing subscription-backed Claude Code CLI and native terminal. Add a read-only panel for the final assistant message captured at a reply boundary. Preserve that message's full explanation, with readable Markdown, separate command/code blocks and Copy buttons beside file/folder paths. The main measure of success is copying the intended literal text without selecting wrapped terminal lines. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

The panel is a record of **captured replies**, not a live terminal replacement, full transcript or tool-execution ledger. Its heading says “Last captured reply”; automatic capture may be absent or delayed. A final assistant message need not contain every earlier explanation or tool result in the turn. Streaming text, intermediate tool activity and interrupted partial replies stay in Raw. These are deliberate v1 boundaries. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768); [Stop input](https://code.claude.com/docs/en/hooks#stop) (fetched 2026-11-19).

## Goals

| Need | Selected behavior |
|---|---|
| Subscription CLI | Keep the same native session and subscription login; require no separate API key or separately billed replacement client. |
| Command copying | Show explicitly recognizable shell commands in blocks with Copy. Preserve complete literal bodies, intentional newlines, indentation, quoting and Unicode. |
| Path copying | Copy just a file/folder path from prose, quotes or inline code, excluding surrounding formatting and explanation. |
| Context | Keep the entire captured final message visible with headings, lists and code. |
| Uncertainty | Use editable Review for uncertain boundaries; never silently guess, trim, normalize or expand the value. |
| Truthful labels | Use “Command in reply” or “Code in reply”. Reply wording alone never establishes execution. |
| Native access | Keep same-session Raw access for questions, permissions and native Escape; capture failure must leave the CLI usable. |

These are the retained product requirements and narrowed scope in the [maintainer decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768). The [literal path rules](path-copy-contract.md) remain applicable only to extraction and Review.

## Non-goals

Run, Run again, C2 and direct panel answers/permission controls remain deferred. V1 also excludes a live executed-command feed, transcript tailing/history reconstruction, partial-reply streaming, model-assisted extraction and automatic execution of anything copied. No separate Claude process or SDK/API client replaces the subscription CLI. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Technical plan

The selected direction is a small, one-way completed-message capture path:

1. Observe the ordinary top-level Claude Code `Stop` hook's `last_assistant_message`.
2. Deliver the message to the extension through a bounded, authenticated loopback HTTP notification.
3. Validate its launch/session identity and payload before retaining an immutable in-memory snapshot.
4. Render that snapshot and derive Copy targets from its original source.
5. If automatic capture is unavailable, retain Raw and offer explicit user import of copied reply text.

Anthropic documents the Stop message field and HTTP hook delivery. This supports the proposal; it does **not** establish field availability or automatic compatibility with a particular installed CLI, hook policy or subscription configuration. Treat missing content as an explicit gap. [Hooks reference](https://code.claude.com/docs/en/hooks) (fetched 2026-11-19).

The loopback endpoint is local-only and launch-bound, with a per-launch secret, request-size limit and short timeout. It must send no tool/permission decisions, blocking verdict or additional model context. Stop responses are empty success responses; network failure must not prevent normal CLI use. Do not assume environment expansion in hook URLs: configuration of the literal local endpoint and secret header must use a supported launch-scoped mechanism. This configuration/version check is **unverified** until implementation review; never work around it by editing user-global authentication or hooks. These are design requirements, informed by [HTTP hook configuration and response semantics](https://code.claude.com/docs/en/hooks#http-hook-fields) (fetched 2026-11-19).

The new path has no private-file reply publisher, upload/acknowledgement protocol, persistent reply store, capacity reservation for native SDK writes or SDK worker-lifetime dependency. Static hook configuration, if needed, is configuration rather than a reply spool. The earlier private-file experiments are historical; their shutdown proofs are not prerequisites for this in-memory panel. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768); [previous transport](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/capture-channel-contract.md).

## Snapshot, Copy and fallback behavior

- Every snapshot owns its original text, launch/session identity and local receipt identity. Targets bind to that snapshot and source span, never to “whatever reply is current” when Copy finishes.
- Keep finite per-message, per-session and host-wide retention limits. Oversize input, eviction and unavailable mapping are visible; never turn a truncated command or path into a complete Copy target. Numerical caps remain an implementation choice to record before coding and cover at each boundary.
- Closed/replaced sessions reject old notifications. Sessions never share targets. Treat delivery order as receipt order unless the actual source supplies verified ordering; do not claim to reconstruct chronological turn order. Duplicate delivery must not mutate an open Copy/Review target.
- Copy uses source text, not rendered DOM text or terminal bytes. Recognize explicit shell syntax conservatively. Generic source code/logs may have a code Copy action, but no invented command or execution label. Prompt-like prefixes with uncertain boundaries require Review.
- Paths use explicit source-mapped boundaries and the retained [path contract](path-copy-contract.md). No filesystem existence check, path expansion, slash/case conversion or semantic guessing.
- A missing/empty observed message shows a gap; a notification that never arrives may be undetectable. Always label retained content “Last captured reply”, with its session/receipt context. Never relabel old content as a newly completed reply.
- Manual import is explicit, scoped to the selected session, labelled “Imported reply — unverified”, and parsed as supplied text. Native `/copy` is the primary source; `/export` requires the user to select the desired reply text. Do not automatically parse a conversation export as one completed reply.
- Render untrusted text inertly. Keep Copy/Review keyboard accessible; announce Copy only after the clipboard operation succeeds. Cancel preserves the clipboard. Preserve context and expose errors.

These are selected behavior requirements from the [decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) and [focused test plan](../../../manual-verification/215-companion.md). Native copy/export availability is documented in the [Claude Code cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet) (fetched 2026-11-19); supported-build behavior remains unverified.

## Native controls

Keep xterm and the existing CLI session available through the Raw toggle. Questions, permissions and interruption remain native; a panel reminder may point to Raw but must not answer or approve anything. Any retained Stop control sends the existing native Escape once, distinguishing “input sent” from confirmed interruption. No focus theft, automatic resubmission or new native-response broker is part of this design. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768); [previous native-control scope](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/design_draft.md#overview).

## Alternatives considered

The previous live private-file companion supported richer event/provenance ambitions, but its write lifetime, cleanup and admission qualification became the critical path. The completed-reply panel deliberately gives up streaming and executed-tool coverage to concentrate on copying. Native terminal modifications remain historical prior art; they do not change the selected Raw fallback. Manual import remains the simple fallback if the ordinary hook is unavailable. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768); [prior comparison](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646855408); [previous qualification](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/manual-verification/215-companion.md).

## Detailed implementation

No implementation starts under this revision. Before a future implementation authorization, reconcile existing extraction/renderer reuse against this design, choose numerical bounds, and verify supported launch-scoped hook configuration and missing-field behavior from the actual target source. Existing #221–#224 work records the previous architecture; closed tickets and earlier tests are not qualification of this replacement. [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768); [#225](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225).

The [focused test plan](../../../manual-verification/215-companion.md) is the acceptance authority. Start with recorded/synthetic completed replies and injected clipboard assertions; later physical clipboard and subscription/native smoke require separate resumption authorization. Delayed-write, host-kill, saturation and universal SDK-worker-quiescence experiments are excluded from this panel's test gates. **All experiments remain stopped.** [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Implementation inputs and history

The [current handoff and input index](documentation-handoff.md) lists the active design and test plan. The old D0/P0–P4 counts, Ready record, capture/view contracts and native receipts belong to their historical checkpoints. [Previous design at c6c07c9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/design_draft.md).
