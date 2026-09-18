# Versioned Pre-release and Stable Promotion Workflow

**Date:** 2026-09-17  
**Status:** Approved design; pending written-spec review  
**Tracking:** #112, Versioning milestone

## Purpose

Claude Workspaces will use a protected, versioned pre-release integration
branch for feature development while keeping `main` on the stable line. The
workflow must support both selective stable promotion and full promotion,
validate the source of every published tag, and establish the live
`prerelease/0.7.x` branch for the next development cycle. These requirements
come directly from issue #112.

The current policy already assigns odd minor versions to the Marketplace
pre-release channel and even minor versions to stable, but it does not assign
development to versioned branches (`docs/versioning-policy.md:L16-L26`). The
current publishing workflow validates tag/version equality and channel parity,
then builds and publishes without proving which branch contains the tagged
commit (`.github/workflows/publish.yml:L28-L94`;
`scripts/release-metadata.js:L22-L44`). The current CI workflow validates all
pull requests but runs push CI only on `main`
(`.github/workflows/ci.yml:L3-L12`).

## Goals

1. Define `prerelease/<odd-minor>.x` as the long-lived integration branch for
   an active pre-release line and `release/<even-version>` as a short-lived
   stable candidate branch. (#112)
2. Keep feature pull requests on the active pre-release line while allowing
   stable maintenance work to start from `main` and be forward-ported. (#112)
3. Reject publication unless a tag matches the package version, has a complete
   changelog section, and its commit belongs to the branch authorized for that
   version. (#112; `scripts/extract-changelog.js:L34-L65`)
4. Run CI on pull requests and on pushes to every protected long-lived branch.
   (#112)
5. Protect `main` and `prerelease/*` with pull-request and required-check
   rules, then create the live `prerelease/0.7.x` branch. (#112)
6. Document a reproducible selective-promotion, full-promotion, stable-hotfix,
   and forward-port process in the repository's public contributor and release
   documentation. (#112; `CONTRIBUTING.md:L51-L62`)

## Non-goals

- No manifest-driven promotion automation or automatic conflict resolution.
  Both are explicitly outside #112.
- No reusable action in `glitchwerks/github-actions`. The approved scope keeps
  the policy local because its odd/even channel convention, package metadata,
  and changelog contract are repository-specific
  (`scripts/guard-channel.js:L3-L28`; `package.json:L35-L47`).
- No product behavior or extension UI changes.
- No 0.7.0 publication in this change. The work establishes the development
  line and its release controls; a later release issue prepares and publishes
  the actual 0.7.0 artifact.

## Branch Model

### Stable line

`main` contains the latest stable even-minor version. Normal feature work does
not target `main`. Stable maintenance fixes branch from `main`, return through
a pull request, and receive a separate forward-port pull request into the
active pre-release branch. This preserves the existing rule that stable
promotion adds no new product behavior (`docs/versioning-policy.md:L18-L26`;
`docs/versioning-policy.md:L70-L73`).

### Pre-release line

Each active odd-minor line has one long-lived branch named
`prerelease/MAJOR.MINOR.x`, beginning with `prerelease/0.7.x`. Feature branches
start from this branch and squash-merge back into it through pull requests.
The pre-release branch is protected against deletion and non-fast-forward
updates and requires the same merge checks as `main`. This naming and merge
model is required by #112.

### Stable candidates

A stable candidate is a short-lived `release/MAJOR.MINOR.PATCH` branch created
from the current stable `main`. For the 0.7.x cycle, the first stable candidate
is `release/0.8.0`. Candidate branches are not long-lived integration branches;
they exist only to assemble, validate, and merge a stable release. (#112)

## Local Policy Module

Add `scripts/release-policy.js` as a pure CommonJS policy module. It will own:

- strict `MAJOR.MINOR.PATCH` parsing;
- channel derivation from minor-version parity;
- the expected pre-release branch for an odd-minor version;
- the expected stable source (`main`) for an even-minor version;
- stable-candidate branch parsing and validation; and
- actionable validation errors that include the received and expected branch,
  version, or tag.

`scripts/release-metadata.js` and `scripts/guard-channel.js` will delegate their
shared version/channel decisions to this module so there is one policy source.
Their current public functions and CLI behavior remain compatible with the
existing tests (`scripts/release-metadata.js:L5-L44`;
`scripts/guard-channel.js:L5-L28`;
`test/unit/releaseMetadata.test.ts:L24-L96`;
`test/unit/guardChannel.test.ts:L20-L67`).

Add `scripts/validate-release-source.js` as the thin workflow adapter. Given a
tag, release package path, changelog path, and release checkout, it will:

1. resolve and validate the package version and tag;
2. derive the authorized source branch;
3. require a non-empty changelog section for the version;
4. resolve the tag to its commit; and
5. use Git ancestry to require that commit to be contained in the fetched
   authorized source branch.

The adapter exits before dependency installation, building, packaging, or
publishing when any check fails. It reads repository state but never changes a
branch or tag. Changelog extraction already distinguishes a missing section;
it will be tightened so an empty section also fails
(`scripts/extract-changelog.js:L15-L29`;
`scripts/extract-changelog.js:L46-L60`).

## Continuous Integration

Update `.github/workflows/ci.yml` so push CI covers `main` and
`prerelease/**`. Pull-request CI remains unfiltered so candidate, promotion,
forward-port, and feature pull requests all receive validation. GitHub evaluates
`pull_request.branches` against the target branch and `push.branches` against
the pushed ref, so preserving unfiltered pull requests avoids accidentally
leaving a supported PR target without checks
(https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax,
fetched 2026-09-17).

Keep the existing cross-platform quality matrix and Windows Extension Host job
unchanged in responsibility (`.github/workflows/ci.yml:L14-L66`). Add a focused
`Release Policy` job that installs locked dependencies and runs only the
release-policy, metadata, channel-guard, changelog, and workflow-contract tests.
This produces a stable, separately requireable check without duplicating the
full integration suite.

## Publication Validation

The publishing workflow keeps tag pushes and manual retries as its two entry
points (`.github/workflows/publish.yml:L3-L16`). After checking out the immutable
release source, it will derive the version, channel, and expected source branch,
fetch only that branch, and run `validate-release-source.js`. No package install
or write-capable publication step runs before this preflight.

The branch rules are:

| Release version | Marketplace channel | Authorized source |
| --- | --- | --- |
| Odd minor, such as `0.7.0` | Pre-release | `prerelease/0.7.x` |
| Even minor, such as `0.8.0` | Stable | `main` |

Tag reachability, rather than the triggering ref name alone, is the source of
truth because both tag pushes and manual retries execute against a tag checkout.
The existing workflow deliberately checks out release tooling separately from
the release source, which will continue to make retries use current trusted
automation against immutable tagged content
(`.github/workflows/publish.yml:L28-L54`). The publish job retains job-level
`contents: write`, while CI jobs retain `contents: read`
(`.github/workflows/publish.yml:L18-L26`;
`.github/workflows/ci.yml:L15-L19`; `.github/workflows/ci.yml:L48-L52`).

## Promotion Procedures

### Selective promotion

1. Create `release/<even-version>` from the current stable `main`.
2. Cherry-pick the squash commit for each approved pre-release feature.
3. Record every source PR number and squash commit SHA in the candidate PR.
4. Resolve conflicts manually; never infer or automate a resolution.
5. Prepare even-version metadata and consolidated release notes on the
   candidate branch.
6. Merge the validated candidate PR into `main`, then tag the merged `main`
   commit.

### Full promotion

1. Create `release/<even-version>` from the current stable `main`.
2. Open a promotion PR from the active pre-release branch into the candidate
   and squash the remaining tree difference.
3. Prepare even-version metadata and consolidated release notes on the
   candidate branch.
4. Record the pre-release source branch and every selectively promoted PR and
   commit in the candidate PR.
5. Merge the validated candidate into `main`, then tag the merged `main`
   commit.

This formalizes the repository's recent behavior: pre-release fixes were
merged into `release/0.5.x` in PR #110 and PR #111, while stable 0.6.0 was
assembled and merged into `main` by PR #117. The new process makes the branch
roles and provenance record explicit rather than reconstructing them after the
fact.

## Rulesets

After the implementation PR has merged and its checks have run successfully,
create an active repository ruleset targeting `main` and
`prerelease/*`. It will require:

- pull requests;
- deletion protection;
- non-fast-forward protection;
- `Release Policy`;
- `Quality (ubuntu-latest)`;
- `Quality (windows-latest)`;
- `Quality (macos-latest)`; and
- `Extension Host Integration (Windows)`.

The existing organization ruleset targets only the default branch and requires
pull requests but no status checks
(https://api.github.com/repos/glitchwerks/vscode-claude-workspaces/rulesets/15682536,
fetched 2026-09-17). The repository ruleset therefore adds the missing check
requirements and pre-release coverage without weakening the organization rule.
GitHub rulesets support branch-name patterns and required status checks; all
required checks must pass before a matching branch can be updated
(https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository,
fetched 2026-09-17;
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets,
fetched 2026-09-17).

## Documentation

Update:

- `docs/versioning-policy.md` with the branch model, selective/full promotion,
  tag source rules, stable-hotfix forward-porting, and 0.7.x transition;
- `CONTRIBUTING.md` so contributors branch from and target the active
  pre-release line instead of always using `main`; and
- `README.md` with a concise lifecycle summary and link to the canonical
  versioning policy.

These files currently describe packaging and odd/even channels but still tell
contributors to base all focused work on `main`
(`README.md:L199-L217`; `CONTRIBUTING.md:L54-L62`). Documentation and its
package-asset assertions must change together because the versioning policy is
shipped as public extension documentation
(`test/unit/packageAssets.test.ts:L88-L127`).

## Testing

Add or extend unit tests for:

- valid and malformed semantic versions;
- odd/even channel derivation;
- expected pre-release and stable source branches;
- valid and invalid candidate branch names;
- tag/package mismatches;
- accepted and rejected Git ancestry checks using temporary repositories;
- missing and empty changelog sections;
- CLI exit codes and actionable errors; and
- workflow contracts: CI covers `prerelease/**`, source validation precedes
  dependency installation and publication, and the focused check has a stable
  name.

Run `npm run check:types`, `npm run lint`, `npm test`, and
`npm run build:production`. Run local accepted and rejected source-validation
scenarios against temporary Git repositories; never create a test release tag
on the remote. These commands match the repository's documented contributor
validation boundary (`CONTRIBUTING.md:L29-L49`).

## Rollout

1. Merge the #112 implementation PR into `main`.
2. Create `prerelease/0.7.x` from that merged `main` commit.
3. Confirm the branch's first push CI run reports every required check.
4. Create and activate the repository ruleset.
5. Verify the ruleset targets both `main` and `prerelease/0.7.x` and lists the
   exact live check names.
6. Keep #112 open when the implementation PR merges. Post the branch, ruleset,
   and successful CI evidence, then close #112 manually with that completion
   summary.

The actual 0.7.0 version bump, release notes, tag, Marketplace publication, and
post-publication verification belong to a separate tracked release issue. This
keeps #112 focused on establishing the workflow that all following 0.7.x issues
will use.

## Failure and Recovery

- A malformed tag, version, branch, missing source ref, unreachable tag commit,
  or incomplete changelog fails before publishing and names the expected value.
- A fetch or ancestry-check error is a hard failure, not permission to publish.
- Promotion conflicts stop for manual resolution, as required by #112.
- If branch protection is misconfigured, disable or correct only the new
  repository ruleset; do not weaken the organization ruleset.
- If the first pre-release branch CI run fails, fix the implementation on a
  focused branch and merge it before activating the required-check rules.
