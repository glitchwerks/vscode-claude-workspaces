## What this proposes

Add a VS Code companion for the same subscription-backed interactive Claude Code CLI, retaining the full captured explanation while placing commands in separate Copy blocks and path controls beside their source text (L12–39). An observational mod sends allowlisted live semantic content through a private file channel to a bounded host model and webview; immutable source-bound targets and evidence-based labels distinguish displayed commands from confirmed tool execution, while gaps remain visible (L55–101). Clear paths copy directly, uncertain paths use an editable review, and Copy preserves the selected literal value without executing commands, resolving paths or calling another model (L89–101, L278–319). Raw access and native Escape continue to use the same managed CLI, questions and permissions remain native under Variant A, and Run is deferred (L103–109, L319–330). The design specifies staged implementation and qualification, but does not claim that its proposed copying, channel, accessibility or performance contracts already pass in a packaged extension (L180–243, L332–361).

## How the existing system works, per this document

The existing extension manages the interactive CLI through a session-owned PTY and xterm; its launch/session state supplies ownership identities, and native input already flows through SessionManager (L57–77, L105–122, L322, L410–412). The existing panel and composer supply draft, input, hydration and lifecycle integration points, while the packaged mod entry owns metadata-only attention notifications rather than a rich content stream (L71–87, L117–122, L186–208, L326). The composer already has a safe Markdown preview and reference parser, but the preview is not a source-mapped output renderer and the parser skips inline code, so these do not already provide the proposed path-copy behavior (L87, L317, L411). Earlier controlled experiments support particular command-copy and native-interaction cases on the recorded Windows/Claude Code baseline; general path recognition and packaged feature reliability remain unqualified (L28, L128–130, L138–160).

## Findings

No comprehension findings. Counts: 0 Blockers, 0 Majors, 0 Nits. Both the proposal and the existing-system account can be paraphrased from this document; its project-specific contract abbreviations and integration references are defined or linked within the target. This is a document-comprehension result, not verification of the linked contracts, runtime or implementation completeness.

## Execution status and read receipts

Completed: native EGM Stage 6 Comprehension, Mode REVIEW; full persona read followed by the full target semantic read. No findings IDs were assigned because there were no findings.

| Input | Measured bytes | Measured SHA-256 | Semantic read |
|---|---:|---|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md | 4817 | 2a2bd8ee584bec96b9470ca53191efb68a01e5d4f8e3c668d60201f368499f8e | Full persona, L1–69 |
| C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md | 92145 | fb861395e8c5edd7aaf01869f11a335929978e6f93792ed67676ff3d4233c3a9 | Full target, L1–414 |

The target has 414 CRLF-terminated lines and no bare LF; its measured bytes and hash match the caller-frozen receipt. Caller-declared commit: 46219dfd8c23998ff476092d064cfd95a6d8710d; no Git command was used to verify commit membership. FeatureRange L1–177 and DetailedRange L178–414 were both read in full. The target was presented without truncation in contiguous ranges L1–70, L71–140, L141–200, L201–250, L251–280, L281–325, L326–365, L366–390 and L391–414.

Not run: link traversal, other project-file/source inspection, external-document verification, standard/GoldfishContext/source-list/history/memory review, detailed-completeness audit, implementation, compiler/tests/build/package, native/Claude/model/clipboard/ACL probes, Git/GitHub operations or mutations. The first Bash attempt to read the persona was denied before content was returned; Node filesystem reads then completed both authorized inputs. No input was altered; the only written artifact is this report.

---

Publication context: completed Stage 6, with no standard or GoldfishContext supplied. Frozen 46219dfd8c23998ff476092d064cfd95a6d8710d; feature L1–L177, Detailed Implementation L178–L414. Complete native response retained above. [Context/source manifest](context_manifest.md), [archived persona](review_tools.json).
