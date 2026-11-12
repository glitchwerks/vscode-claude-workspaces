/** Immutable identities and closed transport records; decoding grants no channel authority. */
export interface ManagedCaptureIdentity {
  readonly sessionId: string;
  readonly claudeSessionId: string;
  readonly generation: string;
}
export interface OwnershipMarker extends ManagedCaptureIdentity {
  readonly v: 1;
  readonly kind: "claude-workspaces-companion";
  readonly hostId: string;
  readonly processId: number;
  readonly channelId: string;
}
declare const captureBindingBrand: unique symbol;
/** Only channel creation may mint this in-memory owner; decoded records cannot substitute. */
export interface CaptureBinding {
  readonly [captureBindingBrand]: true;
  readonly directory: string;
  readonly marker: OwnershipMarker;
  readonly token: string;
}
export const captureLimits = Object.freeze({
  ownershipBytes:1024, controlBytes:4096, frameBytes:262144, chunkBytes:65536,
  chunkCount:8192, observationBytes:6324224, metadataBytes:32768, sourceBytes:1048576,
  outputBytes:262144, nativeIdBytes:256, identityBytes:128, arrayElements:20000,
  queueSlots:64, queueBytes:4194304, stagedTransactions:8, stagedBytes:2097152,
  storageBytes:33554432, storageFiles:256, cleanupEntries:256,
  sessionBytes:8388608, globalBytes:33554432, retainedMessages:200,
  sessionNodes:20000, sessionTargets:2000, transactionMs:2000, handshakeMs:5000,
  assemblyProgressMs:5000, assemblyAbsoluteMs:30000, heartbeatMs:1000, healthMs:5000,
  busyPollMs:50, idlePollMs:250
});
export const captureReasonCodes = Object.freeze([
  "SCHEMA_REJECTED", "CONTENT_REJECTED", "IDENTITY_CHANGED", "TRANSACTION_TIMEOUT",
  "CHANNEL_RETIRED", "CONTROL_REJECTED", "HANDSHAKE_TIMEOUT"
] as const);
export type CaptureReasonCode = typeof captureReasonCodes[number];
export type DecodeResult<T> = {readonly ok:true; readonly value:T} |
  {readonly ok:false; readonly reason:"SCHEMA_REJECTED"|"CONTENT_REJECTED"};
export type CaptureJson = string | Uint8Array;
export interface CaptureLaunchBinding extends ManagedCaptureIdentity {
  readonly directory:string;
  readonly token:string;
}
export const captureEnvironmentKeys = Object.freeze([
  "CLAUDE_WORKSPACES_CAPTURE_DIR", "CLAUDE_WORKSPACES_CAPTURE_TOKEN", "CLAUDE_WORKSPACES_CAPTURE_SESSION_ID",
  "CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID", "CLAUDE_WORKSPACES_CAPTURE_GENERATION"
] as const);
/** Structural launch metadata only; the host must separately prove directory ownership. */
export function decodeCaptureLaunchBinding(environment:Readonly<Record<string,unknown>>):DecodeResult<CaptureLaunchBinding> {
  if (!captureEnvironmentKeys.every(key => Object.hasOwn(environment,key))) return {ok:false,reason:"SCHEMA_REJECTED"};
  const [directory,token,sessionId,claudeSessionId,generation] = captureEnvironmentKeys.map(key => environment[key]);
  if (typeof directory !== "string" || !scalar(directory) || directory.includes("\0") ||
    !(/^[A-Za-z]:[\\/]/.test(directory) || /^\\\\[^\\]+\\[^\\]+/.test(directory) || directory.startsWith("/")) ||
    !envelope({v:1,token,sessionId,claudeSessionId,generation})) return {ok:false,reason:"SCHEMA_REJECTED"};
  return {ok:true,value:Object.freeze({directory,token:token as string,sessionId:sessionId as string,
    claudeSessionId:claudeSessionId as string,generation:generation as string})};
}
export interface CaptureEnvelope extends ManagedCaptureIdentity {
  readonly v: 1;
  readonly token: string;
}
export interface RetiredCapture {
  readonly captureEpoch:string;
  readonly ackSeq:number;
  readonly reasonCode:CaptureReasonCode;
}
export interface CaptureHostControl extends CaptureEnvelope {
  readonly kind:"control";
  readonly controlRevision:number;
  readonly state:"offered"|"granted"|"active"|"retired"|"failed";
  readonly offerId:string|null;
  readonly captureEpoch:string|null;
  readonly grantId:string|null;
  readonly predecessorEpoch:string|null;
  readonly reasonCode:CaptureReasonCode|null;
  readonly recoveriesRemaining:0|1;
  readonly lastRetired:RetiredCapture|null;
}
export interface CaptureEpochRequest extends CaptureEnvelope {
  readonly kind:"epochRequest";
  readonly offerId:string;
  readonly predecessorEpoch:string|null;
  readonly nativeSessionId:string;
  readonly reason:"initial"|"native-reset"|"recover";
}
export interface CaptureEpochActivate extends CaptureEnvelope {
  readonly kind:"epochActivate";
  readonly captureEpoch:string;
  readonly grantId:string;
  readonly nativeSessionId:string;
}
export type CaptureAck = CaptureEnvelope & {readonly kind:"ack";readonly captureEpoch:string;readonly ackSeq:number} &
  ({readonly disposition:"continue"}|{readonly disposition:"retired";readonly reasonCode:CaptureReasonCode});
