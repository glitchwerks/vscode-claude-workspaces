const encoder = new TextEncoder();
const own = (value, key) => value !== null && typeof value === "object" && Object.hasOwn(value, key);
const read = (value, key) => own(value, key) ? value[key] : undefined;
const scalar = value => typeof value === "string" && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
const bounded = (value, limit, min = 0) => scalar(value) && value.length <= limit && encoder.encode(value).length <= limit && encoder.encode(value).length >= min;
const id = value => bounded(value, 256, 1);
const literal = value => bounded(value, 1048576);
function requireSource(valid) { if (!valid) throw new Error("SOURCE_REJECTED"); }
/** Freeze only newly selected data, never an SDK row or envelope. */
function immutable(value) {
  if (value && typeof value === "object") { for (const child of Object.values(value)) immutable(child); Object.freeze(value); }
  return value;
}
function scope(input, key) {
  if (!own(input, key)) return {kind:"main"};
  const agentId = read(input,key); requireSource(id(agentId)); return {kind:"agent",agentId};
}
/** Declared Bash shape and nullable guard projection; private values are never copied. */
function flags(value) {
  if (typeof read(value,"stdout") !== "string" || typeof read(value,"stderr") !== "string" || typeof read(value,"interrupted") !== "boolean") return null;
  const result = {interrupted:read(value,"interrupted")};
  const validators = {
    backgroundTaskId:id,
    backgroundedByUser:v => typeof v === "boolean", backgroundedByTurnAbort:v => typeof v === "boolean",
    backgroundedToDeliverMessage:v => typeof v === "boolean", backgroundEndsWithFinalResponse:v => v === true,
    backgroundWakesOwner:v => v === true, timedOutAfterMs:v => typeof v === "number" && Number.isFinite(v) && v >= 0,
    isImage:v => typeof v === "boolean"
  };
  for (const [key,validate] of Object.entries(validators)) {
    const member = read(value,key); if (member !== undefined && !validate(member)) return null;
    result[key] = member === undefined ? null : member;
  }
  result.backgroundArtifactHint = own(value,"backgroundOutputPath") || own(value,"backgroundCwdHint");
  return result;
}
function callReturn(toolUseId, returned) {
  let branch = "unknown", selectedFlags = null;
  const deny = read(returned,"deny");
  if (deny !== undefined) {
    if (typeof deny === "string" && ["result","context","ref","text","isError","isReadOnly"].every(key => read(returned,key) === undefined)) branch = "deny";
  } else if (read(returned,"isError") === true) branch = "error";
  else { selectedFlags = flags(read(returned,"result")); if (selectedFlags) branch = "bash"; }
  return {kind:"callReturn",scope:{kind:"main"},toolUseId,branch,flags:selectedFlags};
}
function assistant(rowId, content) {
  let bytes = 0; const blocks = [];
  for (let index = 0; index < content.length; index++) {
    const block = content[index]; const type = read(block,"type");
    if (type === "thinking" || type === "redacted_thinking") continue;
    if (type === "text") {
      const text = read(block,"text"); requireSource(literal(text)); bytes += encoder.encode(text).length;
      blocks.push({kind:"text",index,text});
    } else if (type === "tool_use" && read(block,"name") === "Bash") {
      const toolUseId = read(block,"id"), command = read(read(block,"input"),"command");
      requireSource(id(toolUseId) && literal(command)); bytes += encoder.encode(command).length;
      blocks.push({kind:"bashRequest",index,toolUseId,command});
    } else blocks.push({kind:"unsupported",index});
    requireSource(bytes <= 1048576);
  }
  return {kind:"assistantRow",scope:{kind:"main"},rowId,blocks};
}
function output(value, safe) {
  if (!safe) return [{kind:"unavailable",reason:"MEDIA"}];
  const values = typeof value === "string" ? [{type:"text",text:value}] : value;
  if (!Array.isArray(values)) return [{kind:"unavailable",reason:"UNSUPPORTED"}];
  requireSource(values.length <= 20000);
  let bytes = 0; const result = [];
  for (const block of values) {
    if (read(block,"type") !== "text" || typeof read(block,"text") !== "string") {result.push({kind:"unavailable",reason:"UNSUPPORTED"});continue;}
    const text = read(block,"text");
    if (text.length > 262144) return [{kind:"unavailable",reason:"TOO_LARGE"}];
    requireSource(scalar(text));bytes += encoder.encode(text).length;
    if (bytes > 262144) return [{kind:"unavailable",reason:"TOO_LARGE"}];
    result.push({kind:"text",text});
  }
  return result;
}
/**
 * observe(event,input,next,identity?) relays exactly next(input)'s result/rejection.
 * identity is a selected {id,version} session.start metadata snapshot from the adapter.
 * The synchronous sink owns queue accounting, guard storage and cancellation windows.
 */
