# Versioning Policy

Claude Workspaces uses semantic versions and publishes separate stable and
pre-release channels through the VS Code Marketplace.

## Current channels

Current stable version: `0.4.0`

Current pre-release version: `0.5.0`

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
request.