export type CaptureControl = CaptureHostControl|CaptureEpochRequest|CaptureEpochActivate|CaptureAck;
export interface UploadMarker {readonly v:1;readonly basename:string;readonly byteLength:number}
interface DataEnvelope extends CaptureEnvelope {
  readonly captureEpoch:string;
  readonly seq:number;
}
export interface ObservationChunk extends DataEnvelope {
  readonly kind:"observationChunk";
  readonly observationId:number;
  readonly chunkIndex:number;
  readonly chunkCount:number;
  readonly totalByteLength:number;
  readonly byteLength:number;
  readonly data:string;
}
export interface CaptureHeartbeat extends DataEnvelope {readonly kind:"heartbeat"}
export interface CaptureGap extends DataEnvelope {
  readonly kind:"gap";
  readonly mode:"known"|"unknown";
  readonly coversThrough:number;
  readonly reason:"OVERFLOW"|"SOURCE_REJECTED"|"RESET_BOUNDARY";
}
export type CaptureData = ObservationChunk|CaptureHeartbeat|CaptureGap;
export type MainScope = {readonly kind:"main"};
export type AgentScope = {readonly kind:"agent";readonly agentId:string};
export type CaptureScope = MainScope|AgentScope;
export type AssistantBlock = {readonly kind:"text";readonly index:number;readonly text:string} |
  {readonly kind:"bashRequest";readonly index:number;readonly toolUseId:string;readonly command:string} |
  {readonly kind:"unsupported";readonly index:number};
export type OutputBlock = {readonly kind:"text";readonly text:string} |
  {readonly kind:"unavailable";readonly reason:"MEDIA"|"TOO_LARGE"|"UNSUPPORTED"};
export interface BashFlags {
  readonly interrupted:boolean;
  readonly backgroundTaskId:string|null;
  readonly backgroundedByUser:boolean|null;
  readonly backgroundedByTurnAbort:boolean|null;
  readonly backgroundedToDeliverMessage:boolean|null;
  readonly backgroundEndsWithFinalResponse:true|null;
  readonly backgroundWakesOwner:true|null;
  readonly timedOutAfterMs:number|null;
  readonly isImage:boolean|null;
  readonly backgroundArtifactHint:boolean;
}
type ToolObservation = {readonly scope:MainScope;readonly toolUseId:string};
export type NormalizedObservation =
  {readonly kind:"assistantRow";readonly scope:MainScope;readonly rowId:string;readonly blocks:readonly AssistantBlock[]} |
  (ToolObservation & {readonly kind:"callEnter"} &
    ({readonly bindingValid:true;readonly command:string}|{readonly bindingValid:false;readonly command:null})) |
  (ToolObservation & {readonly kind:"callReturn"} &
    ({readonly branch:"bash";readonly flags:BashFlags}|{readonly branch:"deny"|"error"|"unknown";readonly flags:null})) |
  (ToolObservation & {readonly kind:"post"} &
    ({readonly responseState:"valid";readonly command:string;readonly flags:BashFlags}|
    {readonly responseState:"invalid";readonly command:string|null;readonly flags:null})) |
  (ToolObservation & {readonly kind:"failure";readonly command:string|null;readonly isInterrupt:boolean|null}) |
  (ToolObservation & {readonly kind:"permissionDenied";readonly command:string|null}) |
  (ToolObservation & {readonly kind:"storedResult";readonly rowId:string;readonly index:number;
    readonly isError:boolean|null;readonly output:readonly OutputBlock[]}) |
  {readonly kind:"unsupported";readonly scope:AgentScope;readonly reason:"AGENT_SCOPE"} |
  {readonly kind:"unsupported";readonly scope:MainScope;readonly reason:"PLUGIN_ORIGIN"|"UNSUPPORTED_TOOL"};

