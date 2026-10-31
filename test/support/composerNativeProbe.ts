import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { Uri } from "vscode";

import { NodePtyFactory } from "../../src/launch/nodePtyAdapter";
import type { ManagedPty } from "../../src/launch/managedPty";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { createClaudeComposerAdapter } from "../../src/composer/claudeComposerAdapter";
import { formatComposerFileReference } from "../../src/composer/composerFiles";
import type { ComposerTarget, DraftState } from "../../src/composer/composerTypes";

const execute = promisify(execFile);

/** Explicit manual entry point; importing this module never starts native work. */
export async function main(argv: readonly string[]): Promise<number> {
  let executable: string | undefined;
  let optedIn = false;
  let scenario = "inventory";
  let allowModel = false;
  let withShippedPlugin = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--run-live") {
      optedIn = true;
    } else if (argv[index] === "--allow-model") {
      allowModel = true;
    } else if (argv[index] === "--with-shipped-plugin") {
      withShippedPlugin = true;
    } else if (argv[index] === "--claude-executable" && argv[index + 1] !== undefined) {
      executable = argv[++index];
    } else if (argv[index] === "--scenario" && argv[index + 1] !== undefined) {
      scenario = argv[++index]!;
    } else {
      process.stderr.write("Unsupported probe arguments.\n");
      return 2;
    }
  }
  if (!["inventory", "product-control", "product-terminal", "product-dialog", "live-product-basic", "live-product-busy", "live-product-file", "live-product-file-absolute", "live-product-skill", "direct-command", "fill-command", "fill-dialog-race", "fill-permission-race", "fill-queue-command", "fill-queue-dialog-race", "live-basic", "live-busy", "live-file", "live-skill", "live-interrupt", "pending-terminal", "dialog-reject", "drop-prompt", "drop-skill", "builtin-context", "wrong-identity", "lost-command-ack"].includes(scenario)) {
    process.stderr.write("Unknown probe scenario.\n");
    return 2;
  }
  if (scenario.startsWith("live-") && !allowModel) {
    process.stderr.write("This fixed-prompt scenario requires --allow-model.\n");
    return 2;
  }
  if (!optedIn || executable === undefined) {
    process.stderr.write("Native probe requires --run-live and --claude-executable.\n");
    return 2;
  }
  if (!isAbsolute(executable)) {
    process.stderr.write("Native probe requires an absolute executable path.\n");
    return 2;
  }
  try {
    return await runLive(executable, scenario, withShippedPlugin);
  } catch {
    process.stderr.write("Native probe failed; no private process output was exported.\n");
    return 1;
  }
}

