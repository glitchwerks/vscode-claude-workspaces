import { createCompletionRetry } from "./completionRetry.js";

// Test fixture only: synthetic transport pairs, no model/agent/tool execution.
let stats, retry, startedAt;
const background = [];

async function publish($, fields, kind) {
  const began = Date.now();
  let success = false;
  try {
    const result = await $.process.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", $.plugin.root + "/report-activity.ps1"], {
      stdin: JSON.stringify({ session_id: await $.session.id(), completion_reporter_ready: true, ...fields }), timeoutMs: 5000
    });
    success = result.exitCode === 0;
  } catch { /* Count failures without retaining exceptions or output. */ }
  if (!success) stats.failures++;
  const samples = kind === "retry" ? stats.retryMs : stats.initialMs;
  if (samples.length < 64) samples.push(Date.now() - began);
  return success;
}
function driver($) {
  return {
    session: { id: () => $.session.id() },
    clock: { after(ms, callback) {
      stats.controllerTimerCalls++;
      stats.activeControllerTimers++;
      stats.peakControllerTimers = Math.max(stats.peakControllerTimers, stats.activeControllerTimers);
      let live = true, handle;
      const close = () => { if (live) { live = false; stats.activeControllerTimers--; } };
      try { handle = $.clock.after(ms, async () => { close(); await callback(); }); }
      catch (error) { close(); stats.failures++; throw error; }
      return { cancel() { close(); try { handle.cancel(); } catch (error) { stats.failures++; throw error; } } };
    } },
    publish: async fields => {
      stats.retryPublications++;
      stats.activeRetryPublications++;
      stats.peakRetryPublications = Math.max(stats.peakRetryPublications, stats.activeRetryPublications);
      try { return await publish($, fields, "retry"); }
      finally { stats.activeRetryPublications--; }
    }
  };
}
async function batch($, index) {
  for (let i = 0; i < 4; i++) {
    const agentId = "synthetic-agent-" + index + "-" + i;
    const capabilities = driver($);
    const generation = retry?.started(capabilities, agentId);
    const identity = { agent_id: agentId, ...(generation === undefined ? {} : { agent_generation: generation }) };
    stats.initialPublications++;
    await publish($, { hook_event_name: "SubagentStart", ...identity }, "initial");
    const fields = { hook_event_name: "TurnComplete", completion_reason: "answer", is_aborted: false, ...identity };
    stats.initialPublications++;
    await publish($, fields, "initial");
    retry?.completed(capabilities, agentId, generation, fields);
  }
  stats.batches++;
}
async function finalize($) {
  stats.durationMs = Date.now() - startedAt;
  await $.fs.write($.plugin.root + "/probe-metrics.json", JSON.stringify(stats));
}
export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    const mode = await $.env.get("CLAUDE_WORKSPACES_RECOVERY_PROBE_MODE");
    if (mode !== "baseline" && mode !== "candidate") return result;
    stats = { mode, batches: 0, initialPublications: 0, retryPublications: 0, controllerTimerCalls: 0,
      activeControllerTimers: 0, peakControllerTimers: 0, activeRetryPublications: 0, peakRetryPublications: 0,
      failures: 0, initialMs: [], retryMs: [] };
    await $.fs.write($.plugin.root + "/probe-ready.json", JSON.stringify({ mode, ready: true }));
    startedAt = Date.now();
    retry = mode === "candidate" ? createCompletionRetry((capabilities, fields) => capabilities.publish(fields)) : undefined;
    retry?.activate(await $.session.id());
    background.push($.clock.after(30000, () => batch($, 1)));
    background.push($.clock.after(60000, () => batch($, 2)));
    background.push($.clock.after(105000, () => finalize($)));
    await batch($, 0);
    return result;
  });
  on("session.end", async ($, e, next) => {
    retry?.end();
    for (const timer of background) { try { timer.cancel(); } catch { /* Owned process exit also ends waits. */ } }
    background.length = 0;
    return next(e);
  });
}