type Dictionary = Record<string, unknown>;
const hex32 = (v:unknown):v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);
const uuid = (v:unknown):v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v:unknown,min=0):v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const scalar = (v:string):boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v);
const bounded = (v:unknown,max:number,min=0):v is string => typeof v === "string" && scalar(v) && Buffer.byteLength(v,"utf8") >= min && Buffer.byteLength(v,"utf8") <= max;
const oneOf = (v:unknown,values:readonly unknown[]):boolean => values.includes(v);
const nullable = (v:unknown,test:(v:unknown)=>boolean):boolean => v === null || test(v);
const boolean = (v:unknown):v is boolean => typeof v === "boolean";
const reason = (v:unknown):boolean => oneOf(v,captureReasonCodes);

/** Exact keys are checked before inspecting a selected member's values. */
function closed(v:unknown,keys:readonly string[]):v is Dictionary {
  return v !== null && typeof v === "object" && !Array.isArray(v) &&
    Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
}
function requireSchema(valid:unknown):asserts valid {
  if (!valid) throw "SCHEMA_REJECTED";
}
function requireContent(valid:unknown):asserts valid {
  if (!valid) throw "CONTENT_REJECTED";
}
/** Snapshots contain only parsed primitives and closed shallow objects/arrays. */
function freeze<T>(value:T):T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Fatal UTF-8 decoding avoids replacement characters manufacturing source values. */
function decode<T>(input:CaptureJson,max:number,oversize:"SCHEMA_REJECTED"|"CONTENT_REJECTED",validate:(value:unknown)=>void):DecodeResult<T> {
  try {
    if (input.length > max) throw oversize;
    const text = typeof input === "string" ? input : new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(input);
    requireSchema(scalar(text));
    if (Buffer.byteLength(text,"utf8") > max) throw oversize;
    const value:unknown = JSON.parse(text);
    validate(value);
    return {ok:true,value:freeze(value as T)};
  } catch (error) {
    return {ok:false,reason:error === "CONTENT_REJECTED" ? error : "SCHEMA_REJECTED"};
  }
}
const identityKeys = ["sessionId","claudeSessionId","generation"];
const envelopeKeys = ["v","token",...identityKeys];
function identity(v:Dictionary):boolean {
  return bounded(v.sessionId,captureLimits.identityBytes,1) && uuid(v.claudeSessionId) && bounded(v.generation,captureLimits.identityBytes,1);
}
function envelope(v:Dictionary):boolean {
  return v.v === 1 && typeof v.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(v.token) && identity(v);
}