async function runLive(executable: string, scenario: string, withShippedPlugin: boolean): Promise<number> {
  const { stdout: gitRoot } = await execute("git", ["rev-parse", "--show-toplevel"]);
  const root = gitRoot.trim();
  const { stdout: revision } = await execute("git", ["-C", root, "rev-parse", "HEAD"]);
  const { stdout: version } = await execute(executable, ["--version"], { timeout: 10000, windowsHide: true });
  const versionMatch = version.trim().match(/^(\d+\.\d+\.\d+) \(Claude Code\)$/);
  if (versionMatch === null) {
    process.stderr.write("Unsupported Claude version receipt.\n");
    return 1;
  }
  const directory = join(root, ".tmp", "145-execution", `native-${randomUUID()}`);
  const plugin = join(directory, "plugin");
  const workspace = join(directory, "workspace");
  await mkdir(workspace, { recursive: true });
  await cp(join(root, "test", "fixtures", "composer", "probe-plugin"), plugin, { recursive: true });
  const productControl = scenario.startsWith("product-") || scenario.startsWith("live-product-");
  const loadShippedPlugin = productControl || withShippedPlugin;
  const productPlugin = join(directory,"product-plugin");
  if (loadShippedPlugin) await cp(join(root,"media","attention"),productPlugin,{recursive:true});
  const sourceHashes = loadShippedPlugin ? Object.fromEntries(await Promise.all([
    "media/attention/hooks/composer.js","media/attention/hooks/register.js","src/composer/composerBroker.ts","src/composer/claudeComposerAdapter.ts","src/composer/composerFiles.ts","test/fixtures/composer/probe-plugin/hooks/register.js"
  ].map(async file=>[file,createHash("sha256").update((await readFile(join(root,file),"utf8")).replace(/\r\n/g,"\n")).digest("hex")]))) : undefined;
  const fileMarker = `COMPOSER_FILE_${randomUUID()}`;
  await writeFile(join(workspace, "fixture file.txt"), fileMarker + "\n");
  await writeFile(join(plugin, "file-marker.txt"), fileMarker);
  const productFileScenario=scenario.startsWith("live-product-file");
  const absoluteReference=scenario==="live-product-file-absolute" ? formatComposerFileReference(join(workspace,"fixture file.txt"),workspace[0]?.toUpperCase()==="C"?"I:/composer-probe":"C:/composer-probe","win32") : undefined;
  const filePrompt=`Reply only with the marker from ${absoluteReference ?? '@"fixture file.txt"'}.`;
  const sessionId = randomUUID();
  const target: ComposerTarget = {sessionId:randomUUID(),claudeSessionId:sessionId,generation:randomUUID()};
  let submissionKeysSent = 0;
  const ownedPty: {current:ManagedPty|undefined} = {current:undefined};
  const adapter = productControl ? await createClaudeComposerAdapter({
    storagePath:join(directory,"channels"),platform:process.platform,resolveTarget:() => target,
    writeQueue:async (_target,keys) => {
      if (ownedPty.current === undefined) throw new Error("Owned fixture has not started.");
      submissionKeysSent++;
      ownedPty.current.write(keys);
    }
  }) : undefined;
  let launch: LaunchSpec = {
    executable,
    args: ["--session-id", sessionId, "--plugin-dir", plugin,
      ...(loadShippedPlugin ? ["--plugin-dir",productPlugin] : []),
      "--permission-mode", "default",
      ...(scenario.startsWith("live-") ? ["--model", "haiku"] : []),
      "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      ...(scenario === "fill-permission-race" ? ["--settings", '{"permissions":{"defaultMode":"default","ask":["Bash"]}}'] : []),
      "--tools", scenario.endsWith("dialog-race") || scenario === "dialog-reject" || scenario === "product-dialog" ? "AskUserQuestion" : scenario === "fill-permission-race" ? "Bash" : ""],
    cwd: workspace,
    env: { ...process.env, DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
      ...(loadShippedPlugin ? {CLAUDE_WORKSPACES_ATTENTION_CHANNEL:undefined,CLAUDE_WORKSPACES_SESSION_ID:undefined} : {}),
      ...(productControl ? {COMPOSER_PROBE_PRODUCT:"1",COMPOSER_PROBE_PRODUCT_SCENARIO:scenario.replace("live-product-","live-").replace("-absolute",""),
        ...(productFileScenario ? {COMPOSER_PROBE_FILE_PROMPT:filePrompt} : {})} : {}),
      COMPOSER_PROBE_SESSION_ID: scenario === "wrong-identity" ? randomUUID() : sessionId },
    root: { id: "composer-probe", label: "Composer fixture", uri: { scheme: "file", fsPath: workspace } as Uri },
    importedRoots: [], skippedImportIds: []
  };
  if (adapter !== undefined) launch = await adapter.prepareLaunch(launch,target,versionMatch[1]);
  const pty = await new NodePtyFactory().spawn(launch);
  ownedPty.current = pty;
  pty.resize(120, 32);
  let terminal = "";
  let trustedFixture = false;
  let exited = false;
  const dataSubscription = pty.onData((data) => {
    terminal = (terminal + data).slice(-16000);
    if (!trustedFixture && /Yes, I trust this folder/.test(terminal)) {
      trustedFixture = true;
      pty.write("\r");
    }
  });
  const exitSubscription = pty.onExit(() => { exited = true; });
  try {
    const deadline = Date.now() + 45000;
    let receipt: unknown;
    while (!exited && Date.now() < deadline) {
      try { receipt = JSON.parse(await readFile(join(plugin, "receipt.json"), "utf8")); break; } catch { /* poll an in-place write */ }
      await delay(200);
    }
    let actionReceipt: unknown;
    if (controlPassed("inventory",receipt,undefined) && adapter !== undefined) {
      let actionId = 0;
      const fixtureAction = async (kind: string) => {
        const id = ++actionId;
        await writeFile(join(plugin,"product-action.json"),JSON.stringify({id,kind}));
        const limit=Date.now()+10000;
        while(Date.now()<limit) {
          try {
            const reply=JSON.parse(await readFile(join(plugin,"product-action-result.json"),"utf8"));
            if(reply.id===id)return reply as Record<string,unknown>;
          } catch { /* Wait for the controlled fixture action. */ }
          await delay(100);
        }
        return {} as Record<string,unknown>;
      };
      const submit = (text: string, id = randomUUID()) => {
        const draft: DraftState = {revision:1,text,selection:{anchor:0,head:text.length}};
        return adapter.submit({target,submissionId:id,draft});
      };
      const commands=await adapter.listCommands(target);
      const catalogReady=commands.some(c=>c.invocation==="/context") && commands.some(c=>c.invocation==="/composer-fixture:marker");
      if (scenario.startsWith("live-product-")) {
        const deadline = Date.now()+60000;
        const waitReceipt = async (file: string): Promise<Record<string,unknown>> => {
          while(Date.now()<deadline) {
            try {return JSON.parse(await readFile(join(plugin,file),"utf8")) as Record<string,unknown>;} catch {await delay(100);}
          }
          return {};
        };
        const beforeFirstCompletion = async () => {
          try {await access(join(plugin,"completion.json"));return false;}
          catch (error) {return (error as NodeJS.ErrnoException).code==="ENOENT";}
        };
        const text = productFileScenario ? filePrompt
          : scenario==="live-product-skill" ? "/composer-fixture:marker COMPOSER_SKILL_ARGUMENT"
          : "Reply only with COMPOSER_NATIVE_ACK.\nThis is a controlled composer fixture.";
        const first = await submit(text);
        if(first.status==="accepted") {
          const acceptance=await waitReceipt("acceptance.json");
          if(scenario==="live-product-busy") {
            const second=await submit("Reply only with COMPOSER_SECOND_ACK.");
            const hostEarly=await beforeFirstCompletion();
            const secondAcceptance=await waitReceipt("second-acceptance.json");
            const completion=await waitReceipt("second-completion.json");
            const answer=await waitReceipt("second-answer.json");
            actionReceipt={...secondAcceptance,...completion,...answer,accepted:second.status==="accepted",hostAckBeforeCompletion:hostEarly,
              productCatalogReady:catalogReady,noAutoRetry:submissionKeysSent===2};
          } else {
            const hostEarly=await beforeFirstCompletion();
            const completion=await waitReceipt("completion.json");
            const answer=await waitReceipt("answer.json");
            const extra=productFileScenario ? await waitReceipt("mention.json") : scenario==="live-product-skill" ? await waitReceipt("skill.json") : {};
            actionReceipt={...acceptance,...completion,...answer,...extra,accepted:true,hostAckBeforeCompletion:hostEarly,
              productCatalogReady:catalogReady,noAutoRetry:submissionKeysSent===1};
          }
        } else actionReceipt={productCatalogReady:catalogReady,accepted:false};
      } else if(scenario==="product-control") {
        const dropped=await submit("COMPOSER_DROP_FIXTURE");
        await fixtureAction("clear");
        const skill=await submit("/composer-fixture:marker COMPOSER_SKILL_ARGUMENT");
        const nativeSkill=JSON.parse(await readFile(join(plugin,"submission.json"),"utf8"));
        await fixtureAction("clear");
        const contextId=randomUUID();
        const context=await submit("/context",contextId);
        const keysBeforeRepeat=submissionKeysSent;
        const repeated=await submit("/context",contextId);
        actionReceipt={productCatalogReady:catalogReady,productPromptNotAccepted:dropped.status!=="accepted",
          productSkillNotAccepted:skill.status!=="accepted" && nativeSkill.routedCommand===true,
          productContextAccepted:context.status==="accepted",productDuplicateSuppressed:repeated.status===context.status && keysBeforeRepeat===submissionKeysSent,
          noAutoRetry:submissionKeysSent===3};
      } else if(scenario==="product-terminal") {
        const filled=await fixtureAction("pending");
        const result=await submit("COMPOSER_DROP_FIXTURE");
        const preserved=await fixtureAction("verify-pending");
        actionReceipt={productCatalogReady:catalogReady,productTerminalDraftRejected:filled.filled===true && result.status==="rejected" && result.reason==="terminal-draft",
          terminalDraftPreserved:preserved.terminalDraftPreserved===true,noSubmit:submissionKeysSent===0};
      } else {
        const dialog=await fixtureAction("dialog");
        const result=await submit("COMPOSER_DROP_FIXTURE");
        const stillPending=await fixtureAction("verify-dialog");
        actionReceipt={productCatalogReady:catalogReady,productDialogRejected:dialog.dialogConfirmed===true && result.status==="rejected" && result.reason==="dialog",
          dialogPending:stillPending.dialogPending===true,noSubmit:submissionKeysSent===0};
      }
    } else if (controlPassed("inventory", receipt, undefined) && scenario !== "inventory") {
      await writeFile(join(plugin, "action.json"), JSON.stringify({ scenario }));
      const actionDeadline = Date.now() + (scenario === "lost-command-ack" ? 5000 : scenario.startsWith("live-") ? 60000 : 15000);
      let enterSent = false;
      let secondEnterSent = false;
      let interruptSent = false;
      while (!exited && Date.now() < actionDeadline) {
        try {
          const action = JSON.parse(await readFile(join(plugin, "action-result.json"), "utf8"));
          actionReceipt = action;
          if (["direct-command", "pending-terminal", "dialog-reject"].includes(scenario)) { break; }
          const maySend = scenario.startsWith("live-") || scenario === "lost-command-ack" || scenario.startsWith("drop-") || scenario === "builtin-context" || scenario.endsWith("-command") || action.dialogConfirmed === true;
          if (action.filled === true && maySend && !enterSent) {
            enterSent = true;
            submissionKeysSent++;
            pty.write(scenario.startsWith("fill-queue-") || scenario.endsWith("-race") || scenario.startsWith("live-") || scenario === "lost-command-ack" || scenario.startsWith("drop-") || scenario === "builtin-context" ? "\x18\r" : "\r");
          }
          if (scenario === "drop-prompt" || scenario === "drop-skill") {
            const dropped = JSON.parse(await readFile(join(plugin, "submission.json"), "utf8"));
            const command = scenario === "drop-skill" ? JSON.parse(await readFile(join(plugin, "skill-command.json"), "utf8")) : {};
            actionReceipt = { ...action, ...dropped, ...command };
            break;
          }
          if (scenario === "live-busy" || scenario === "live-interrupt") {
            const secondFill = JSON.parse(await readFile(join(plugin, "second-fill.json"), "utf8"));
            if (secondFill.filled === true && !secondEnterSent) { secondEnterSent = true; submissionKeysSent++; pty.write("\x18\r"); }
            const acceptance = JSON.parse(await readFile(join(plugin, "second-acceptance.json"), "utf8"));
            if (scenario === "live-interrupt") {
              if (!interruptSent) { interruptSent = true; pty.write("\x03"); }
              const completion = JSON.parse(await readFile(join(plugin, "completion.json"), "utf8"));
              actionReceipt = { ...secondFill, ...acceptance, ...completion };
              break;
            }
            const completion = JSON.parse(await readFile(join(plugin, "second-completion.json"), "utf8"));
            const answer = JSON.parse(await readFile(join(plugin, "second-answer.json"), "utf8"));
            actionReceipt = { ...secondFill, ...acceptance, ...completion, ...answer };
            break;
          }
          if (["live-basic", "live-file", "live-skill"].includes(scenario)) {
            const acceptance = JSON.parse(await readFile(join(plugin, "acceptance.json"), "utf8"));
            const completion = JSON.parse(await readFile(join(plugin, "completion.json"), "utf8"));
            const answer = JSON.parse(await readFile(join(plugin, "answer.json"), "utf8"));
            const extra = scenario === "live-file" ? JSON.parse(await readFile(join(plugin, "mention.json"), "utf8"))
              : scenario === "live-skill" ? JSON.parse(await readFile(join(plugin, "skill.json"), "utf8")) : {};
            actionReceipt = { ...action, ...acceptance, ...completion, ...answer, ...extra };
            break;
          }
          const resultFile = scenario.endsWith("-race") ? "race-after.json" : "command.json";
          const command = JSON.parse(await readFile(join(plugin, resultFile), "utf8"));
          actionReceipt = { ...action, ...command };
          break;
        } catch { /* wait for the controlled action's receipt */ }
        await delay(100);
      }
      if (scenario === "lost-command-ack") {
        const processed = JSON.parse(await readFile(join(plugin, "processed.json"), "utf8"));
        let missingAck = false;
        try { JSON.parse(await readFile(join(plugin, "command.json"), "utf8")); } catch { missingAck = true; }
        actionReceipt = { ...sanitizeReceipt(actionReceipt), sawCommand: processed.sawCommand === true,
          unconfirmed: missingAck && processed.commandRuns === 1 && terminal.includes("COMPOSER_COMMAND_FIXTURE"),
          noAutoRetry: submissionKeysSent === 1 };
      }
    }
    let declarationHash: string | null = null;
    if (scenario.endsWith("-race")) {
      await writeFile(join(directory, "synthetic-dialog-terminal.txt"), terminal);
    }
    try {
      declarationHash = createHash("sha256").update(await readFile(
        join(plugin, ".claude-plugin", "types", "claude-code", "index.d.ts"))).digest("hex");
    } catch { /* unsupported builds may not generate declarations */ }
    const evidence = {
      schemaVersion: 1, cliVersion: versionMatch[1], extensionCommit: revision.trim(),
      executableSha256: createHash("sha256").update(await readFile(executable)).digest("hex"),
      declarationSha256: declarationHash,
      ...(loadShippedPlugin ? {workingTreeSourceHashes:sourceHashes,sourceHashNormalization:"LF text at launch",shippedPluginLoaded:true} : {}),
      sessionReceipt: sanitizeReceipt(receipt),
      actionReceipt: sanitizeReceipt(actionReceipt), scenario, submissionKeysSent,
      nativeSessionExited: exited, trustPromptHandled: trustedFixture,
      modelCallsRequested: scenario === "live-busy" || scenario === "live-interrupt" || scenario === "live-product-busy" ? 2 : scenario.startsWith("live-") ? 1 : 0, gate: "route-control-only"
    };
    await writeFile(join(directory, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
    process.stdout.write(JSON.stringify(evidence) + "\n");
    return controlPassed(scenario, receipt, actionReceipt) ? 0 : 1;
  } finally {
    dataSubscription.dispose();
    exitSubscription.dispose();
    await pty.terminate();
    pty.dispose();
    await adapter?.close();
  }
}

/** Exports an allowlist of booleans, never arbitrary mod text or paths. */
export function sanitizeReceipt(value: unknown) {
  const data = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    ready: data.ready === true,
    hasBuiltin: data.hasBuiltin === true,
    hasFixtureCommand: data.hasFixtureCommand === true,
    promptInitiallyEmpty: data.promptInitiallyEmpty === true,
    sawCommand: data.sawCommand === true,
    sawSubmit: data.sawSubmit === true,
    routedCommand: data.routedCommand === true,
    dropped: data.dropped === true,
    filled: data.filled === true,
    submittedTextPreserved: data.submittedTextPreserved === true,
    dialogConfirmed: data.dialogConfirmed === true,
    dialogAnswered: data.dialogAnswered === true,
    accepted: data.accepted === true,
    ackBeforeCompletion: data.ackBeforeCompletion === true,
    replyObserved: data.replyObserved === true,
    turnCompleted: data.turnCompleted === true,
    nativeWaitFlag: data.nativeWaitFlag === true,
    targetedBusyTurn: data.targetedBusyTurn === true,
    hasFixtureSkill: data.hasFixtureSkill === true,
    fileContentObserved: data.fileContentObserved === true,
    skillExpanded: data.skillExpanded === true,
    rejected: data.rejected === true,
    noSubmit: data.noSubmit === true,
    terminalDraftPreserved: data.terminalDraftPreserved === true,
    identityMatches: data.identityMatches === true,
    builtinRan: data.builtinRan === true,
    interrupted: data.interrupted === true,
    dialogPending: data.dialogPending === true,
    nativeInputUnavailableAfterSend: data.nativeInputUnavailableAfterSend === true,
    unconfirmed: data.unconfirmed === true,
    noAutoRetry: data.noAutoRetry === true,
    commandAwaitedPrompt: data.commandAwaitedPrompt === true,
    productCatalogReady:data.productCatalogReady===true,
    productContextAccepted:data.productContextAccepted===true,
    productDuplicateSuppressed:data.productDuplicateSuppressed===true,
    productPromptNotAccepted:data.productPromptNotAccepted===true,
    productSkillNotAccepted:data.productSkillNotAccepted===true,
    productTerminalDraftRejected:data.productTerminalDraftRejected===true,
    productDialogRejected:data.productDialogRejected===true
    ,hostAckBeforeCompletion:data.hostAckBeforeCompletion===true
  };
}

/** An inventory receipt alone cannot pass a requested route control. */
export function controlPassed(scenario: string, inventory: unknown, action: unknown): boolean {
  const ready = sanitizeReceipt(inventory);
  if (!ready.ready || !ready.hasBuiltin || !ready.hasFixtureCommand || !ready.hasFixtureSkill || !ready.promptInitiallyEmpty || !ready.identityMatches) return false;
  const observation = sanitizeReceipt(action);
  if (scenario === "inventory") return true;
  if (scenario === "product-control") return observation.productCatalogReady && observation.productContextAccepted && observation.productDuplicateSuppressed && observation.productPromptNotAccepted && observation.productSkillNotAccepted && observation.noAutoRetry;
  if (scenario === "product-terminal") return observation.productCatalogReady && observation.productTerminalDraftRejected && observation.terminalDraftPreserved && observation.noSubmit;
  if (scenario === "product-dialog") return observation.productCatalogReady && observation.productDialogRejected && observation.dialogPending && observation.noSubmit;
  if (scenario.startsWith("live-product-")) {
    if (!observation.productCatalogReady || !observation.accepted || !observation.ackBeforeCompletion || !observation.replyObserved || !observation.turnCompleted || !observation.noAutoRetry) return false;
    if (scenario === "live-product-busy") return observation.hostAckBeforeCompletion && observation.targetedBusyTurn && observation.nativeWaitFlag;
    if (scenario.startsWith("live-product-file")) return observation.fileContentObserved;
    if (scenario === "live-product-skill") return observation.skillExpanded;
    return true;
  }
  if (scenario === "direct-command") return observation.sawSubmit && observation.dropped;
  if (scenario === "fill-command" || scenario === "fill-queue-command") return observation.filled && observation.sawCommand;
  if (scenario === "live-basic") return observation.filled && observation.accepted && observation.ackBeforeCompletion && observation.replyObserved && observation.turnCompleted;
  if (scenario === "live-file") return observation.filled && observation.accepted && observation.ackBeforeCompletion && observation.replyObserved && observation.turnCompleted && observation.fileContentObserved;
  if (scenario === "live-skill") return observation.filled && observation.accepted && observation.ackBeforeCompletion && observation.replyObserved && observation.turnCompleted && observation.skillExpanded;
  if (scenario === "live-busy") return observation.filled && observation.accepted && observation.ackBeforeCompletion && observation.replyObserved && observation.turnCompleted && observation.targetedBusyTurn && observation.nativeWaitFlag;
  if (scenario === "pending-terminal") return observation.rejected && observation.noSubmit && observation.terminalDraftPreserved;
  if (scenario === "dialog-reject") return observation.rejected && observation.noSubmit && observation.dialogConfirmed;
  if (scenario === "drop-prompt") return observation.sawSubmit && observation.dropped;
  if (scenario === "builtin-context") return observation.filled && observation.sawCommand && observation.builtinRan;
  if (scenario === "live-interrupt") return observation.filled && observation.accepted && observation.ackBeforeCompletion && observation.interrupted && observation.targetedBusyTurn && observation.nativeWaitFlag;
  if (scenario === "lost-command-ack") return observation.filled && observation.sawCommand && observation.unconfirmed && observation.noAutoRetry;
  if (scenario === "drop-skill") return observation.filled && observation.sawSubmit && observation.routedCommand && observation.dropped && observation.commandAwaitedPrompt;
  if (["fill-dialog-race", "fill-permission-race", "fill-queue-dialog-race"].includes(scenario)) {
    return observation.filled && observation.dialogConfirmed && observation.sawCommand && observation.dialogPending && observation.nativeInputUnavailableAfterSend && !observation.dialogAnswered;
  }
  return false;
}

if (require.main === module) {
  void main(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
