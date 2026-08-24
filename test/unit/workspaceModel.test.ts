import assert from "node:assert/strict";
import type { Uri, WorkspaceFolder } from "vscode";

import { WorkspaceModel } from "../../src/workspace/workspaceModel";

function uri(value: string): Uri {
  const scheme = value.slice(0, value.indexOf(":"));

  return {
    scheme,
    toString: (skipEncoding?: boolean) =>
      skipEncoding ? value : encodeURI(value)
  } as Uri;
}

function folder(name: string, value: string, index: number): WorkspaceFolder {
  return {
    index,
    name,
    uri: uri(value)
  };
}

describe("WorkspaceModel", () => {
  it("accepts a saved file workspace", () => {
    const model = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [folder("alpha", "file:///projects/alpha", 0)]
    );

    assert.equal(model.isEligible, true);
  });

  it("rejects an untitled workspace", () => {
    const model = WorkspaceModel.from(
      uri("untitled:workspace-1"),
      [folder("alpha", "file:///projects/alpha", 0)]
    );

    assert.equal(model.isEligible, false);
  });

  it("rejects an ordinary folder window", () => {
    const model = WorkspaceModel.from(undefined, [
      folder("alpha", "file:///projects/alpha", 0)
    ]);

    assert.equal(model.isEligible, false);
  });

  it("preserves workspace-folder order in root ids", () => {
    const model = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [
        folder("beta", "file:///projects/beta folder", 0),
        folder("alpha", "file:///projects/alpha", 1)
      ]
    );

    assert.deepEqual(model.rootIds, [
      "file:///projects/beta folder",
      "file:///projects/alpha"
    ]);
  });

  it("uses URI identity when display names are duplicated", () => {
    const model = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [
        folder("service", "file:///projects/frontend", 0),
        folder("service", "file:///projects/backend", 1)
      ]
    );

    assert.deepEqual(
      model.roots.map(({ id, label }) => ({ id, label })),
      [
        { id: "file:///projects/frontend", label: "service" },
        { id: "file:///projects/backend", label: "service" }
      ]
    );
  });
});
