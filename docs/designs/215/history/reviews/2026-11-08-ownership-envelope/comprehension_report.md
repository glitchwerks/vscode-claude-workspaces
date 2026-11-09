## What this proposes

The design proposes a VS Code companion view for the existing subscription-backed Claude Code CLI that keeps the captured explanation readable and adds Copy actions for complete commands and file/folder paths. An observational CLI mod would send allowlisted live content through a private file channel to a bounded extension-owned source model, which supplies the companion webview and its revision-bound copy targets. Copy uses retained literal values, uncertain paths receive an editable review, and missing or evicted capture appears as explicit boundaries rather than reconstructed content. The same PTY/xterm remains available for native questions and permissions, and Stop sends native Escape independently of capture. Run and direct companion question/permission controls are deferred; implementation and packaged/runtime qualification remain separately authorized future work.

## How the existing system works, per this document

The existing VS Code extension manages an interactive Claude Code session whose PTY output reaches an xterm terminal, alongside a composer and session-owned native input. Its launch/session integration supplies the current managed-session, CLI identity and process-generation ownership, while an existing mod entry supports attention/composer integration and the attention publisher carries notification metadata rather than conversation content. The runtime already has a restricted Markdown composer preview, but that preview is not the proposed source-mapped output renderer and its reference parser skips inline code. Recorded experiments support controlled event-based copying and particular native interactions, while the document explicitly leaves broader path recognition, packaged behavior, accessibility and long-session performance unqualified.

## Findings

No comprehension findings in the active scope: 0 Blockers, 0 Majors and 0 Nits. Both the proposal and the existing-system relationship can be paraphrased from the document; its project-specific contracts and evidence references are explained or linked.

## Status and read receipts

- Completed: native EGM Stage 6 Comprehension, Mode REVIEW, against the full target document alone.
- Active target: lines 1–408, including FeatureRange 1–177 and DetailedRange 178–408.
- Frozen commit supplied by the caller: eb11873050cbcc09ece0ea3c32de1f4d39c4a345. No Git operation was used to verify the commit; the measured target byte hash matches the caller's frozen CRLF hash.

| Input | Measured bytes | Measured SHA-256 | Measured line endings | Read scope |
|---|---:|---|---|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md | 4,817 | 2a2bd8ee584bec96b9470ca53191efb68a01e5d4f8e3c668d60201f368499f8e | 69 CRLF; 0 lone LF | Full file, lines 1–69, read before the target |
| C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md | 89,549 | 2ec4a0caea4c411cb2d1759d6b254f36bb19e3903e1a05835e67dfc1412b00be | 408 CRLF; 0 lone LF | Full file, lines 1–408 |

The first full target display was truncated. Lines 110–230 and 231–330 were then explicitly reread, completing the visible coverage of lines 1–408. Full-file receipt reads were confined to these same two inputs. The first shell launch for the persona read was denied; the subsequent full read succeeded.

Not run or consulted: document standards, GoldfishContext, parent transcript/history, memory, source reading lists, linked documents/resources, other project files, independent verification of linked claims, implementation/completeness audits, fixes, compiler/build/tests, native/Claude/model/clipboard/ACL probes, or Git/GitHub mutations. Links were assessed as document-provided references only; their destinations were not opened.

---

Publication context: completed Stage 6; no GoldfishContext or document standard supplied. Frozen target eb11873050cbcc09ece0ea3c32de1f4d39c4a345, feature 1–177 and Detailed Implementation 178–408. Complete native response retained above. [Context/source manifest](context_manifest.md), [archived persona](review_tools.json).
