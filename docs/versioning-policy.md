# Versioning Policy

Claude Workspaces uses semantic versions and publishes separate stable and
pre-release channels through the VS Code Marketplace.

## Current channels

Current stable version: `0.8.1` (#155, PR #156)

Current pre-release version: `0.7.2`

Active pre-release line: `0.9.x`, initialized but not yet published.

Recovery 0.8.1 uses the published `v0.7.2` snapshot at
`181370a25854fca78cc04129b6728bb3e6bbadc9`. Work after that cutoff is preserved
on `prerelease/0.9.x` at `a2c34a9ed63155dd5983a29f2568a34921eea88b` (PR #154).
The maintainer approved a narrow compatibility exception: preserve the shared
default-root and directed-import settings written by Marketplace 0.8.0,
persist them as schema v1, and drop the removed automatic-import preference
(#155, PR #156). Documentation table formatting is also corrected.
The maintainer explicitly authorized withdrawal of the GitHub `v0.8.0` release
and tag as a one-time exception; the Marketplace version is superseded by 0.8.1
without reusing 0.8.0 (#155).

See the [changelog](../CHANGELOG.md) for the changes included in each version.

## Release cadence

Develop and validate new features in an odd-minor pre-release line. Promote the latest validated odd-minor
pre-release after freezing its published tag and peeled commit, then use the
next even-minor stable version. Selection, conflict resolution, or compatibility
changes outside that snapshot require a separate exact scope approval (#157).
After stable publication, begin the next odd-minor pre-release line.

Stable maintenance fixes may increment the even-minor patch version when they
do not need a separate pre-release cycle. Additional validation or fixes within
a pre-release line increment the odd-minor patch version.

## Development branches

`main` contains the current stable even-minor line. New features for the next
odd-minor line branch from and return to `prerelease/MAJOR.MINOR.x` through
squash-merged pull requests. The active branch is `prerelease/0.9.x`.

Stable maintenance fixes use `hotfix/MAJOR.MINOR.PATCH` from `main` and return through an issue-linked, separately approved pull request (#157).
Forward-port each merged stable fix in a separate pull request to the active
pre-release branch. The forward-port branch starts from the active pre-release
branch and contains only the stable fix being carried forward.

For the recovery, `release/0.8.1` restores the published `v0.7.2` snapshot and
promotes that product code to stable. Subsequent feature pull requests target
`prerelease/0.9.x`; stable 0.8.x maintenance continues on `main`.

## Stable promotion

Create `release/MAJOR.MINOR.PATCH` from current `main`. Pin the published source
tag, peeled SHA, GitHub Release ID, and successful Publish run ID. Full promotion
reproduces that product snapshot while retaining main-owned publication and guard
authority. Selective promotion records each source PR and ordered selected squash commit; every
selected commit must be an ancestor of the published cutoff (#157).

Construct the candidate and prepare its version/changelog before computing the
approval. Merge that record through a separate `policy/ISSUE-description` PR to
main before the candidate can pass. The approval binds the baseline product,
resulting product, and exact product/supporting-test changes. It remains valid
across policy-only main updates. Another product fix or candidate/test edit needs
a refreshed approval with explicit supersession (#157).

Selection or changed conflict/compatibility bytes require `--mode selective` or
`--mode compatibility`, a linked issue, rationale, exact changed entry identities,
and resulting fingerprints. There is no directory-wide exception. Records are
immutable; corrections append replacements using `--supersedes` (#157).

After candidate review and checks, squash-merge it into main and create the
stable tag on that exact merge commit. Publication repeats merged-PR, published
cutoff, approved-scope, and maintenance-disposition checks before installation
or publishing (#157).

### Prepare an approval record

Run these commands from a policy worktree based on current main after the tooling
is installed. Values below are explicit operator inputs obtained from the live
candidate and published source; the tool never selects a moving branch tip.

```bash
node scripts/prepare-release-approval.js prepare-promotion \
  --version "$TARGET_VERSION" --source-tag "$SOURCE_TAG" \
  --source-commit "$SOURCE_COMMIT" --source-branch "$SOURCE_BRANCH" \
  --source-release-id "$SOURCE_RELEASE_ID" --source-run-id "$SOURCE_RUN_ID" \
  --baseline-tag "$STABLE_TAG" --candidate-pr "$CANDIDATE_PR" \
  --issue "$PROMOTION_ISSUE" --rationale "$PROMOTION_REASON" \
  --output "$APPROVAL_FILE"
```

`--mode full` is the default. Selective mode also requires comma-separated
`--source-commits` and `--source-prs`, in matching order: each selected commit
must be the referenced PR's merge commit on the published source line. The guard
applies these rules to hand-written records too. Source publication must belong to the active
odd-minor line. Output must name a new JSON file directly inside
`.github/release-policy/approvals/`; it never overwrites. Without `--output`, the
tool prints the proposed record. Fetching evidence updates local Git objects and
refs, and does not publish or merge anything (#157).

```bash
node scripts/prepare-release-approval.js prepare-hotfix \
  --version "$TARGET_VERSION" --baseline-tag "$STABLE_TAG" \
  --baseline-commit "$STABLE_COMMIT" \
  --baseline-release-id "$STABLE_RELEASE_ID" --baseline-run-id "$STABLE_RUN_ID" \
  --candidate-pr "$CANDIDATE_PR" --issue "$FIX_ISSUE" \
  --rationale "$FIX_REASON" --output "$APPROVAL_FILE"
```

After merging a hotfix, forward-port it in a separate active-prerelease PR.
An open PR does not complete the requirement. Once merged, append its disposition
through another policy PR:

```bash
node scripts/prepare-release-approval.js record-forward-port \
  --approval-id "$HOTFIX_APPROVAL_ID" --pr "$FORWARD_PORT_PR" \
  --issue "$FIX_ISSUE" --rationale "$FORWARD_PORT_REASON" \
  --output "$DISPOSITION_FILE"
```

Disposition output belongs in `.github/release-policy/forward-ports/`. Use
`--supersedes-fix` only for an explicitly reviewed merged replacement fix. Before
promotion, every applicable stable fix needs a merged disposition contained in
the frozen cutoff, including fixes already present in the stable baseline.
Missing evidence or an unregistered stable change blocks promotion (#157).
## Tag source rules

Odd-minor tags must belong to the matching `prerelease/MAJOR.MINOR.x` branch.
Even-minor tags must belong to `main`. For example, `v0.7.0` must be contained
in `prerelease/0.7.x`, while `v0.8.1` must be contained in `main`.

Before installing dependencies or publishing, the Publish workflow requires
the tag to match `package.json`, a nonempty matching changelog section, and tag
commit ancestry in the authorized source branch. A tag name alone is not proof
of its source. Main-owned scope preflight adds exact approval/publication checks.
Current publication requires matching main-owned publication authority, including
the excluded policy tests and helpers that npm test executes. Product-route PRs
cannot add, edit or delete those files; update them through a separate main policy
PR and synchronize before publication. Non-document modules under docs are also
authority; Markdown/image documentation edits retain the policy route (#157, PR #159).
Register new lines through a main policy PR and synchronize that authority into
the prerelease branch (#157).

To inspect a tag without publishing, use its isolated checkout as `SOURCE_DIR`
and run current main's tooling:

```bash
node scripts/validate-release-source.js "$TAG" \
  "$SOURCE_DIR/package.json" "$SOURCE_DIR/CHANGELOG.md" "$SOURCE_DIR"
```

This retains the four CLI arguments and runs no package build or publication.
Missing objects/evidence, moved tags, wrong versions, stale approvals, and changed
scope fail closed. Refresh/rebase or prepare an explicit replacement approval;
do not substitute a branch tip (#157).

## Rollback and recovery

If a selective cherry-pick or full promotion conflicts, stop the operation and
resolve it manually. Abort the operation when the candidate cannot be made
correct; update or recreate the short-lived candidate branch and pull request
instead of changing `main` or the pre-release branch directly.

Treat release tags as immutable. If validation finds incorrect version,
changelog, or ancestry data, fix it on the authorized source branch, increment
the patch version, and create a new tag. Do not move or reuse the rejected tag.
If validation passed and publication failed for a transient reason, rerun the
Publish run, or dispatch with `gh workflow run publish.yml --ref "$TAG" -f tag="$TAG"`
so the dispatched ref and tag input identify the same immutable commit. Main-ref
dispatches with another tag input fail. Manual-run approval evidence also requires
the successful validated-source step naming that exact tag and SHA; older manual
runs without it cannot qualify (#157;
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch,
fetched 2026-10-10). Historical retries require exact verified records: v0.7.2 at
181370a25854fca78cc04129b6728bb3e6bbadc9 and v0.8.1 at
1a309056b57409fee02f0272d53d1f7ec413af83 are seeded. Other historical retries
need separate verification and approval; withdrawn v0.8.0 stays rejected
(#155, #157).

## Install from the Marketplace

Install the stable channel:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces
```

Install or switch to the pre-release channel:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces --pre-release
```

## Build a channel-specific VSIX

Install the exact dependencies, then run the packaging command that matches the
package version's channel:

```bash
npm ci
npm run package:stable
```

```bash
npm ci
npm run package:prerelease
```

Even minor versions use `package:stable`; odd minor versions use
`package:prerelease`. The channel guard rejects mismatched commands. Both
commands write the Windows x64 package to
`dist/claude-workspaces-win32-x64.vsix`; files under `dist/` are generated and
are not committed.

## Publication

Pushing a `vMAJOR.MINOR.PATCH` tag runs `.github/workflows/publish.yml`. The
workflow verifies that the tag matches `package.json`, derives the channel from
the minor version, validates and packages the extension, publishes it to the
Marketplace, and creates or updates the matching GitHub Release.

Full promotion reproduces the published prerelease product after root version
normalization. Separately approved exceptions bind their exact product/test
scope. Recovery 0.8.1 adds only the approved settings compatibility exception to
the published 0.7.2 snapshot. Later features and corrections remain in the 0.9.x
pre-release line (#155, PR #156).

The guard uses a native organization workflow rule scoped to this repository and
selecting `.github/workflows/release-guard.yml` from protected main. It reads
candidates as Git objects, installs no candidate dependencies, and receives
read-only contents/pull-request/Actions permissions. Its ordinary branch filter is not
a status-check exemption: native required workflows ignore event filters. Keep
all five quality checks and branch protections; strict freshness and live
bypass/retarget probes are part of activation (#157;
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules,
fetched 2026-10-10).

Installation, authority synchronization, activation, and live receipts are tracked
in #157. The workflow's presence or a similarly named green candidate job does not
prove the native rule is active. Administrators who can change rules remain the
policy authority (#157).

Current Publish preflight receives `GH_TOKEN` from the job token and reads
Actions/pull-request evidence with explicit read permissions. Maintenance PR
lookups cover only product/supporting-test commits identified from local Git,
preserving fail-closed checks for unregistered changes while avoiding one API
request per policy-only commit. Existing historical entry workflows retain the
four-argument CLI and use these narrower reads if no token is supplied (#157;
https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run,
https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api,
fetched 2026-10-10).