/** Decode a bounded marker and exact directory suffix without adopting its owner. */
export function decodeOwnershipMarker(input:CaptureJson,directoryBasename:string):DecodeResult<OwnershipMarker> {
  return decode(input,captureLimits.ownershipBytes,"SCHEMA_REJECTED",value => {
    requireSchema(closed(value,["v","kind","hostId","processId","channelId",...identityKeys]));
    requireSchema(value.v === 1 && value.kind === "claude-workspaces-companion" && hex32(value.hostId) &&
      integer(value.processId,1) && hex32(value.channelId) && directoryBasename === "companion-"+value.channelId && identity(value));
  });
}
/** Decode one closed control member; authority and state transitions belong to its consumer. */
export function decodeCaptureControl(input:CaptureJson):DecodeResult<CaptureControl> {
  return decode(input,captureLimits.controlBytes,"SCHEMA_REJECTED",value => {
    requireSchema(value !== null && typeof value === "object" && !Array.isArray(value));
    const v = value as Dictionary;
    switch (v.kind) {
      case "control":
        requireSchema(closed(v,[...envelopeKeys,"kind","controlRevision","state","offerId","captureEpoch","grantId","predecessorEpoch","reasonCode","recoveriesRemaining","lastRetired"]));
        requireSchema(integer(v.controlRevision,1) && oneOf(v.state,["offered","granted","active","retired","failed"]) &&
          nullable(v.offerId,hex32) && nullable(v.captureEpoch,hex32) && nullable(v.grantId,hex32) && nullable(v.predecessorEpoch,hex32) &&
          nullable(v.reasonCode,reason) && oneOf(v.recoveriesRemaining,[0,1]));
        requireSchema(v.lastRetired === null || (closed(v.lastRetired,["captureEpoch","ackSeq","reasonCode"]) &&
          hex32(v.lastRetired.captureEpoch) && integer(v.lastRetired.ackSeq) && reason(v.lastRetired.reasonCode)));
        break;
      case "epochRequest":
        requireSchema(closed(v,[...envelopeKeys,"kind","offerId","predecessorEpoch","nativeSessionId","reason"]));
        requireSchema(hex32(v.offerId) && nullable(v.predecessorEpoch,hex32) && uuid(v.nativeSessionId) && oneOf(v.reason,["initial","native-reset","recover"]));
        break;
      case "epochActivate":
        requireSchema(closed(v,[...envelopeKeys,"kind","captureEpoch","grantId","nativeSessionId"]));
        requireSchema(hex32(v.captureEpoch) && hex32(v.grantId) && uuid(v.nativeSessionId));
        break;
      case "ack":
        requireSchema(oneOf(v.disposition,["continue","retired"]));
        requireSchema(closed(v,[...envelopeKeys,"kind","captureEpoch","disposition","ackSeq",...(v.disposition === "retired" ? ["reasonCode"] : [])]));
        requireSchema(hex32(v.captureEpoch) && integer(v.ackSeq) && (v.disposition === "continue" || reason(v.reasonCode)));
        break;
      default: requireSchema(false);
    }
    requireSchema(envelope(v));
  });
}
/** Decode a ready marker against a host-computed upload name, never a supplied path. */
export function decodeUploadMarker(input:CaptureJson,expectedBasename:string):DecodeResult<UploadMarker> {
  return decode(input,captureLimits.controlBytes,"SCHEMA_REJECTED",v => {
    requireSchema(closed(v,["v","basename","byteLength"]) && v.v === 1 && integer(v.byteLength,1) && v.basename === expectedBasename);
    const match = /^(?:request\.[a-f0-9]{32}|activate\.[a-f0-9]{32}|frame\.[a-f0-9]{32}\.([1-9][0-9]*))\.upload$/.exec(expectedBasename);
    requireSchema(match && (match[1] === undefined || integer(Number(match[1]),1)));
  });
}
/** Decode one frame without authenticating its binding or admitting its sequence. */
export function decodeCaptureData(input:CaptureJson):DecodeResult<CaptureData> {
  return decode(input,captureLimits.frameBytes,"CONTENT_REJECTED",value => {
    requireSchema(value !== null && typeof value === "object" && !Array.isArray(value));
    const v = value as Dictionary;
    const common = [...envelopeKeys,"kind","captureEpoch","seq"];
    switch (v.kind) {
      case "heartbeat": requireSchema(closed(v,common)); break;
      case "gap":
        requireSchema(closed(v,[...common,"mode","coversThrough","reason"]));
        requireSchema(oneOf(v.mode,["known","unknown"]) && integer(v.coversThrough,1) && integer(v.seq,1) &&
          (v.mode === "known" ? v.coversThrough >= v.seq : v.coversThrough === v.seq) && oneOf(v.reason,["OVERFLOW","SOURCE_REJECTED","RESET_BOUNDARY"]));
        break;
      case "observationChunk":
        requireSchema(closed(v,[...common,"observationId","chunkIndex","chunkCount","totalByteLength","byteLength","data"]));
        requireSchema(integer(v.observationId,1) && integer(v.chunkIndex) && integer(v.chunkCount,1) &&
          v.chunkCount <= captureLimits.chunkCount && v.chunkIndex < v.chunkCount && integer(v.totalByteLength,1) && integer(v.byteLength,1) && typeof v.data === "string");
        requireContent(v.totalByteLength <= captureLimits.observationBytes && v.byteLength <= captureLimits.chunkBytes &&
          bounded(v.data,captureLimits.chunkBytes,1) && Buffer.byteLength(v.data,"utf8") === v.byteLength &&
          v.totalByteLength >= v.byteLength && (v.chunkCount !== 1 || v.totalByteLength === v.byteLength) && v.totalByteLength >= v.chunkCount);
        break;
      default: requireSchema(false);
    }
    requireSchema(envelope(v) && hex32(v.captureEpoch) && integer(v.seq,1));
  });
}

