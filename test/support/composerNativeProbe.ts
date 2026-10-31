import { execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { Uri } from "vscode";

import { NodePtyFactory } from "../../src/launch/nodePtyAdapter";

const execute = promisify(execFile);

/** Explicit manual entry point; importing this module never starts native work. */
export async function main(argv: readonly string[]): Promise<number> {
  let executable: string | undefined;
  let optedIn = false;
  let scenario = "inventory";
  let allowModel = false;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--run-live") {
      optedIn = true;
    } else if (argv[index] === "--allow-model") {
      allowModel = true;
    } else if (argv[index] === "--claude-executable" && argv[index + 1] !== undefined) {
      executable = argv[++index];
    } else if (argv[index] === "--scenario" && argv[index + 1] !== undefined) {
      scenario = argv[++index]!;
    } else {
      process.stderr.write("Unsupported probe arguments.\n");
      return 2;
    }
  }
  if (!["inventory", "direct-command", "fill-command", "fill-dialog-race", "fill-permission-race", "fill-queue-command", "fill-queue-dialog-race", "live-basic", "live-busy", "live-file", "live-skill", "live-interrupt", "pending-terminal", "dialog-reject", "drop-prompt", "drop-skill", "builtin-context", "wrong-identity", "lost-command-ack"].includes(scenario)) {
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
    return await runLive(executable, scenario);
  } catch {
    process.stderr.write("Native probe failed; no private process output was exported.\n");
    return 1;
  }
}

async function runLive(executable: string, scenario: string): Promise<number> {
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
  const fileMarker = `COMPOSER_FILE_${randomUUID()}`;
  await writeFile(join(workspace, "fixture file.txt"), fileMarker + "\n");
  await writeFile(join(plugin, "file-marker.txt"), fileMarker);
  const sessionId = randomUUID();
  const pty = await new NodePtyFactory().spawn({
    executable,
    args: ["--session-id", sessionId, "--plugin-dir", plugin,
      "--permission-mode", "default",
      ...(scenario.startsWith("live-") ? ["--model", "haiku"] : []),
      "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      ...(scenario === "fill-permission-race" ? ["--settings", '{"permissions":{"defaultMode":"default","ask":["Bash"]}}'] : []),
      "--tools", scenario.endsWith("dialog-race") || scenario === "dialog-reject" ? "AskUserQuestion" : scenario === "fill-permission-race" ? "Bash" : ""],
    cwd: workspace,
    env: { ...process.env, DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
      COMPOSER_PROBE_SESSION_ID: scenario === "wrong-identity" ? randomUUID() : sessionId },
    root: { id: "composer-probe", label: "Composer fixture", uri: { scheme: "file", fsPath: workspace } as Uri },
    importedRoots: [], skippedImportIds: []
  });
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
    let submissionKeysSent = 0;
    if (controlPassed("inventory", receipt, undefined) && scenario !== "inventory") {
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
      declarationSha256: declarationHash, sessionReceipt: sanitizeReceipt(receipt),
      actionReceipt: sanitizeReceipt(actionReceipt), scenario, submissionKeysSent,
      nativeSessionExited: exited, trustPromptHandled: trustedFixture,
      modelCallsRequested: scenario === "live-busy" || scenario === "live-interrupt" ? 2 : scenario.startsWith("live-") ? 1 : 0, gate: "route-control-only"
    };
    await writeFile(join(directory, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
    process.stdout.write(JSON.stringify(evidence) + "\n");
    return controlPassed(scenario, receipt, actionReceipt) ? 0 : 1;
  } finally {
    dataSubscription.dispose();
    exitSubscription.dispose();
    await pty.terminate();
    pty.dispose();
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
    commandAwaitedPrompt: data.commandAwaitedPrompt === true
  };
}

/** An inventory receipt alone cannot pass a requested route control. */
export function controlPassed(scenario: string, inventory: unknown, action: unknown): boolean {
  const ready = sanitizeReceipt(inventory);
  if (!ready.ready || !ready.hasBuiltin || !ready.hasFixtureCommand || !ready.hasFixtureSkill || !ready.promptInitiallyEmpty || !ready.identityMatches) return false;
  const observation = sanitizeReceipt(action);
  if (scenario === "inventory") return true;
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
