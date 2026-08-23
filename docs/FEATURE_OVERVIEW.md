# Claude Workspaces

## Elevator pitch

Claude Workspaces is a VS Code extension for developers who work across
multiple related repositories in one `.code-workspace`. It provides a dedicated
bottom panel where they can launch, view, switch between, restart, and close
Claude Code sessions without juggling anonymous terminal tabs.

Each workspace folder can have its own Claude sessions and its own selective
access to sibling folders. A backend session might receive the frontend and
infrastructure repositories, while an infrastructure session receives only the
backend. The developer configures those relationships once, and every future
launch uses the appropriate workspace context automatically.

Source: `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L14-L54`.

## What it does

- Turns a saved `.code-workspace` into the boundary for a group of related
  project folders.
- Adds a dedicated Claude Sessions panel to the bottom of VS Code.
- Launches multiple concurrent Claude Code sessions from any workspace folder.
- Uses a configurable default folder for fast one-click launches.
- Lets each launch folder selectively import different sibling folders.
- Keeps every session clearly named, ordered, and independently managed.
- Terminates sessions when their tabs close or the VS Code window shuts down.
- Leaves Claude sessions launched through other tools completely untouched.

Sources:
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L84-L177`;
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L179-L239`.

## Why it matters

Multi-repository work is common, but Claude Code still treats the folder where
a session starts as its natural boundary. Developers working across a frontend,
backend, shared library, and infrastructure repository repeatedly pay the same
coordination cost: choosing the right folder, supplying related directories,
re-explaining project relationships, and tracking which terminal belongs to
which task.

Claude Workspaces makes the saved VS Code workspace—not an individual
repository or terminal—the working context. It reduces launch friction while
preserving control: sibling access is explicit, directional, disabled by
default, and configured separately for every possible session root.

Sources: `docs/PROBLEM_STATEMENT.md:L1-L39`;
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L104-L129`.

## How it works

1. The extension appears when a saved `.code-workspace` is opened.
2. On first use, a setup view asks for an optional default root and the sibling
   folders each root should import.
3. The configuration is stored locally by the extension rather than written
   into the `.code-workspace` file.
4. **New Session** launches Claude in the default root. **New in Folder…**
   launches from another workspace root.
5. The extension validates the selected sibling folders and passes the
   available ones to Claude at launch.
6. Each live process appears as an automatically named tab in the bottom panel.
7. Closing, restarting, or switching sessions happens through session-focused
   controls instead of general terminal management.

The initial version uses a terminal renderer internally because Claude Code is
currently a terminal application. That renderer is an implementation bridge,
not the product model; the long-term direction is a native Claude-session
experience.

Sources:
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L56-L82`;
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L131-L239`.

## V1 boundaries

The first version intentionally does not include session resume, persistence,
retained transcripts, general-purpose terminal features, native chat-style
rendering, or adoption of Claude sessions launched elsewhere. These are kept
out of the core so V1 can validate the central idea: whether a workspace-aware,
session-focused launch and tab experience meaningfully improves multi-repository
Claude Code workflows.

V1 also does not introduce a workspace-level `CLAUDE.md` or shared skills
layer. That is an explicit future direction: eventually, a `.code-workspace`
should be able to provide common instructions and skills to its member
repositories without duplicating them in every root. It remains separate from
the initial launch-and-session-management scope because the prior-art review
found no reliable existing mechanism to adapt.

Sources:
`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L324-L333`;
`docs/research/2026-08-23-multi-root-claude-workspaces-prior-art.md:L128-L142`.

## Smoke-test question

> When I open a multi-root VS Code workspace, can I start the right Claude
> session—with the right sibling repositories available—and confidently manage
> several sessions without thinking about terminal setup or losing track of
> which session belongs to which project?

If V1 makes the answer consistently “yes,” the core product concept is working.