/** Source constraints differ from malformed dictionaries or member types. */
function nativeId(v:unknown):void {
  requireSchema(typeof v === "string");
  requireContent(bounded(v,captureLimits.nativeIdBytes,1));
}
function source(v:unknown):number {
  requireSchema(typeof v === "string");
  requireContent(bounded(v,captureLimits.sourceBytes));
  return Buffer.byteLength(v,"utf8");
}
function command(v:unknown):void { if (v !== null) source(v); }
function array(v:unknown):asserts v is unknown[] {
  requireSchema(Array.isArray(v));
  requireContent(v.length <= captureLimits.arrayElements);
}
function bashFlags(v:unknown):void {
  requireSchema(closed(v,["interrupted","backgroundTaskId","backgroundedByUser","backgroundedByTurnAbort","backgroundedToDeliverMessage",
    "backgroundEndsWithFinalResponse","backgroundWakesOwner","timedOutAfterMs","isImage","backgroundArtifactHint"]));
  requireSchema(boolean(v.interrupted) && boolean(v.backgroundArtifactHint) &&
    nullable(v.backgroundedByUser,boolean) && nullable(v.backgroundedByTurnAbort,boolean) && nullable(v.backgroundedToDeliverMessage,boolean) &&
    oneOf(v.backgroundEndsWithFinalResponse,[true,null]) && oneOf(v.backgroundWakesOwner,[true,null]) && nullable(v.isImage,boolean) &&
    nullable(v.timedOutAfterMs,n => typeof n === "number" && Number.isFinite(n) && n >= 0));
  if (v.backgroundTaskId !== null) nativeId(v.backgroundTaskId);
}
function assistantBlocks(v:unknown):void {
  array(v);
  let lastIndex = -1;
  let bytes = 0;
  for (const block of v) {
    requireSchema(block !== null && typeof block === "object" && !Array.isArray(block));
    const b = block as Dictionary;
    switch (b.kind) {
      case "text":
        requireSchema(closed(b,["kind","index","text"])); bytes += source(b.text); break;
      case "bashRequest":
        requireSchema(closed(b,["kind","index","toolUseId","command"])); nativeId(b.toolUseId); bytes += source(b.command); break;
      case "unsupported": requireSchema(closed(b,["kind","index"])); break;
      default: requireSchema(false);
    }
    requireSchema(integer(b.index) && b.index > lastIndex);
    lastIndex = b.index;
    requireContent(bytes <= captureLimits.sourceBytes);
  }
}
function outputBlocks(v:unknown):void {
  array(v);
  let bytes = 0;
  for (const b of v) {
    if (closed(b,["kind","text"]) && b.kind === "text") bytes += source(b.text);
    else requireSchema(closed(b,["kind","reason"]) && b.kind === "unavailable" && oneOf(b.reason,["MEDIA","TOO_LARGE","UNSUPPORTED"]));
    requireContent(bytes <= captureLimits.outputBytes);
  }
}
/** Decode one complete normalized snapshot, applying source and metadata budgets. */
export function decodeNormalizedObservation(input:CaptureJson):DecodeResult<NormalizedObservation> {
  return decode(input,captureLimits.observationBytes,"CONTENT_REJECTED",value => {
    requireSchema(value !== null && typeof value === "object" && !Array.isArray(value));
    const v = value as Dictionary;
    const common = ["kind","scope"];
    if (v.kind === "unsupported") {
      requireSchema(closed(v,[...common,"reason"]));
      requireSchema((v.reason === "AGENT_SCOPE" && closed(v.scope,["kind","agentId"]) && v.scope.kind === "agent") ||
        (oneOf(v.reason,["PLUGIN_ORIGIN","UNSUPPORTED_TOOL"]) && closed(v.scope,["kind"]) && v.scope.kind === "main"));
      if (v.reason === "AGENT_SCOPE") nativeId((v.scope as Dictionary).agentId);
    } else {
      requireSchema(closed(v.scope,["kind"]) && v.scope.kind === "main");
      switch (v.kind) {
        case "assistantRow":
          requireSchema(closed(v,[...common,"rowId","blocks"])); nativeId(v.rowId); assistantBlocks(v.blocks); break;
        case "callEnter":
          requireSchema(closed(v,[...common,"toolUseId","bindingValid","command"]));
          requireSchema(boolean(v.bindingValid) && (v.bindingValid ? typeof v.command === "string" : v.command === null)); command(v.command); break;
        case "callReturn":
          requireSchema(closed(v,[...common,"toolUseId","branch","flags"]) && oneOf(v.branch,["deny","error","bash","unknown"]));
          if (v.branch === "bash") bashFlags(v.flags); else requireSchema(v.flags === null); break;
        case "post":
          requireSchema(closed(v,[...common,"toolUseId","command","responseState","flags"]) && oneOf(v.responseState,["valid","invalid"]));
          if (v.responseState === "valid") { requireSchema(typeof v.command === "string"); bashFlags(v.flags); }
          else requireSchema(v.flags === null);
          command(v.command); break;
        case "failure":
          requireSchema(closed(v,[...common,"toolUseId","command","isInterrupt"]) && nullable(v.isInterrupt,boolean)); command(v.command); break;
        case "permissionDenied":
          requireSchema(closed(v,[...common,"toolUseId","command"])); command(v.command); break;
        case "storedResult":
          requireSchema(closed(v,[...common,"toolUseId","rowId","index","isError","output"]) && integer(v.index) && nullable(v.isError,boolean));
          nativeId(v.rowId); outputBlocks(v.output); break;
        default: requireSchema(false);
      }
      if (v.kind !== "assistantRow") nativeId(v.toolUseId);
    }
    const metadata = JSON.stringify(v,(key,child:unknown) => (key === "text" || key === "command") && typeof child === "string" ? "" : child);
    requireContent(Buffer.byteLength(metadata,"utf8") <= captureLimits.metadataBytes);
  });
}

