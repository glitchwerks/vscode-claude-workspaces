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
- **Compose before sending.** Write multiline prompts, insert file
  references and skills, and preview Markdown in the embedded prompt composer.

## Install

Requires **Windows x64**, **VS Code 1.128.0 or later**, and **Claude Code** on
your `PATH` (or set `claudeWorkspaces.claudeExecutable`).

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=cbeaulieu-gt.vscode-claude-workspaces), or use:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces
```

For the published **0.11.3 testing prerelease**:

```bash
code --install-extension cbeaulieu-gt.vscode-claude-workspaces --pre-release
```

Stable **0.12.0** is published from the validated 0.11.3 snapshot; see its
[publication receipt](https://github.com/glitchwerks/vscode-claude-workspaces/issues/217#issuecomment-6673727185).
The **0.13.x** development line is registered for the copying companion (#215);
no 0.13.x release is published. The composer screenshots were captured on
0.11.2 and illustrate features available in published stable 0.12.0.
Physical keyboard/layout, activity/notification and original typing/rendering
acceptance remain open under [release planning #215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).
After changing versions, run **Developer: Reload Window**.

Open a saved **`.code-workspace`** file, run **Claude Workspaces: Show Claude
Workspaces** from the Command Palette, and choose **New Session**. Single-folder
windows and untitled workspaces are not supported.

## Feature tour

### Give each session the right context

Choose a default folder and directed imports so Claude can work across your
frontend, backend, and documentation.

![Workspace configuration choosing cross-folder imports for a sample workspace](https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/screenshots/workspace-configuration.png)

### Switch sessions and resume conversations

Name live sessions, move between projects, and reopen saved conversations from
the sidebar.

![Named live sessions and saved conversations in the Claude Workspaces sidebar](https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/screenshots/session-tabs.png)

### Work with Claude in one panel

Use Claude Code in the embedded terminal with your configured workspace context.

![Claude Code running in the embedded terminal with workspace context visible](https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/screenshots/running-session.png)

### Write richer prompts

Draft multiline prompts below the terminal, insert **@ File** references, browse
**Skills / commands**, and keep separate drafts for each session.

Drafts autosave after one second without edits. Switching sessions, hiding the
editor or sending a prompt flushes pending changes.

![PRERELEASE 0.11.2: multiline prompt composer with file references and writing tools](https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/screenshots/prompt-composer-prerelease.png)

*Screenshot captured on prerelease 0.11.2; this feature is available in published 0.12.0.*

### Preview before sending

Check Markdown formatting without submitting the prompt. Resize or expand the
editor when you need more writing space.

![PRERELEASE 0.11.2: Markdown preview of an unsent prompt in the embedded composer](https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/screenshots/prompt-preview-prerelease.png)

*Screenshot captured on prerelease 0.11.2; Markdown preview is available in published 0.12.0.*

See the [user guide](https://github.com/glitchwerks/vscode-claude-workspaces/blob/main/docs/user-guide.md) for configuration, shortcuts, session
management, Claude CLI requirements, and troubleshooting.

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

The versioned pre-release branch **`prerelease/0.13.x`** is the registered
feature integration line (#220), initialized with development package 0.13.0.
Main retains the published 0.12.0 stable package; publishing requires separate
approval. Run `npm run test:integration` for extension-host checks.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full developer workflow and
[versioning policy](https://github.com/glitchwerks/vscode-claude-workspaces/blob/main/docs/versioning-policy.md) for packaging and releases.
README screenshots use immutable source URLs; the user guide and versioning
policy link to stable `main`. The source package configuration is preserved
for exact snapshot promotion.

### Companion qualification harness

The 0.13.x copying companion is **not yet qualified for production capture**
(#225). Inspect the synthetic matrix with
`node test/manual/companionNative.smoke.cjs --plan` and run its safe checks with
`node test/manual/companionNative.smoke.cjs --self-test`. Neither mode starts
Claude, VS Code or a browser. Package this development line with
`npm run package:prerelease`. Native/subscription, installed-package and 30-minute synthetic-performance runs
require separate authorization; see the
[qualification guide](https://github.com/glitchwerks/vscode-claude-workspaces/blob/prerelease/0.13.x/docs/manual-verification/215-companion.md).

The no-model native dispatch Trial F has its own safe source checks:
`node test/manual/companionNativeRendezvous.smoke.cjs --plan` and
`node test/manual/companionNativeRendezvous.smoke.cjs --self-test`. Its real
`--run-live --config ABSOLUTE_PATH` mode requires independent source review and
separate execution approval; it does not qualify production or the host-death
and normal-exit lifetime trials (#225).
Both generated controls compare complete target paths after changing only backslashes
to forward slashes; plugin/user-tier checks and the original downstream event stay
unchanged. This source correction follows the [#225 diagnostic outcome](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6897066621);
actual Trial F subsequently passed both holds on source `108f14b`, as recorded in the
[#225 actual result](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6897596456)
and `test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json`.
The separate `--diagnostic-plan` mode is also inert. After a new execution
approval, `--run-diagnostic --config ABSOLUTE_PATH` attempts one 100 ms hold
with bounded v2 diagnostic metadata, including a reserved pre-filter target
candidate and the file snapshot from the observation’s existing read. Checkpoint
integrity is informational: the
files cannot attest the writer's last SDK return, so diagnostic qualification
remains unverified and the launcher returns nonzero even with intact records.
It cannot qualify full Trial F, L/E or any of the 63 release gates.

The [actual Trial L result on `0421819`](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6994889108)
remains unestablished after release; later returned/upload files do not supply the
missing in-run gates. Its exact failed marker/predicate is unknown. The source
correction checks exact file identity during marker polling and records both ends
of the 60-second return check for replay. A new run requires reviewed source,
fresh exact-head CI and new approval.
Trial L has inert source-preparation commands:
`node test/manual/companionNativeLifetime.smoke.cjs --plan` and
`node test/manual/companionNativeLifetime.smoke.cjs --self-test`.
Both are inert with respect to Native/PTY/auth execution. Its separate
`--run-live --config ABSOLUTE_PATH` path requires reviewed committed source and
new execution approval; no L run is established by the source tests. It verifies
the committed actual F receipt and all 24 dependency byte hashes, exact pinned
CLI/SDK/Node identities, clean HEAD and an empty canonical parent under `.tmp`.
The six-second controller B1 mutation window does not guarantee remaining Native
hook time; the unchanged seven-second hook/SDK budget still decides viability.
See the qualification guide for the closed config, preserved storage, private
artifacts and limits. L/E, installed/Electron, all 63 gates and production
admission remain pending.

The [actual Trial L result](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225#issuecomment-6996033551) records the subsequent pass.
The normal-exit diagnostic has two offline commands, `node test/manual/companionNativeExit.smoke.cjs --plan` and `node test/manual/companionNativeExit.smoke.cjs --self-test`.
Its separately approved live command observes one extension-owned upload around a normal PTY exit and preserves the capture directory and admission intent. E, worker quiescence and production admission remain unestablished. [Manual verification and limits](docs/manual-verification/215-companion.md#normal-exit-dispatch-diagnostic)
