// Separate from attention: this channel carries user-authored draft text.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();
const maxDraftBytes = 1048576;
const maxFrameBytes = 7000000;

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value, allowed) {
  return record(value) && Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
}
function sameTarget(a, b) {
  return keys(a, ["sessionId", "claudeSessionId", "generation"]) && a.sessionId === b.sessionId
    && a.claudeSessionId === b.claudeSessionId && a.generation === b.generation;
}
function validOffset(value, text) {
  return Number.isSafeInteger(value) && value >= 0 && value <= text.length
    && (value === 0 || value === text.length || !(/[\uD800-\uDBFF]/.test(text[value - 1]) && /[\uDC00-\uDFFF]/.test(text[value])));
}
function validDraft(value) {
  return keys(value, ["revision", "text", "selection"]) && Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.text === "string" && value.text.trim().length > 0 && encoder.encode(value.text).length <= maxDraftBytes
    && keys(value.selection, ["anchor", "head"]) && validOffset(value.selection.anchor, value.text) && validOffset(value.selection.head, value.text);
}

/** No additional process/runtime: use only the native session's bounded SDK calls. */

let binding;
let pending;
let retired;
let epoch = 0;
let timer;
const seen = new Set();

async function reply($, owner, fields) {
  try {
    await $.fs.write(`${owner.binding.directory}/response.json`, JSON.stringify({
      protocol: 1, token: owner.binding.token, requestId: owner.request.requestId,
      target: owner.binding.target, ...fields
    }));
  } catch { /* A missing receipt remains unconfirmed; never retry the native action. */ }
}

async function finish($, owner, status, reason) {
  if (owner.completed) return;
  owner.completed = true;
  if (pending === owner) pending = undefined;
  await reply($, owner, {kind: "result", status, ...(reason === undefined ? {} : {reason})});
}

async function isCurrent($, owner) {
  try { return await $.session.id() === owner.binding.target.claudeSessionId; } catch { return false; }
}

async function retainNative($, text) {
  try {
    // Never replace text typed after the submitted event was raised.
    const current = await $.prompt.read();
    if (current.text === "") await $.prompt.fill({text, mode: "append"});
  } catch { /* The native input may belong to a dialog; do not send keystrokes. */ }
}

function guard() {
  if (pending !== undefined && !pending.executing && Date.now() >= pending.expires) {
    retired = pending;
    pending = undefined;
  }
  if (retired !== undefined && Date.now() >= retired.expires) retired = undefined;
  return pending ?? retired;
}

async function bindingSafe($) {
  try {
    const custom = await $.env.get("CLAUDE_CONFIG_DIR");
    const home = await $.env.get("USERPROFILE") || await $.env.get("HOME");
    const directory = custom || (home ? `${home}/.claude` : undefined);
    if (!directory) return false;
    const file = `${directory.replace(/[\\/]+$/, "")}/keybindings.json`;
    if (!await $.fs.exists(file)) return true;
    const text = await $.fs.read(file);
    if (encoder.encode(text).length > 65536) return false;
    const config = JSON.parse(text);
    if (!record(config) || !Array.isArray(config.bindings)) return false;
    for (const block of config.bindings) {
      if (!record(block) || typeof block.context !== "string" || !record(block.bindings)) return false;
      for (const [key, action] of Object.entries(block.bindings)) {
        const normalized = key.toLowerCase().trim().replace(/control\+/g, "ctrl+").replace(/\s+/g, " ")
          .replace(/ (?:return|ctrl\+m)$/, " enter");
        if (normalized === "ctrl+x") return false;
        if (normalized === "ctrl+x enter" && (block.context !== "Chat" || action !== "chat:queueSubmit")) return false;
      }
    }
    return true;
  } catch { return false; }
}

function validRequest(value, scope) {
  if (!record(value) || value.protocol !== 1 || value.token !== scope.token || !uuid.test(value.requestId)
    || !sameTarget(value.target, scope.target)) return false;
  return value.operation === "catalog" ? keys(value, ["protocol", "token", "requestId", "target", "operation"])
    : value.operation === "submit" && keys(value, ["protocol", "token", "requestId", "target", "operation", "draft"]) && validDraft(value.draft);
}

