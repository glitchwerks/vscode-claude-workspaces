# Contributing to Claude Workspaces

Thank you for helping improve Claude Workspaces. This guide covers local setup,
validation, and pull request expectations for contributors.

## Prerequisites

- Windows x64
- VS Code 1.120.0 or later
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
not already exist, and use a focused branch based on the latest `main`.

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