/** Local extraction spans never identify a retained model revision. */
export interface CompanionSourceSpan { readonly start:number; readonly end:number }
export type CompanionContentNotice = "UNSUPPORTED_CONTENT"|"RENDER_LIMIT";
/** Closed pre-identity VW node shapes; the model replaces local targetIndex with targetId. */
export type CompanionContentNode = {readonly sourceSpan:CompanionSourceSpan|null} & (
  {readonly kind:"text";readonly text:string} |
  {readonly kind:"paragraph"|"emphasis"|"strong"|"blockquote"|"listItem";readonly children:readonly CompanionContentNode[]} |
  {readonly kind:"list";readonly children:readonly CompanionContentNode[];readonly ordered:boolean;readonly startNumber:number|null} |
  {readonly kind:"heading";readonly level:number;readonly children:readonly CompanionContentNode[]} |
  {readonly kind:"code";readonly text:string;readonly language:string|null;readonly block:boolean;readonly targetIndex:number|null} |
  {readonly kind:"softBreak"|"hardBreak"} |
  {readonly kind:"link";readonly children:readonly CompanionContentNode[];readonly href:string|null} |
  {readonly kind:"imagePlaceholder";readonly alt:string} |
  {readonly kind:"notice";readonly reason:CompanionContentNotice;readonly text:string}
);
/** Host-local literal value; never serialize this as a VW target descriptor. */
export interface CompanionLiteralCandidate {
  readonly sourceStart:number;readonly sourceEnd:number;readonly literal:string;readonly utf8Bytes:number;
  readonly kind:"command"|"code"|"path";readonly action:"copy"|"review";
  readonly provenanceStatus:"suggested"|"example"|"code"|"none";
  readonly displayLabel:string;readonly accessibleLabel:string;
}
export interface CompanionExtractedContent {
  /** Bytes of returned sourceText only; rejected input is not retained. */
  readonly sourceText:string;readonly sourceBytes:number;readonly derivedBytes:number;
  /** derivedBytes conservatively counts serialized nodes and literal candidates, including labels. */
  readonly nodes:readonly CompanionContentNode[];readonly targets:readonly CompanionLiteralCandidate[];
  readonly unavailableReason:null|"SOURCE_TOO_LARGE"|"INVALID_SOURCE"|"UNSUPPORTED_CONTENT"|"RENDER_LIMIT"|"CANDIDATE_TOO_LARGE";
}
