import type { WorkspaceConfigV1 } from "../config/workspaceConfig";
import type { RootId, WorkspaceRoot } from "../workspace/workspaceModel";

const CANCELLATION_GRACE_MS = 50;
const RETIRED_AVAILABILITY_PROBE = Symbol("retired-availability-probe");

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
  | { readonly kind: "invalid-availability-policy" };

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
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly maxOutstandingProbes: number;
  readonly totalTimeoutMs: number;
  /**
   * Checks one root and receives an abort request when its timeout expires.
   *
   * Implementations should observe `signal` when their filesystem boundary
   * supports cancellation. The planner retires probes that do not settle.
   */
  isAvailable(root: WorkspaceRoot, signal: AbortSignal): Promise<boolean>;
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
  const snapshot = snapshotLaunchInputs(request, roots, config, executable, environment);
  if (!hasValidAvailabilityPolicy(availability)) {
    return { kind: "error", error: { kind: "invalid-availability-policy" } };
  }
  const availableIds = await findAvailableRootIds(prioritizeRequestedRoot(snapshot), availability);

  const selectedRoot = selectRoot(snapshot.request, snapshot.roots, snapshot.config, availableIds);
  if (selectedRoot.kind === "error") {
    return selectedRoot;
  }

  const imports = snapshot.config.importsByRoot[selectedRoot.root.id] ?? [];
  const rootsById = new Map(snapshot.roots.map((root) => [root.id, root]));
  const importedRoots = imports.flatMap((id) => {
    const root = rootsById.get(id);
    return root !== undefined && availableIds.has(id) ? [freezeRoot(root)] : [];
  });
  const skippedImportIds = imports.filter((id) => {
    return !availableIds.has(id) || !rootsById.has(id);
  });
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

  const args = importedRoots.flatMap(({ id }) => ["--add-dir", snapshot.pathsByRootId[id]!]);
  const spec: LaunchSpec = Object.freeze({
    executable: snapshot.executable ?? "claude",
    args: freezeArray(args),
    cwd: snapshot.pathsByRootId[selectedRoot.root.id]!,
    env: snapshot.environment,
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

interface LaunchInputSnapshot {
  readonly request: LaunchRequest;
  readonly roots: readonly WorkspaceRoot[];
  readonly pathsByRootId: Readonly<Record<RootId, string>>;
  readonly config: LaunchConfigSnapshot;
  readonly executable: string | undefined;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

interface LaunchConfigSnapshot {
  readonly defaultRootOverride?: RootId;
  readonly importsByRoot: Readonly<Record<RootId, readonly RootId[]>>;
}

function snapshotLaunchInputs(
  request: LaunchRequest,
  roots: readonly WorkspaceRoot[],
  config: WorkspaceConfigV1,
  executable: string | undefined,
  environment: Readonly<Record<string, string | undefined>>
): LaunchInputSnapshot {
  const rootSnapshots = roots.map(freezeRoot);
  const pathsByRootId: Record<RootId, string> = {};
  const importsByRoot: Record<RootId, readonly RootId[]> = {};
  for (const root of rootSnapshots) {
    pathsByRootId[root.id] = root.uri.fsPath;
    importsByRoot[root.id] = freezeArray(config.importsByRoot[root.id] ?? []);
  }

  return Object.freeze({
    request: Object.freeze({ ...request }),
    roots: freezeArray(rootSnapshots),
    pathsByRootId: Object.freeze(pathsByRootId),
    config: Object.freeze({
      ...(config.defaultRootOverride === undefined
        ? {}
        : { defaultRootOverride: config.defaultRootOverride }),
      importsByRoot: Object.freeze(importsByRoot)
    }),
    executable,
    environment: Object.freeze({ ...environment })
  });
}

async function findAvailableRootIds(
  roots: readonly WorkspaceRoot[],
  availability: RootAvailability
): Promise<ReadonlySet<RootId>> {
  const availableIds = new Set<RootId>();
  let nextIndex = 0;
  const workerCount = Math.min(roots.length, availability.maxConcurrency);
  const deadline = Date.now() + availability.totalTimeoutMs;
  let activeProbes = 0;
  let unresolvedProbes = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < roots.length) {
      if (
        Date.now() >= deadline ||
        activeProbes + unresolvedProbes >= availability.maxOutstandingProbes
      ) {
        return;
      }
      const root = roots[nextIndex];
      nextIndex += 1;
      activeProbes += 1;
      const availabilityResult = root === undefined
        ? false
        : await isAvailableWithinTimeout(root, availability, deadline);
      activeProbes -= 1;
      if (availabilityResult === RETIRED_AVAILABILITY_PROBE) {
        unresolvedProbes += 1;
        continue;
      }
      if (root !== undefined && availabilityResult) {
        availableIds.add(root.id);
      }
    }
  });
  await Promise.all(workers);
  return availableIds;
}