async function poll($, scope, expectedEpoch) {
  if (binding !== scope || epoch !== expectedEpoch) return;
  try {
    if (pending === undefined && await $.fs.exists(`${scope.directory}/request.json`)) {
      const text = await $.fs.read(`${scope.directory}/request.json`);
      if (encoder.encode(text).length <= maxFrameBytes) {
        const request = JSON.parse(text);
        if (validRequest(request, scope) && !seen.has(request.requestId)) {
          seen.add(request.requestId);
          const owner = {binding: scope, request, completed: false, expires: Date.now() + 5000, executing: false};
          if (!await isCurrent($, owner) || epoch !== expectedEpoch) {
            await finish($, owner, "rejected", "unavailable");
          } else if (request.operation === "catalog") {
            const listed = await $.command.list();
            const commands = listed.slice(0,1000).filter(item => typeof item.name === "string" && /^\S{1,255}$/u.test(item.name)
              && typeof item.description === "string" && item.description.length <= 4096 && ["builtin","plugin","user","mcp"].includes(item.source))
              .map(item => ({invocation: `/${item.name}`, description: item.description, source: item.source,
                ...(typeof item.plugin === "string" && item.plugin.length <= 256 ? {plugin:item.plugin} : {})}));
            if (await isCurrent($, owner) && epoch === expectedEpoch) await reply($, owner, {kind:"catalog", commands});
          } else if (!await bindingSafe($)) {
            await finish($, owner, "rejected", "unavailable");
          } else {
            const native = await $.prompt.read();
            if (native.text !== "") {
              await finish($, owner, "rejected", "terminal-draft");
            } else if (!await isCurrent($, owner) || epoch !== expectedEpoch) {
              await finish($, owner, "rejected", "unavailable");
            } else {
              // Append into the observed empty box. If native input arrives
              // during the RPC, keep it and reject the combined draft.
              const filled = await $.prompt.fill({text: request.draft.text, mode:"append"});
              if (!filled.isFilled || filled.text !== request.draft.text) {
                await finish($, owner, "rejected", filled.isFilled ? "terminal-draft" : filled.refusal === "dialog" ? "dialog" : "unavailable");
              } else if (!await isCurrent($, owner) || epoch !== expectedEpoch) {
                retired = owner;
                await finish($, owner, "rejected", "unavailable");
              } else {
                pending = owner;
                await reply($, owner, {kind:"prepared", queueBinding:"ctrl+x enter"});
                $.clock.after(5000, async () => {
                  if (pending !== owner || owner.executing) return;
                  retired = owner;
                  await finish($, owner, "unconfirmed");
                  // Leave the visible native copy for explicit review. An
                  // automatic read/clear could erase a concurrent terminal edit.
                });
              }
            }
          }
        }
      }
    }
  } catch { /* Malformed/unavailable input cannot mutate native submission ownership. */ }
  if (binding === scope && epoch === expectedEpoch) timer = $.clock.after(250, () => poll($, scope, expectedEpoch));
}

async function reset($, ended = false) {
  const expectedEpoch = ++epoch;
  try { timer?.cancel(); } catch { /* Old callbacks also check epoch. */ }
  binding = undefined;
  if (pending !== undefined && !pending.executing) {
    retired = pending;
    await finish($, pending, "rejected", "unavailable");
  }
  if (ended) return;
  try {
    const directory = await $.env.get("CLAUDE_WORKSPACES_COMPOSER_CHANNEL");
    const token = await $.env.get("CLAUDE_WORKSPACES_COMPOSER_TOKEN");
    const sessionId = await $.env.get("CLAUDE_WORKSPACES_COMPOSER_SESSION");
    const claudeSessionId = await $.env.get("CLAUDE_WORKSPACES_COMPOSER_UUID");
    const generation = await $.env.get("CLAUDE_WORKSPACES_COMPOSER_GENERATION");
    if (typeof directory !== "string" || !directory || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)
      || typeof sessionId !== "string" || !sessionId || !uuid.test(claudeSessionId) || !uuid.test(generation)
      || await $.session.id() !== claudeSessionId || epoch !== expectedEpoch) return;
    binding = {directory, token, target: {sessionId,claudeSessionId,generation}};
    const scope = binding;
    timer = $.clock.after(250, () => poll($, scope, expectedEpoch));
  } catch { /* No composer capability means no change to ordinary terminal behavior. */ }
}

export async function startComposer($) { await reset($); }
export async function stopComposer($) { await reset($, true); }
export function register(on) {

  on("prompt.submit", async ($, e, next) => {
    const owner = guard();
    if (owner === undefined || e.origin?.kind !== "composer") return next(e);
    const expected = /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(owner.request.draft.text);
    const commandMatches = e.command !== undefined && (
      e.command.name === owner.command || (expected !== null && expected[1] === e.command.name && (expected[2] ?? "") === e.command.args)
    );
    const matches = commandMatches || (e.command === undefined && e.text === owner.request.draft.text);
    if (owner !== pending || !await isCurrent($, owner) || !matches) {
      await retainNative($, e.text);
      await finish($, owner, "rejected", "terminal-draft");
      return {drop:"Composer send cancelled because native input or session changed; review the retained draft."};
    }
    const result = await next(e);
    await finish($, owner, typeof result.text === "string" ? "accepted" : "rejected", typeof result.text === "string" ? undefined : "invalid");
    return result;
  });

  on("command.run", async ($, e, next) => {
    const owner = guard();
    if (owner === undefined || e.origin?.kind !== "composer") return next(e);
    const match = /^\/([^\s]+)(?:\s([\s\S]*))?$/.exec(owner.request.draft.text);
    if (owner !== pending || !await isCurrent($, owner) || match === null || match[1] !== e.command || (match[2] ?? "") !== e.args) {
      await retainNative($, `/${e.command}${e.args ? ` ${e.args}` : ""}`);
      await finish($, owner, "rejected", "terminal-draft");
      return {text:"Composer send cancelled because native input or session changed; review the retained draft."};
    }
    owner.executing = true;
    owner.command = e.command;
    try {
      const result = await next(e);
      if (!owner.completed) {
        // Generic command completion does not prove a skill's prompt entered:
        // an earlier plugin can stop that prompt before our observer runs.
        // /context is the independently verified local, non-model command.
        const confirmedLocal = e.command === "context" && (typeof result.ref === "number" || typeof result.text === "string");
        if (confirmedLocal) await finish($, owner, "accepted");
        // Otherwise retain ownership: command completion may precede its
        // prompt acceptance. Only that later receipt or the deadline settles it.
      }
      return result;
    } finally {
      owner.executing = false;
      if (!owner.completed && Date.now() >= owner.expires) await finish($, owner, "unconfirmed");
    }
  });
}
