import { createCaptureObserver } from "./companion/observer.js";
import { createFilePublisher } from "./companion/filePublisher.js";
import { createCompletionRetry } from "./completionRetry.js";
import { register as registerComposer, startComposer, stopComposer } from "./composer.js";

// Metadata only: never send answers, prompts, transcripts, or tool results.
const completionRetry = createCompletionRetry((driver, fields, sessionId) => driver.publish(fields, sessionId));
let readinessRevision = 0;
let readinessWrite = Promise.resolve();

// Capabilities cross the helper boundary, never the SDK object itself. The
// legacy supported compiler follows $ only through functions in this file.
function composerDriver($) {
  return {
    session: {id: () => $.session.id()},
    clock: {after: (ms, callback) => $.clock.after(ms, callback)},
    fs: {exists: file => $.fs.exists(file), read: file => $.fs.read(file), write: (file, text) => $.fs.write(file, text)},
    prompt: {read: () => $.prompt.read(), fill: input => $.prompt.fill(input)},
    command: {list: () => $.command.list()},
    env: {get: async name => {
      switch (name) {
        case "CLAUDE_WORKSPACES_COMPOSER_CHANNEL": return $.env.get("CLAUDE_WORKSPACES_COMPOSER_CHANNEL");
        case "CLAUDE_WORKSPACES_COMPOSER_TOKEN": return $.env.get("CLAUDE_WORKSPACES_COMPOSER_TOKEN");
        case "CLAUDE_WORKSPACES_COMPOSER_SESSION": return $.env.get("CLAUDE_WORKSPACES_COMPOSER_SESSION");
        case "CLAUDE_WORKSPACES_COMPOSER_UUID": return $.env.get("CLAUDE_WORKSPACES_COMPOSER_UUID");
        case "CLAUDE_WORKSPACES_COMPOSER_GENERATION": return $.env.get("CLAUDE_WORKSPACES_COMPOSER_GENERATION");
        case "CLAUDE_CONFIG_DIR": return $.env.get("CLAUDE_CONFIG_DIR");
        case "USERPROFILE": return $.env.get("USERPROFILE");
        case "HOME": return $.env.get("HOME");
        default: return undefined;
      }
    }}
  };
}

// Pass capabilities, never the SDK object, across the controller boundary.
function retryDriver($) {
  return {
    clock: { after: (ms, callback) => $.clock.after(ms, callback) },
    session: { id: () => $.session.id() },
    publish: (fields, sessionId) => publish($, fields, sessionId)
  };
}
async function logFailure($) {
  try {
    await $.ui.log("Claude Workspaces attention signal delivery failed.");
  } catch {
    // Diagnostics are best effort too, including asynchronous log failures.
  }
}

async function publish($, fields, confirmedSessionId) {
  try {
    // Retry already checked identity/lifecycle; do not introduce another await
    // between that check and dispatching its writer.
    const sessionId = confirmedSessionId === undefined ? await $.session.id() : confirmedSessionId;
    const result = await $.process.run([
      "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", `${$.plugin.root}/report-activity.ps1`
    ], {
      stdin: JSON.stringify({ session_id: sessionId, completion_reporter_ready: true, ...fields }),
      timeoutMs: 5000
    });
    if (result.exitCode === 0) {
      return true;
    }
  } catch {
    // Delivery failures must never change another plugin's decision or result.
  }
  await logFailure($);
  return false;
}

async function markReady($, ended = false) {
  const revision = ++readinessRevision;
  try {
    if (ended) completionRetry.end();
    const sessionId = ended ? "" : await $.session.id();
    if (revision !== readinessRevision) return;
    if (!ended) completionRetry.activate(sessionId);
    const previousWrite = readinessWrite;
    let release;
    readinessWrite = new Promise(resolve => { release = resolve; });
    try {
      await previousWrite;
      if (revision !== readinessRevision) return;
      await $.env.set("CLAUDE_WORKSPACES_COMPLETION_SESSION", sessionId);
    } finally {
      release();
    }
  } catch {
    // A transient readiness failure does not undo already observed starts.
    // Explicit identity changes and session.end still invalidate old work.
    await logFailure($);
  }
}


