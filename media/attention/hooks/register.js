// Metadata only: never send answers, prompts, transcripts, or tool results.
async function logFailure($) {
  try {
    await $.ui.log("Claude Workspaces attention signal delivery failed.");
  } catch {
    // Diagnostics are best effort too, including asynchronous log failures.
  }
}

async function publish($, fields) {
  try {
    const sessionId = await $.session.id();
    const result = await $.process.run([
      "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", `${$.plugin.root}/report-activity.ps1`
    ], {
      stdin: JSON.stringify({ session_id: sessionId, completion_reporter_ready: true, ...fields }),
      timeoutMs: 5000
    });
    if (result.exitCode === 0) {
      return;
    }
  } catch {
    // Delivery failures must never change another plugin's decision or result.
  }
  await logFailure($);
}

async function markReady($, ended = false) {
  try {
    await $.env.set("CLAUDE_WORKSPACES_COMPLETION_SESSION", ended ? "" : await $.session.id());
  } catch {
    await logFailure($);
  }
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    await markReady($);
    return next(e);
  });
  // SessionStart also covers /clear and /resume within an already-loaded worker.
  on("classic.SessionStart", async ($, e, next) => {
    await markReady($);
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    await markReady($, true);
    return next(e);
  });
  on("classic.SubagentStart", async ($, e, next) => {
    await publish($, {
      hook_event_name: "SubagentStart", agent_id: e.agent_id
    });
    return next(e);
  });
  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    await publish($, {
      hook_event_name: "TurnComplete", completion_reason: e.reason, is_aborted: e.isAborted,
      ...(e.agentId === undefined ? {} : { agent_id: e.agentId })
    });
    return result;
  });
}
