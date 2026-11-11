# Contributing to Claude Workspaces

Thank you for helping improve Claude Workspaces. This guide covers local setup,
validation, and pull request expectations for contributors.

## Prerequisites

- Windows x64
- VS Code 1.128.0 or later
- Node.js 24 (recommended)
- npm
- Claude Code on the extension host `PATH`, or an executable configured through
  `claudeWorkspaces.claudeExecutable`, for manual session testing

## Set up the project

Fork and clone the repository, then install the exact dependencies from the
lockfile:

```bash
npm ci
```

Run the extension locally by pressing `F5` in VS Code. The included launch
configuration builds the extension and opens an Extension Development Host.
Open a saved `.code-workspace` file in that host because the extension does not
activate in a single-folder or untitled workspace.

## Validate changes

Run the checks that cover your change before opening a pull request:

```bash
npm run check:types
npm run lint
npm run test:unit
```

Run the integration suite when a change affects activation, VS Code APIs, the
webview, or session lifecycle behavior:

```bash
npm run test:integration
```

Integration tests download a compatible VS Code test instance on first use.
Use `npm test` to run both unit and integration tests. Use
`npm run build:production` to verify a production bundle when changing build or
packaging behavior.

For channel-specific VSIX packaging commands, generated artifact details, and
the release cadence, see the [versioning policy](docs/versioning-policy.md).

## Issues, branches, and pull requests

