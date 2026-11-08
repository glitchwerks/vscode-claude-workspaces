# What this proposes

The document proposes a companion view for the same subscription-backed interactive Claude Code CLI, capturing live semantic output through a private file channel into an extension-owned model. It renders the full retained explanation with separate command blocks and adjacent path actions, copying complete source-backed values and requiring review for uncertain path boundaries. Native evidence controls execution labels, while bounded storage, explicit gaps, stale-action rejection and visible capture failures limit what the companion can claim. V1 retains the same Raw terminal and native Escape input, leaves questions and permissions in Claude, and defers Run, direct response controls and snapshot recovery.

# How the existing system works, per this document

The existing CLI feeds a session-owned PTY and xterm, with panel/composer integration and a native input path that the companion will retain. The current mod entry already integrates attention and composer behavior, while attention publishes metadata rather than conversation content. The runtime also has a safe Markdown preview and a reference parser, but the preview is not a source-mapped output renderer and the parser skips inline code, so these do not already provide the proposed copying behavior.

# Findings

No comprehension findings: 0 Blockers, 0 Majors, 0 Nits.

FeatureRange 1–180 and DetailedRange 181–405 can be paraphrased from the target document at its stated altitude. The target connects the current system, proposed ownership/data flow, supported copying behavior, failure boundaries and deferred scope. References to the channel, view, path and native-provenance contracts are explicit definition links; they were acknowledged without being followed. This review does not assert the correctness or completeness of those linked contracts.

# Completion status

Completed: fresh EGM Stage 6 Comprehension review, Mode REVIEW, covering the complete target and both requested ranges. No section failed the paraphrase check. No finding IDs were allocated because there are no findings.

Not run: linked-file or external-source inspection, standard/GoldfishContext/source-index/other-report inspection, conversation-history or memory supplementation, browser/GitHub access, code/design/fixture edits, tests/builds, native/Claude probes, or Git/GitHub mutations. The only workspace write is this report.

# Required-read receipt

- Persona: C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md; full read, lines 1–69; 4,817 bytes; SHA-256 2a2bd8ee584bec96b9470ca53191efb68a01e5d4f8e3c668d60201f368499f8e.
- Design input: C:/Users/chris/.codex/worktrees/215-disposable-output-experiment/workspaces/docs/designs/215/design_draft.md; full read, lines 1–405; FeatureRange 1–180; DetailedRange 181–405; 87,944 bytes; SHA-256 a6af461ce845a2db8305385fd230c4fc4fbcc837021b06df4f94ddb85b6ef9ff.
- Frozen revision supplied by caller: feef3a2995e679b4ab56785aad2fb81e0d298656. No Git lookup was performed; the byte/hash receipt identifies the actual file reviewed.

---

**Publication scope:** Stage 6; frozen feef3a2995e679b4ab56785aad2fb81e0d298656; feature 1–180, Detailed Implementation 181–405. Completed 1/1; not run 0. Full paraphrase/response retained; no GoldfishContext or standard supplied. [Archived persona](review_tools.json), [run scope](context_manifest.md).
