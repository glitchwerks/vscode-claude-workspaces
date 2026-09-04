import assert from "node:assert/strict";
import type { Uri } from "vscode";

import type { WorkspaceConfigV1 } from "../../src/config/workspaceConfig";
import {
  planLaunch,
  type LaunchPlanResult,
  type LaunchPlanSuccess,
  type RootAvailability
} from "../../src/launch/launchPlanner";
import type { WorkspaceRoot } from "../../src/workspace/workspaceModel";

const alpha = root("alpha", "C:\\work\\alpha");
const beta = root("beta", "C:\\work\\client portal");
const gamma = root("gamma", "C:\\work\\gamma");
const roots = [alpha, beta, gamma];

function root(id: string, fsPath: string): WorkspaceRoot {
  return {
    id,
    label: id,
    uri: { fsPath } as Uri
  };
}

class LazyFsPathUri {
  private cachedFsPath: string | undefined;

  private constructor(private readonly sourceFsPath: string) {}

  static file(fsPath: string): LazyFsPathUri {
    return new LazyFsPathUri(fsPath);
  }

  get fsPath(): string {
    this.cachedFsPath ??= this.sourceFsPath;
    return this.cachedFsPath;
  }
}

function config(
  defaultRootOverride: string | undefined,
  importsByRoot: Readonly<Record<string, readonly string[]>>
): WorkspaceConfigV1 {
  return {
    schemaVersion: 1,
    configuredRoots: roots.map(({ id }) => id),
    ...(defaultRootOverride === undefined ? {} : { defaultRootOverride }),
    importsByRoot
  };
}

function availability(availableIds: readonly string[]): RootAvailability {
  return {
    isAvailable: async ({ id }) => availableIds.includes(id),
    timeoutMs: 50,
    maxConcurrency: 2,
    maxOutstandingProbes: 2,
    totalTimeoutMs: 100
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Expected asynchronous work to start.");
}

async function completeWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Launch planning timed out.")), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function expectSuccess(result: LaunchPlanResult): LaunchPlanSuccess {
  assert.equal(result.kind, "success");
  return result;
}

