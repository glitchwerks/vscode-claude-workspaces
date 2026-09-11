import assert from "node:assert/strict";

import {
  showSingleSelectionQuickPick,
  withInitialSelections,
  type SingleSelectionQuickPick
} from "../../src/config/setupQuickPick";

interface TestItem {
  readonly label: string;
  readonly rootId?: string;
  readonly picked?: boolean;
}

class TestQuickPick implements SingleSelectionQuickPick<TestItem> {
  items: readonly TestItem[] = [];
  activeItems: readonly TestItem[] = [];
  selectedItems: readonly TestItem[] = [];
  placeholder: string | undefined;
  shown = false;
  disposed = false;
  private readonly acceptListeners: Array<() => void> = [];
  private readonly hideListeners: Array<() => void> = [];

  readonly onDidAccept = (listener: () => void): { dispose(): void } => {
    this.acceptListeners.push(listener);
    return { dispose: () => undefined };
  };

  readonly onDidHide = (listener: () => void): { dispose(): void } => {
    this.hideListeners.push(listener);
    return { dispose: () => undefined };
  };

  show(): void {
    this.shown = true;
  }

  hide(): void {
    for (const listener of this.hideListeners) {
      listener();
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  accept(item: TestItem): void {
    this.selectedItems = [item];
    for (const listener of this.acceptListeners) {
      listener();
    }
  }

  dismiss(): void {
    this.hide();
  }
}

const items: readonly TestItem[] = [
  { label: "Alpha", rootId: "file:///alpha" },
  { label: "Beta", rootId: "file:///beta" }
];

describe("workspace setup QuickPick", () => {
  it("marks exactly the saved import roots as initially selected", () => {
    const result = withInitialSelections(items, ["file:///beta"]);

    assert.deepEqual(result, [
      { label: "Alpha", rootId: "file:///alpha", picked: false },
      { label: "Beta", rootId: "file:///beta", picked: true }
    ]);
    assert.deepEqual(items, [
      { label: "Alpha", rootId: "file:///alpha" },
      { label: "Beta", rootId: "file:///beta" }
    ]);
  });

  it("activates the saved default root before showing the single-select picker", async () => {
    const quickPick = new TestQuickPick();
    const resultPromise = showSingleSelectionQuickPick(
      quickPick,
      items,
      items[1],
      "Choose the default root"
    );

    assert.equal(quickPick.shown, true);
    assert.deepEqual(quickPick.items, items);
    assert.deepEqual(quickPick.activeItems, [items[1]]);
    assert.equal(quickPick.placeholder, "Choose the default root");

    quickPick.accept(items[0]!);
    assert.equal(await resultPromise, items[0]);
    assert.equal(quickPick.disposed, true);
  });

  it("returns no default selection when the single-select picker is dismissed", async () => {
    const quickPick = new TestQuickPick();
    const resultPromise = showSingleSelectionQuickPick(
      quickPick,
      items,
      items[0],
      "Choose the default root"
    );

    quickPick.dismiss();

    assert.equal(await resultPromise, undefined);
    assert.equal(quickPick.disposed, true);
  });
});
