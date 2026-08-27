import assert from "node:assert/strict";

import { ConfigurationStore } from "../../src/config/configurationStore";
import { SetupController } from "../../src/config/setupController";

class InMemoryMemento {
  private value: unknown;

  get<T>(): T | undefined {
    return this.value as T | undefined;
  }

  async update(_key: string, value: unknown): Promise<void> {
    this.value = value;
  }

  storedValue(): unknown {
    return this.value;
  }
}

class RecordingPicker {
  defaultSelections = 0;
  importSelections = 0;
  readonly defaultChoices: Array<string | null | undefined>;
  readonly importChoices: Array<readonly string[] | undefined>;

  constructor(
    defaultChoices: Array<string | null | undefined> = [null],
    importChoices: Array<readonly string[] | undefined> = []
  ) {
    this.defaultChoices = defaultChoices;
    this.importChoices = importChoices;
  }

  async chooseDefaultRoot(): Promise<string | null | undefined> {
    this.defaultSelections += 1;
    return this.defaultChoices.shift();
  }

  async chooseImports(): Promise<readonly string[] | undefined> {
    this.importSelections += 1;
    return this.importChoices.shift() ?? [];
  }
}

const roots = [
  { id: "file:///alpha", label: "alpha" },
  { id: "file:///beta", label: "beta" }
];

describe("SetupController", () => {
  it("opens setup on first activation", async () => {
    const picker = new RecordingPicker();
    const controller = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      picker
    );

    await controller.ensureConfigured(roots);

    assert.equal(picker.defaultSelections, 1);
    assert.equal(picker.importSelections, 2);
  });

  it("does not reopen setup when roots are unchanged", async () => {
    const picker = new RecordingPicker([null]);
    const controller = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      picker
    );

    await controller.ensureConfigured(roots);
    await controller.ensureConfigured(roots);

    assert.equal(picker.defaultSelections, 1);
    assert.equal(picker.importSelections, 2);
  });

  it("reopens setup when root order changes", async () => {
    const picker = new RecordingPicker([null, null]);
    const controller = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      picker
    );

    await controller.ensureConfigured(roots);
    await controller.ensureConfigured([...roots].reverse());

    assert.equal(picker.defaultSelections, 2);
    assert.equal(picker.importSelections, 4);
  });

  it("saves safe defaults when the popup is dismissed", async () => {
    const memento = new InMemoryMemento();
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker([undefined])
    );

    const config = await controller.configure(roots);

    assert.deepEqual(config, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      importsByRoot: { "file:///alpha": [], "file:///beta": [] }
    });
    assert.deepEqual(memento.storedValue(), config);
  });

  it("rejects unavailable roots and self-imports without saving them", async () => {
    const unknownRootController = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      new RecordingPicker(["file:///missing"])
    );
    const selfImportController = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      new RecordingPicker([null], [["file:///alpha"]])
    );

    await assert.rejects(
      unknownRootController.configure(roots),
      /selected default root is not in this workspace/
    );
    await assert.rejects(
      selfImportController.configure(roots),
      /Directed imports must target another workspace root/
    );
  });

  it("returns a new config without mutating a live-session snapshot", async () => {
    const snapshot = Object.freeze({
      schemaVersion: 1 as const,
      configuredRoots: Object.freeze(["file:///alpha", "file:///beta"]),
      importsByRoot: Object.freeze({
        "file:///alpha": Object.freeze(["file:///beta"]),
        "file:///beta": Object.freeze([])
      })
    });
    const controller = new SetupController(
      new ConfigurationStore(new InMemoryMemento(), () => undefined),
      new RecordingPicker(["file:///beta"], [["file:///beta"], []])
    );

    const config = await controller.configure(roots);

    assert.notStrictEqual(config, snapshot);
    assert.deepEqual(snapshot, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      importsByRoot: {
        "file:///alpha": ["file:///beta"],
        "file:///beta": []
      }
    });
    assert.deepEqual(config, {
      ...snapshot,
      defaultRootOverride: "file:///beta"
    });
  });
});
