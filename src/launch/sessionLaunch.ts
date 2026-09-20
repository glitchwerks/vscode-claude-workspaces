import type { LaunchSpec } from "./launchPlanner";

export const ATTENTION_CHANNEL_ENVIRONMENT_VARIABLE = "CLAUDE_WORKSPACES_ATTENTION_CHANNEL";
export const MANAGED_SESSION_ID_ENVIRONMENT_VARIABLE = "CLAUDE_WORKSPACES_SESSION_ID";

/** Adds host-local attention routing without mutating the planner-owned launch snapshot. */
export function overlaySessionEnvironment(
  spec: LaunchSpec,
  attentionChannelPath: string,
  managedSessionId: string
): LaunchSpec {
  return Object.freeze({
    ...spec,
    env: Object.freeze({
      ...spec.env,
      [ATTENTION_CHANNEL_ENVIRONMENT_VARIABLE]: attentionChannelPath,
      [MANAGED_SESSION_ID_ENVIRONMENT_VARIABLE]: managedSessionId
    })
  });
}

/** Builds an immutable launch specification for a new Claude-backed session. */
export function planNewClaudeSession(spec: LaunchSpec, claudeSessionId: string): LaunchSpec {
  return prependSessionArgument(spec, "--session-id", claudeSessionId);
}

/** Builds an immutable launch specification that resumes a persisted Claude-backed session. */
export function planResumedClaudeSession(spec: LaunchSpec, claudeSessionId: string): LaunchSpec {
  return prependSessionArgument(spec, "--resume", claudeSessionId);
}

/** Preserves a launch snapshot while prefixing one documented Claude session option and value. */
function prependSessionArgument(spec: LaunchSpec, option: "--session-id" | "--resume", value: string): LaunchSpec {
  return Object.freeze({
    ...spec,
    args: Object.freeze([option, value, ...spec.args])
  });
}
