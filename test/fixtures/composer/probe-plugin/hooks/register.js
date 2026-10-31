let active = false;
let activeScenario = "";
let turnCompleted = false;
let completedTurns = 0;
let firstTurnId = "";
let expectedFileMarker = "";
let submissions = 0;
let questionVisible = false;
let nativeDialogPending = false;
let dialogWasAnswered = false;
let lateDialogConfirmed = false;
let commandRuns = 0;
const basicPrompt = "Reply only with COMPOSER_NATIVE_ACK.\nThis is a controlled composer fixture.";
const secondPrompt = "Reply only with COMPOSER_SECOND_ACK.";
const filePrompt = 'Reply only with the marker from @"fixture file.txt".';
const skillPrompt = "/composer-fixture:marker COMPOSER_SKILL_ARGUMENT";
const droppedPrompt = "COMPOSER_DROP_FIXTURE";
let productActionId = 0;
let productMode = false;

async function pollProductControl($) {
  try {
    const file = `${$.plugin.root}/product-action.json`;
    if (await $.fs.exists(file)) {
      const action = JSON.parse(await $.fs.read(file));
      if (Number.isSafeInteger(action.id) && action.id > productActionId) {
        productActionId = action.id;
        let observation = {};
        if (action.kind === "clear" || action.kind === "pending") {
          const expected = action.kind === "clear" ? "" : "COMPOSER_NATIVE_DRAFT";
          const result = await $.prompt.fill({text:expected,mode:"replace"});
          observation = {filled:result.isFilled && result.text === expected};
        } else if (action.kind === "verify-pending") {
          observation = {terminalDraftPreserved:(await $.prompt.read()).text === "COMPOSER_NATIVE_DRAFT"};
        } else if (action.kind === "dialog") {
          void $.ui.ask("Composer synthetic product dialog?",["Fixture acknowledged","Fixture cancelled"]).catch(() => undefined);
          for (let attempt=0;attempt<12;attempt++) {
            await $.clock.sleep(200);
            const result = await $.prompt.fill({text:"",mode:"append"});
            if (!result.isFilled && result.refusal === "dialog") {observation={dialogConfirmed:true};break;}
          }
        } else if (action.kind === "verify-dialog") {
          const result = await $.prompt.fill({text:"",mode:"append"});
          observation = {dialogPending:!result.isFilled && result.refusal === "dialog"};
        }
        await $.fs.write(`${$.plugin.root}/product-action-result.json`,JSON.stringify({id:action.id,...observation}));
      }
    }
  } catch { /* The host only accepts complete fixed-fixture receipts. */ }
  $.clock.after(100,() => pollProductControl($));
}

async function recordRaceAfter($) {
  const after = await $.prompt.fill({ text: "/probe-echo", mode: "replace" });
  await $.fs.write(`${$.plugin.root}/race-after.json`, JSON.stringify({
    sawCommand: true, dialogConfirmed: lateDialogConfirmed, dialogPending: nativeDialogPending,
    nativeInputUnavailableAfterSend: !after.isFilled, dialogAnswered: dialogWasAnswered
  }));
}

async function fillSecond($) {
  const before = await $.prompt.read();
  if (before.text !== "") return;
  const result = await $.prompt.fill({ text: secondPrompt, mode: "replace" });
  await $.fs.write(`${$.plugin.root}/second-fill.json`, JSON.stringify({ filled: result.isFilled && result.text === secondPrompt }));
}

