# Changelog

## [Unreleased]

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
