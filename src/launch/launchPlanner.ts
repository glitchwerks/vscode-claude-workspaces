import type { WorkspaceConfigV1 } from "../config/workspaceConfig";
import type { RootId, WorkspaceRoot } from "../workspace/workspaceModel";

/** Describes whether a caller chooses the configured default or a specific root. */
export interface LaunchRequest {
  readonly rootMode: "default" | "explicit";
  readonly explicitRoot?: RootId;
}

/** Immutable command and workspace snapshot used to start one Claude session. */
export interface LaunchSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly root: WorkspaceRoot;
  readonly importedRoots: readonly WorkspaceRoot[];
  readonly skippedImportIds: readonly RootId[];
}

/** A non-fatal condition that should be reported after a launch plan is made. */
export type LaunchWarning = DefaultRootUnavailableWarning | ImportsUnavailableWarning;

/** Reports that the configured default root required a fallback. */
export interface DefaultRootUnavailableWarning {
  readonly kind: "default-root-unavailable";
  readonly rootId: RootId;
  readonly fallbackRootId: RootId;
}

/** Reports all directed imports skipped from one otherwise valid launch. */
export interface ImportsUnavailableWarning {
  readonly kind: "imports-unavailable";
  readonly rootId: RootId;
  readonly skippedRootIds: readonly RootId[];
}

/** An error that prevents a Claude session from being launched. */
export type LaunchError =
  | { readonly kind: "root-unavailable"; readonly rootId: RootId }
  | { readonly kind: "no-root-available" }
  | { readonly kind: "invalid-request"; readonly rootId?: RootId }
  | { readonly kind: "availability-failed"; readonly cause: unknown };

/** The successful outcome of launch planning. */
export interface LaunchPlanSuccess {
  readonly kind: "success";
  readonly spec: LaunchSpec;
  readonly warnings: readonly LaunchWarning[];
}

/** The unsuccessful outcome of launch planning. */
export interface LaunchPlanFailure {
  readonly kind: "error";
  readonly error: LaunchError;
}

/** A typed outcome that leaves presentation and retry decisions to callers. */
export type LaunchPlanResult = LaunchPlanSuccess | LaunchPlanFailure;

/**
 * Provides bounded, concurrency-controlled root availability checks.
 *
 * The adapter owns timeout and concurrency policy so planner callers keep a
 * stable parameter list while network-backed roots cannot block a launch.
 */
export interface RootAvailability {
  check(roots: readonly WorkspaceRoot[]): Promise<ReadonlySet<RootId>>;
}

/**
 * Builds a frozen Claude process specification from one configuration snapshot.
 *
 * @param request - The requested root selection mode.
 * @param roots - Ordered workspace roots currently eligible for launch.
 * @param config - Saved directed-import configuration.
 * @param executable - Optional configured Claude executable.
 * @param environment - The inherited extension-host environment.
 * @param availability - Bounded root availability boundary.
 * @returns A launch specification and warnings, or a typed launch error.
 */
export async function planLaunch(
  request: LaunchRequest,
  roots: readonly WorkspaceRoot[],
  config: WorkspaceConfigV1,
  executable: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  availability: RootAvailability
): Promise<LaunchPlanResult> {
  let availableIds: ReadonlySet<RootId>;
  try {
    availableIds = await availability.check([...roots]);
  } catch (cause) {
    return { kind: "error", error: { kind: "availability-failed", cause } };
  }

  const selectedRoot = selectRoot(request, roots, config, availableIds);
  if (selectedRoot.kind === "error") {
    return selectedRoot;
  }

  const imports = config.importsByRoot[selectedRoot.root.id] ?? [];
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  const importedRoots = imports.flatMap((id) => {
    const root = rootsById.get(id);
    return root !== undefined && availableIds.has(id) ? [freezeRoot(root)] : [];
  });
  const skippedImportIds = imports.filter((id) => !availableIds.has(id));
  const warnings: LaunchWarning[] = [...selectedRoot.warnings];
  if (skippedImportIds.length > 0) {
    warnings.push(
      Object.freeze({
        kind: "imports-unavailable" as const,
        rootId: selectedRoot.root.id,
        skippedRootIds: freezeArray(skippedImportIds)
      })
    );
  }

  const args = importedRoots.flatMap(({ uri }) => ["--add-dir", uri.fsPath]);
  const spec: LaunchSpec = Object.freeze({
    executable: executable ?? "claude",
    args: freezeArray(args),
    cwd: selectedRoot.root.uri.fsPath,
    env: Object.freeze({ ...environment }),
    root: freezeRoot(selectedRoot.root),
    importedRoots: freezeArray(importedRoots),
    skippedImportIds: freezeArray(skippedImportIds)
  });

  return Object.freeze({
    kind: "success" as const,
    spec,
    warnings: freezeArray(warnings)
  });
}

function selectRoot(
  request: LaunchRequest,
  roots: readonly WorkspaceRoot[],
  config: WorkspaceConfigV1,
  availableIds: ReadonlySet<RootId>
):
  | { readonly kind: "success"; readonly root: WorkspaceRoot; readonly warnings: readonly LaunchWarning[] }
  | LaunchPlanFailure {
  if (request.rootMode === "explicit") {
    if (request.explicitRoot === undefined) {
      return { kind: "error", error: { kind: "invalid-request" } };
    }
    const root = roots.find(({ id }) => id === request.explicitRoot);
    if (root === undefined) {
      return { kind: "error", error: { kind: "invalid-request", rootId: request.explicitRoot } };
    }
    if (!availableIds.has(root.id)) {
      return { kind: "error", error: { kind: "root-unavailable", rootId: root.id } };
    }
    return { kind: "success", root, warnings: [] };
  }

  const requestedRoot =
    (config.defaultRootOverride === undefined
      ? undefined
      : roots.find(({ id }) => id === config.defaultRootOverride)) ?? roots[0];
  const root =
    requestedRoot !== undefined && availableIds.has(requestedRoot.id)
      ? requestedRoot
      : roots.find(({ id }) => availableIds.has(id));
  if (root === undefined) {
    return { kind: "error", error: { kind: "no-root-available" } };
  }
  if (requestedRoot !== undefined && requestedRoot.id !== root.id) {
    return {
      kind: "success",
      root,
      warnings: [
        Object.freeze({
          kind: "default-root-unavailable" as const,
          rootId: requestedRoot.id,
          fallbackRootId: root.id
        })
      ]
    };
  }
  return { kind: "success", root, warnings: [] };
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeRoot(root: WorkspaceRoot): WorkspaceRoot {
  return Object.freeze({ ...root });
}
