import assert from "node:assert/strict";
import type { Uri } from "vscode";

import { type EventLogLevel, type LogLevel, parseLogLevel, shouldLog } from "../../src/logging/logLevel";
import { OutputLogger, redactLaunchArgs } from "../../src/logging/outputLogger";
import type { LaunchSpec } from "../../src/launch/launchPlanner";

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
  it("classifies successful, failed, and signalled exits at the appropriate threshold", () => {
    // Signal-only termination must remain visible at warn; node-pty's zero signal denotes a normal exit.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never);
    logger.processExit("normal", 0);
    logger.processExit("normal-zero-signal", 0, 0);
    logger.processExit("failed", 1);
    logger.processExit("signalled", 0, 9);
    assert.deepEqual(channel.lines.map((line) => JSON.parse(line).level), ["info", "info", "warn", "warn"]);
  });

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

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), [{
      timestamp: "1970-01-01T00:00:00.000Z",
      level: "error",
      event: "startup-error",
      message: "visible"
    }]);
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
        args: ["--add-dir", "[redacted]"],
        rootId: "[redacted]",
        importedRootCount: 1,
        skippedImportCount: 1
      },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "warn", event: "skipped-imports", rootId: "[redacted]", skippedImportCount: 1 },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "startup-error", message: "spawn failed" },
      { timestamp: "2026-09-11T12:34:56.789Z", level: "warn", event: "process-exit", sessionId: "alpha 1", exitCode: 1, signal: 9 },
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
      "[redacted]",
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

  it("redacts multiline values in equals-form path arguments", () => {
    // A dot-only matcher regresses MCP redaction and exposes paths containing line breaks.
    assert.deepEqual(redactLaunchArgs([
      "--mcp-config=/home/MCP_SENTINEL\n/config.json",
      "--add-dir=/home/ROOT_SENTINEL\n/private-team"
    ]), ["--mcp-config=[redacted]", "--add-dir=[redacted]"]);
  });

  for (const level of ["info", "trace"] as const) {
    it(`excludes workspace paths from launch and skipped-import diagnostics at ${level}`, () => {
      // Production IDs are file URIs; retaining identities or --add-dir values exposes local paths.
      const channel = new RecordingOutputChannel();
      const logger = new OutputLogger(channel as never, { level, now: fixedNow });
      const root = {
        id: "file:///C:/Users/ROOT_SENTINEL/private-project",
        label: "ROOT_SENTINEL",
        uri: { fsPath: "C:\\Users\\ROOT_SENTINEL\\private-project" } as Uri
      };
      const importedRoot = {
        id: "file:///C:/Users/IMPORT_SENTINEL/client%20portal",
        label: "IMPORT_SENTINEL",
        uri: { fsPath: "C:\\Users\\IMPORT_SENTINEL\\client portal" } as Uri
      };
      const skippedImportIds = ["file:///home/SKIPPED_SENTINEL/private-team"];

      logger.launchPlan({
        executable: "claude",
        args: [
          "--add-dir", importedRoot.uri.fsPath,
          "--add-dir=/home/EQUALS_SENTINEL/private-team",
          "--mcp-config", "C:\\Users\\MCP_SENTINEL\\config.json",
          "--mcp-config=/home/MCP_EQUALS_SENTINEL/config.json",
          "--resume", "session-1"
        ],
        cwd: root.uri.fsPath,
        env: { SECRET: "ENV_SENTINEL" },
        root,
        importedRoots: [importedRoot],
        skippedImportIds
      });
      logger.skippedImports(root.id, skippedImportIds);

      const records = channel.lines.map((line) => JSON.parse(line));
      assert.deepEqual(records.map(({ event }) => event), level === "trace"
        ? ["launch-plan", "skipped-imports"] : ["skipped-imports"]);
      for (const line of channel.lines) {
        assert.doesNotMatch(line, /SENTINEL|file:|Users|private-project|client|home|private-team/iu);
      }
      assert.equal(records.at(-1).skippedImportCount, 1);
      if (level === "trace") {
        assert.deepEqual(records[0].args, [
          "--add-dir", "[redacted]", "--add-dir=[redacted]",
          "--mcp-config", "[redacted]", "--mcp-config=[redacted]", "--resume", "session-1"
        ]);
        assert.equal(records[0].importedRootCount, 1);
        assert.equal(records[0].skippedImportCount, 1);
      }
    });
  }

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

  it("redacts add-dir paths from error messages in separate and equals forms", () => {
    // Omitting add-dir from text redaction exposes workspace paths when launch errors echo arguments.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    logger.startupError('launch failed: --add-dir "C:\\Users\\ROOT_SENTINEL\\client portal"');
    logger.terminationError("session-1", new Error("launch failed: --add-dir='/home/ROOT_SENTINEL/private team'"));
    logger.configurationReset(new Error("launch failed: --add-dir=/home/ROOT_SENTINEL\n/private-team"));

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line).message), [
      "launch failed: --add-dir [redacted]",
      "launch failed: --add-dir=[redacted]",
      "launch failed: --add-dir=[redacted]"
    ]);
    assert.doesNotMatch(channel.lines.join("\n"), /ROOT_SENTINEL|client portal|private team|private-team/u);
  });

  it("redacts separate-token paths through the next option boundary", () => {
    // Stopping at whitespace leaks multiline and unquoted space-containing path continuations.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    logger.startupError("launch failed: --add-dir /home/ROOT_SENTINEL\n/private-team --resume session-1");
    logger.terminationError(
      "session-1",
      new Error("launch failed: --add-dir C:\\Users\\ROOT SENTINEL\\client portal --resume session-1")
    );
    logger.configurationReset(
      new Error("launch failed: --mcp-config /home/MCP_SENTINEL\n/config file.json --resume session-1")
    );

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line).message), [
      "launch failed: --add-dir [redacted] --resume session-1",
      "launch failed: --add-dir [redacted] --resume session-1",
      "launch failed: --mcp-config [redacted] --resume session-1"
    ]);
    assert.doesNotMatch(channel.lines.join("\n"), /ROOT_SENTINEL|MCP_SENTINEL|private-team|client portal|config file/u);
  });

  it("writes a safe error record when malformed context cannot be serialized", () => {
    // A cyclic runtime value must not break the product path or leak serialization details.
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });

    assert.doesNotThrow(() => logger.shutdown(cyclic as unknown as readonly string[]));

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), [
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "logging-serialization-failed" }
    ]);
  });

  for (const [event, emit] of [
    ["startup-error", (logger: OutputLogger, error: unknown) => logger.startupError(error)],
    ["configuration-reset", (logger: OutputLogger, error: unknown) => logger.configurationReset(error)],
    ["termination-error", (logger: OutputLogger, error: unknown) => logger.terminationError("session-1", error)]
  ] as const) {
    it(`contains unconvertible errors in enabled ${event} diagnostics`, () => {
      // String conversion can throw for null-prototype values or user-defined conversion hooks.
      const channel = new RecordingOutputChannel();
      const logger = new OutputLogger(channel as never, { level: "trace", now: fixedNow });
      const errors = [
        Object.create(null),
        { toString: () => { throw new Error("CONVERSION_SENTINEL"); } }
      ];

      for (const error of errors) {
        assert.doesNotThrow(() => emit(logger, error));
      }

      assert.deepEqual(channel.lines.map((line) => {
        const record = JSON.parse(line);
        return { event: record.event, message: record.message };
      }), [
        { event, message: "Unknown error" },
        { event, message: "Unknown error" }
      ]);
      assert.doesNotMatch(channel.lines.join("\n"), /SENTINEL/u);
    });

    it(`filters ${event} before preparing unknown error text at off`, () => {
      // Filtering only inside write is too late if callers eagerly convert unknown errors.
      const channel = new RecordingOutputChannel();
      let conversions = 0;
      let clockReads = 0;
      const logger = new OutputLogger(channel as never, {
        level: "off",
        now: () => { clockReads += 1; throw new Error("CLOCK_SENTINEL"); }
      });
      const error = { toString: () => { conversions += 1; throw new Error("CONVERSION_SENTINEL"); } };

      assert.doesNotThrow(() => emit(logger, error));
      assert.equal(conversions, 0);
      assert.equal(clockReads, 0);
      assert.deepEqual(channel.lines, []);
    });
  }

  for (const level of ["off", "trace"] as const) {
    it(`contains launch context preparation failures at ${level}`, () => {
      // Accessing spec fields must happen after filtering and inside the best-effort boundary.
      const channel = new RecordingOutputChannel();
      const logger = new OutputLogger(channel as never, { level, now: fixedNow });
      let reads = 0;
      const spec = {
        get executable() { reads += 1; throw new Error("CONTEXT_SENTINEL"); }
      } as unknown as LaunchSpec;

      assert.doesNotThrow(() => logger.launchPlan(spec));
      assert.equal(reads, level === "off" ? 0 : 1);
      assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), level === "off" ? [] : [
        { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "logging-serialization-failed" }
      ]);
    });
  }

  for (const [name, now] of [
    ["invalid", () => new Date(Number.NaN)],
    ["throwing", () => { throw new Error("CLOCK_SENTINEL"); }]
  ] as const) {
    it(`contains ${name} clocks without leaking the original diagnostic`, () => {
      // Timestamp creation outside the write boundary can interrupt lifecycle control flow.
      const channel = new RecordingOutputChannel();
      const logger = new OutputLogger(channel as never, { now });

      assert.doesNotThrow(() => logger.sessionStarting("SESSION_SENTINEL"));

      assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), [
        { timestamp: "1970-01-01T00:00:00.000Z", level: "error", event: "logging-serialization-failed" }
      ]);
    });
  }

  it("uses a context-free fallback when the primary output append fails", () => {
    // A fallback that repeats the event/error/context could expose data from a failed diagnostic.
    const lines: string[] = [];
    let writes = 0;
    const logger = new OutputLogger({
      appendLine: (line: string) => {
        writes += 1;
        if (writes === 1) { throw new Error("APPEND_SENTINEL"); }
        lines.push(line);
      }
    } as never, { now: fixedNow });

    assert.doesNotThrow(() => logger.startupError("ERROR_SENTINEL"));

    assert.equal(writes, 2);
    assert.deepEqual(lines.map((line) => JSON.parse(line)), [
      { timestamp: "2026-09-11T12:34:56.789Z", level: "error", event: "logging-serialization-failed" }
    ]);
  });

  it("contains fallback output failure without recursively retrying", () => {
    // An unguarded fallback append still throws into the caller when the channel is unavailable.
    let writes = 0;
    const logger = new OutputLogger({
      appendLine: () => { writes += 1; throw new Error("APPEND_SENTINEL"); }
    } as never, { now: fixedNow });

    assert.doesNotThrow(() => logger.startupError("ERROR_SENTINEL"));

    assert.equal(writes, 2);
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
