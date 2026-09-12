import assert from "node:assert/strict";
import type { Uri } from "vscode";

import { type EventLogLevel, type LogLevel, parseLogLevel, shouldLog } from "../../src/logging/logLevel";
import { OutputLogger, redactLaunchArgs } from "../../src/logging/outputLogger";

class RecordingOutputChannel {
  readonly lines: string[] = [];
  disposed = false;

  appendLine(value: string): void {
    this.lines.push(value);
  }

  dispose(): void {
    this.disposed = true;
  }
}

const fixedNow = (): Date => new Date("2026-09-11T12:34:56.789Z");

describe("OutputLogger", () => {
  it("parses only the six supported diagnostic levels and defaults malformed values to info", () => {
    // Accepting an unknown setting value would leave logging behavior ambiguous.
    const cases: ReadonlyArray<readonly [unknown, LogLevel]> = [
      ["off", "off"],
      ["error", "error"],
      ["warn", "warn"],
      ["info", "info"],
      ["debug", "debug"],
      ["trace", "trace"],
      [undefined, "info"],
      ["verbose", "info"],
      [{ level: "error" }, "info"]
    ];

    for (const [value, expected] of cases) {
      assert.equal(parseLogLevel(value), expected);
    }
  });

  it("filters every event level at the configured threshold", () => {
    // A reversed or incomplete severity comparison would expose records at the wrong verbosity.
    const cases: ReadonlyArray<readonly [LogLevel, readonly EventLogLevel[]]> = [
      ["off", []],
      ["error", ["error"]],
      ["warn", ["error", "warn"]],
      ["info", ["error", "warn", "info"]],
      ["debug", ["error", "warn", "info", "debug"]],
      ["trace", ["error", "warn", "info", "debug", "trace"]]
    ];
    const eventLevels: readonly EventLogLevel[] = ["error", "warn", "info", "debug", "trace"];

    for (const [configured, expected] of cases) {
      assert.deepEqual(eventLevels.filter((eventLevel) => shouldLog(configured, eventLevel)), expected);
    }
  });

  it("does not write at off and applies a new level to subsequent records", () => {
    // Filtering after serialization or retaining a stale level would leak disabled diagnostics.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "off", now: () => new Date(0) });

    logger.startupError("hidden");
    logger.setLevel("error");
    logger.startupError("visible");
    logger.terminationDelayed("session-1");

    assert.equal(channel.lines.length, 1);
  });

  it("writes structured lifecycle diagnostics to its single output channel", () => {
    // A logger that emits unstructured text or drops diagnostic fields must fail.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    logger.configurationReset(new Error("invalid state"));
    logger.launchPlan({
      executable: "claude",
      args: ["--add-dir", "C:\\work\\client portal"],
      cwd: "C:\\work\\alpha",
      env: {},
      root: {
        id: "alpha",
        label: "alpha",
        uri: { fsPath: "C:\\work\\alpha" } as Uri
      },
      importedRoots: [
        {
          id: "beta",
          label: "beta",
          uri: { fsPath: "C:\\work\\client portal" } as Uri
        }
      ],
      skippedImportIds: ["gamma"]
    });
    logger.skippedImports("alpha", ["gamma"]);
    logger.startupError("spawn failed");
    logger.processExit("alpha 1", 1, 9);
    logger.shutdown(["alpha 1", "beta 1"]);

    const records = channel.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const record of records) {
      assert.equal(record.timestamp, "2026-09-11T12:34:56.789Z");
      assert.equal(typeof record.level, "string");
      assert.equal(typeof record.event, "string");
    }

    assert.deepEqual(records, [
      { timestamp: "2026-09-11T12:34:56.789Z", level: "warn", event: "configuration-reset", message: "invalid state" },
      {
        timestamp: "2026-09-11T12:34:56.789Z",
        level: "debug",
        event: "launch-plan",
        executable: "claude",
        args: ["--add-dir", "C:\\work\\client portal"],
        rootId: "alpha",
        importedRootIds: ["beta"],
        skippedImportIds: ["gamma"]
      },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "warn", event: "skipped-imports", rootId: "alpha", skippedRootIds: ["gamma"] },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "startup-error", message: "spawn failed" },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "info", event: "process-exit", sessionId: "alpha 1", exitCode: 1, signal: 9 },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "info", event: "shutdown", sessionIds: ["alpha 1", "beta 1"] }
    ]);
  });

  it("redacts mcp-config arguments before launch diagnostics are serialized", () => {
    // Leaving either supported flag form intact would disclose the sensitive configuration path.
    const args = [
      "--add-dir",
      "C:\\work\\client",
      "--mcp-config",
      "C:\\secrets\\bookmarks.json",
      "--mcp-config=C:\\secrets\\bookmarks.json",
      "--resume",
      "session-1"
    ];
    assert.deepEqual(redactLaunchArgs(args), [
      "--add-dir",
      "C:\\work\\client",
      "--mcp-config",
      "[redacted]",
      "--mcp-config=[redacted]",
      "--resume",
      "session-1"
    ]);

    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });
    logger.launchPlan({
      executable: "claude",
      args,
      cwd: "C:\\work\\alpha",
      env: { BOOKMARKS_PATH: "C:\\secrets\\bookmarks.json" },
      root: { id: "alpha", label: "alpha", uri: { fsPath: "C:\\work\\alpha" } as Uri },
      importedRoots: [],
      skippedImportIds: []
    });

    const record = JSON.parse(channel.lines[0]!) as Record<string, unknown>;
    assert.deepEqual(record.args, redactLaunchArgs(args));
    assert.equal("env" in record, false);
    assert.equal(JSON.stringify(record).includes("C:\\secrets\\bookmarks.json"), false);
  });

  it("redacts quoted mcp-config paths with spaces from error messages", () => {
    // A whitespace-only matcher would leave the final path segment visible in quoted diagnostics.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    logger.startupError('launch failed: --mcp-config "C:\\secrets\\my config.json"');
    logger.terminationError("session-1", new Error('launch failed: --mcp-config="C:\\secrets\\my config.json"'));

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line).message), [
      "launch failed: --mcp-config [redacted]",
      "launch failed: --mcp-config=[redacted]"
    ]);
    assert.equal(channel.lines.join("\n").includes("C:\\secrets\\my config.json"), false);
  });

  it("writes a safe error record when malformed context cannot be serialized", () => {
    // A cyclic runtime value must not break the product path or leak serialization details.
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    assert.doesNotThrow(() => logger.launchPlan({
      executable: "claude",
      args: [],
      cwd: "C:\\work\\alpha",
      env: {},
      root: { id: "alpha", label: "alpha", uri: { fsPath: "C:\\work\\alpha" } as Uri },
      importedRoots: [],
      skippedImportIds: cyclic as unknown as readonly string[]
    }));

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), [
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "logging-serialization-failed" }
    ]);
  });

  it("writes structured delayed and failed termination diagnostics", () => {
    // Missing lifecycle diagnostics or unstructured error details would leave termination failures unactionable.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    logger.terminationDelayed("session-1");
    logger.terminationError("session-1", new Error("kill failed"));

    assert.deepEqual(channel.lines.slice(-2).map((line) => JSON.parse(line)), [
      { timestamp: "2026-09-11T12:34:56.789Z", level: "warn", event: "termination-delayed", sessionId: "session-1" },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "termination-error", sessionId: "session-1", message: "kill failed" }
    ]);
  });

  it("disposes the output channel it owns", () => {
    // A logger that leaves its VS Code output resource alive must fail.
    const channel = new RecordingOutputChannel();

    new OutputLogger(channel as never).dispose();

    assert.equal(channel.disposed, true);
  });
});
