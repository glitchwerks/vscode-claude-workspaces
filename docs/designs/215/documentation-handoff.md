# Documentation handoff before implementation P0

* **State:** R5 prerequisite retained and source selection refreshed for the A1–A4 auto-accepted corrections. The new Ready record will pin this batch; the earlier record remains historical. No implementation worktree is changed. [Four-finding authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972512).
* **Immutable source:** Read the full 40-character correction commit pinned in the [handoff record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972828). The record must say Ready and identify [implementation-inputs.json](implementation-inputs.json) in that same commit. No branch name, latest PR head, unstaged working copy or unresolved placeholder is a valid source.
* **Authority:** [Author approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465); [verified two-tree gap](reviews/2026-11-07-copying-v1/implementation_readiness_report.md).

## Selected prerequisite

Perform a separate documentation-only integration commit in the already authorized implementation worktree before P0. Materialize exactly the manifest's files from the pinned correction commit; never copy the documentation checkout's runtime code, package files, dependencies or settings.

The manifest is an explicit allowlist, not a recursive checkout or discovery rule. It includes its own path, corrected contracts/vectors, the approved brief/native evidence and the durable documents needed by their local references. Source Git blobs must exist for every file before any write. The record pins an immutable Git object containing all of them; its source is independent of the runtime code baseline.

The pinned runtime ef5fd48f4b676881a8730afbf8e583e70565ca11 has no docs/designs/215 tree. The refreshed manifest has 49 exact documentation inputs (38 Markdown, 11 JSON), all Create against that runtime, separately from the subsequent 28 Create/18 Modify execution paths. Its new inputs are the nine source re-review artifacts and this batch’s resolution, needed by the corrected contracts’ local references. The union is 93 distinct paths, or 77 Create/16 existing Modify against the pinned runtime. Two subsequent Modify paths (design_draft.md and technical_choices.md) are created by the overlay first. They are correctly Modify during P0 only after this prerequisite. The manifest records the union count and exact overlap so these are not hidden writes.

## Preflight and ordering

1. Obtain the separately required implementation authorization and tracking/milestone if split. Follow the user's branch/worktree policy and recheck the repository workflow. This handoff does not select or change a branch/base; the pinned runtime remains a verification snapshot, not permission to bypass current policy.
2. Read the Ready handoff record, its exact source SHA and manifest from that Git object. Reject a missing/unresolved source, non-doc path, duplicate path, traversal, absent blob or manifest/source mismatch before P0.
3. Verify the authorized worktree's actual runtime baseline and cleanliness. If the runtime differs from the recorded snapshot, re-audit API/Modify/lane claims before implementation. Do not infer compatibility from a version number.
4. For each allowed documentation path: create it if absent; leave it if its Git blob already matches the selected source; stop for explicit reconciliation if an existing file differs. Do not silently overwrite a newer local design or carry unrelated changes.
5. Materialize only absent approved paths. Use structured Git arguments equivalent to git -C WORKTREE restore --source SOURCE_SHA -- followed by the exact manifest paths. The strings are data arguments, not evaluated shell source. Do not run a branch switch, merge, cherry-pick of runtime commits or broad directory restore as an implicit substitute.
6. Audit every local documentation dependency and exact source blob with git ls-tree SOURCE_SHA -- PATH and the materialized worktree. Commit this documentation-only prerequisite separately, retaining source SHA/manifest reference in its commit/implementation PR. No runtime activation, dependency install or model probe is implied.
7. Only then execute P0-P4 under the existing runtime allowlists. P0 may modify the two now-present design files; the corrected C4/native/channel/view/path documents and vectors are read-only inputs unless an explicit design revision adds them to a later write subset.

If all paths are already present and identical, record the verified prerequisite as a no-op; do not create an empty commit. Any mismatch is a handoff failure, not permission to change Create/Modify classifications silently.

## Acceptance

A preflight fixture against the pinned runtime must find all manifest files in the selected correction commit, classify the absent paths, materialize only docs and verify the 46 later phase paths with their two documentation overlaps. Include negative cases for a missing evidence blob, an altered local document, a mutable source identifier and a non-doc path. These are future implementation/preflight tests; no overlay is performed now.

Input context: git ls-tree -r --name-only ef5fd48f4b676881a8730afbf8e583e70565ca11 -- docs/designs/215 is empty; git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/capture-provenance-contract.md docs/designs/215/evidence/c4-adapter-cases.json at cc4875d003e832c1bf67e6defbc61a2f76fc64eb verifies the earlier documentation inputs. The Ready handoff record supplies the immutable corrected source and final manifest proof after this batch is committed.

## Sources

* [R5 review finding](reviews/2026-11-07-copying-v1/consolidated_review_report.md#r5--major-declare-the-documentation-overlay-before-implementation-p0).
* [Current implementation plan](design_draft.md#detailed-implementation).
* [Pinned workflow to recheck before implementation](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/CONTRIBUTING.md#L98-L103).