async function pollAction($) {
  if (active) return;
  try {
    if (await $.fs.exists(`${$.plugin.root}/action.json`)) {
      const action = JSON.parse(await $.fs.read(`${$.plugin.root}/action.json`));
      active = true;
      activeScenario = action.scenario;
      if (await $.session.id() !== await $.env.get("COMPOSER_PROBE_SESSION_ID")) {
        await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({ rejected: true, noSubmit: submissions === 0 }));
        return;
      }
      if (activeScenario === "live-file") expectedFileMarker = (await $.fs.read(`${$.plugin.root}/file-marker.txt`)).trim();
      if (action.scenario === "pending-terminal") {
        await $.prompt.fill({ text: "COMPOSER_NATIVE_DRAFT", mode: "replace" });
        const before = await $.prompt.read();
        const reject = before.text !== "";
        const after = await $.prompt.read();
        await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({
          rejected: reject, noSubmit: submissions === 0,
          terminalDraftPreserved: before.text === "COMPOSER_NATIVE_DRAFT" && after.text === before.text
        }));
        return;
      }
      if (action.scenario === "dialog-reject") {
        void $.ui.ask("Composer synthetic dialog?", ["Fixture acknowledged", "Fixture cancelled"]).catch(() => undefined);
        let confirmed = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          await $.clock.sleep(300);
          const result = await $.prompt.fill({ text: "/probe-echo", mode: "replace" });
          confirmed = !result.isFilled && (result.refusal === "dialog" || questionVisible);
          if (confirmed) break;
        }
        await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({
          rejected: confirmed, noSubmit: submissions === 0, dialogConfirmed: confirmed
        }));
        return;
      }
      if (action.scenario === "direct-command") {
        await $.fs.write(`${$.plugin.root}/dispatch.json`, JSON.stringify({ dispatched: true }));
        const result = await $.prompt.submit({ text: "/probe-echo", asUser: true });
        await $.fs.write(`${$.plugin.root}/returned.json`, JSON.stringify({ dropped: typeof result.drop === "string" }));
        const observation = JSON.parse(await $.fs.read(`${$.plugin.root}/submission.json`));
        await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({ ...observation, dropped: typeof result.drop === "string" }));
      } else if (["fill-command", "fill-dialog-race", "fill-permission-race", "fill-queue-command", "fill-queue-dialog-race", "live-basic", "live-busy", "live-file", "live-skill", "live-interrupt", "drop-prompt", "drop-skill", "builtin-context", "lost-command-ack"].includes(action.scenario)) {
        const before = await $.prompt.read();
        if (before.text !== "") {
          await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({ filled: false }));
          return;
        }
        const text = action.scenario === "builtin-context" ? "/context" : action.scenario === "drop-prompt" ? droppedPrompt : action.scenario === "live-file" ? filePrompt : action.scenario === "live-skill" || action.scenario === "drop-skill" ? skillPrompt
          : action.scenario.startsWith("live-") ? basicPrompt : "/probe-echo";
        const result = await $.prompt.fill({ text, mode: "replace" });
        let dialogConfirmed = false;
        if (action.scenario.endsWith("-race") && result.isFilled) {
          nativeDialogPending = true;
          const dialog = action.scenario === "fill-permission-race"
            ? $.tool.call({ tool: "Bash", command: "echo COMPOSER_PERMISSION_FIXTURE", description: "Print the controlled composer fixture marker" })
            : $.ui.ask("Composer synthetic dialog?", ["Fixture acknowledged", "Fixture cancelled"]);
          void dialog.then(async result => {
            nativeDialogPending = false;
            dialogWasAnswered = lateDialogConfirmed;
            if (action.scenario === "fill-permission-race") {
              await $.fs.write(`${$.plugin.root}/tool-result.json`, JSON.stringify(result));
            }
            await $.fs.write(`${$.plugin.root}/dialog-result.json`, JSON.stringify({ dialogAnswered: dialogConfirmed }));
          }).catch(async error => {
            nativeDialogPending = false;
            await $.fs.write(`${$.plugin.root}/dialog-error.txt`, String(error));
          });
          for (let attempt = 0; attempt < 12; attempt++) {
            await $.clock.sleep(300);
            const guard = await $.prompt.fill({ text: "/probe-echo", mode: "replace" });
            await $.fs.write(`${$.plugin.root}/dialog-guard.json`, JSON.stringify({ isFilled: guard.isFilled, refusal: guard.refusal ?? null }));
            dialogConfirmed = guard.isFilled === false && nativeDialogPending;
            if (dialogConfirmed) break;
          }
          lateDialogConfirmed = dialogConfirmed;
        }
        await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({
          filled: result.isFilled && result.text === text, dialogConfirmed
        }));
      }
      return;
    }
  } catch (error) {
    if (active) {
      await $.fs.write(`${$.plugin.root}/action-error.txt`, String(error));
      await $.fs.write(`${$.plugin.root}/action-result.json`, JSON.stringify({ actionFailed: true }));
      return;
    }
  }
  $.clock.after(100, () => pollAction($));
}

