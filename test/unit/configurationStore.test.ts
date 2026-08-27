import assert from "node:assert/strict";

import { ConfigurationStore } from "../../src/config/configurationStore";
import {
  createSafeConfig,
  parseWorkspaceConfig
} from "../../src/config/workspaceConfig";

class InMemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(value: unknown = undefined) {
    if (value !== undefined) {
      this.values.set("claudeWorkspaces.config", value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const alpha = "file:///alpha";
const beta = "file:///beta";
const gamma = "file:///gamma";

function configuredState(): object {
  return {
    schemaVersion: 1,
    configuredRoots: [alpha, beta],
    defaultRootOverride: beta,
    importsByRoot: {
      [alpha]: [beta],
      [beta]: []
    }
  };
}

describe("ConfigurationStore", () => {
  it("creates safe defaults and requests setup when state is missing", async () => {
    const store = new ConfigurationStore(new InMemoryMemento(), () => undefined);

    const loaded = await store.load([alpha, beta]);

    assert.equal(loaded.needsSetup, true);
    assert.deepEqual(loaded.config, {
      schemaVersion: 1,
      configuredRoots: [alpha, beta],
      importsByRoot: {
        [alpha]: [],
        [beta]: []
      }
    });
  });

  it("uses valid schema-v1 state without requesting setup", async () => {
    const store = new ConfigurationStore(
      new InMemoryMemento(configuredState()),
      () => undefined
    );

    const loaded = await store.load([alpha, beta]);

    assert.equal(loaded.needsSetup, false);
    assert.deepEqual(loaded.config, configuredState());
  });

  it("resets corrupt state, logs an error, and requests setup", async () => {
    const errors: string[] = [];
    const store = new ConfigurationStore(
      new InMemoryMemento({ schemaVersion: 99 }),
      (message) => errors.push(message)
    );

    const loaded = await store.load([alpha]);

    assert.equal(loaded.needsSetup, true);
    assert.deepEqual(loaded.config, createSafeConfig([alpha]));
    assert.deepEqual(errors, ["Discarded invalid Claude Workspaces configuration."]);
  });

  it("resets an out-of-set default override as corrupt state", async () => {
    const errors: string[] = [];
    const store = new ConfigurationStore(
      new InMemoryMemento({
        schemaVersion: 1,
        configuredRoots: [alpha],
        defaultRootOverride: beta,
        importsByRoot: { [alpha]: [] }
      }),
      (message) => errors.push(message)
    );

    const loaded = await store.load([alpha]);

    assert.equal(loaded.needsSetup, true);
    assert.deepEqual(loaded.config, createSafeConfig([alpha]));
    assert.deepEqual(errors, ["Discarded invalid Claude Workspaces configuration."]);
  });

  it("reconciles reordered, added, and removed roots while retaining directed edges", async () => {
    const store = new ConfigurationStore(
      new InMemoryMemento(configuredState()),
      () => undefined
    );

    const loaded = await store.load([beta, alpha, gamma]);

    assert.equal(loaded.needsSetup, true);
    assert.deepEqual(loaded.config, {
      schemaVersion: 1,
      configuredRoots: [beta, alpha, gamma],
      defaultRootOverride: beta,
      importsByRoot: {
        [beta]: [],
        [alpha]: [beta],
        [gamma]: []
      }
    });

    const removed = await store.load([alpha]);
    assert.deepEqual(removed.config, {
      schemaVersion: 1,
      configuredRoots: [alpha],
      importsByRoot: { [alpha]: [] }
    });
  });

  it("preserves asymmetric imports without creating reverse edges", async () => {
    const store = new ConfigurationStore(
      new InMemoryMemento(configuredState()),
      () => undefined
    );

    const loaded = await store.load([alpha, beta]);

    assert.deepEqual(loaded.config.importsByRoot[alpha], [beta]);
    assert.deepEqual(loaded.config.importsByRoot[beta], []);
  });

  it("rejects self-imports from persisted configuration", () => {
    assert.equal(
      parseWorkspaceConfig({
        schemaVersion: 1,
        configuredRoots: [alpha],
        importsByRoot: { [alpha]: [alpha] }
      }),
      undefined
    );
  });

  it("creates dismissal defaults with no override or directed imports", () => {
    assert.deepEqual(createSafeConfig([alpha, beta]), {
      schemaVersion: 1,
      configuredRoots: [alpha, beta],
      importsByRoot: { [alpha]: [], [beta]: [] }
    });
  });
});
