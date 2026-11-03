# Claude Workspaces

Run Claude Code across the projects in your VS Code workspace. Keep sessions,
workspace context, and saved conversations together in one panel.

## Features

- **Work across projects.** Start a session in any workspace folder and choose
  which other folders Claude can access.
- **Keep sessions organized.** Switch between named sessions without juggling
  terminal windows. See each session's launch folder and imported paths.
- **Pick up where you left off.** Resume saved conversations in their original
  workspace folder.
- **Know when you're needed.** Activity indicators and native Windows
  notifications help you follow background sessions.
- **Compose before sending — prerelease.** Write multiline prompts, insert file
  references and skills, and preview Markdown in the 0.11.2 prompt composer.

## Install

Requires **Windows x64**, **VS Code 1.128.0 or later**, and **Claude Code** on
your `PATH` (or set `claudeWorkspaces.claudeExecutable`).

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cbeaulieu-gt.vscode-claude-workspaces), or use:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces
```

For the **0.11.x testing prerelease**, including the prompt composer shown below:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces --pre-release
```

The prompt-composer screenshots show **0.11.2**; the command installs the latest
available prerelease. The **0.11.3 candidate** prepares the validated composer
and activity fixes; it is not published yet. Stable **0.10.0** does not include
the prompt composer.
After changing versions, run **Developer: Reload Window**.

Open a saved **`.code-workspace`** file, run **Claude Workspaces: Show Claude
Workspaces** from the Command Palette, and choose **New Session**. Single-folder
windows and untitled workspaces are not supported.

## Feature tour

### Give each session the right context

Choose a default folder and directed imports so Claude can work across your
frontend, backend, and documentation.

![Workspace configuration choosing cross-folder imports for a sample workspace](media/screenshots/workspace-configuration.png)

### Switch sessions and resume conversations

Name live sessions, move between projects, and reopen saved conversations from
the sidebar.

![Named live sessions and saved conversations in the Claude Workspaces sidebar](media/screenshots/session-tabs.png)

### Work with Claude in one panel

Use Claude Code in the embedded terminal with your configured workspace context.

![Claude Code running in the embedded terminal with workspace context visible](media/screenshots/running-session.png)

### Write richer prompts — 0.11.2 prerelease

Draft multiline prompts below the terminal, insert **@ File** references, browse
**Skills / commands**, and keep separate drafts for each session.

![PRERELEASE 0.11.2: multiline prompt composer with file references and writing tools](media/screenshots/prompt-composer-prerelease.png)

*Prerelease feature: the prompt composer is available in 0.11.2, not stable 0.10.0.*

### Preview before sending — 0.11.2 prerelease

Check Markdown formatting without submitting the prompt. Resize or expand the
editor when you need more writing space.

![PRERELEASE 0.11.2: Markdown preview of an unsent prompt in the embedded composer](media/screenshots/prompt-preview-prerelease.png)

*Prerelease feature: Markdown preview is part of the 0.11.2 prompt composer.*

See the [user guide](docs/user-guide.md) for configuration, shortcuts, session
management, prerelease requirements, and troubleshooting.

## Development quickstart

Use **Windows x64**, **Node.js 24** (recommended), **npm**, and **VS Code 1.128.0+**.

```bash
git clone https://github.com/glitchwerks/vscode-claude-workspaces.git
```

Open the cloned repository in VS Code, then run:

```bash
npm ci
npm run check:types
npm run lint
npm run test:unit
```

Press **F5** to build and launch an Extension Development Host. Open a saved
multi-root workspace in that host and start a session. Manual session testing
also needs Claude Code installed.

For composer development, use the versioned pre-release branch
**`prerelease/0.11.x`**; `main` contains stable code. Run
`npm run test:integration` for extension-host checks.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer workflow and
[versioning policy](docs/versioning-policy.md) for packaging and releases.
Packaging resolves README images and links from the active prerelease line
configured by `vsce.githubBranch` in `package.json`.
