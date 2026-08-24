# Problem Statement: Claude Code × VS Code Multi-Root Workspaces

## Context

Many developers keep related work split across several separate VS Code
workspace roots (e.g. a frontend repo, a backend repo, a shared libs repo,
an infra repo) rather than one monorepo. Claude Code sessions today are
scoped to a single project root: each session only sees the `CLAUDE.md`,
skills, and files under the folder it was launched in. When work spans
multiple sibling workspaces, the user has to manually re-explain context,
duplicate or hand-copy `CLAUDE.md`/skill content, and juggle terminal tabs
or windows themselves — Claude Code and VS Code offer no first-class
concept of "this workspace is one of a related set."

## Problem

**Claude Code has no notion of a multi-root workspace group.** This causes
friction in several concrete ways:

1. **No cross-workspace awareness.** A Claude session started in Workspace
   A has no way to know Workspace B and C exist, what they contain, or how
   they relate — even when the user works across all three in the same
   sitting. Context has to be manually re-supplied every session.
2. **No workspace-level `CLAUDE.md` / skills concept.** Instructions and
   skills are either global (`~/.claude`) or single-project
   (`<repo>/CLAUDE.md`, `<repo>/skills/`). There's no layer for "these rules
   apply to this group of related workspaces" without copy-pasting into
   each repo.
3. **No discovery of per-workspace skills across the group.** Even if each
   workspace defines its own skills, a session in one workspace can't see
   or invoke skills that live in a sibling workspace.
4. **No convenient multi-root launch.** Starting Claude in "whichever
   workspace root I want, with a sensible default" is a manual `cd` +
   launch today; there's no notion of a default root for a group with
   easy switching to the others.
5. **No structured tab/session management in the VS Code UI.** When a user
   does open multiple Claude Code sessions (one per workspace), VS Code
   has no dedicated, predictable place (sidebar view or panel/tab-bar
   entry) to see and switch between them — they end up as generic
   terminal tabs indistinguishable from anything else.

## Goal

Build a standalone VS Code extension that makes the roots in a saved
`.code-workspace` behave, from Claude's perspective and the user's UI, like one
coherent working context — without merging them into a single repo. The
extension owns only sessions launched through its own bottom-panel workflow;
it does not adopt or alter sessions launched elsewhere. This direction is
resolved by D1-D3 in
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L24-L43`.

### In scope for V1

| # | Capability | One-line description |
|---|---|---|
| 1 | Selective cross-workspace awareness | For each launch root, the user can persistently select which sibling roots are supplied to its sessions. |
| 4 | Flexible launch with a default root | Launch Claude in any workspace root in the group; a configurable default root is used when the user doesn't pick one explicitly. |
| 5 | Managed workspace tabs in the VS Code UI | A dedicated bottom-panel tab surface for launching, seeing, switching, restarting, and terminating the extension's active Claude sessions. |

### Explicitly out of scope for V1

- Merging or restructuring the underlying repos (this is about coordination
  across separate roots, not monorepo migration).
- Real-time collaborative/multiplayer editing between sessions.
- Native chat-style rendering; V1 uses a terminal renderer as an implementation
  bridge while keeping the product model session-oriented.
- Persistence, resume, reconnect, or retained exited-session tabs.
- Adoption or management of Claude sessions launched outside this extension.
- Operation outside a saved `.code-workspace` window.
- Workspace-level `CLAUDE.md`/skills scope and guaranteed cross-workspace skill
  discovery (original capabilities 2 and 3). These remain deferred because the
  prior-art review found no reliable shipped mechanism
  (`docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L128-L142`).

## Resolved design questions

- **Group definition (D2-D3):** one saved `.code-workspace`; every listed
  folder joins automatically.
- **Distribution (D1):** standalone VS Code extension, not a Claude Code
  plugin and not a Conductor increment.
- **Local state (D4):** extension-local workspace state, separate from the
  `.code-workspace` file.
- **Default root (D5):** local override, then first available workspace
  folder.
- **Cross-root access (D6):** persistent directed import matrix; every
  source-to-target edge defaults disabled.
- **UI (D12):** dedicated bottom-panel session tabs, initially rendered with
  xterm.js/node-pty.

The complete V1 design and deferred items are in
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L1-L370`.

## Why this matters

Without this, multi-workspace users pay a recurring tax: re-explaining
context every session, duplicating instructions/skills across repos, and
losing track of which terminal tab is which Claude session. This extension
aims to remove that tax by making the workspace group — not the single
repo — the unit Claude and the VS Code UI reason about.
