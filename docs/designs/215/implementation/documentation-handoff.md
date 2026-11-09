# Implementation-package handoff before P0

* **State:** Author-approved separation of implementation inputs from historical records; copying-only v1, with Run/Run again/C2/direct companion answers deferred. [Authorization and current source record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).
* **Immutable source:** Use the full 40-character source SHA in that record only after its state is Ready. Require this [manifest](implementation-inputs.json) in the same Git object. Pending records, branch names, latest PR heads and working copies are invalid source selectors.
* **Preceding source:** The [first clean static review](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/reviews/2026-11-08-exit-bootstrap/consolidated_review_report.md) applies to the preceding layout and behavior design; its two editorial Nits remain open. This packaging revision is not a new EGM round or runtime qualification.

## Exact D0 package

D0 contains **13 files: 8 Markdown and 5 JSON**, all under the implementation directory and listed explicitly in the manifest. They are the main design, four behavior contracts, four input/outcome fixture sets, technical choices, this handoff, the manifest itself and preserved C4 native evidence. Historical decisions and review findings are cited through immutable Git URLs rather than local archive dependencies. The manifest excludes concepts, review/resolution records, the superseded broad design and all deferred Run/C2 artifacts. [Manifest](implementation-inputs.json), [author decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).

The implementation source and runtime baseline are independent. At the recorded runtime ef5fd48f4b676881a8730afbf8e583e70565ca11 the 13 package files are absent, so D0 creates them. P0–P4 retain **28 Create / 18 Modify = 46 paths** after D0. The main design and technical-choices paths are the two overlaps, now inside this package. The union is **57 distinct paths = 41 Create / 16 existing Modify** at that runtime. These are inventory classifications, not implementation results. [Exact inventory and phases](design_draft.md#detailed-implementation), [manifest counts](implementation-inputs.json).

## Preflight and ordering

1. Obtain separate implementation authorization and tracking/milestone if split. Follow the user's worktree/branch policy and recheck repository workflow. This handoff does not change a branch/base or authorize product work. [Design baseline](design_draft.md#detailed-implementation).
2. Read the Ready record and the manifest from its exact source Git object. Reject a Pending/missing/unresolved record, mutable source, duplicate or traversal path, non-doc path, historical/review input, any path outside this implementation package, missing blob or manifest/source mismatch before writing.
3. Verify the authorized worktree's actual runtime baseline and cleanliness. Re-audit APIs and Modify/lane classifications if it differs from the recorded snapshot; a matching version number is insufficient.
4. For every exact allowed path: absent means create from the selected source blob; identical means no-op; different means stop for explicit reconciliation. Do not overwrite a newer design or carry unrelated changes.
5. Materialize only the exact absent manifest paths with structured Git arguments equivalent to git -C WORKTREE restore --source SOURCE_SHA -- followed by those paths. Do not recursively restore an archive/root directory or copy runtime code, package files, dependencies or settings.
6. Verify every manifest source blob and local documentation dependency with git ls-tree SOURCE_SHA -- PATH and the materialized worktree. Every local file link from a package document must stay inside the 13-file allowlist. Historical citations are immutable external references and are not overlay inputs. Commit D0 separately with its source SHA/manifest reference; if everything is already identical, record a verified no-op.
7. Only then execute P0–P4 under the [phase write allowlists](design_draft.md#detailed-implementation). P0 may modify the now-present main design and technical choices. Contracts/native evidence/design vectors remain read-only inputs unless an explicit design revision extends a later write subset.

These selected steps retain the earlier documentation-only prerequisite and mismatch policy while narrowing its file boundary. [Earlier selected procedure](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/documentation-handoff.md), [author separation decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).

## Acceptance and exclusions

The future preflight fixture must verify the exact 13 source blobs, local-reference closure, Create classifications, 46 later paths, two overlaps and 57-path union. Negative cases cover a missing evidence blob, changed local document, mutable/Pending source, non-doc/traversal/duplicate path, attempted historical/review import and changed runtime without re-audit. No overlay or product test is run by this documentation change. [Manifest checks](implementation-inputs.json), [phase criteria](design_draft.md#detailed-implementation).

No historical review outcome adds implementation scope. Run/Run again/C2/direct companion responses remain deferred. Earlier Ready records preserve their own source commits and manifests; use the current package record for this layout. Static packaging checks do not grant implementation, native/model qualification, merge or release approval. [Current source and authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6729431831).

Context: git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/implementation-inputs.json at a9818b4e811bae0cb833914ad90c4ce49243e100 verifies the preceding source before relocation. The new Ready record supplies the committed package SHA and exact manifest/source-tree proof after publication.