/** Explicit source-literal SDK capabilities; no auth, process or settings authority. */
function captureDriver($) {
  return {
    fs: {
      exists: file => $.fs.exists(file), read: file => $.fs.read(file),
      write: (file, text) => $.fs.write(file, text),
      stat: (file, options) => $.fs.stat(file, options), list: directory => $.fs.list(directory)
    },
    clock: { now: () => $.clock.now(), after: (ms, callback) => $.clock.after(ms, callback) }
  };
}
let capturePublisher;
let captureObserver;
let captureInitialization = 0;

/** Initialization never holds a native continuation on environment or capture I/O. */
async function startCapture($, native) {
  const revision = ++captureInitialization;
  try {
    const [id, version, directory, token, sessionId, claudeSessionId, generation] = await Promise.all([
      $.session.id(), $.session.version(),
      $.env.get("CLAUDE_WORKSPACES_CAPTURE_DIR"),
      $.env.get("CLAUDE_WORKSPACES_CAPTURE_TOKEN"),
      $.env.get("CLAUDE_WORKSPACES_CAPTURE_SESSION_ID"),
      $.env.get("CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID"),
      $.env.get("CLAUDE_WORKSPACES_CAPTURE_GENERATION")
    ]);
    if (revision !== captureInitialization) return;
    if (!capturePublisher) {
      capturePublisher = createFilePublisher(captureDriver($), {
        CLAUDE_WORKSPACES_CAPTURE_DIR: directory, CLAUDE_WORKSPACES_CAPTURE_TOKEN: token,
        CLAUDE_WORKSPACES_CAPTURE_SESSION_ID: sessionId, CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID: claudeSessionId,
        CLAUDE_WORKSPACES_CAPTURE_GENERATION: generation
      });
      captureObserver = createCaptureObserver(capturePublisher);
    }
    capturePublisher.nativeStart(native?.id ?? id, native?.source ?? "startup", version);
  } catch {
    // Missing/unsupported SDK or binding disables capture without changing native progress.
    if (revision === captureInitialization) { capturePublisher?.stop(); capturePublisher = undefined; captureObserver = undefined; }
  }
}

/** Compose the selected passive graph without wrapping or replacing next.origin. */
function registerCompanion(on) {
  on("session.start", ($, event, next) => { void startCapture($); return next(event); });
  for (const name of ["session.append", "tool.call", "classic.PostToolUse", "classic.PostToolUseFailure", "classic.PermissionDenied", "classic.SessionStart", "session.end"]) {
    on(name, ($, event, next) => {
      if (name === "session.end") captureInitialization++;
      if (name === "classic.SessionStart" && !captureObserver) void startCapture($, {id:event.session_id,source:event.source});
      return captureObserver ? captureObserver.observe(name, event, next) : next(event);
    });
  }
}

export function register(on) {
  registerCompanion(on);
  registerComposer(on);
  on("session.start", async ($, e, next) => {
    await markReady($);
    await startComposer(composerDriver($));
    return next(e);
  });
  // SessionStart also covers /clear and /resume within an already-loaded worker.
  on("classic.SessionStart", async ($, e, next) => {
    await markReady($);
    await startComposer(composerDriver($));
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    await markReady($, true);
    await stopComposer(composerDriver($));
    return next(e);
  });
  on("classic.SubagentStart", async ($, e, next) => {
    const generation = completionRetry.started(retryDriver($), e.agent_id);
    await publish($, {
      hook_event_name: "SubagentStart", agent_id: e.agent_id,
      ...(generation === undefined ? {} : { agent_generation: generation })
    });
    return next(e);
  });
  on("turn.complete", async ($, e, next) => {
    const generation = completionRetry.generation(e.agentId);
    const result = await next(e);
    const fields = {
      hook_event_name: "TurnComplete", completion_reason: e.reason, is_aborted: e.isAborted,
      ...(e.agentId === undefined ? {} : { agent_id: e.agentId }),
      ...(generation === undefined ? {} : { agent_generation: generation })
    };
    await publish($, fields);
    completionRetry.completed(retryDriver($), e.agentId, generation, fields);
    return result;
  });
}
