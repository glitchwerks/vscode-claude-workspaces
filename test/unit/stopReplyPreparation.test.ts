import assert from "node:assert/strict";
import type { Uri } from "vscode";
import { createStopReplyPreparation, supportsStopReplyVersion } from "../../src/companion/stopReplyPreparation";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import type { ManagedCaptureIdentity } from "../../src/companion/companionTypes";

const ownedSettings = "C:/private/.hooks-settings.json";
const portKey = "CLAUDE_WORKSPACES_STOP_REPLY_PORT";
const tokenKey = "CLAUDE_WORKSPACES_STOP_REPLY_TOKEN";
const target: ManagedCaptureIdentity = {
  sessionId: "session-a",
  claudeSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  generation: "generation-a"
};
const original: LaunchSpec = Object.freeze({
  executable: "claude.cmd",
  cwd: "C:/example workspace",
  args: Object.freeze(["--settings", ownedSettings, "--plugin-dir", "C:/existing/plugin", "--resume", target.claudeSessionId]),
  env: Object.freeze({
    PATH: "C:/bin",
    CLAUDE_CONFIG_DIR: "C:/original/config",
    CLAUDE_CODE_OAUTH_TOKEN: "fixture-login",
    https_proxy: "http://proxy.example.test",
    NO_PROXY: "example.test"
  }),
  root: {id: "root", label: "Fixture", uri: {fsPath: "C:/example workspace"} as Uri},
  importedRoots: [],
  skippedImportIds: []
});

describe("Stop reply launch preparation", () => {
  it("admits observed stable versions with the documented Stop reply field", () => {
    for (const version of ["2.1.47", "2.1.322", "2.2.0", "3.0.0"]) {
      assert.equal(supportsStopReplyVersion(version), true, version);
    }
    for (const version of [undefined, "2.1.46", "2.0.999", "1.9.999", "2.1", "v2.1.47", "2.1.47\n",
      "2.01.47", "2.1.47-beta", "9007199254740992.0.0"]) {
      assert.equal(supportsStopReplyVersion(version), false, version);
    }
  });

  it("preserves settings, arguments, login and proxy environment with distinct per-launch credentials", async () => {
    const peer = {...target, sessionId: "session-b", generation: "generation-b"};
    const prepare = createStopReplyPreparation({
      observedVersion: () => "2.1.47",
      capture: {start: async () => 12345, bind: owner => (owner === target ? "a" : "b").repeat(64)}
    });
    const stale = {...original, env: {...original.env, [portKey.toLowerCase()]: "19", [tokenKey]: "stale"}};
    const [first, second] = await Promise.all([prepare(stale, ownedSettings, target), prepare(original, ownedSettings, peer)]);
    assert.equal(first.args, original.args);
    assert.equal(second.args, original.args);
    assert.equal(first.executable, original.executable);
    assert.equal(first.cwd, original.cwd);
    assert.equal(first.root, original.root);
    assert.deepEqual(first.env, {...original.env, [portKey]: "12345", [tokenKey]: "a".repeat(64)});
    assert.deepEqual(second.env, {...original.env, [portKey]: "12345", [tokenKey]: "b".repeat(64)});
    assert.equal(stale.env[tokenKey], "stale");
  });

  it("uses manual import and clears inherited relay values when ownership or capabilities are unavailable", async () => {
    let version: string | undefined = "2.1.46";
    let startups = 0;
    let binds = 0;
    const prepare = createStopReplyPreparation({
      observedVersion: () => version,
      capture: {
        start: async () => ++startups === 1 ? undefined : 12345,
        bind: () => { binds++; return undefined; }
      }
    });
    const stale = {...original, env: {...original.env, [portKey]: "12345", [tokenKey.toLowerCase()]: "a".repeat(64)}};
    const fallback = await prepare(stale, ownedSettings, target);
    assert.deepEqual(fallback, original);
    assert.equal(startups, 0);
    version = "2.1.47";
    assert.equal(await prepare(original, "C:/other/.hooks-settings.json", target), original);
    assert.equal(await prepare(original, ownedSettings, undefined), original);
    assert.equal(startups, 0);
    assert.equal(await prepare(original, ownedSettings, target), original);
    assert.equal(binds, 0, "no listener was available");
    assert.equal(await prepare(original, ownedSettings, target), original);
    assert.equal(binds, 1, "the listener rejected the launch after startup");
  });
});
