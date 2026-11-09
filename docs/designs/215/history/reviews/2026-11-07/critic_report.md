# Stage 7: Feature critique

**Target:** [design lines 1–182](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L1-L182), with the remainder read for definitions. **Date:** 2026-11-07. [Review inputs](context_manifest.md).

## Reviewer status

| Reviewer | Standard | Status | Blockers | Majors | Nits |
|---|---|---|---|---|---|
| Design Critic | Feature Specification | completed | 0 | 1 | 0 |
| Structural | Feature Specification | completed | 0 | 0 | 0 |
| Style | Persona only | completed | 0 | 0 | 3 |

## S7D-1 — Major: Run’s no-interruption guarantee lacks a concurrency boundary

**Scope:** [target lines 104–112](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L104-L112), [Run contract lines 29–33](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L29-L33).

Run reuses a revealed interactive terminal, observes shell start/end events and promises to block busy or unknown work. The one-pending-action guard serializes companion Run actions but does not cover native input arriving between the last idle observation and dispatch. The selected API can interrupt existing work. Thus the specified observations do not enforce the promised non-interruption boundary. This is an **inferred design race**, not a demonstrated product failure. [Terminal API](https://code.visualstudio.com/api/references/vscode-api#TerminalShellIntegration), fetched 2026-11-07.

Specify an admission boundary covering native input, shell-state changes and companion dispatch, including foreground work starting after the last idle observation. Explain how dispatch avoids interruption. If this interface cannot enforce the guarantee, record the residual limitation for an explicit author decision. Preserve the selected persistent-shell scope rather than silently switching to fresh terminals. [Persistent-shell decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6707453909), fetched 2026-11-07.

## S7S-1 — Nit: decision labels obscure the selected choice

**Scope:** target lines 145, 149, 155, 161 and 167. Several **Rejected by author:** labels introduce the selected companion, full-context layout, private channel, live capture or copying behavior. Readers must use the surrounding alternative heading to recover the decision. Name the rejected alternative explicitly, then state Selected instead or Decision. [Alternatives text](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L139-L167), [layout decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684608334), [source decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6700896861), [transport decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701115191), fetched 2026-11-07.

## S7S-2 — Nit: obsolete wording presents finalized work as unresolved

**Scope:** target lines 30 and 50. The phrases “These remain acceptance and technical-design work” and “Capture/history limits still need to be designed” do not reflect the rules and numerical limits now supplied in items 3–5. **CALIBRATE:** point to the selected contracts and describe implementation/qualification as outstanding. This is a status-wording discrepancy, not a claim that qualification passed. [Current wording](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L22-L50), [selected implementation contracts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L229-L263).

## S7S-3 — Nit: universal transcript-reader caveat adds no decision

**Scope:** target line 167. The final clause “no claim is made here that every possible transcript reader is infeasible” adds no v1 decision after transcript tailing is excluded and line 139 already distinguishes selection from failure. **DROP** that clause, retaining the explicit source boundary. [Alternative and framing](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L139-L167).

## Structural result and read receipts

The structural reviewer found the required problem, goals, architecture, alternatives and risk/limit content; the supplied standard does not mandate a particular Risks heading. Heading hierarchy, table/fence syntax and inspected local links/anchors passed this lens. This is a structure result, not runtime readiness. [Feature range](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L1-L182).

All three reviewers read their complete personas, the complete target, the temporary source catalog and all five linked local context documents; the two supplied Feature Specification standards were read. All independently matched target SHA-256 d589e392a78b15c805638c7c5a4936c28e565359a02b0c7a7d561ed9a5c38019. No required read was missing.

Design Critic inspected approval/source/experiment comments 6684329277, 6684608334, 6684810864, 6700896861, 6701115191, 6706751545, 6685055630, 6701284701, 6707126769, 6707453909, 6646355033 and 6647481988; pinned composition, session, launch, channel, xterm and renderer evidence; and official mod/terminal excerpts. Structural inspected the corresponding selection comments, including 6701274240, and pinned Markdown/channel/session/launch excerpts. Style inspected those selections plus 6685022793 and 6646855408, and the cited runtime boundaries. Durable source URLs are listed in the [manifest](context_manifest.md).

Style found no existing/tested capability overclaim in its inspected evidence. Clipboard newline, native Escape, packaged-support and Run-readiness caveats were KEEP, not findings. Reviewers did not read each other’s reports, edit files, execute design commands, run builds/model probes or mutate GitHub. No findings were remediated during this consolidated pass.
