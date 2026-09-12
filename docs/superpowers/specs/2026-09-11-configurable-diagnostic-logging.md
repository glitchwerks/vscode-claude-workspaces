# Configurable Diagnostic Logging Design

## Goal

Add configurable, structured diagnostic verbosity to the Claude Workspaces extension-owned VS Code Output channel while excluding Claude conversation traffic and secret-bearing values. This implements issue #84 and preserves the redaction boundary required by issue #50.

## Context

The current `OutputLogger` appends unlevelled JSON directly to one `OutputChannel`, and the production activation creates that channel once under the `Claude Workspaces` name (`src/logging/outputLogger.ts:L8-L55`, `src/extension.ts:L127-L132`). The requested behavior, levels, runtime updates, subsystem coverage, redaction rules, tests, and documentation are defined by #84.

Workspace root identifiers are serialized file URIs, so diagnostic context that includes root IDs can expose local paths (`src/workspace/workspaceModel.ts:L20-L26`). Launch arguments can also contain filesystem values and will later contain a sensitive `--mcp-config` carrier path under #50.

VS Code exposes a `LogOutputChannel`, but its `logLevel` is read-only to extensions and defaults to the editor log level. Because `claudeWorkspaces.logLevel` must be authoritative and support immediate changes, Claude Workspaces will retain its regular extension-owned `OutputChannel` and perform filtering and record serialization itself. [VS Code API](https://code.visualstudio.com/api/references/vscode-api#LogOutputChannel) (fetched 2026-09-11).

## User-visible behavior

- `claudeWorkspaces.logLevel` accepts `off`, `error`, `warn`, `info`, `debug`, and `trace`; the default is `info` (#84).
- Changing the setting affects subsequent records immediately and does not reload the extension (#84).
- **Open Logs** continues to reveal only the existing `Claude Workspaces` Output channel (#84; `src/logging/outputLogger.ts:L51-L54`).
- Each emitted line is JSON with `timestamp`, `level`, `event`, and an event-specific context object (#84).
- `info` contains concise lifecycle summaries; `warn` and `error` contain actionable failures; `debug` contains sanitized planning and persistence outcomes; `trace` contains high-frequency decision transitions. `off` emits nothing.

## Diagnostic API and privacy boundary

`src/logging/logLevel.ts` owns the closed level set, parsing, and severity comparison. Unknown configuration values resolve to `info`, matching the manifest default.

`OutputLogger` owns the current level and exposes `setLevel(level)` for runtime changes. Its public methods remain event-specific rather than accepting arbitrary records. This keeps allowed fields reviewable at each call site and prevents prompts, terminal contents, or environment objects from being passed through a generic logging API.

Launch diagnostics retain option names and non-secret values useful for troubleshooting, but `redactLaunchArgs` replaces both the next-token and `--flag=value` forms of `--mcp-config`. `LaunchSpec.env` is never serialized. Error text passes through the same sensitive-argument redactor before serialization. These rules satisfy #84 while preparing the existing full-argument logger for #50.

Root identifiers and filesystem paths are represented by stable counts, booleans, session IDs, or redacted placeholders unless a specific non-secret path is required to diagnose launch selection. No diagnostic method accepts prompt text, PTY data, clipboard contents, or environment values.

## Event coverage

- Configuration: effective level, whether a custom executable is configured, root count, configuration reset.
- Capability probing: started, supported, unsupported, or failed without executable values or help output.
- Launch planning: request mode, sanitized argument vector, imported/skipped counts, selected-root placeholder.
- Managed process lifecycle: starting, running, exit, delayed termination, failed termination, and shutdown.
- Session persistence/resume: saved, renamed, forgotten, skipped, resume requested, resume rejected, and persistence failure without display names or root paths.
- Panel messages: rejected protocol/action failures without payloads, clipboard data, terminal data, or external URI contents.

## Testing

Unit tests will prove level parsing, filtering at every boundary, deterministic timestamps, serialization fallback, runtime level changes, launch-argument redaction, and absence of prohibited values. Integration tests will prove activation reads the setting, registers one configuration listener, applies changes without reload, and preserves Output channel ownership. Existing subsystem tests will assert representative debug/trace events without weakening their behavioral assertions (#84).

README and manifest-asset tests will keep the six levels, `info` default, Output-channel location, and troubleshooting instructions synchronized (#84; `test/unit/packageAssets.test.ts:L118`).

## Out of scope

- Logging in the embedded Claude terminal.
- Capturing prompts, responses, or raw PTY traffic.
- Persisting a separate extension-owned log file.
- Completing the Bookmarks Plus integration tracked by #50.
