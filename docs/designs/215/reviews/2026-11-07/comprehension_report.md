## What this proposes

Add a companion view that preserves Claude’s full captured explanation while providing exact command Copy actions and adjacent path Copy controls, with editable review for uncertain paths. Capture comes from live observations of the same subscription-backed CLI through a bounded private file channel into an extension-owned source model. Questions, permissions and Stop remain native through the retained terminal. A separate Run action executes complete commands in a dedicated persistent VS Code shell associated with the Claude session generation, initially launched at its recorded original folder.

## How the existing system works, per this document

The extension already manages the interactive Claude CLI, routes its PTY output into xterm and sends native input through session-owned handling. Its packaged attention plugin publishes metadata, while the composer has a restricted Markdown preview and a reference parser that skips inline code. Those components provide integration points, but the document explicitly distinguishes them from the proposed source-mapped companion renderer and content channel.

## Findings

**S6C-1 — Major — Required release/packaging lane is an unexplained workflow prerequisite.**
**Affected target:** `docs/designs/215/design_draft.md:L189-L191`, `L294-L296`.

The implementation instructions require the “required feature worktree/release lane,” and qualification requires the “correct-lane packaging check,” but the document never identifies the available lanes, how to select one or where that selection procedure is documented. A new reader can understand the proposed architecture but cannot determine which packaging check satisfies this mandatory qualification step. Name the applicable lane and check, or provide a direct workflow reference explaining their selection.

**Read receipt:** Read the complete comprehension persona and all target lines **1–351**, covering FeatureRange **1–182** and DetailedRange **183–351**. No linked documents, source files, prior reports or external material were opened.

---

Stage 6 completed on 2026-11-07 with one Major finding and no missing required read. The complete reviewer response above is preserved. This is a target-only comprehension test, with no baseline context supplied. [Reviewed prerequisite](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L191), [qualification instruction](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L294-L296), [review scope](context_manifest.md).
