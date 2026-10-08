import assert from "node:assert/strict";
import type { Uri } from "vscode";

import { ConfigurationStore } from "../../src/config/configurationStore";
import { parseWorkspaceConfig, reconcileConfig, type WorkspaceConfig } from "../../src/config/workspaceConfig";
import { SetupController } from "../../src/config/setupController";
import { planLaunch, type RootAvailability } from "../../src/launch/launchPlanner";
import { InMemoryMemento } from "../support/inMemoryMemento";

const roots = ["alpha", "beta", "gamma"].map(id => ({ id, label: id, uri: { fsPath: `C:/work/${id}` } as Uri }));
const ids = roots.map(root => root.id);
const legacy = {
  schemaVersion: 1, configuredRoots: ids, defaultRootOverride: "beta",
  importsByRoot: { alpha: ["gamma"], beta: [], gamma: ["alpha"] }
};
const migrated = { ...legacy, schemaVersion: 2, autoDefaultRootImport: false };

function configuration(enabled: boolean, override?: string, imports = { alpha: [] as string[], beta: [] as string[], gamma: [] as string[] }): WorkspaceConfig {
  return { schemaVersion: 2, autoDefaultRootImport: enabled, configuredRoots: ids,
    ...(override === undefined ? {} : { defaultRootOverride: override }), importsByRoot: imports };
}

function available(idsAvailable: readonly string[] = ids): RootAvailability {
  return { timeoutMs: 100, maxConcurrency: 3, maxOutstandingProbes: 3, totalTimeoutMs: 500,
    isAvailable: async root => idsAvailable.includes(root.id) };
}