function hasValidAvailabilityPolicy(availability: RootAvailability): boolean {
  return (
    Number.isFinite(availability.timeoutMs) &&
    availability.timeoutMs >= 0 &&
    Number.isFinite(availability.maxConcurrency) &&
    Number.isInteger(availability.maxConcurrency) &&
    availability.maxConcurrency >= 1 &&
    Number.isFinite(availability.maxOutstandingProbes) &&
    Number.isInteger(availability.maxOutstandingProbes) &&
    availability.maxOutstandingProbes >= availability.maxConcurrency &&
    Number.isFinite(availability.totalTimeoutMs) &&
    Number.isInteger(availability.totalTimeoutMs) &&
    availability.totalTimeoutMs >= 0
  );
}

async function isAvailableWithinTimeout(
  root: WorkspaceRoot,
  availability: RootAvailability,
  deadline: number
): Promise<boolean | typeof RETIRED_AVAILABILITY_PROBE> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let graceHandle: ReturnType<typeof setTimeout> | undefined;
  const check = Promise.resolve()
    .then(() => Date.now() >= deadline ? false : availability.isAvailable(root, controller.signal))
    .catch(() => false);
  const timedOut = Symbol("availability-timed-out");
  const timeout = new Promise<typeof timedOut>((resolve) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      resolve(timedOut);
    }, Math.max(0, Math.min(availability.timeoutMs, deadline - Date.now())));
  });

  try {
    const result = await Promise.race([check, timeout]);
    if (result === timedOut) {
      const graceExpired = Symbol("availability-cancellation-grace-expired");
      const grace = new Promise<typeof graceExpired>((resolve) => {
        graceHandle = setTimeout(
          () => resolve(graceExpired),
          Math.max(0, Math.min(CANCELLATION_GRACE_MS, deadline - Date.now()))
        );
      });
      return (await Promise.race([check, grace])) === graceExpired
        ? RETIRED_AVAILABILITY_PROBE
        : false;
    }
    return result;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    if (graceHandle !== undefined) {
      clearTimeout(graceHandle);
    }
  }
}

function prioritizeRequestedRoot(snapshot: LaunchInputSnapshot): readonly WorkspaceRoot[] {
  const requestedId = snapshot.request.rootMode === "explicit"
    ? snapshot.request.explicitRoot
    : snapshot.config.defaultRootOverride;
  const requestedRoot = snapshot.roots.find(({ id }) => id === requestedId);
  return requestedRoot === undefined
    ? snapshot.roots
    : [requestedRoot, ...snapshot.roots.filter(({ id }) => id !== requestedRoot.id)];
}

function selectRoot(
  request: LaunchRequest,
  roots: readonly WorkspaceRoot[],
  config: LaunchConfigSnapshot,
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

  const fallbackRoot = roots.find(({ id }) => availableIds.has(id));
  if (config.defaultRootOverride === undefined) {
    return fallbackRoot === undefined
      ? { kind: "error", error: { kind: "no-root-available" } }
      : { kind: "success", root: fallbackRoot, warnings: [] };
  }

  const requestedRoot = roots.find(({ id }) => id === config.defaultRootOverride);
  if (requestedRoot !== undefined && availableIds.has(requestedRoot.id)) {
    return { kind: "success", root: requestedRoot, warnings: [] };
  }

  const root = fallbackRoot;
  if (root === undefined) {
    return { kind: "error", error: { kind: "no-root-available" } };
  }
  return {
    kind: "success",
    root,
    warnings: [
      Object.freeze({
        kind: "default-root-unavailable" as const,
        rootId: config.defaultRootOverride,
        fallbackRootId: root.id
      })
    ]
  };
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeRoot(root: WorkspaceRoot): WorkspaceRoot {
  return Object.freeze({ ...root });
}
