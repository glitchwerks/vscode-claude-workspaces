import assert from "node:assert/strict";
import type { Uri } from "vscode";

import type { LaunchSpec } from "../../src/launch/launchPlanner";
import {
  planNewClaudeSession,
  planResumedClaudeSession
} from "../../src/launch/sessionLaunch";

const originalSpec: LaunchSpec = Object.freeze({
  executable: "C:\\Program Files\\Claude\\claude.exe",
  args: Object.freeze(["--add-dir", "C:\\work\\client portal"]),
  cwd: "C:\\work\\alpha",
  env: Object.freeze({ PATH: "C:\\bin", KEEP: "yes" }),
  root: Object.freeze({
    id: "alpha",
    label: "alpha",
    uri: { fsPath: "C:\\work\\alpha" } as Uri
  }),
  importedRoots: Object.freeze([Object.freeze({
    id: "beta",
    label: "beta",
    uri: { fsPath: "C:\\work\\client portal" } as Uri
  })]),
  skippedImportIds: Object.freeze(["gamma"])
});

describe("Claude session launch planning", () => {
  it("prepends a new Claude session id without changing launch metadata", () => {
    // Replacing or mutating the original plan would lose a selected root, import, or environment setting.
    const planned = planNewClaudeSession(originalSpec, "4b1cc9cf-9ca2-4afc-a54b-cb3fc54648bd");

    assert.deepEqual(planned.args, [
      "--session-id",
      "4b1cc9cf-9ca2-4afc-a54b-cb3fc54648bd",
      "--add-dir",
      "C:\\work\\client portal"
    ]);
    assertLaunchMetadataIsPreserved(planned);
  });

  it("prepends a resume id without changing launch metadata", () => {
    // Using a new-session flag for a resume would silently start an unrelated conversation.
    const planned = planResumedClaudeSession(originalSpec, "a953b8f3-81b7-41b5-af4a-5f8b8a1889b0");

    assert.deepEqual(planned.args, [
      "--resume",
      "a953b8f3-81b7-41b5-af4a-5f8b8a1889b0",
      "--add-dir",
      "C:\\work\\client portal"
    ]);
    assertLaunchMetadataIsPreserved(planned);
  });
});

function assertLaunchMetadataIsPreserved(planned: LaunchSpec): void {
  assert.equal(Object.isFrozen(planned), true);
  assert.equal(Object.isFrozen(planned.args), true);
  assert.equal(planned.executable, originalSpec.executable);
  assert.equal(planned.cwd, originalSpec.cwd);
  assert.strictEqual(planned.env, originalSpec.env);
  assert.strictEqual(planned.root, originalSpec.root);
  assert.strictEqual(planned.importedRoots, originalSpec.importedRoots);
  assert.strictEqual(planned.skippedImportIds, originalSpec.skippedImportIds);
  assert.deepEqual(originalSpec.args, ["--add-dir", "C:\\work\\client portal"]);
}
