/** Capture admission consumes version/build metadata only, with no launch or auth side effects. */
export interface CaptureCapabilityMetadata {
  readonly platform:string;
  readonly arch:string;
  readonly remoteName:string|null;
  readonly vscodeVersion:string;
  readonly cliVersion:string|null;
  readonly cliBuild:string|null;
  readonly pluginAvailable:boolean;
  readonly schemaVersion:number;
}
export interface CaptureQualification {
  readonly platform:string;
  readonly arch:string;
  readonly cliVersion:string;
  readonly cliBuild:string;
  readonly schemaVersion:number;
  readonly adapterId:string;
  readonly receipt:string;
}
export type CaptureCapability = {readonly available:true;readonly adapterId:string;readonly schemaVersion:1} |
  {readonly available:false;readonly reason:"UNSUPPORTED_HOST"|"REMOTE_HOST"|"UNSUPPORTED_VSCODE"|
    "PLUGIN_UNAVAILABLE"|"UNSUPPORTED_SCHEMA"|"UNQUALIFIED_BUILD"};

/** No real build is admitted until packaged qualification supplies a receipt. */
export const qualifiedCaptureBuilds:readonly CaptureQualification[] = Object.freeze([]);

/** Assess capture only; this result is independent of ordinary CLI/composer launch support. */
export function assessCaptureCapability(metadata:CaptureCapabilityMetadata,qualified:readonly CaptureQualification[]=qualifiedCaptureBuilds):CaptureCapability {
  if (metadata.platform !== "win32" || metadata.arch !== "x64") return {available:false,reason:"UNSUPPORTED_HOST"};
  if (metadata.remoteName !== null) return {available:false,reason:"REMOTE_HOST"};
  // The manifest's stable ^1.128.0 range; qualification never widens the host range.
  const version = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\+[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/.exec(metadata.vscodeVersion);
  if (!version || Number(version[1]) !== 1 || !Number.isSafeInteger(Number(version[2])) ||
    Number(version[2]) < 128 || !Number.isSafeInteger(Number(version[3]))) return {available:false,reason:"UNSUPPORTED_VSCODE"};
  if (!metadata.pluginAvailable) return {available:false,reason:"PLUGIN_UNAVAILABLE"};
  if (metadata.schemaVersion !== 1) return {available:false,reason:"UNSUPPORTED_SCHEMA"};
  const record = qualified.find(item => item.platform === metadata.platform && item.arch === metadata.arch &&
    item.cliVersion === metadata.cliVersion && item.cliBuild === metadata.cliBuild &&
    item.schemaVersion === metadata.schemaVersion && item.cliVersion.length > 0 && item.cliBuild.length > 0 &&
    item.receipt.trim().length > 0 && item.adapterId.trim().length > 0);
  if (record) return {available:true,adapterId:record.adapterId,schemaVersion:1};
  return {available:false,reason:"UNQUALIFIED_BUILD"};
}
