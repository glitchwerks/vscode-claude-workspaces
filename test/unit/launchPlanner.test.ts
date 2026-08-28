import assert from "node:assert/strict";
import type { Uri } from "vscode";

import type { WorkspaceConfigV1 } from "../../src/config/workspaceConfig";
import {
  planLaunch,
  type LaunchPlanResult,
  type LaunchPlanSuccess
} from "../../src/launch/launchPlanner";
import type { WorkspaceRoot } from "../../src/workspace/workspaceModel";

interface RootAvailability {
  check(roots: readonly WorkspaceRoot[]): Promise<ReadonlySet<string>>;
}

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
    check: async (candidates) =>
      new Set(candidates.filter(({ id }) => availableIds.includes(id)).map(({ id }) => id))
  };
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
});