Search the existing [issues](https://github.com/glitchwerks/vscode-claude-workspaces/issues)
before starting work. Open an issue for a bug or proposed change when one does
not already exist.

For new pre-release features, base the focused branch on the
active pre-release branch and target that branch in the pull request. Base
stable maintenance work on the latest `main` and forward-port the merged fix
through a separate pull request. See the
[versioning policy](docs/versioning-policy.md) for the active branch and
promotion process.

The active development integration branch is `prerelease/0.13.x` (#220).

Keep each pull request scoped to one issue. Describe the user-visible behavior,
include the validation commands you ran, and link the issue. Add a changelog
entry when the change affects extension users.

## Documentation and screenshots

Update `README.md` when a change affects installation, runtime requirements,
configuration, commands, build steps, or the development workflow. Keep public
documentation focused on released or planned release behavior that the code can
verify.

Store feature-tour screenshots in `media/screenshots/`. Capture the real
extension running in an Extension Development Host; do not use mockups. Use PNG
images with a 16:9 aspect ratio and a width of at least 1200 pixels, avoid
personal or sensitive information, and use realistic sample workspace names and
session content. Update the corresponding README image and alt text in the same
pull request. Run the package asset tests after changing screenshots:

```bash
npm run test:unit
```

## Advanced development and native verification

The browser build bundles xterm, CodeMirror and the Markdown preview parser locally. Their packages are pinned
build dependencies; no CDN assets are needed by the session panel. Composer UI
tests run with the existing unit-test command; real keyboard/rebinding checks run
in the VS Code host.

Feature pull requests target `prerelease/0.13.x` (#220). Stable 0.12.0 was
published from the validated 0.11.3 snapshot (#217). Use `npm run package:stable`
for an even-minor package and `npm run package:prerelease` for an odd-minor package.
The development package is initialized at 0.13.0 with `vsce.githubBranch` set
to `prerelease/0.13.x`. Main retains the published stable package identity;
no 0.13.x release is published.

Builds and test compilation automatically apply a pinned cleanup patch to
node-pty 1.1.0 for Windows session exits. Unexpected dependency source or version
changes fail the build; revalidate or remove the patch when upgrading node-pty.
The shipped VSIX includes the patched dependency.

On Windows, `npm run measure:terminal-echo` opens an isolated VS Code test
instance and measures 288 ordered synthetic echoes with capture off/on, one
and four owned PTYs, idle/working indicator presentation, and the production
xterm adapter. Numeric results are written to
`.tmp/180-diagnostics/controlled-echo/results.json`. The workload uses synthetic
paste and a command echo child; it does not run Claude or establish physical
keyboard-to-paint latency. The first run may download the pinned VS Code test
version. Normal integration tests remain separate.

For the quiet-background-agent input control on Windows, compile tests and run
`node test/manual/nativeAgentInput.smoke.cjs --run-live --claude-executable "C:/path/to/claude.exe" --playwright-module "C:/path/to/playwright-core"`.
Supply an absolute Claude executable and an installed Playwright module; the
pinned VS Code test cache includes one under its resources/app/node_modules.
The control launches Edge headlessly and two native agents held before model
entry, then types a synthetic marker through the production renderer/xterm/PTY.
It writes metadata and source hashes under `.tmp/current-agent-input-*/`.
It measures parsed-buffer echo, not hardware keyboard-to-paint latency, and
requires explicit opt-in. Its successful control is recorded in
[test/fixtures/reliability/0112-quiet-agent-input.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2b03d562b13eb6fa572f9b8f76d6de1d400573b0/test/fixtures/reliability/0112-quiet-agent-input.json).

Run `node --test test/manual/programStatusTransport.unit.cjs` to check the
controlled transport runner's timeout and failure cleanup. On Windows, run
`npm run compile:tests` followed by
`node test/manual/programStatusTransport.smoke.cjs` to compare fixed OSC 7501
reply transport with Microsoft's Win32 input encoding. The ten owned-child
controls print metadata only and do not start Claude or change settings.
See the [native status findings](https://github.com/glitchwerks/vscode-claude-workspaces/blob/b11b1036e0a29ae961305509818ec75392aae26b/docs/reliability/native-status-evaluation.md)
for measured results and the remaining Claude negotiation and activity checks.

For a bounded retry-transport soak on Windows, compile tests, then run
`node --test test/manual/completionRecoverySoak.unit.cjs` and
`node test/manual/completionRecoverySoak.smoke.cjs --claude "C:/path/to/claude.exe"`.
Replace the quoted path with an existing Claude executable. The two controls
take about four minutes, provide no model prompts or terminal input, and write
numeric results under `.tmp/completion-recovery-soak/` (override with
`--output-dir`). They exercise synthetic metadata pairs through actual SDK
timers and PowerShell, with diagnostics disabled. They do not measure real
keyboard-to-paint latency. See the [recovery evaluation](https://github.com/glitchwerks/vscode-claude-workspaces/blob/b11b1036e0a29ae961305509818ec75392aae26b/docs/reliability/native-status-evaluation.md#bounded-sdk-transport-soak).

On local Windows x64, run `npm run compile:tests` followed by
`node test/manual/snoreToastActivation.smoke.cjs` to verify native COM callback
routing, handler renewal beyond one minute, and owned-process cleanup. The test
uses built-in Windows PowerShell 5.1, takes about 75 seconds, and requires other
SnoreToast helpers to be stopped. It does not display a toast or change Windows
registration. Complete the [notification checklist](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2b03d562b13eb6fa572f9b8f76d6de1d400573b0/docs/manual-verification/waiting-session-notifications.md)
separately for real notification selection and window behavior.

Each extension host with pending notification callbacks maintains two signed
SnoreToast helpers, briefly overlapping a third during renewal. The pinned
helper exits after one callback or one minute, so renewal starts roughly 2.4
helpers per minute per owner. Unselected callbacks expire after seven days;
closing the owner stops its helpers sooner.

## Publishing

Pushing a `vMAJOR.MINOR.PATCH` tag runs the
[Publish workflow](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2b03d562b13eb6fa572f9b8f76d6de1d400573b0/.github/workflows/publish.yml). The workflow verifies that
the tag matches `package.json`, derives the channel from the version, runs the
full validation suite, packages and publishes the Windows x64 VSIX, and creates
or updates the matching GitHub Release from [CHANGELOG.md](CHANGELOG.md). Odd
minor versions publish as pre-releases; even minor versions publish as stable
releases.

New features integrate through a versioned pre-release branch. Stable
candidates promote approved work from that line to `main`. See the
[versioning policy](docs/versioning-policy.md) for active branch names,
selective and full promotion, source provenance, and forward-porting rules.

The repository must provide an Actions secret named `VSCE_PAT` containing an
Azure DevOps personal access token with **All accessible organizations** access
and **Marketplace (Manage)** scope for the `cbeaulieu-gt` publisher. See the
[VS Code publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for token creation and Marketplace prerequisites.

To retry an existing tag without moving it, open **Actions → Publish → Run
workflow**. Select that exact tag under **Use workflow from**, then enter the
same tag as the input. The selected ref and input must match; the same validation
and publication sequence runs against that immutable tag.

## Release enforcement for development

The active prerelease line carries the release-policy authority synchronized from
protected main under issue #157. CI runs the policy tests, and the native
Release Guard validates each PR using the protected-main workflow. Feature PRs
target prerelease/0.13.x; main uses its required merge queue. Publication must
match current main-owned scripts, workflows, policy data and executable policy
tests. See [versioning policy](docs/versioning-policy.md) for approval and
forward-port commands.

Native guard logs retain redacted `releaseQueueReceipt` records for the job
token's fixed queue query/response fields, PR/ref identities before and after
evaluation, and the proved tree. An outdated main-targeting source branch must
be updated to current main and checked again before queue retry.
