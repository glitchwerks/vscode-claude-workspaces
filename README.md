# Claude Workspaces

Manage workspace-aware Claude Code sessions across VS Code multi-root workspaces.

## Install

Build a VSIX from a checkout, then install it in VS Code:

```bash
npm ci
npm run package:vsix
code --install-extension dist/claude-workspaces.vsix
```

The extension is available only when VS Code has opened a saved
`.code-workspace` file. It intentionally does not activate in a folder window
or an untitled workspace.

## Configuration

Claude Workspaces stores its configuration in VS Code's workspace-local extension
state; it never writes to the `.code-workspace` file. On first use, and whenever
the ordered workspace folder set changes, it prompts for an optional default root
and directed cross-root imports. Dismissing the prompt keeps the first workspace
folder as the effective default and disables every cross-root import.

`claudeWorkspaces.claudeExecutable` is an optional string setting for a Claude
executable path or command. Leave it unset to use `claude` from the extension
host's `PATH`.

## Commands and sessions

The Claude Workspaces panel and Command Palette provide New Session, New in
Folder, Close Session, Restart Fresh, Previous/Next Session, and Configure
Workspace. Sessions are owned only by this extension: closing or deactivating
the extension terminates its managed Claude processes without changing VS Code
terminals or externally launched Claude processes. Retry and Restart Fresh
always resolve the current workspace configuration before launching.

Use **Configure Workspace…** to select an optional default root and directed
cross-root imports. A launch starts Claude in its selected root and passes each
enabled available import as a separate `--add-dir` argument.

## V1 limitations

V1 is session-oriented rather than a general terminal or a Claude conversation
client. It does not persist, resume, reconnect, or retain session transcripts;
adopt externally launched Claude sessions; run outside a saved workspace; or
provide general-purpose terminal features.

Workspace-level `CLAUDE.md` configuration and shared skill discovery are future
scope, not current features.

## Requirements

- VS Code 1.134.0 or later
- Node.js 20 or later
- npm

## Troubleshooting

- Save the workspace as a `.code-workspace` file before using the commands or
  panel.
- Verify that `claude` is available on the VS Code extension host `PATH`, or
  set `claudeWorkspaces.claudeExecutable` to the executable path or command.
  Paths containing spaces are supported.
- Use **Configure Workspace…** after workspace roots change or when a launch
  skips unavailable local or network import roots.
- If Claude exits immediately or fails to start, use the notification's
  **Retry** or **Open Logs** action to inspect the Claude Workspaces output.

## Development

Install the exact dependencies from the lockfile:

```bash
npm ci
```

Available commands:

```bash
npm run check:types
npm run lint
npm run build
npm run build:production
npm run test:unit
npm run test:integration
npm test
npm run package:vsix
```

Press `F5` in VS Code to launch an Extension Development Host after installing
dependencies. Open a saved `.code-workspace` file in that host to exercise the
extension manually. Integration tests download a compatible VS Code test
instance on first use. Packaged VSIX files are written under `dist/` and are
not committed.
