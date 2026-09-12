# Configurable Diagnostic Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime-configurable, structured, redacted diagnostic verbosity to the Claude Workspaces Output channel.

**Architecture:** A closed log-level module owns parsing and filtering, while `OutputLogger` remains the single serializer and exposes event-specific methods. Activation reads and watches the VS Code setting; subsystem call sites emit allowlisted diagnostic events without passing prompts, PTY data, clipboard content, environment values, or unredacted sensitive arguments.

**Tech Stack:** TypeScript 6, VS Code Extension API 1.120, Node.js, Mocha, `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-11-configurable-diagnostic-logging.md`

## Global Constraints

- Implement the exact `off`, `error`, `warn`, `info`, `debug`, and `trace` setting contract with default `info` from #84.
- Apply setting changes to subsequent records without an extension reload (#84).
- Keep **Open Logs** on the existing extension-owned Output channel (`src/logging/outputLogger.ts:L135-L138`).
- Do not log prompts, responses, raw terminal traffic, clipboard content, environment values, or unredacted `--mcp-config` values (#84, #50).
- Keep `LaunchSpec.env` outside serialization and use event-specific fields rather than an arbitrary context logger (`src/logging/outputLogger.ts:L88-L95`).
- Follow test-first RED/GREEN cycles for every production behavior.

---

### Task 1: Level Model and Structured Logger

**Files:**
- Create: `src/logging/logLevel.ts`
- Modify: `src/logging/outputLogger.ts`
- Modify: `test/unit/outputLogger.test.ts`

**Interfaces:**
- Produces: `LogLevel`, `parseLogLevel(value): LogLevel`, `shouldLog(configured, eventLevel): boolean`.
- Produces: `new OutputLogger(channel, { level, now })`, `setLevel(level)`, and event-specific methods that serialize `{ timestamp, level, event, ...context }`.
- Produces: `redactLaunchArgs(args): readonly string[]`, covering `--mcp-config value` and `--mcp-config=value`.

- [ ] **Step 1: Write failing level and filtering tests**

Add table-driven tests that require all six parsed values, fallback to `info`, complete threshold filtering, and no writes at `off`. Require `error` to pass every enabled threshold and `trace` only at `trace`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js"`

Expected: FAIL because `logLevel.ts`, constructor options, and level filtering do not exist.

- [ ] **Step 3: Implement the closed level model and minimal filter**

Create the exact public types and functions:

```ts
export const LOG_LEVELS = ["off", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = typeof LOG_LEVELS[number];
export type EventLogLevel = Exclude<LogLevel, "off">;
export function parseLogLevel(value: unknown): LogLevel;
export function shouldLog(configured: LogLevel, eventLevel: EventLogLevel): boolean;
```

Update `OutputLogger` to hold its current level and filter before constructing or serializing a record.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js"`

Expected: PASS.

- [ ] **Step 5: Write failing record-shape and redaction tests**

Require a fixed injected clock to produce `2026-09-11T12:34:56.789Z`; assert every line contains `timestamp`, `level`, and `event`. Assert launch diagnostics redact both `--mcp-config`, `C:\\secrets\\bookmarks.json` and `--mcp-config=C:\\secrets\\bookmarks.json`, never include any `env` entry, and keep safe flags in order. Add a cyclic/unserializable context test that requires a safe `logging-serialization-failed` error record rather than throwing into product behavior.

- [ ] **Step 6: Run the focused test and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js"`

Expected: FAIL because timestamped records, argument redaction, and serialization fallback are missing.

- [ ] **Step 7: Implement structured records and redaction**

Keep event-specific public methods. Add a private writer with the exact boundary:

```ts
private write(level: EventLogLevel, event: string, context: Readonly<Record<string, unknown>> = {}): void;
```

Generate the timestamp from the injected clock, redact sensitive argument forms before the record is built, never spread `LaunchSpec.env`, and catch serialization failures inside `write`.

- [ ] **Step 8: Run logger tests and the unit suite**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js"`

Run: `npm run test:unit`

Expected: all tests PASS.

- [ ] **Step 9: Commit the logger core**

```bash
git add src/logging/logLevel.ts src/logging/outputLogger.ts test/unit/outputLogger.test.ts
git commit -m "feat(logging): add structured verbosity levels"
```

### Task 2: Manifest Setting and Live Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `test/unit/packageAssets.test.ts`
- Modify: `test/integration/activation.test.ts`

**Interfaces:**
- Consumes: `parseLogLevel`, `OutputLogger.setLevel` from Task 1.
- Extends: `ExtensionWorkspaceApi.onDidChangeConfiguration(listener)` for dependency-injected activation tests.
- Produces: `claudeWorkspaces.logLevel` contribution with the exact six-value enum and `info` default.

- [ ] **Step 1: Write failing manifest and activation tests**

Require the contributed setting to expose the ordered six-value enum and default `info`. In activation integration tests, inject a mutable configuration reader and event listener, assert the initial level is applied, fire a change affecting `claudeWorkspaces.logLevel`, and assert subsequent logger output follows the new threshold without recreating or reloading the logger.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/packageAssets.test.js" "out/test/integration/activation.test.js"`

Expected: FAIL because the setting and configuration-change adapter are absent.

- [ ] **Step 3: Add the setting and runtime listener**

Add this manifest contract:

```json
"claudeWorkspaces.logLevel": {
  "type": "string",
  "enum": ["off", "error", "warn", "info", "debug", "trace"],
  "default": "info",
  "description": "Controls diagnostic verbosity in the Claude Workspaces Output channel."
}
```

Extend the injected workspace boundary to read configuration and subscribe to `vscode.workspace.onDidChangeConfiguration`. Register exactly one disposable listener; when `event.affectsConfiguration("claudeWorkspaces.logLevel")` is true, parse the latest value and call `logger.setLevel`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run compile:tests && npx mocha "out/test/unit/packageAssets.test.js" "out/test/integration/activation.test.js"`

Expected: PASS.

- [ ] **Step 5: Run type checking and commit**

Run: `npm run check:types`

```bash
git add package.json src/extension.ts test/unit/packageAssets.test.ts test/integration/activation.test.ts
git commit -m "feat(logging): apply verbosity changes live"
```

### Task 3: Allowlisted Subsystem Diagnostics

**Files:**
- Modify: `src/logging/outputLogger.ts`
- Modify: `src/sessions/sessionTypes.ts`
- Modify: `src/sessions/sessionManager.ts`
- Modify: `src/launch/launchController.ts`
- Modify: `src/panel/sessionPanelProvider.ts`
- Modify: `src/extension.ts`
- Modify: `test/unit/outputLogger.test.ts`
- Modify: `test/unit/sessionManager.test.ts`
- Modify: `test/unit/sessionResumeController.test.ts`
- Modify: `test/integration/activation.test.ts`

**Interfaces:**
- Extends: `SessionLifecycleLogger` with event-specific `sessionStarting` and `sessionRunning` methods.
- Produces: event-specific `OutputLogger` methods for configuration summaries, capability outcomes, launch requests/plans, persistence/resume outcomes, and panel failures.
- Preserves: existing error, exit, shutdown, termination, skipped-import, and **Open Logs** behavior.

- [ ] **Step 1: Write failing lifecycle classification tests**

Require `session-starting`, `session-running`, normal `process-exit`, and `shutdown` at `info`; `skipped-imports`, nonzero `process-exit`, `configuration-reset`, and `termination-delayed` at `warn`; and startup/termination failures at `error`. Assert IDs are present but root URI/path, display name, `LaunchSpec.env`, and terminal data are absent.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js" "out/test/unit/sessionManager.test.js"`

Expected: FAIL because the new events and classifications do not exist.

- [ ] **Step 3: Implement process lifecycle events**

Extend the lifecycle interface and invoke the new methods only at the existing starting-to-running transitions. Make `processExit` choose `info` for exit code zero without a signal and `warn` otherwise. Keep all context event-specific.

- [ ] **Step 4: Run focused lifecycle tests and verify GREEN**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js" "out/test/unit/sessionManager.test.js"`

Expected: PASS.

- [ ] **Step 5: Write failing debug/trace coverage tests**

Require representative events for configuration summary, capability result, launch request/plan, persistence write outcome, resume rejection, and panel failure. Assert debug/trace filtering and prove sentinel prompt, PTY, clipboard, environment, root-path, and `--mcp-config` values never appear in any emitted line.

- [ ] **Step 6: Run focused orchestration tests and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js" "out/test/unit/sessionResumeController.test.js" "out/test/integration/activation.test.js"`

Expected: FAIL because the subsystem events are absent.

- [ ] **Step 7: Add event-specific diagnostics at existing boundaries**

Add named methods with closed parameters such as counts, booleans, enum-like outcomes, and session IDs. Do not pass whole request, workspace, webview message, error, PTY, environment, clipboard, or persisted-session objects. Map the panel provider's existing host log callback to `panelFailure` so message payloads are never serialized.

- [ ] **Step 8: Run focused tests and the unit suite**

Run: `npm run compile:tests && npx mocha "out/test/unit/outputLogger.test.js" "out/test/unit/sessionManager.test.js" "out/test/unit/sessionResumeController.test.js" "out/test/integration/activation.test.js"`

Run: `npm run test:unit`

Expected: all tests PASS.

- [ ] **Step 9: Commit subsystem diagnostics**

```bash
git add src/logging/outputLogger.ts src/sessions/sessionTypes.ts src/sessions/sessionManager.ts src/launch/launchController.ts src/panel/sessionPanelProvider.ts src/extension.ts test/unit/outputLogger.test.ts test/unit/sessionManager.test.ts test/unit/sessionResumeController.test.ts test/integration/activation.test.ts
git commit -m "feat(logging): cover extension lifecycle diagnostics"
```

### Task 4: Documentation and Release Verification

**Files:**
- Modify: `README.md`
- Modify: `test/unit/packageAssets.test.ts`
- Retain: `docs/superpowers/specs/2026-09-11-configurable-diagnostic-logging.md`
- Retain until #84 closes: `docs/superpowers/plans/2026-09-11-configurable-diagnostic-logging.md`

**Interfaces:**
- Consumes: the manifest setting and emitted level contract from Tasks 1-3.
- Produces: user-facing troubleshooting guidance synchronized with the manifest.

- [ ] **Step 1: Write the failing README contract test**

Require the README to name `claudeWorkspaces.logLevel`, all six levels, the `info` default, immediate application, the **Claude Workspaces** Output channel, and the prohibition on prompt/response/terminal logging.

- [ ] **Step 2: Run the asset test and verify RED**

Run: `npm run compile:tests && npx mocha "out/test/unit/packageAssets.test.js"`

Expected: FAIL because the troubleshooting documentation is absent.

- [ ] **Step 3: Update README troubleshooting guidance**

Document how to open the extension-owned channel, choose each level, change it live, gather debug/trace diagnostics, and return to `info`. State that Claude prompts, responses, terminal traffic, environment values, and sensitive carrier arguments are excluded.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run compile:tests && npx mocha "out/test/unit/packageAssets.test.js"`

Run: `npm run check:types`

Run: `npm run lint`

Run: `npm run build:production`

Run: `npm test`

Expected: all commands PASS with 0 test failures.

- [ ] **Step 5: Audit committed artifacts**

Run: `git diff main...HEAD --stat`

Run: `git ls-tree HEAD -- docs/superpowers/specs/2026-09-11-configurable-diagnostic-logging.md docs/superpowers/plans/2026-09-11-configurable-diagnostic-logging.md`

Confirm every path named by the committed spec and plan either exists in `HEAD` or is an existing repository path.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md test/unit/packageAssets.test.ts docs/superpowers/specs/2026-09-11-configurable-diagnostic-logging.md docs/superpowers/plans/2026-09-11-configurable-diagnostic-logging.md
git commit -m "docs(logging): document diagnostic verbosity"
```

- [ ] **Step 7: Request code review before push and PR creation**

Use `superpowers:requesting-code-review`, address all Critical/Important findings through new RED/GREEN cycles, rerun the full verification set, then verify no existing PR for `feature/84-configurable-logging` is closed or merged before pushing.

- [ ] **Step 8: Create the pull request**

Create a PR to `main` whose body summarizes behavior, redaction boundaries, and verification, and includes `Closes #84` plus the required Codex attribution.