describe("LaunchPlanner", () => {
  it("uses the configured default override before the first workspace root", async () => {
    // A planner that always selects roots[0] must fail this test.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "default" },
        roots,
        config(beta.id, { [alpha.id]: [], [beta.id]: [], [gamma.id]: [] }),
        undefined,
        { PATH: "C:\\bin" },
        availability([alpha.id, beta.id, gamma.id])
      )
    );

    assert.equal(result.spec.root.id, beta.id);
    assert.equal(result.spec.executable, "claude");
    assert.equal(result.spec.cwd, beta.uri.fsPath);
    assert.deepEqual(result.warnings, []);
  });

  it("falls back to the first available root with one typed warning", async () => {
    // A planner that launches an unavailable override or omits the warning must fail.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "default" },
        roots,
        config(beta.id, { [alpha.id]: [], [beta.id]: [], [gamma.id]: [] }),
        "C:\\Program Files\\Claude\\claude.exe",
        { PATH: "C:\\bin" },
        availability([alpha.id, gamma.id])
      )
    );

    assert.equal(result.spec.root.id, alpha.id);
    assert.equal(result.spec.executable, "C:\\Program Files\\Claude\\claude.exe");
    assert.deepEqual(result.warnings, [
      {
        kind: "default-root-unavailable",
        rootId: beta.id,
        fallbackRootId: alpha.id
      }
    ]);
  });

  it("rejects an unavailable explicit root instead of falling back", async () => {
    // A planner that silently substitutes another root must fail this test.
    const result = await planLaunch(
      { rootMode: "explicit", explicitRoot: beta.id },
      roots,
      config(undefined, { [alpha.id]: [], [beta.id]: [], [gamma.id]: [] }),
      undefined,
      {},
      availability([alpha.id])
    );

    assert.deepEqual(result, { kind: "error", error: { kind: "root-unavailable", rootId: beta.id } });
  });

  it("uses only directed imports and supplies each surviving target as a separate argument", async () => {
    // A planner that infers reverse imports or joins paths into one shell-like string must fail.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "explicit", explicitRoot: alpha.id },
        roots,
        config(undefined, {
          [alpha.id]: [beta.id, gamma.id],
          [beta.id]: [],
          [gamma.id]: [alpha.id]
        }),
        undefined,
        { PATH: "C:\\bin", KEEP: "yes" },
        availability([alpha.id, beta.id, gamma.id])
      )
    );

    assert.deepEqual(result.spec.args, [
      "--add-dir",
      beta.uri.fsPath,
      "--add-dir",
      gamma.uri.fsPath
    ]);
    assert.deepEqual(result.spec.importedRoots.map(({ id }) => id), [beta.id, gamma.id]);
    assert.deepEqual(result.spec.env, { PATH: "C:\\bin", KEEP: "yes" });
  });

  it("aggregates unavailable imports while preserving available paths containing spaces", async () => {
    // A planner that aborts for one import or strips the spaced path must fail.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "explicit", explicitRoot: alpha.id },
        roots,
        config(undefined, { [alpha.id]: [beta.id, gamma.id], [beta.id]: [], [gamma.id]: [] }),
        undefined,
        {},
        availability([alpha.id, beta.id])
      )
    );

    assert.deepEqual(result.spec.args, ["--add-dir", "C:\\work\\client portal"]);
    assert.deepEqual(result.spec.skippedImportIds, [gamma.id]);
    assert.deepEqual(result.warnings, [
      { kind: "imports-unavailable", rootId: alpha.id, skippedRootIds: [gamma.id] }
    ]);
  });

  it("creates an immutable launch snapshot without mutating inputs", async () => {
    // A planner that reuses mutable input arrays or environment objects must fail.
    const inputConfig = Object.freeze({
      schemaVersion: 1 as const,
      configuredRoots: Object.freeze(roots.map(({ id }) => id)),
      importsByRoot: Object.freeze({
        [alpha.id]: Object.freeze([beta.id]),
        [beta.id]: Object.freeze([]),
        [gamma.id]: Object.freeze([])
      })
    });
    const inputEnvironment = Object.freeze({ PATH: "C:\\bin" });

    const result = expectSuccess(
      await planLaunch(
        { rootMode: "explicit", explicitRoot: alpha.id },
        Object.freeze([...roots]),
        inputConfig,
        undefined,
        inputEnvironment,
        availability([alpha.id, beta.id])
      )
    );

    assert.notStrictEqual(result.spec.args, inputConfig.importsByRoot[alpha.id]);
    assert.notStrictEqual(result.spec.env, inputEnvironment);
    assert.equal(Object.isFrozen(result.spec), true);
    assert.equal(Object.isFrozen(result.spec.args), true);
    assert.equal(Object.isFrozen(result.spec.importedRoots), true);
    assert.equal(Object.isFrozen(result.spec.env), true);
    assert.deepEqual(inputConfig.importsByRoot[alpha.id], [beta.id]);
    assert.deepEqual(inputEnvironment, { PATH: "C:\\bin" });
  });

  it("warns with a configured default root id that is no longer present", async () => {
    // A planner that replaces a missing override with roots[0] before warning must fail.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "default" },
        roots,
        config("removed-root", {
          [alpha.id]: [],
          [beta.id]: [],
          [gamma.id]: []
        }),
        undefined,
        {},
        availability([beta.id, gamma.id])
      )
    );

    assert.equal(result.spec.root.id, beta.id);
    assert.deepEqual(result.warnings, [
      {
        kind: "default-root-unavailable",
        rootId: "removed-root",
        fallbackRootId: beta.id
      }
    ]);
  });

  it("uses the first available root without warning when no override is configured", async () => {
    // A planner that treats roots[0] as an explicit override must fail this test.
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "default" },
        roots,
        config(undefined, {
          [alpha.id]: [],
          [beta.id]: [],
          [gamma.id]: []
        }),
        undefined,
        {},
        availability([beta.id, gamma.id])
      )
    );

    assert.equal(result.spec.root.id, beta.id);
    assert.deepEqual(result.warnings, []);
  });

  it("preserves concrete URI objects while snapshotting their launch paths", async () => {
    // Mirrors the lazy cache reproduced with concrete vscode.Uri.file instances.
    // A planner that freezes copied URI implementation internals must fail this test.
    const concreteAlpha: WorkspaceRoot = {
      id: "concrete-alpha",
      label: "concrete-alpha",
      uri: LazyFsPathUri.file("C:\\work\\concrete alpha") as unknown as Uri
    };
    const concreteBeta: WorkspaceRoot = {
      id: "concrete-beta",
      label: "concrete-beta",
      uri: LazyFsPathUri.file("C:\\work\\concrete beta") as unknown as Uri
    };
    const result = expectSuccess(
      await planLaunch(
        { rootMode: "explicit", explicitRoot: concreteAlpha.id },
        [concreteAlpha, concreteBeta],
        {
          schemaVersion: 1,
          configuredRoots: [concreteAlpha.id, concreteBeta.id],
          importsByRoot: { [concreteAlpha.id]: [concreteBeta.id], [concreteBeta.id]: [] }
        },
        undefined,
        {},
        availability([concreteAlpha.id, concreteBeta.id])
      )
    );

    assert.equal(result.spec.cwd, "C:\\work\\concrete alpha");
    assert.deepEqual(result.spec.args, ["--add-dir", "C:\\work\\concrete beta"]);
    assert.equal(result.spec.root.uri, concreteAlpha.uri);
    assert.equal(result.spec.importedRoots[0]?.uri, concreteBeta.uri);
  });

  it("skips timed-out and rejected checks without blocking the launch", async () => {
    // A planner that awaits a never-resolving check or aborts the batch on rejection must fail.
    const boundedAvailability: RootAvailability = {
      isAvailable: async ({ id }, signal) => {
        if (id === beta.id) {
          return new Promise<boolean>((resolve) => {
            signal?.addEventListener("abort", () => resolve(false), { once: true });
          });
        }
        if (id === gamma.id) {
          throw new Error("network root unavailable");
        }
        return true;
      },
      timeoutMs: 10,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100
    };

    const result = expectSuccess(
      await completeWithin(
        planLaunch(
          { rootMode: "explicit", explicitRoot: alpha.id },
          roots,
          config(undefined, { [alpha.id]: [beta.id, gamma.id], [beta.id]: [], [gamma.id]: [] }),
          undefined,
          {},
          boundedAvailability
        ),
        100
      )
    );

    assert.deepEqual(result.spec.importedRoots, []);
    assert.deepEqual(result.spec.skippedImportIds, [beta.id, gamma.id]);
    assert.deepEqual(result.warnings, [
      { kind: "imports-unavailable", rootId: alpha.id, skippedRootIds: [beta.id, gamma.id] }
    ]);
  });

  it("limits concurrent availability checks to the supplied policy", async () => {
    // A planner that starts every root check at once must fail this test.
    let activeChecks = 0;
    let maximumChecks = 0;
    const startedIds: string[] = [];
    const releases = new Map<string, () => void>();
    const boundedAvailability: RootAvailability = {
      isAvailable: ({ id }) =>
        new Promise<boolean>((resolve) => {
          activeChecks += 1;
          maximumChecks = Math.max(maximumChecks, activeChecks);
          startedIds.push(id);
          releases.set(id, () => {
            activeChecks -= 1;
            resolve(true);
          });
        }),
      timeoutMs: 1_000,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100
    };

    const planning = planLaunch(
      { rootMode: "default" },
      roots,
      config(undefined, { [alpha.id]: [], [beta.id]: [], [gamma.id]: [] }),
      undefined,
      {},
      boundedAvailability
    );
    await waitFor(() => startedIds.length === 2);
    assert.equal(maximumChecks, 2);
    releases.get(alpha.id)?.();
    releases.get(beta.id)?.();
    await waitFor(() => startedIds.length === 3);
    releases.get(gamma.id)?.();
    await planning;

    assert.equal(maximumChecks, 2);
  });

  it("cancels timed-out probes before advancing bounded workers", async () => {
    // A planner that races timeouts without waiting for aborted probes to settle must fail.
    const cancellationRoots = ["one", "two", "three", "four", "five"].map((id) =>
      root(id, `C:\\work\\${id}`)
    );
    const activeIds = new Set<string>();
    const abortedIds: string[] = [];
    let maximumActiveChecks = 0;
    const cancellationAwareAvailability: RootAvailability = {
      isAvailable: ({ id }, signal) =>
        new Promise<boolean>((resolve) => {
          activeIds.add(id);
          maximumActiveChecks = Math.max(maximumActiveChecks, activeIds.size);
          signal?.addEventListener("abort", () => {
            abortedIds.push(id);
            activeIds.delete(id);
            resolve(false);
          }, { once: true });
        }),
      timeoutMs: 10,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100
    };

    const result = await completeWithin(
      planLaunch(
        { rootMode: "default" },
        cancellationRoots,
        {
          schemaVersion: 1,
          configuredRoots: cancellationRoots.map(({ id }) => id),
          importsByRoot: Object.fromEntries(cancellationRoots.map(({ id }) => [id, []]))
        },
        undefined,
        {},
        cancellationAwareAvailability
      ),
      500
    );

    assert.deepEqual(result, { kind: "error", error: { kind: "no-root-available" } });
    assert.equal(maximumActiveChecks, 2);
    assert.equal(activeIds.size, 0);
    assert.deepEqual(abortedIds.sort(), ["five", "four", "one", "three", "two"]);
  });

  it("retires non-cooperative timed-out probes without blocking launch planning", async () => {
    // A planner that awaits an aborted probe forever must fail this test.
    const retirementRoots = ["one", "two", "three", "four"].map((id) =>
      root(id, `C:\\work\\${id}`)
    );
    const startedIds: string[] = [];
    const abortedIds: string[] = [];
    const nonCooperativeAvailability: RootAvailability = {
      isAvailable: ({ id }, signal) =>
        new Promise<boolean>(() => {
          startedIds.push(id);
          signal.addEventListener("abort", () => abortedIds.push(id), { once: true });
        }),
      timeoutMs: 10,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100
    };

    const result = await completeWithin(
      planLaunch(
        { rootMode: "default" },
        retirementRoots,
        {
          schemaVersion: 1,
          configuredRoots: retirementRoots.map(({ id }) => id),
          importsByRoot: Object.fromEntries(retirementRoots.map(({ id }) => [id, []]))
        },
        undefined,
        {},
        nonCooperativeAvailability
      ),
      500
    );

    assert.deepEqual(result, { kind: "error", error: { kind: "no-root-available" } });
    assert.deepEqual(startedIds.sort(), ["one", "two"]);
    assert.deepEqual(abortedIds.sort(), ["one", "two"]);
  });

  it("reaches a later available root after the first worker set ignores abort", async () => {
    const probeRoots = ["one", "two", "three"].map((id) => root(id, `C:\\work\\${id}`));
    const startedIds: string[] = [];
    const boundedAvailability = {
      isAvailable: ({ id }: WorkspaceRoot) => {
        startedIds.push(id);
        return id === "three" ? Promise.resolve(true) : new Promise<boolean>(() => undefined);
      },
      timeoutMs: 10,
      maxConcurrency: 2,
      maxOutstandingProbes: 3,
      totalTimeoutMs: 250
    };

    const result = expectSuccess(await completeWithin(
      planLaunch(
        { rootMode: "default" },
        probeRoots,
        {
          schemaVersion: 1,
          configuredRoots: probeRoots.map(({ id }) => id),
          importsByRoot: Object.fromEntries(probeRoots.map(({ id }) => [id, []]))
        },
        undefined,
        {},
        boundedAvailability
      ),
      500
    ));

    assert.equal(result.spec.root.id, "three");
    assert.deepEqual(startedIds.sort(), ["one", "three", "two"]);
  });

  it("caps total unsettled probes when cancellation is ignored", async () => {
    const probeRoots = ["one", "two", "three", "four", "five"].map((id) =>
      root(id, `C:\\work\\${id}`)
    );
    const startedIds: string[] = [];
    const boundedAvailability = {
      isAvailable: ({ id }: WorkspaceRoot) => {
        startedIds.push(id);
        return new Promise<boolean>(() => undefined);
      },
      timeoutMs: 10,
      maxConcurrency: 2,
      maxOutstandingProbes: 3,
      totalTimeoutMs: 500
    };
    const result = await completeWithin(planLaunch(
      { rootMode: "default" },
      probeRoots,
      {
        schemaVersion: 1,
        configuredRoots: probeRoots.map(({ id }) => id),
        importsByRoot: Object.fromEntries(probeRoots.map(({ id }) => [id, []]))
      },
      undefined,
      {},
      boundedAvailability
    ), 500);

    assert.deepEqual(result, { kind: "error", error: { kind: "no-root-available" } });
    assert.deepEqual(startedIds.sort(), ["one", "three", "two"]);
  });

  it("stops launch planning at the total availability deadline", async () => {
    const probeRoots = ["one", "two"].map((id) => root(id, `C:\\work\\${id}`));
    const startedIds: string[] = [];
    const boundedAvailability = {
      isAvailable: ({ id }: WorkspaceRoot) => {
        startedIds.push(id);
        return new Promise<boolean>(() => undefined);
      },
      timeoutMs: 1_000,
      maxConcurrency: 1,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 20
    };
    const result = await completeWithin(planLaunch(
      { rootMode: "default" },
      probeRoots,
      {
        schemaVersion: 1,
        configuredRoots: probeRoots.map(({ id }) => id),
        importsByRoot: Object.fromEntries(probeRoots.map(({ id }) => [id, []]))
      },
      undefined,
      {},
      boundedAvailability
    ), 250);

    assert.deepEqual(result, { kind: "error", error: { kind: "no-root-available" } });
    assert.deepEqual(startedIds, ["one"]);
  });

  for (const prioritizedRequest of [
    { name: "explicit", request: { rootMode: "explicit" as const, explicitRoot: "three" }, override: undefined },
    { name: "configured default", request: { rootMode: "default" as const }, override: "three" }
  ]) {
    it(`probes the ${prioritizedRequest.name} root before unrelated roots`, async () => {
      const probeRoots = ["one", "two", "three"].map((id) => root(id, `C:\\work\\${id}`));
      const startedIds: string[] = [];
      const boundedAvailability = {
        isAvailable: ({ id }: WorkspaceRoot) => {
          startedIds.push(id);
          return id === "three" ? Promise.resolve(true) : new Promise<boolean>(() => undefined);
        },
        timeoutMs: 10,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 250
      };
      const result = expectSuccess(await planLaunch(
        prioritizedRequest.request,
        probeRoots,
        {
          schemaVersion: 1,
          configuredRoots: probeRoots.map(({ id }) => id),
          ...(prioritizedRequest.override === undefined
            ? {}
            : { defaultRootOverride: prioritizedRequest.override }),
          importsByRoot: Object.fromEntries(probeRoots.map(({ id }) => [id, []]))
        },
        undefined,
        {},
        boundedAvailability
      ));

      assert.equal(result.spec.root.id, "three");
      assert.equal(startedIds[0], "three");
    });
  }

  it("returns typed errors for invalid availability policy values", async () => {
    const invalidPolicies = [
      { name: "NaN timeout", timeoutMs: Number.NaN, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "infinite timeout", timeoutMs: Number.POSITIVE_INFINITY, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "negative infinite timeout", timeoutMs: Number.NEGATIVE_INFINITY, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "negative timeout", timeoutMs: -1, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "NaN concurrency", timeoutMs: 10, maxConcurrency: Number.NaN, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "infinite concurrency", timeoutMs: 10, maxConcurrency: Number.POSITIVE_INFINITY, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "negative infinite concurrency", timeoutMs: 10, maxConcurrency: Number.NEGATIVE_INFINITY, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "fractional concurrency", timeoutMs: 10, maxConcurrency: 1.5, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "zero concurrency", timeoutMs: 10, maxConcurrency: 0, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "negative concurrency", timeoutMs: 10, maxConcurrency: -1, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "zero outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 0, totalTimeoutMs: 20 },
      { name: "negative outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: -1, totalTimeoutMs: 20 },
      { name: "fractional outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1.5, totalTimeoutMs: 20 },
      { name: "infinite outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: Number.POSITIVE_INFINITY, totalTimeoutMs: 20 },
      { name: "outstanding below concurrency", timeoutMs: 10, maxConcurrency: 2, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
      { name: "negative total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: -1 },
      { name: "fractional total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 1.5 },
      { name: "infinite total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: Number.POSITIVE_INFINITY }
    ];

    for (const policy of invalidPolicies) {
      const result = await planLaunch(
        { rootMode: "default" },
        roots,
        config(undefined, { [alpha.id]: [], [beta.id]: [], [gamma.id]: [] }),
        undefined,
        {},
        { isAvailable: async () => false, ...policy }
      );

      assert.deepEqual(
        result,
        { kind: "error", error: { kind: "invalid-availability-policy" } },
        policy.name
      );
    }
  });

  it("snapshots launch inputs before asynchronous availability validation", async () => {
    // A planner that reads config, roots, or environment after await must fail this test.
    const initialAlpha = root("initial-alpha", "C:\\work\\initial alpha");
    const initialBeta = root("initial-beta", "C:\\work\\initial beta");
    const mutableRoots = [initialAlpha, initialBeta];
    const mutableRequest = { rootMode: "explicit" as const, explicitRoot: initialAlpha.id };
    const mutableConfig: WorkspaceConfigV1 = {
      schemaVersion: 1,
      configuredRoots: [initialAlpha.id, initialBeta.id],
      importsByRoot: { [initialAlpha.id]: [initialBeta.id], [initialBeta.id]: [] }
    };
    const mutableEnvironment: Record<string, string> = { PATH: "C:\\original" };
    const releases: Array<() => void> = [];
    let validationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      validationStarted = resolve;
    });
    const deferredAvailability: RootAvailability = {
      isAvailable: () =>
        new Promise<boolean>((resolve) => {
          validationStarted?.();
          releases.push(() => resolve(true));
        }),
      timeoutMs: 1_000,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100
    };

    const planning = planLaunch(
      mutableRequest,
      mutableRoots,
      mutableConfig,
      "C:\\original\\claude.exe",
      mutableEnvironment,
      deferredAvailability
    );
    await started;
    mutableRequest.explicitRoot = initialBeta.id;
    mutableRoots.reverse();
    (mutableConfig.importsByRoot as Record<string, readonly string[]>)[initialAlpha.id] = [];
    mutableEnvironment.PATH = "C:\\changed";
    (initialAlpha.uri as unknown as { fsPath: string }).fsPath = "C:\\changed\\alpha";
    releases.forEach((release) => release());

    const result = expectSuccess(await planning);

    assert.equal(result.spec.root.id, initialAlpha.id);
    assert.equal(result.spec.cwd, "C:\\work\\initial alpha");
    assert.deepEqual(result.spec.args, ["--add-dir", "C:\\work\\initial beta"]);
    assert.deepEqual(result.spec.env, { PATH: "C:\\original" });
    assert.equal(result.spec.executable, "C:\\original\\claude.exe");
  });
});
