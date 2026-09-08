# Changelog

## [Unreleased]

## [0.3.0] - 2026-09-07

Claude Workspaces 0.3.0 targets the Marketplace pre-release channel for Windows x64.
Version 0.2.0 remains the stable channel for VS Code 1.120.0 or later.

### Added

- Resume supported Claude sessions and recover from unexpected session exits.
  (#27)
- Propagate live workspace-root renames to active session labels (#37).
- Show richer session details, including the exact `--add-dir` paths used at
  launch (#38).
- Open HTTP and HTTPS links in session output through VS Code (#52).
- Reuse available root-local terminal ordinals after sessions close (#53).
- Provide New Session and related actions from the collapsible session sidebar
  (#54).
- Restore reliable multiline paste behavior in the embedded terminal (#55).
- Forget individual saved sessions directly from the resume-list context menu
  without attempting a resume first (#73).

### Fixed

- Match the embedded terminal background to the VS Code theme when no explicit
  terminal background is provided (#70).
- Use neutral session-action controls in dark themes while retaining primary
  controls in light themes (#71).
- Keep the workspace area filling the panel when no live sessions are open
  (#72).

### Installation

After the `v0.3.0` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.2.0 remains available on the stable channel.

## [0.2.0] - 2026-09-05

Claude Workspaces 0.2.0 is the first stable release.

### Added

- Manage separate Claude Code sessions for each root in a saved VS Code
  multi-root workspace.
- Configure an optional default root and directed cross-root imports, with
  each available import passed to Claude as a separate `--add-dir` argument.
- Start, switch, close, retry, and restart managed sessions in the Claude
  Workspaces panel and its embedded terminal.
- Validate launch roots with bounded availability checks and preserve session
  ownership through extension shutdown.
- Add a Marketplace icon and a README feature tour with sanitized product
  screenshots (#46).
- Publish tag-driven stable and pre-release packages with matching GitHub
  releases and SHA-256 checksums (#44).

### Fixed

- Prevent a streamed-output cursor artifact from obscuring terminal text
  (#32).
- Restart a session from its original selected workspace root (#30).
- Prevent repeated Claude intro messages when the session view is re-resolved
  or replaced (#29).
- Prevent non-cooperative availability probes from starving later reachable
  roots while preserving bounded launch planning (#19).

### Installation

This is the first regular Windows x64 release for VS Code 1.120.0 or later.

## [0.1.3] - 2026-09-05

### Fixed

- Prevent repeated Claude intro messages when the session view is re-resolved
  or replaced (#29).
- Prevent non-cooperative availability probes from starving later reachable
  roots while preserving bounded launch planning (#19).

### Installation

This remains a Windows x64 pre-release for VS Code 1.120.0 or later.
