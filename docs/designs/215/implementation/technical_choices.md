# Technical choices: completed-reply copy panel

**Revised 2026-11-19; design only. Experiments and implementation remain stopped.** [Maintainer decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

| Choice | Rationale and source |
|---|---|
| Keep subscription-backed native CLI | Required by #215; retain current process, terminal and login without a separate API key/client. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) |
| Final assistant message only | The chosen narrower scope targets command/path copying with full captured reply context. Streaming and tool chatter stay in Raw. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) |
| Ordinary Stop hook, proposed local HTTP delivery | The documented hook carries final-message text and supports HTTP delivery. Optional/missing fields and exact launch configuration remain to be checked for the target build; no runtime compatibility claim is made. [Hooks](https://code.claude.com/docs/en/hooks) (fetched 2026-11-19) |
| Bounded in-memory snapshots | Avoid the former reply-spool/native-write-lifetime dependency; retain immutable source text and session-bound Copy actions. Numerical limits must be recorded before implementation. [Design](design_draft.md#snapshot-copy-and-fallback-behavior) |
| “Last captured reply” heading | Capture can be absent/delayed; receive order does not prove chronological turn order. This is a selected truthful presentation rule. [Design](design_draft.md#snapshot-copy-and-fallback-behavior) |
| Source-backed Copy and editable Review | Preserve exact command bodies and path-only values. The deterministic lexical path rules remain useful without the old transport. [Path contract](path-copy-contract.md); [decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) |
| Neutral command provenance | A final reply is not execution evidence. Executed-tool capture is deferred. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) |
| Native controls and same-session Raw | Questions, permissions and Escape remain native. Run and direct panel responses remain deferred. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768) |
| Explicit manual import fallback | User selects reply text from native copy/export; import is labelled unverified. Availability on supported builds remains unverified. [Cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet) (fetched 2026-11-19) |

The endpoint's authentication, payload bound, launch/session validation and passive response are requirements to implement and verify; this revision does not create or enable an endpoint. No user-global hook/authentication changes are authorized. [Design](design_draft.md#technical-plan)

The [focused test plan](../../../manual-verification/215-companion.md) replaces the old lifecycle-heavy qualification sequence. Offline fixtures precede a later separately authorized installed clipboard/native smoke; no tests run as part of this revision. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

## Superseded choices

The private-file live publisher, admission/acknowledgements, cross-process write reservations and SDK-worker cleanup qualification are no longer v1 requirements. Their original rationale, inventory and limits remain in the [previous choices at c6c07c9](https://github.com/glitchwerks/vscode-claude-workspaces/blob/c6c07c9d59d954290b36f371e78f5ab12a2284de/docs/designs/215/implementation/technical_choices.md) and historical #222/#225 discussion. Previous passing observations do not qualify the replacement panel. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-7009882768)

Existing extraction, model, renderer and native-control code may offer reuse, but adaptation and removal of old capture wiring require a future reviewed implementation. This is an unverified reuse candidate, not an instruction to retain the old transport. [#223](https://github.com/glitchwerks/vscode-claude-workspaces/issues/223); [#224](https://github.com/glitchwerks/vscode-claude-workspaces/issues/224).