export function register(on) {
  on("session.start", async ($, e, next) => {
    await $.command.register({ name: "probe-echo", description: "Controlled composer fixture" });
    const commands = await $.command.list();
    const prompt = await $.prompt.read();
    await $.fs.write(`${$.plugin.root}/receipt.json`, JSON.stringify({
      ready: true,
      hasBuiltin: commands.some(command => command.name === "help"),
      hasFixtureCommand: commands.some(command => command.name === "probe-echo"),
      hasFixtureSkill: commands.some(command => command.name === "composer-fixture:marker"),
      identityMatches: await $.session.id() === await $.env.get("COMPOSER_PROBE_SESSION_ID"),
      promptInitiallyEmpty: prompt.text === ""
    }));
    productMode = await $.env.get("COMPOSER_PROBE_PRODUCT") === "1";
    if (productMode) {
      const configured = await $.env.get("COMPOSER_PROBE_PRODUCT_SCENARIO");
      if (["live-basic","live-busy","live-file","live-skill"].includes(configured)) activeScenario = configured;
      if (activeScenario === "live-file") expectedFileMarker = (await $.fs.read(`${$.plugin.root}/file-marker.txt`)).trim();
      $.clock.after(500, () => pollProductControl($));
    } else $.clock.after(500, () => pollAction($));
    return next(e);
  });
  on("prompt.submit", async ($, e, next) => {
    submissions++;
    const expected = activeScenario === "live-file" ? filePrompt : activeScenario === "live-skill" ? skillPrompt : basicPrompt;
    if (activeScenario.startsWith("live-") && (e.text === expected || (["live-busy", "live-interrupt"].includes(activeScenario) && e.text === secondPrompt))) {
      const result = await next(e);
      const file = e.text === secondPrompt ? "second-acceptance.json" : "acceptance.json";
      await $.fs.write(`${$.plugin.root}/${file}`, JSON.stringify({
        accepted: typeof result.text === "string", ackBeforeCompletion: !turnCompleted,
        submittedTextPreserved: result.text === e.text, nativeWaitFlag: e.wait === true,
        targetedBusyTurn: e.turnId === firstTurnId && firstTurnId !== ""
      }));
      return result;
    }
    await $.fs.write(`${$.plugin.root}/submission.json`, JSON.stringify({
      sawSubmit: true, routedCommand: e.command !== undefined,
      submittedTextPreserved: e.text === "/probe-echo" || e.text === droppedPrompt, dropped: true
    }));
    return { drop: "Controlled composer probe: model calls disabled" };
  }).catch(async ($, e, next) => {
    if (next.called) return next(e);
    return { drop: "Controlled composer probe failed closed" };
  });
  on("tool.check", { tool: "Bash" }, async () => ({ decision: "ask" }));
  on("ui.render", { component: "AskUserQuestion" }, async ($, e, next) => {
    questionVisible = true;
    return next(e);
  });
  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const marker = activeScenario === "live-file" ? expectedFileMarker : activeScenario === "live-skill" ? "COMPOSER_SKILL_ACK" : "COMPOSER_NATIVE_ACK";
    if (activeScenario.startsWith("live-") && e.props.text.includes(marker)) {
      await $.fs.write(`${$.plugin.root}/answer.json`, JSON.stringify({ replyObserved: true }));
      if (activeScenario === "live-file" && expectedFileMarker !== "") {
        await $.fs.write(`${$.plugin.root}/mention.json`, JSON.stringify({ fileContentObserved: true }));
      }
    }
    if (["live-busy", "live-interrupt"].includes(activeScenario) && e.props.text.includes("COMPOSER_SECOND_ACK")) {
      await $.fs.write(`${$.plugin.root}/second-answer.json`, JSON.stringify({ replyObserved: true }));
    }
    return next(e);
  });
  on("skill.prompt", async ($, e, next) => {
    if (activeScenario === "live-skill") {
      await $.fs.write(`${$.plugin.root}/skill.json`, JSON.stringify({ skillExpanded: e.text.includes("COMPOSER_SKILL_ARGUMENT") && e.text.includes("COMPOSER_SKILL_ACK") }));
    }
    return next(e);
  });
  on("turn.start", async ($, e, next) => {
    if (["live-busy", "live-interrupt"].includes(activeScenario) && firstTurnId === "" && e.agentId === undefined) {
      firstTurnId = e.turnId;
      if (productMode) await $.fs.write(`${$.plugin.root}/holding.json`,JSON.stringify({working:true}));
      else $.clock.after(300, () => fillSecond($));
      await $.clock.sleep(activeScenario === "live-interrupt" ? 5000 : 2500);
    }
    return next(e);
  });
  on("turn.complete", async ($, e, next) => {
    if (e.agentId === undefined) {
      turnCompleted = true;
      completedTurns++;
      const file = completedTurns === 2 ? "second-completion.json" : "completion.json";
      await $.fs.write(`${$.plugin.root}/${file}`, JSON.stringify({ turnCompleted: true, interrupted: e.isAborted === true }));
    }
    return next(e);
  });
  on("command.run", { command: "probe-echo" }, async ($) => {
    commandRuns++;
    await $.fs.write(`${$.plugin.root}/processed.json`, JSON.stringify({ sawCommand: true, commandRuns }));
    if (activeScenario !== "lost-command-ack") await $.fs.write(`${$.plugin.root}/command.json`, JSON.stringify({ sawCommand: true }));
    if (activeScenario.endsWith("-race")) $.clock.after(500, () => recordRaceAfter($));
    return { text: "COMPOSER_COMMAND_FIXTURE" };
  });
  on("command.run", { command: "context" }, async ($, e, next) => {
    const result = await next(e);
    await $.fs.write(`${$.plugin.root}/command.json`, JSON.stringify({
      sawCommand: true, builtinRan: typeof result.ref === "number" || typeof result.text === "string"
    }));
    return result;
  });
  on("command.run", async ($, e, next) => {
    const result = await next(e);
    if ((activeScenario === "drop-skill" || activeScenario === "live-skill") && e.args.includes("COMPOSER_SKILL_ARGUMENT")) {
      await $.fs.write(`${$.plugin.root}/skill-command.json`, JSON.stringify({ commandAwaitedPrompt: submissions > 0 }));
    }
    return result;
  });
}