describe("automatic default-root imports", () => {
  it("persists a disabled migration without losing saved directed imports or reopening setup", async () => {
    const state = new InMemoryMemento(legacy);
    const errors: string[] = [];
    const store = new ConfigurationStore(state, message => errors.push(message));
    const loaded = await store.load(ids);
    assert.deepEqual(loaded, { config: migrated, needsSetup: false });
    assert.deepEqual(state.storedValue(), migrated);
    assert.deepEqual((await store.load(ids)).config, migrated);
    assert.deepEqual(errors, []);
    assert.equal(legacy.schemaVersion, 1, "migration leaves the original object intact");
  });

  it("offers enabled defaults only for a workspace with no saved configuration", async () => {
    const loaded = await new ConfigurationStore(new InMemoryMemento(), () => undefined).load(ids);
    assert.deepEqual(loaded, { needsSetup: true, config: {
      schemaVersion: 2, autoDefaultRootImport: true, configuredRoots: ids,
      importsByRoot: { alpha: [], beta: [], gamma: [] }
    } });
  });

  it("round-trips enabled and disabled current configurations", () => {
    for (const enabled of [true, false]) {
      const config = configuration(enabled, "beta");
      assert.deepEqual(parseWorkspaceConfig(config), config);
    }
  });

  it("rejects malformed current import policies instead of silently enabling access", () => {
    for (const value of [undefined, null, "true", 1, {}]) {
      assert.equal(parseWorkspaceConfig({ ...configuration(false), autoDefaultRootImport: value }), undefined);
    }
  });

  it("preserves the policy and surviving directed imports as roots change", () => {
    const config = configuration(true, "beta", { alpha: ["gamma"], beta: [], gamma: [] });
    assert.deepEqual(reconcileConfig(config, ["gamma", "alpha", "delta"]), {
      schemaVersion: 2, autoDefaultRootImport: true, configuredRoots: ["gamma", "alpha", "delta"],
      importsByRoot: { gamma: [], alpha: ["gamma"], delta: [] }
    });
  });

  for (const [label, enabled, override, source, imports, expected] of [
    ["first root", true, undefined, "beta", { alpha: [], beta: [], gamma: [] }, ["alpha"]],
    ["configured override", true, "gamma", "beta", { alpha: [], beta: [], gamma: [] }, ["gamma"]],
    ["disabled policy", false, "gamma", "beta", { alpha: [], beta: ["alpha"], gamma: [] }, ["alpha"]],
    ["self root", true, "beta", "beta", { alpha: [], beta: [], gamma: [] }, []],
    ["explicit duplicate", true, "gamma", "beta", { alpha: [], beta: ["gamma", "alpha"], gamma: [] }, ["gamma", "alpha"]]
  ] as const) {
    it(`plans the ${label} without changing explicit imports`, async () => {
      const config = configuration(enabled, override, { alpha: [...imports.alpha], beta: [...imports.beta], gamma: [...imports.gamma] });
      const before = JSON.stringify(config);
      const result = await planLaunch({ rootMode: "explicit", explicitRoot: source }, roots, config, undefined, {}, available());
      assert.equal(result.kind, "success");
      assert.deepEqual(result.spec.importedRoots.map(root => root.id), expected);
      assert.deepEqual(result.spec.args, expected.flatMap(id => ["--add-dir", `C:/work/${id}`]));
      assert.equal(JSON.stringify(config), before);
    });
  }

  it("uses the available default fallback when the configured default is unavailable", async () => {
    const result = await planLaunch({ rootMode: "explicit", explicitRoot: "beta" }, roots,
      configuration(true, "gamma"), undefined, {}, available(["alpha", "beta"]));
    assert.equal(result.kind, "success");
    assert.deepEqual(result.spec.args, ["--add-dir", "C:/work/alpha"]);
    assert.deepEqual(result.warnings, [{ kind: "default-root-unavailable", rootId: "gamma", fallbackRootId: "alpha" }]);
  });

  it("snapshots the import policy before asynchronous availability checks", async () => {
    const config = { ...configuration(true) };
    const checks = available();
    checks.isAvailable = async root => {
      Object.assign(config, { autoDefaultRootImport: false, defaultRootOverride: "gamma" });
      return ids.includes(root.id);
    };
    const result = await planLaunch({ rootMode: "explicit", explicitRoot: "beta" }, roots, config, undefined, {}, checks);
    assert.equal(result.kind, "success");
    assert.deepEqual(result.spec.args, ["--add-dir", "C:/work/alpha"]);
  });

  it("saves the selected import policy without inserting implicit edges into directed imports", async () => {
    const state = new InMemoryMemento();
    let initial: boolean | undefined;
    const picker = {
      chooseDefaultRoot: async () => "beta",
      chooseDefaultRootImport: async (value: boolean) => { initial = value; return false; },
      chooseImports: async () => []
    };
    const config = await new SetupController(new ConfigurationStore(state, () => undefined), picker).configure(roots);
    assert.equal(initial, true);
    assert.deepEqual(config, { schemaVersion: 2, autoDefaultRootImport: false, configuredRoots: ids,
      defaultRootOverride: "beta", importsByRoot: { alpha: [], beta: [], gamma: [] } });
    assert.deepEqual(state.storedValue(), config);
  });

  it("retains an existing configuration when the new policy prompt is dismissed", async () => {
    const state = new InMemoryMemento(migrated);
    let importsRequested = false;
    const picker = {
      chooseDefaultRoot: async () => "gamma",
      chooseDefaultRootImport: async () => undefined,
      chooseImports: async () => { importsRequested = true; return []; }
    };
    const result = await new SetupController(new ConfigurationStore(state, () => undefined), picker).configure(roots);
    assert.equal(importsRequested, false);
    assert.deepEqual(result, migrated);
    assert.deepEqual(state.storedValue(), migrated);
  });

  it("disables automatic imports when initial setup is dismissed at the policy prompt", async () => {
    const state = new InMemoryMemento();
    const picker = {
      chooseDefaultRoot: async () => "beta",
      chooseDefaultRootImport: async () => undefined,
      chooseImports: async () => { assert.fail("dismissed setup must stop collecting imports"); }
    };
    const controller = new SetupController(new ConfigurationStore(state, () => undefined), picker);
    const result = await controller.ensureConfigured(roots);
    assert.deepEqual(result, configuration(false));
    assert.deepEqual(await controller.ensureConfigured(roots), result);
    assert.deepEqual(state.storedValue(), result);
  });

  it("preserves directed imports when the automatic policy is switched off", async () => {
    const current = configuration(true, "beta", { alpha: ["beta", "gamma"], beta: ["gamma"], gamma: [] });
    const state = new InMemoryMemento(current);
    const picker = {
      chooseDefaultRoot: async () => "beta",
      chooseDefaultRootImport: async (initial: boolean) => { assert.equal(initial, true); return false; },
      chooseImports: async (_source: unknown, _targets: unknown, initial: readonly string[]) => initial
    };
    const result = await new SetupController(new ConfigurationStore(state, () => undefined), picker).configure(roots);
    assert.deepEqual(result, { ...current, autoDefaultRootImport: false });
    assert.deepEqual(state.storedValue(), result);
    assert.equal(current.autoDefaultRootImport, true);
  });
});
