import type { LaunchSpec } from "./launchPlanner";

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
