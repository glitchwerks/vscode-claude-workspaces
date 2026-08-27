import type { RootId } from "../workspace/workspaceModel";
import type { ConfigurationStore } from "./configurationStore";
import type { WorkspaceConfigV1 } from "./workspaceConfig";

/** The root information needed to label workspace setup choices. */
export interface WorkspaceSetupRoot {
  readonly id: RootId;
  readonly label: string;
}

/** VS Code popup operations needed to collect workspace setup choices. */
export interface WorkspaceSetupPicker {
  /**
   * Lets the user select a default override, the first-root option, or dismiss.
   *
   * @param roots - Current roots available to configure.
   * @returns A root id, null for the first-root option, or undefined on dismissal.
   */
  chooseDefaultRoot(roots: readonly WorkspaceSetupRoot[]): Promise<RootId | null | undefined>;

  /**
   * Lets the user select directed import targets for one source root.
   *
   * @param source - The root that may import selected targets.
   * @param targets - All eligible cross-root targets.
   * @returns Selected root identifiers, or undefined on dismissal.
   */
  chooseImports(
    source: WorkspaceSetupRoot,
    targets: readonly WorkspaceSetupRoot[]
  ): Promise<readonly RootId[] | undefined>;
}

/** Opens and persists the workspace-local configuration popup when needed. */
export class SetupController {
  /**
   * Creates the setup controller.
   *
   * @param store - Workspace-local configuration persistence.
   * @param picker - Adapter for the VS Code QuickPick sequence.
   */
  constructor(
    private readonly store: ConfigurationStore,
    private readonly picker: WorkspaceSetupPicker
  ) {}

  /**
   * Loads configuration and opens setup only when no matching state exists.
   *
   * @param roots - Current workspace roots in workspace order.
   * @returns The loaded or newly saved configuration.
   */
  async ensureConfigured(
    roots: readonly WorkspaceSetupRoot[]
  ): Promise<WorkspaceConfigV1> {
    const loaded = await this.store.load(roots.map(({ id }) => id));
    return loaded.needsSetup ? this.configure(roots) : loaded.config;
  }

  /**
   * Opens the configuration popup and saves a new independent configuration.
   *
   * @param roots - Current workspace roots in workspace order.
   * @returns The saved configuration.
   * @throws Error when a picker response includes an unavailable or self root.
   */
  async configure(roots: readonly WorkspaceSetupRoot[]): Promise<WorkspaceConfigV1> {
    const rootIds = roots.map(({ id }) => id);
    const knownRoots = new Set(rootIds);
    const defaultRootOverride = await this.picker.chooseDefaultRoot(roots);
    if (defaultRootOverride === undefined) {
      return this.store.reset(rootIds);
    }
    if (defaultRootOverride !== null && !knownRoots.has(defaultRootOverride)) {
      throw new Error("The selected default root is not in this workspace.");
    }

    const importsByRoot: Record<RootId, readonly RootId[]> = {};
    for (const source of roots) {
      const targets = roots.filter(({ id }) => id !== source.id);
      const selectedImports = await this.picker.chooseImports(source, targets);
      if (selectedImports === undefined) {
        return this.store.reset(rootIds);
      }
      validateImports(source.id, selectedImports, knownRoots);
      importsByRoot[source.id] = [...selectedImports];
    }

    const config: WorkspaceConfigV1 = {
      schemaVersion: 1,
      configuredRoots: [...rootIds],
      ...(defaultRootOverride === null ? {} : { defaultRootOverride }),
      importsByRoot
    };
    await this.store.save(config);
    return config;
  }
}

/** Validates a selected directed-import list before it becomes persisted state. */
function validateImports(
  sourceId: RootId,
  imports: readonly RootId[],
  knownRoots: ReadonlySet<RootId>
): void {
  const uniqueImports = new Set(imports);
  if (uniqueImports.size !== imports.length) {
    throw new Error("A directed import may be selected only once.");
  }
  if (imports.some((targetId) => targetId === sourceId || !knownRoots.has(targetId))) {
    throw new Error("Directed imports must target another workspace root.");
  }
}
