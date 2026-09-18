# Versioning Policy

Claude Workspaces uses semantic versions and publishes separate stable and
pre-release channels through the VS Code Marketplace.

## Current channels

Current stable version: `0.6.0`

Current pre-release version: None

Next pre-release line: `0.7.x`

See the [changelog](../CHANGELOG.md) for the changes included in each version.

## Release cadence

Develop and validate new features in an odd-minor pre-release line. When that
line is ready for general use, promote the latest validated odd-minor
pre-release to the next even-minor stable version without adding product
behavior in the promotion pull request. After the stable release is published,
new features begin in the next odd-minor pre-release line.

Stable maintenance fixes may increment the even-minor patch version when they
do not need a separate pre-release cycle. Additional validation or fixes within
a pre-release line increment the odd-minor patch version.

## Development branches

`main` contains the current stable even-minor line. New features for the next
odd-minor line branch from and return to `prerelease/MAJOR.MINOR.x` through
squash-merged pull requests. The active branch is `prerelease/0.7.x`.

Stable maintenance fixes branch from `main` and return through a pull request.
Forward-port each merged stable fix in a separate pull request to the active
pre-release branch. The forward-port branch starts from the active pre-release
branch and contains only the stable fix being carried forward.

For the current transition, 0.6.x maintenance continues on `main`, new feature
pull requests target `prerelease/0.7.x`, and the first stable candidate for the
completed pre-release line will be `release/0.8.0`.

## Stable promotion

Create `release/MAJOR.MINOR.PATCH` from `main`. For selective promotion,
cherry-pick approved feature squash commits. For full promotion, squash the
remaining pre-release tree into the candidate. The candidate pull request must
record each source PR number and squash commit SHA. Stop for manual resolution
when promotion conflicts occur.

For selective promotion, choose only approved squash commits from the active
pre-release branch and cherry-pick them onto the candidate. Keep the candidate
pull request's source PR and squash commit list current as work is added or
removed.

For full promotion, bring the remaining tree difference from the active
pre-release branch into the candidate as one squash commit. Record the source
branch as well as any source PRs and squash commits already promoted
selectively. A full promotion does not bypass review or the candidate pull
request.

Prepare the even-minor version metadata and consolidated changelog entry on the
candidate. After the candidate pull request passes validation, merge it into
`main`, then create the stable tag on the merged `main` commit. Promotion pull
requests change release metadata and documentation but do not add new product
behavior.

## Tag source rules

Odd-minor tags must belong to the matching `prerelease/MAJOR.MINOR.x` branch.
Even-minor tags must belong to `main`. For example, `v0.7.0` must be contained
in `prerelease/0.7.x`, while `v0.8.0` must be contained in `main`.

Before installing dependencies or publishing, the Publish workflow requires
the tag to match `package.json`, a nonempty matching changelog section, and tag
commit ancestry in the authorized source branch. A tag name alone is not proof
of its source.

## Rollback and recovery

If a selective cherry-pick or full promotion conflicts, stop the operation and
resolve it manually. Abort the operation when the candidate cannot be made
correct; update or recreate the short-lived candidate branch and pull request
instead of changing `main` or the pre-release branch directly.

Treat release tags as immutable. If validation finds incorrect version,
changelog, or ancestry data, fix it on the authorized source branch, increment
the patch version, and create a new tag. Do not move or reuse the rejected tag.
If validation passed and publication failed for a transient reason, rerun the
Publish workflow with the existing tag so it validates and publishes the same
commit.

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

A release promotion changes the version and release documentation only. Product
behavior belongs in the preceding pre-release line, not in the promotion pull
request. The validated 0.5.2 pre-release was promoted to stable 0.6.0 without
adding product behavior. New features begin in the 0.7.x pre-release line.
