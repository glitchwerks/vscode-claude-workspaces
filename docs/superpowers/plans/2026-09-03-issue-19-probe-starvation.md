# Issue 19 Probe Starvation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow launch planning to reach later viable roots after earlier filesystem probes ignore cancellation, while enforcing explicit outstanding-probe and total-latency bounds (#19).

**Architecture:** Keep the existing bounded worker pool, but distinguish awaited concurrency from the total number of filesystem operations that may still be outstanding. A retired non-cooperative probe releases its worker only while the new `maxOutstandingProbes` ceiling and an absolute `totalTimeoutMs` deadline still permit more work; requested roots are moved to the front of the probe order so unrelated checks cannot consume their opportunity to run. This preserves the planner's single aggregated import warning and ordered fallback selection (`src/launch/launchPlanner.ts:L105-L129`, `src/launch/launchPlanner.ts:L270-L318`; #19).

**Tech Stack:** TypeScript, Node.js timers and `AbortController`, Mocha, Node strict assertions (`package.json:L34-L43`, `test/unit/launchPlanner.test.ts:L1-L10`).

**Spec:** GitHub issue #19 and `docs/superpowers/specs/2026-08-23-claude-workspaces.md:L131-L163`

## Global Constraints

- Preserve explicit-root failure and default-root fallback behavior (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L133-L140`).
- Preserve independent import validation and one aggregated warning (`docs/superpowers/specs/2026-08-23-claude-workspaces.md:L151-L160`; #19).
- Never start more than `maxConcurrency` awaited probes or `maxOutstandingProbes` total unsettled probes; stop starting work at `totalTimeoutMs` (#19).
- Production availability checks use non-cancellable `vscode.workspace.fs.stat`, so the planner—not the adapter—must enforce these bounds (`src/extension.ts:L516-L525`; `src/launch/launchPlanner.ts:L73-L79`).
- Add regression coverage before implementation and run the repository's type, lint, unit, and integration commands (`package.json:L34-L43`; #19).

---

### Task 1: Bound and replace non-cooperative root probes

**Files:**
- Modify: `src/launch/launchPlanner.ts:64-80,93-106,194-268`
- Modify: `src/extension.ts:516-525`
- Modify: `test/unit/launchPlanner.test.ts:53-59,312-504`
- Modify: `test/integration/lifecycle.test.ts:126-131,219,270,339,394,449,500,557,612,667`

**Interfaces:**
- Consumes: `planLaunch(request, roots, config, executable, environment, availability): Promise<LaunchPlanResult>` and the ordered `WorkspaceRoot[]` snapshot.
- Produces: `RootAvailability` with required numeric `timeoutMs`, `maxConcurrency`, `maxOutstandingProbes`, and `totalTimeoutMs`; `planLaunch` retains its existing signature and result types.

- [x] **Step 1: Write the starvation regression test**

Add a unit test whose first two probes never settle after abort and whose third root is immediately available. The production mutation this catches is returning the worker when `isAvailableWithinTimeout` reports a retired probe.

```ts
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
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run compile:tests && npx mocha "out/test/unit/launchPlanner.test.js" --grep "reaches a later available root"
```

Expected: FAIL because the current worker returns after retiring `one` or `two`, so `three` is absent from `startedIds` and the result is `no-root-available` (`src/launch/launchPlanner.ts:L202-L216`).

- [x] **Step 3: Add tests for the two resource ceilings and request priority**

Add these focused cases:

```ts
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
```

Use literal expected ID arrays and result objects, matching the existing behavior-focused test style (`test/unit/launchPlanner.test.ts:L312-L472`). These tests cover the issue's unresolved-operation, total-latency, and requested-root acceptance criteria (#19).

- [x] **Step 4: Extend and validate the availability policy**

Update the public boundary:

```ts
export interface RootAvailability {
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly maxOutstandingProbes: number;
  readonly totalTimeoutMs: number;
  isAvailable(root: WorkspaceRoot, signal: AbortSignal): Promise<boolean>;
}
```

Extend `hasValidAvailabilityPolicy` so both new values are finite integers, `maxOutstandingProbes >= maxConcurrency`, and `totalTimeoutMs >= 0`. Add these invalid-policy table rows:

```ts
{ name: "zero outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 0, totalTimeoutMs: 20 },
{ name: "negative outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: -1, totalTimeoutMs: 20 },
{ name: "fractional outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1.5, totalTimeoutMs: 20 },
{ name: "infinite outstanding probes", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: Number.POSITIVE_INFINITY, totalTimeoutMs: 20 },
{ name: "outstanding below concurrency", timeoutMs: 10, maxConcurrency: 2, maxOutstandingProbes: 1, totalTimeoutMs: 20 },
{ name: "negative total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: -1 },
{ name: "fractional total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: 1.5 },
{ name: "infinite total timeout", timeoutMs: 10, maxConcurrency: 1, maxOutstandingProbes: 1, totalTimeoutMs: Number.POSITIVE_INFINITY }
```

Give the existing rows `maxOutstandingProbes: 1` and `totalTimeoutMs: 20`. This keeps invalid policy failures typed as `invalid-availability-policy` (`src/launch/launchPlanner.ts:L41-L46`, `src/launch/launchPlanner.ts:L220-L227`).

- [x] **Step 5: Implement requested-root ordering and the bounded scheduler**

Before calling `findAvailableRootIds`, use this stable priority helper. Do not change `selectRoot`, which must retain ordered fallback semantics (`src/launch/launchPlanner.ts:L270-L318`).

```ts
function prioritizeRequestedRoot(snapshot: LaunchInputSnapshot): readonly WorkspaceRoot[] {
  const requestedId = snapshot.request.rootMode === "explicit"
    ? snapshot.request.explicitRoot
    : snapshot.config.defaultRootOverride;
  const requestedRoot = snapshot.roots.find(({ id }) => id === requestedId);
  return requestedRoot === undefined
    ? snapshot.roots
    : [requestedRoot, ...snapshot.roots.filter(({ id }) => id !== requestedRoot.id)];
}
```

Inside `findAvailableRootIds`, implement the scheduler with this state transition:

```ts
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
    const result = root === undefined
      ? false
      : await isAvailableWithinTimeout(root, availability, deadline);
    activeProbes -= 1;
    if (result === RETIRED_AVAILABILITY_PROBE) {
      unresolvedProbes += 1;
      continue;
    }
    if (root !== undefined && result) {
      availableIds.add(root.id);
    }
  }
});
```

In `isAvailableWithinTimeout`, compute `Math.max(0, Math.min(availability.timeoutMs, deadline - Date.now()))` for the abort timer. After it fires, compute the cancellation grace with `Math.max(0, Math.min(CANCELLATION_GRACE_MS, deadline - Date.now()))`. These counters and deadline make the total live filesystem-operation and latency ceilings explicit while retaining `maxConcurrency` workers (#19; current retirement point: `src/launch/launchPlanner.ts:L194-L268`).

- [x] **Step 6: Configure production bounds and update test fixtures**

Set production policy to:

```ts
{
  timeoutMs: 5_000,
  maxConcurrency: 4,
  maxOutstandingProbes: 8,
  totalTimeoutMs: 10_000,
  isAvailable: async (root) => {
    await vscode.workspace.fs.stat(root.uri);
    return true;
  }
}
```

Update the unit helper to use `maxOutstandingProbes: 2` and `totalTimeoutMs: 100`. Update each integration fixture with `maxOutstandingProbes` equal to its existing `maxConcurrency` and `totalTimeoutMs: 100`, because those fixtures resolve immediately and are not intended to exercise retirement. TypeScript then enforces complete policies (`src/extension.ts:L516-L525`; `test/integration/lifecycle.test.ts:L126-L131`; `test/unit/launchPlanner.test.ts:L53-L59`).

- [x] **Step 7: Verify GREEN and the full repository**

Run:

```bash
npm run compile:tests && npx mocha "out/test/unit/launchPlanner.test.js"
npm run check:types
npm run lint
npm test
```

Expected: all launch-planner tests pass, type checking and lint exit successfully, and the complete unit/integration suite passes (`package.json:L34-L43`).

- [x] **Step 8: Commit the completed bug fix**

```bash
git add src/launch/launchPlanner.ts src/extension.ts test/unit/launchPlanner.test.ts test/integration/lifecycle.test.ts docs/superpowers/plans/2026-09-03-issue-19-probe-starvation.md
git commit -m "fix(launch): prevent availability probe starvation (#19)"
```
