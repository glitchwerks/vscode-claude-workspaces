# Release policy enforcement design

Date: 2026-10-10
Tracking: #157, Versioning milestone; existing-behavior file citations refer to recovery commit 1a309056b57409fee02f0272d53d1f7ec413af83.
Status: specification and implementation plan approved by the maintainer on 2026-10-10 (#157); Native execution underway, activation pending.

## Outcome and approved decisions

Prevent new prerelease features from entering stable main or being published as a stable release without the intended published prerelease cutoff. The 0.8.0 incident promoted later development work; recovery restored the published v0.7.2 product snapshot as 0.8.1, with an explicitly approved settings compatibility exception, and preserved later work for 0.9.x (#149, PR #151, #155, PR #156).

The maintainer approved retaining release candidates and stable fixes into main, keeping implementation in this repository, and enforcing routing, frozen publication provenance, exact approved exceptions, and publication preflight. Policy-only PRs may reach main without changing product behavior. These decisions and the conversational approval are recorded in #157. Written-spec approval precedes implementation planning; no implementation or repository-rule changes ship with this document.

## Existing behavior and gap

Main is the stable even-minor line; feature PRs return to the active odd-minor prerelease branch. Stable fixes return to main and are forward-ported. Candidates use release/MAJOR.MINOR.PATCH. Selective and full promotions are currently documented (docs/versioning-policy.md:L29-L77; scripts/release-policy.js:L45-L79).

The required Release Policy job only runs helper tests. Publication checks package/tag agreement, changelog presence, and tag ancestry in the channel's authorized branch; it does not compare product scope with a published prerelease cutoff (.github/workflows/ci.yml:L16-L34; scripts/validate-release-source.js:L49-L102). Thus valid branch names and passing helper tests alone cannot reject the incident's wrong promotion snapshot (#149, PR #151).

The existing repository ruleset 23655009 protects main and prerelease/*, requires squash PRs and five CI checks, and has no bypass actors. Its required checks are currently loose, allowing an out-of-date head (https://github.com/glitchwerks/vscode-claude-workspaces/rules/23655009, fetched 2026-10-10). Preserve those checks and protections; add enforcement rather than replace quality checks (#157).

## Selected architecture

Use one dependency-free Node policy engine, two adapters, and protected approval data (#157):

1. The PR adapter validates live routing and compares candidate Git objects with approved scope.
2. The publication adapter applies the same scope rules to the tagged tree before dependencies are installed or publishing credentials are used.
3. Policy and approval records live on protected main and are read from the trusted automation checkout, never from the incoming candidate as authority.

Keep the existing release-policy helper tests as a distinct check. A new required workflow runs the guard from protected main. Workflow YAML only supplies identity/inputs and invokes scripts; the engine uses Git object reads and Node built-ins, with no npm installation or candidate-code execution (#157; .github/workflows/ci.yml:L16-L34; .github/workflows/publish.yml:L28-L75).

Branch-only enforcement was rejected because it would permit later features on an allowed branch. Publication-only enforcement was rejected because it would leave main contaminated before tagging. The combined guard addresses both failure points (#157; #149; PR #151).

## Allowed routes

| Target | Incoming work | Required conditions |
| --- | --- | --- |
| Active prerelease branch | Feature/fix PR | Odd-minor package version matches the target line; cannot introduce a conflicting main-owned publication workflow or policy authority. |
| main | release/MAJOR.MINOR.PATCH | Same-repository candidate, even-minor version matching the branch, approved published source and scope. |
| main | hotfix/MAJOR.MINOR.PATCH | Same-repository candidate, next patch of the current stable line, issue-linked exact scope approved separately. |
| main | policy/ISSUE-description | Only explicitly permitted policy, CI, release-tooling, test, or documentation changes; product fingerprint unchanged. |
| Active prerelease branch | Stable forward-port or policy synchronization | Identifies the originating main PR/commit; manual conflict resolution remains reviewable. |

These are proposed concrete branch conventions implementing the routes approved in #157; current candidate naming and stable-forward-port responsibilities come from docs/versioning-policy.md:L41-L77. Every other route to main fails, including an ordinary feature branch and a direct prerelease-to-main PR. Unknown prerelease targets fail until their line is registered in main-owned policy.

A normal prerelease PR may change feature tests and product code. Main-owned guard authority and the publication entry workflow can only change through the policy route on main; synchronization into prerelease must match the corresponding trusted main content. Other prerelease CI changes retain normal review. This avoids making a prerelease PR its own authority (#157; .github/workflows/publish.yml:L28-L71).

Policy-only means an explicit path and JSON-field allowlist, not a label or a broad scripts exclusion. Existing release helpers and their enforcement successors, policy records, CI workflows, policy tests, and documentation can qualify. Runtime code, assets, build configuration, dependency resolution, extension contributions, and packaging selection cannot. Test-command wiring may change only specifically registered package fields. The engine rejects any mixed policy/product PR through this route (#157; package.json:L16-L48; esbuild.js:L14-L39; .vscodeignore:L1-L25).

## Product identity

Compute a deterministic SHA-256 fingerprint over sorted Git entries, including each path, file mode, and exact blob bytes. Read committed Git objects so Windows working-tree line endings do not change the result. All tracked entries are product inputs by default; only the explicit trusted policy exclusions are removed (#157).

Release-only normalization removes package.json's top-level version and the matching root version fields in package-lock.json. It does not remove nested dependency versions, integrity values, scripts, engines, commands, configuration, or other manifest fields. Explicitly registered policy test-command fields may be excluded; generic package or dependency changes are never ignored (#157; package.json:L16-L48).

README, changelog, repository documentation, tests, and registered policy tooling can differ outside the product fingerprint. Package contents and their source/build inputs remain covered: src and scripts being excluded from the VSIX does not make them irrelevant to producing or validating the product (.vscodeignore:L1-L25; esbuild.js:L14-L39). Changes outside the registered exclusions, including added files or mode changes, fail comparison. Test fixtures must cover binary files, deletions, dependency changes, and packaging changes (#157).

For a full promotion, compare the candidate with the frozen source fingerprint, after the narrowly defined release normalization. Versions must promote an odd-minor prerelease to the next even minor; stable patches cannot introduce a new minor line (docs/versioning-policy.md:L29-L37; #157).

## Frozen source and approval records

A promotion record identifies target version, source branch, published prerelease tag, peeled commit, GitHub release ID, successful Publish run, expected product fingerprint, linked issue, and source PR/commit references. Fetch the exact tag object and verify it still resolves to the recorded commit. Verify a published, non-draft prerelease and a successful Publish run for that commit. The existing workflow publishes to Marketplace before creating the GitHub Release; both publication evidence and the pinned commit are required (.github/workflows/publish.yml:L109-L130; #157).

The record is merged through a separate policy PR before the release candidate can pass. Its authoring command computes and displays the immutable cutoff and expected comparison; it never chooses the moving branch tip implicitly. Protected main supplies the authoritative record. A candidate may include descriptive provenance, but cannot create, replace, or broaden its own authoritative approval (#157).

Normal promotion must reproduce that published product snapshot. Existing selective-promotion intent remains possible, but a selection differing from the full published tree needs an explicit exception record: frozen published cutoff, stable baseline tag/commit, ordered selected source commits, rationale and linked issue, and exact expected candidate product fingerprint. Selected commits must be ancestors of the published cutoff. Unpublished commits cannot qualify simply because they are on the active prerelease branch. This tightens the current selective process while preserving a reviewed route for it (docs/versioning-policy.md:L56-L71; #157).

A compatibility correction or conflict resolution that changes product bytes is also an exception. Its record lists the exact changed paths, old/new blob identities, reason, and expected resulting product fingerprint. Replacing a directory allowlist with unrestricted new contents is prohibited. The 0.8.1 settings compatibility decision is the motivating example (#155, PR #156; #157).

Approval records bind product changes and relevant supporting test changes, not a free-form label. Record the canonical proposed diff digest over product changes and non-policy supporting tests, and the resulting product identity. Compute that diff against the live PR base, excluding registered policy-only changes and permitted release metadata; also require the base product fingerprint to match the approved stable baseline where applicable. A later product/test edit invalidates the record and requires a new separately merged approval. Bind the baseline product identity rather than the moving policy-only main commit so merging an approval does not invalidate itself. Release version/changelog preparation follows its own validation rather than granting arbitrary package edits (#157).

Existing approvals are append-only. A correction or changed scope produces a replacement record with explicit supersession; historical records remain available for immutable-tag retries. Unrecognized schemas, duplicate target approvals without supersession, missing references, malformed digests, or missing publication evidence fail closed (#157; docs/versioning-policy.md:L97-L102).

## Stable maintenance and forward-porting

A hotfix starts from the current stable main product. Its separate approval identifies the stable baseline tag/commit and fingerprint, next patch version, issue, exact product/test diff, and resulting fingerprint. The guard verifies the baseline still describes main's product, then verifies the incoming diff and version. Another merged product fix requires rebasing and refreshed approval; policy-only main changes do not (#157; docs/versioning-policy.md:L35-L48).

The guard cannot infer whether arbitrary code is a bug fix or a feature. The separate issue-linked approval is the deliberate scope decision; exact fingerprints prevent later changes from riding along. Merging a branch named hotfix alone is insufficient (#157).

Forward-port the merged fix in a separate PR to the active prerelease branch. The maintenance record starts with forward-port status pending. An append-only supplemental disposition later identifies the merged forward-port PR/commit or the approved superseding fix; it does not mutate the original scope approval. Before a promotion can pass, all stable maintenance since its baseline must either have merged forward-ports contained in the published cutoff, or an explicit recorded disposition explaining how that snapshot retains or supersedes the fix. Publication repeats this check; simply opening a forward-port PR does not satisfy it (#157; docs/versioning-policy.md:L45-L48).

## Trusted required workflow

Use a new organization ruleset scoped only to repository ID 1344170098, with main and prerelease/* branch targets and no bypass actors. Its workflows rule selects the new guard workflow from this repository's refs/heads/main. The organization is on GitHub Team, verified through https://api.github.com/orgs/glitchwerks (fetched 2026-10-10, authenticated organization plan field); Team supports organization rulesets including required Actions workflows (https://github.blog/changelog/2025-06-16-organization-rulesets-now-available-for-github-team-plans/, fetched 2026-10-10; https://docs.github.com/en/rest/orgs/rules, fetched 2026-10-10).

Use pull_request as the ruleset workflow trigger, without path filters or a conditional that skips enforcement. The guard checks out automation at github.workflow_sha, the commit for the selected workflow definition, and reads PR head/base objects only as data. It receives contents:read, pull-requests:read, Actions:read, and issues:read, no publication secrets or status-write token. Issues read validates approval/disposition issue references (https://docs.github.com/en/rest/issues/issues#get-an-issue, fetched 2026-10-10; #157 / PR #159). The Actions read permission was added during implementation review because authenticated workflow/job evidence requires it (https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run, fetched 2026-10-10; #157). Explicitly verify the source revision and actual check association during rollout (https://docs.github.com/en/actions/reference/workflows-and-actions/contexts, fetched 2026-10-10; https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules, fetched 2026-10-10; #157).

Requiring the workflow itself protects its identity; a similarly named success job in the incoming PR is insufficient. Keep existing CI checks required, and enable strict freshness for protected branches. Guard evaluation checks live PR base/head identity and refuses stale inputs. Fetch main-owned approvals at the verified workflow revision; record that revision in the result (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets, fetched 2026-10-10; #157).

This avoids depending on pull_request_target, for which GitHub documents a default public-repository block beginning November 2, 2026. No Actions event-policy exception or external shared action is needed (https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target, fetched 2026-10-10; #157).

Administrators able to edit repository or organization rules remain the policy authority. This design prevents an incoming PR from rewriting its own enforcement; it does not claim to protect against administrators deliberately changing that authority (#157).

## Publication and historical baseline

Extend the trusted source validator already called before npm ci. Keep its existing command-line interface compatible so older publication entry workflows still invoke current main-owned scope enforcement. Validate source identity, approval provenance, product fingerprint, maintenance disposition, tag/package agreement, changelog, and authorized-branch ancestry before any build or publish step (scripts/validate-release-source.js:L49-L133; .github/workflows/publish.yml:L28-L75; #157).

Seed an explicit historical record for stable v0.8.1 at 1a309056b57409fee02f0272d53d1f7ec413af83, source v0.7.2 at 181370a25854fca78cc04129b6728bb3e6bbadc9, and the approved settings compatibility diff. Validate those objects when generating its fingerprints. Later prerelease work stays on prerelease/0.9.x; no product forward-port of this enforcement task is bundled into stable (#155, PR #156; docs/versioning-policy.md:L14-L23).

Historical records permit retries of those exact published tag/commit pairs. There is no blanket exception for old version numbers or pre-activation dates. The withdrawn v0.8.0 is not an approved publication target. Other historical retries require separately verified records. Tag immutability remains unchanged (#155; docs/versioning-policy.md:L97-L102; #157).

## Failure behavior, rollout, and verification

Each failure identifies the route, cutoff, approval, or changed path that failed, and the next concrete correction. Missing Git objects, unavailable GitHub evidence, stale identities, or unexpected schemas fail with no publishing side effects. Do not fall back to branch-tip promotion or warn-only enforcement (#157).

Rollout order: merge the reviewed policy tooling under current protections; seed the historical baseline and active-line data; synchronize main-owned publication authority into the active prerelease line; run positive and negative disposable PR probes; create the repository-scoped required-workflow rule and enable strict freshness; then prove valid PRs pass and forbidden PRs cannot merge. Preserve the entire existing ruleset payload when changing freshness. Team evaluate-mode availability is not assumed; inspect runs before activation (https://docs.github.com/en/rest/orgs/rules, fetched 2026-10-10; https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules, fetched 2026-10-10; #157).

Tests must reproduce the incident: a correctly named release branch with the later 0.9 product tree fails against the v0.7.2 cutoff. Also cover valid full promotion, missing/unpublished/moved sources, wrong targets and versions, package/lockfile/packaging changes, exact approved compatibility exceptions, stale hotfix approval, mixed policy/product PRs, missing forward-ports, and immutable historical retries (#157; #155; PR #156).

Workflow contract and live probes must show the configured main-owned workflow runs its actual guard, including when a PR deletes/replaces its local workflow or changes guard code. Test no secret/write access or execution of inspected candidate code. Existing unit, lint, type, build, and appropriate integration checks continue to apply; no additional OS matrix is introduced (#157; .github/workflows/ci.yml:L36-L87).

Update README and the versioning policy with commands, approval preparation, branch routing, selective-promotion requirements, forward-port completion, failures, and rollout receipts. Close #157 only after implementation, required enforcement, publication verification, and documentation are complete. The spec is durable design rationale; later execution plans are deleted when #157 closes (#157).

## Artifact audit for this design-only commit

The repository file citations above name existing tracked files. New components and records describe future implementation deliverables, not artifacts claimed to ship now. Context verification: git ls-tree HEAD -- docs/versioning-policy.md scripts/release-policy.js scripts/validate-release-source.js .github/workflows/ci.yml .github/workflows/publish.yml package.json package-lock.json esbuild.js .vscodeignore README.md. All ten cited source artifacts must be present before committing this specification (#157).
