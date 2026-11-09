## What this proposes

Add a companion view to the existing Claude Code integration that preserves full captured explanations while providing Copy controls for complete commands and file/folder paths. Observe the same subscription-backed CLI through live semantic events, send allowlisted content through a private file channel, and retain a bounded extension-owned source model with explicit gaps and revision-bound copy targets. Clear paths copy directly; uncertain paths require an editable preview, and command labels distinguish displayed text, requests and source-confirmed execution. Keep the existing native terminal available for questions, permissions and Escape, independently of capture health; Run and direct companion responses are deferred. Implement the feature in ordered phases, then qualify its copy fidelity, native interaction, packaging, accessibility and operating limits before making reliability claims.

## How the existing system works, per this document

The extension already manages a subscription-backed Claude Code CLI whose PTY feeds an xterm terminal, with native input owned by the session infrastructure. It also has a composer, a safe Markdown preview and a metadata-only attention mechanism; these provide integration conventions but do not already provide the required source-mapped output and path-copy behavior. Recorded experiments support particular capture, copying and native-interaction cases, while general path recognition and packaged product behavior remain unqualified. The proposed implementation targets a pinned runtime baseline distinct from this documentation checkout.

## Report

**Status:** completed.

**Read receipt:** Read the complete `comprehension.md` persona and all 388 lines of `docs/designs/215/design_draft.md`, covering FeatureRange 1–179 and DetailedRange 180–388. The caller supplied frozen commit `4e165ee519d8331c89679d373f33a74d558a26f0`; I did not independently inspect Git state. No linked documents, reviews, implementation, memory or context manifest were read. No files were written and no builds, tests, model probes or subagents were used.

**Findings:** none. Blocker: 0; Major: 0; Nit: 0. No finding IDs assigned.

The product scope, existing-versus-proposed boundary, ownership, user interactions and qualification obligations can be paraphrased coherently from this document. Recognition rules and operating details appropriately appear in Detailed Implementation rather than needing duplication in the feature range.

The exact C4 native adapter predicates and receipt contents remain unresolved external dependencies, specifically at lines 289 and 296–299, linked through the resource entry at line 372. I have not reconstructed or validated them; their explicit linkage is not an undefined-concept finding under the persona’s definition-or-link rule. Consequently, this result establishes comprehension of the document’s stated design, not verification of its external evidence or implementation readiness.
