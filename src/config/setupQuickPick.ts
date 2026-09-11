import type { RootId } from "../workspace/workspaceModel";

/** Disposable event subscription used by the QuickPick adapter. */
interface DisposableLike {
  dispose(): void;
}

/** Narrow single-selection QuickPick contract used by workspace setup. */
export interface SingleSelectionQuickPick<T> {
  items: readonly T[];
  activeItems: readonly T[];
  readonly selectedItems: readonly T[];
  placeholder: string | undefined;
  readonly onDidAccept: (listener: () => void) => DisposableLike;
  readonly onDidHide: (listener: () => void) => DisposableLike;
  show(): void;
  hide(): void;
  dispose(): void;
}

/** Adds VS Code's initial multi-selection flag to setup items. */
export function withInitialSelections<T extends { readonly rootId?: RootId }>(
  items: readonly T[],
  initialSelections: readonly RootId[]
): Array<T & { readonly picked: boolean }> {
  const selectedRoots = new Set(initialSelections);
  return items.map((item) => ({
    ...item,
    picked: item.rootId !== undefined && selectedRoots.has(item.rootId)
  }));
}

/** Shows a single-select QuickPick with an initially active item. */
export async function showSingleSelectionQuickPick<T>(
  quickPick: SingleSelectionQuickPick<T>,
  items: readonly T[],
  initialSelection: T | undefined,
  placeholder: string
): Promise<T | undefined> {
  quickPick.items = items;
  quickPick.activeItems = initialSelection === undefined ? [] : [initialSelection];
  quickPick.placeholder = placeholder;

  return new Promise<T | undefined>((resolve) => {
    let accepted: T | undefined;
    const acceptSubscription = quickPick.onDidAccept(() => {
      accepted = quickPick.selectedItems[0];
      if (accepted !== undefined) {
        quickPick.hide();
      }
    });
    const hideSubscription = quickPick.onDidHide(() => {
      acceptSubscription.dispose();
      hideSubscription.dispose();
      quickPick.dispose();
      resolve(accepted);
    });
    quickPick.show();
  });
}
