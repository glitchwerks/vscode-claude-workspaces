import type { ManagedCaptureIdentity } from "./companionTypes";
import type { LaunchSpec } from "../launch/launchPlanner";

const portKey = "CLAUDE_WORKSPACES_STOP_REPLY_PORT";
const tokenKey = "CLAUDE_WORKSPACES_STOP_REPLY_TOKEN";

interface StopReplyPreparationOptions {
  readonly observedVersion: (executable: string) => string | undefined;
  readonly capture: {
    start(): Promise<number | undefined>;
    bind(target: Readonly<ManagedCaptureIdentity>): string | undefined;
  };
}

/** Use only an observed stable Claude Code version with the documented Stop message field. */
export function supportsStopReplyVersion(version: string | undefined): boolean {
  if (version === undefined) return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (match?.[0] !== version) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 47)));
}

/** Reuse the existing Stop reporter and bind a private relay only for its owning launch. */
export function createStopReplyPreparation(options: StopReplyPreparationOptions) {
  return async (
    spec: LaunchSpec,
    ownedSettingsPath: string | undefined,
    target: Readonly<ManagedCaptureIdentity> | undefined
  ): Promise<LaunchSpec> => {
    // Windows environment names are case-insensitive. Drop inherited relay bindings even on fallback.
    const envEntries = Object.entries(spec.env);
    const retained = envEntries.filter(([key]) => {
      const canonical = key.toUpperCase();
      return canonical !== portKey && canonical !== tokenKey;
    });
    const base = retained.length === envEntries.length ? spec
      : Object.freeze({...spec, env: Object.freeze(Object.fromEntries(retained))});
    if (target === undefined || ownedSettingsPath === undefined ||
        spec.args[0] !== "--settings" || spec.args[1] !== ownedSettingsPath ||
        !supportsStopReplyVersion(options.observedVersion(spec.executable))) return base;

    const port = await options.capture.start();
    if (port === undefined) return base;
    const token = options.capture.bind(target);
    if (token === undefined) return base;
    return Object.freeze({
      ...base,
      env: Object.freeze({...base.env, [portKey]: String(port), [tokenKey]: token})
    });
  };
}
