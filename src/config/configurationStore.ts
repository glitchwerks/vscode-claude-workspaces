import type { RootId } from "../workspace/workspaceModel";
import {
  createSafeConfig,
  parseWorkspaceConfig,
  reconcileConfig,
  type WorkspaceConfig
} from "./workspaceConfig";

const CONFIGURATION_KEY = "claudeWorkspaces.config";
const SETUP_PENDING_KEY = "claudeWorkspaces.setupPending";

/** Minimal workspace-state interface needed by the configuration store. */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/** Result of loading and reconciling workspace-local configuration. */
export interface LoadedWorkspaceConfig {
  readonly config: WorkspaceConfig;
  readonly needsSetup: boolean;
}

/** Persists validated workspace-local configuration behind VS Code's Memento API. */
export class ConfigurationStore {
  /**
   * Creates a configuration store.
   *
   * @param memento - Workspace-local persistence supplied by VS Code.
   * @param logError - Receives a diagnostic when corrupt data is reset.
   */
  constructor(
    private readonly memento: MementoLike,
    private readonly logError: (message: string) => void
  ) {}

  /**
   * Loads configuration for current roots and marks setup needed when state differs.
   *
   * @param rootIds - Ordered identifiers for current workspace roots.
   * @returns The reconciled configuration and whether setup should open.
   */
  async load(rootIds: readonly RootId[]): Promise<LoadedWorkspaceConfig> {
    const rawConfig = this.memento.get<unknown>(CONFIGURATION_KEY);
    const parsed = parseWorkspaceConfig(rawConfig);
    if (parsed === undefined) {
      const config = { ...createSafeConfig(rootIds), autoDefaultRootImport: rawConfig === undefined };
      if (rawConfig !== undefined) {
        this.logError("Discarded invalid Claude Workspaces configuration.");
      }
      await this.markSetupPending();
      await this.saveConfig(config);
      return { config, needsSetup: true };
    }

    const rootsChanged = !hasSameOrder(parsed.configuredRoots, rootIds);
    const needsSetup =
      rootsChanged || this.memento.get<boolean>(SETUP_PENDING_KEY) === true;
    const config = reconcileConfig(parsed, rootIds);
    if (rootsChanged) {
      await this.markSetupPending();
    }
    if (rootsChanged || (typeof rawConfig === "object" && rawConfig !== null &&
      "schemaVersion" in rawConfig && rawConfig.schemaVersion === 1)) {
      await this.saveConfig(config);
    }
    return { config, needsSetup };
  }

  /** Saves a configuration as workspace-local extension state. */
  async save(config: WorkspaceConfig): Promise<void> {
    await this.saveConfig(config);
    await this.memento.update(SETUP_PENDING_KEY, false);
  }

  /** Resets workspace-local configuration to safe defaults for current roots. */
  async reset(rootIds: readonly RootId[]): Promise<WorkspaceConfig> {
    const config = createSafeConfig(rootIds);
    await this.save(config);
    return config;
  }

  private async markSetupPending(): Promise<void> {
    await this.memento.update(SETUP_PENDING_KEY, true);
  }

  private async saveConfig(config: WorkspaceConfig): Promise<void> {
    await this.memento.update(CONFIGURATION_KEY, config);
  }
}

/** Returns whether both root lists have the same identifiers in the same order. */
function hasSameOrder(left: readonly RootId[], right: readonly RootId[]): boolean {
  return left.length === right.length && left.every((rootId, index) => rootId === right[index]);
}
