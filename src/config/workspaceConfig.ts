import type { RootId } from "../workspace/workspaceModel";

/** The schema version supported by this extension release. */
export const WORKSPACE_CONFIG_SCHEMA_VERSION = 1;

/** Workspace-local launch configuration for schema version 1. */
export interface WorkspaceConfigV1 {
  readonly schemaVersion: 1;
  readonly configuredRoots: readonly RootId[];
  readonly defaultRootOverride?: RootId;
  readonly importsByRoot: Readonly<Record<RootId, readonly RootId[]>>;
}

/**
 * Parses a persisted workspace configuration when it has the supported shape.
 *
 * @param value - Untrusted workspace-state data.
 * @returns The schema-v1 configuration, or undefined when the value is invalid.
 */
export function parseWorkspaceConfig(value: unknown): WorkspaceConfigV1 | undefined {
  if (!isRecord(value) || value.schemaVersion !== WORKSPACE_CONFIG_SCHEMA_VERSION) {
    return undefined;
  }

  if (!isRootIdList(value.configuredRoots) || !isRecord(value.importsByRoot)) {
    return undefined;
  }

  if (
    value.defaultRootOverride !== undefined &&
    typeof value.defaultRootOverride !== "string"
  ) {
    return undefined;
  }

  const configuredRoots = [...value.configuredRoots];
  const configuredRootSet = new Set(configuredRoots);
  if (configuredRootSet.size !== configuredRoots.length) {
    return undefined;
  }
  if (
    value.defaultRootOverride !== undefined &&
    !configuredRootSet.has(value.defaultRootOverride)
  ) {
    return undefined;
  }

  const importsByRoot: Record<RootId, readonly RootId[]> = {};
  for (const rootId of configuredRoots) {
    const imports = value.importsByRoot[rootId];
    if (!isRootIdList(imports) || new Set(imports).size !== imports.length) {
      return undefined;
    }
    if (imports.some((targetId) => targetId === rootId || !configuredRootSet.has(targetId))) {
      return undefined;
    }
    importsByRoot[rootId] = [...imports];
  }

  if (Object.keys(value.importsByRoot).some((rootId) => !configuredRootSet.has(rootId))) {
    return undefined;
  }

  return {
    schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
    configuredRoots,
    ...(value.defaultRootOverride === undefined
      ? {}
      : { defaultRootOverride: value.defaultRootOverride }),
    importsByRoot
  };
}

/**
 * Creates a configuration with no override and no cross-root imports.
 *
 * @param rootIds - Ordered identifiers for the roots currently in the workspace.
 * @returns A safe schema-v1 configuration.
 */
export function createSafeConfig(rootIds: readonly RootId[]): WorkspaceConfigV1 {
  return {
    schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
    configuredRoots: [...rootIds],
    importsByRoot: Object.fromEntries(rootIds.map((rootId) => [rootId, []]))
  };
}

/**
 * Reconciles a saved configuration with the current roots without creating access.
 *
 * @param config - A validated saved configuration.
 * @param rootIds - Ordered identifiers for the roots currently in the workspace.
 * @returns Configuration for the current roots that preserves valid directed edges.
 */
export function reconcileConfig(
  config: WorkspaceConfigV1,
  rootIds: readonly RootId[]
): WorkspaceConfigV1 {
  const currentRootSet = new Set(rootIds);
  const importsByRoot: Record<RootId, readonly RootId[]> = {};

  for (const sourceId of rootIds) {
    const savedImports = config.importsByRoot[sourceId] ?? [];
    importsByRoot[sourceId] = savedImports.filter(
      (targetId) => targetId !== sourceId && currentRootSet.has(targetId)
    );
  }

  return {
    schemaVersion: WORKSPACE_CONFIG_SCHEMA_VERSION,
    configuredRoots: [...rootIds],
    ...(config.defaultRootOverride !== undefined &&
    currentRootSet.has(config.defaultRootOverride)
      ? { defaultRootOverride: config.defaultRootOverride }
      : {}),
    importsByRoot
  };
}

/** Returns whether a value is a non-null record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns whether a value is an array of URI root identifiers. */
function isRootIdList(value: unknown): value is readonly RootId[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
