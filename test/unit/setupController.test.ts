import assert from "node:assert/strict";

import { ConfigurationStore } from "../../src/config/configurationStore";
import { SetupController } from "../../src/config/setupController";

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

  storedValue(): unknown {
    return this.values.get("claudeWorkspaces.config");
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
    return this.importChoices.length === 0 ? [] : this.importChoices.shift();
  }
}

class DeferredPicker {
  defaultSelections = 0;
  private releaseFirstSelection: (() => void) | undefined;
  private resolveFirstSelection: (value: null) => void = () => undefined;
  readonly firstSelectionStarted = new Promise<void>((resolve) => {
    this.releaseFirstSelection = resolve;
  });
  private readonly firstSelection = new Promise<null>((resolve) => {
    this.resolveFirstSelection = resolve;
  });

  async chooseDefaultRoot(): Promise<null> {
    this.defaultSelections += 1;
    if (this.defaultSelections === 1) {
      this.releaseFirstSelection?.();
      return this.firstSelection;
    }
    return null;
  }

  async chooseImports(): Promise<readonly string[]> {
    return [];
  }

  release(): void {
    this.resolveFirstSelection(null);
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

  it("serializes setup so the newest root snapshot remains persisted", async () => {
    const memento = new InMemoryMemento();
    const picker = new DeferredPicker();
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      picker
    );

    const firstSetup = controller.ensureConfigured(roots);
    await picker.firstSelectionStarted;

    const reversedRoots = [...roots].reverse();
    const secondSetup = controller.ensureConfigured(reversedRoots);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const selectionsBeforeRelease = picker.defaultSelections;

    picker.release();
    await Promise.all([firstSetup, secondSetup]);

    assert.equal(selectionsBeforeRelease, 1);
    assert.deepEqual(memento.storedValue(), {
      schemaVersion: 1,
      configuredRoots: ["file:///beta", "file:///alpha"],
      importsByRoot: { "file:///beta": [], "file:///alpha": [] }
    });
  });

  it("saves safe defaults when automatic setup is dismissed", async () => {
    const memento = new InMemoryMemento();
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker([undefined])
    );

    const config = await controller.ensureConfigured(roots);

    assert.deepEqual(config, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      importsByRoot: { "file:///alpha": [], "file:///beta": [] }
    });
    assert.deepEqual(memento.storedValue(), config);
  });

  it("saves safe defaults when automatic setup is dismissed during imports", async () => {
    const memento = new InMemoryMemento();
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker([null], [undefined])
    );

    const config = await controller.ensureConfigured(roots);

    assert.deepEqual(config, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      importsByRoot: { "file:///alpha": [], "file:///beta": [] }
    });
    assert.deepEqual(memento.storedValue(), config);
  });

  it("preserves saved configuration when explicit setup is dismissed during imports", async () => {
    const savedConfig = {
      schemaVersion: 1 as const,
      configuredRoots: ["file:///alpha", "file:///beta"],
      defaultRootOverride: "file:///beta",
      importsByRoot: {
        "file:///alpha": ["file:///beta"],
        "file:///beta": []
      }
    };
    const memento = new InMemoryMemento(savedConfig);
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker([null], [undefined])
    );

    const config = await controller.configure(roots);

    assert.deepEqual(config, savedConfig);
    assert.deepEqual(memento.storedValue(), savedConfig);
  });

  it("preserves saved configuration when explicit setup is dismissed before imports", async () => {
    const savedConfig = {
      schemaVersion: 1 as const,
      configuredRoots: ["file:///alpha", "file:///beta"],
      defaultRootOverride: "file:///beta",
      importsByRoot: {
        "file:///alpha": ["file:///beta"],
        "file:///beta": []
      }
    };
    const memento = new InMemoryMemento(savedConfig);
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker([undefined])
    );

    const config = await controller.configure(roots);

    assert.deepEqual(config, savedConfig);
    assert.deepEqual(memento.storedValue(), savedConfig);
  });

  it("reopens setup after a picker failure interrupts first activation", async () => {
    const memento = new InMemoryMemento();
    const failingController = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      {
        chooseDefaultRoot: async () => {
          throw new Error("picker failed");
        },
        chooseImports: async () => []
      }
    );

    await assert.rejects(
      failingController.ensureConfigured(roots),
      /picker failed/
    );

    const retryPicker = new RecordingPicker();
    const retryController = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      retryPicker
    );
    await retryController.ensureConfigured(roots);

    assert.equal(retryPicker.defaultSelections, 1);
    assert.equal(retryPicker.importSelections, 2);
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

  it("does not mutate current configuration while saving a replacement", async () => {
    const currentConfig = Object.freeze({
      schemaVersion: 1 as const,
      configuredRoots: Object.freeze(["file:///alpha", "file:///beta"]),
      importsByRoot: Object.freeze({
        "file:///alpha": Object.freeze(["file:///beta"]),
        "file:///beta": Object.freeze([])
      })
    });
    const memento = new InMemoryMemento(currentConfig);
    const controller = new SetupController(
      new ConfigurationStore(memento, () => undefined),
      new RecordingPicker(["file:///beta"], [["file:///beta"], []])
    );

    const loaded = await controller.ensureConfigured(roots);
    const replacement = await controller.configure(roots);

    assert.notStrictEqual(loaded, currentConfig);
    assert.deepEqual(currentConfig, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      importsByRoot: {
        "file:///alpha": ["file:///beta"],
        "file:///beta": []
      }
    });
    assert.deepEqual(replacement, {
      schemaVersion: 1,
      configuredRoots: ["file:///alpha", "file:///beta"],
      defaultRootOverride: "file:///beta",
      importsByRoot: {
        "file:///alpha": ["file:///beta"],
        "file:///beta": []
      }
    });
    assert.deepEqual(memento.storedValue(), replacement);
  });
});