export function createCaptureObserver(sink) {
  const safe = action => {try {return action();} catch {try {sink.gap("SOURCE_REJECTED");} catch {} }};
  const emit = (value,window) => {
    const metadata = JSON.stringify(value,(key,v) => (key === "text" || key === "command") && typeof v === "string" ? "" : v);
    requireSource(encoder.encode(metadata).length <= 32768);
    sink.enqueue(immutable(value),window);
  };
  return { async observe(event, input, next, identity) {
    const window = safe(() => sink.window());
    const selected = safe(() => {
      if (event === "session.start") {sink.nativeStart(identity?.id,"startup",identity?.version);return {};}
      if (event === "session.end") {sink.nativeEnd(read(input,"sessionId"));return {};}
      if (!["session.append","tool.call","classic.PostToolUse","classic.PostToolUseFailure","classic.PermissionDenied","classic.SessionStart"].includes(event)) return {};
      const selectedScope = scope(input,event.startsWith("classic.") ? "agent_id" : "agentId");
      if (selectedScope.kind === "agent") return {unsupported:{kind:"unsupported",scope:selectedScope,reason:"AGENT_SCOPE"}};
      if (event === "classic.SessionStart") {sink.nativeStart(read(input,"session_id"),read(input,"source"));return {};}
      if (event.startsWith("classic.")) sink.nativeIdentity?.(read(input,"session_id"));
      const origin = event === "tool.call" ? next.origin : read(input,"origin");
      if ((event === "tool.call" && read(origin,"plugin") !== "engine") || (event === "session.append" && read(origin,"kind") === "plugin"))
        return {unsupported:{kind:"unsupported",scope:selectedScope,reason:"PLUGIN_ORIGIN"}};
      if (event === "session.append") return {uuid:read(input,"uuid"),door:read(input,"door"),originKind:read(origin,"kind"),originTool:read(origin,"tool")};
      const tool = read(input,event === "tool.call" ? "tool" : "tool_name");
      if (tool !== "Bash") return {unsupported:{kind:"unsupported",scope:selectedScope,reason:"UNSUPPORTED_TOOL"}};
      const toolUseId = read(input,"tool_use_id");requireSource(id(toolUseId));
      const value = read(event === "tool.call" ? input : read(input,"tool_input"),"command");
      const command = literal(value) ? value : null;
      if (event === "tool.call") {
        const bindingValid = read(origin,"tier") === "core" && command !== null;
        emit({kind:"callEnter",scope:selectedScope,toolUseId,bindingValid,command:bindingValid ? command : null},window);
        return {toolUseId};
      }
      if (event === "classic.PostToolUse") {
        const selectedFlags = flags(read(input,"tool_response"));const valid = command !== null && selectedFlags !== null;
        sink.imageGuard(toolUseId,valid && selectedFlags.isImage !== true);
        return {fact:{kind:"post",scope:selectedScope,toolUseId,command,responseState:valid ? "valid" : "invalid",flags:valid ? selectedFlags : null}};
      }
      if (event === "classic.PostToolUseFailure") {
        const interrupted = read(input,"is_interrupt");
        return {fact:{kind:"failure",scope:selectedScope,toolUseId,command,isInterrupt:typeof interrupted === "boolean" ? interrupted : null}};
      }
      return {fact:{kind:"permissionDenied",scope:selectedScope,toolUseId,command}};
    });
    // Capture cannot catch, replace, freeze or re-run the native continuation.
    const result = await next(input);
    safe(() => {
      if (!selected || sink.window() !== window) return;
      if (selected.unsupported) emit(selected.unsupported,window);
      else if (selected.fact) emit(selected.fact,window);
      else if (event === "tool.call" && selected.toolUseId) {
        const fact = callReturn(selected.toolUseId,result);
        if (fact.branch === "bash") sink.imageGuard(selected.toolUseId,fact.flags.isImage !== true);
        else if (fact.branch === "unknown") sink.imageGuard(selected.toolUseId,false);
        emit(fact,window);
      } else if (event === "session.append") {
        if (selected.originKind === "tool" && selected.originTool !== "Bash") {emit({kind:"unsupported",scope:{kind:"main"},reason:"UNSUPPORTED_TOOL"},window);return;}
        const response = selected.door === "response" && selected.originKind === "model";
        const toolResult = selected.door === "tool-result" && selected.originKind === "tool" && selected.originTool === "Bash";
        if (!response && !toolResult) return;
        requireSource(id(selected.uuid) && read(result,"uuid") === selected.uuid && read(result,"deny") === undefined);
        const message = read(result,"message"), type = response ? "assistant" : "user";
        requireSource(read(message,"type") === type && read(message,"role") === type);
        const content = read(message,"content");requireSource(Array.isArray(content) && content.length <= 20000);
        if (response) emit(assistant(selected.uuid,content),window);
        else for (let index = 0; index < content.length; index++) {
          const block = content[index];if (read(block,"type") !== "tool_result") continue;
          const toolUseId = read(block,"tool_use_id");requireSource(id(toolUseId));const isError = read(block,"is_error");
          emit({kind:"storedResult",scope:{kind:"main"},rowId:selected.uuid,index,toolUseId,isError:typeof isError === "boolean" ? isError : null,
            output:output(read(block,"content"),sink.imageGuard(toolUseId))},window);
        }
      }
    });
    return result;
  }};
}
