import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import type { ScopeChange } from "../../scripts/release-enforcement/contracts";

const loader = createRequire(__filename);
const migration = () => (loader(path.resolve("scripts/release-enforcement/policyMigration220.js")) as {
  matchesPolicy220Migration(changes: unknown, incomingBranch: unknown): boolean;
}).matchesPolicy220Migration;

// Independently generated from the frozen #220 migration endpoints using Git-source LF bytes.
const approved: ScopeChange[] = [
  { path: "CONTRIBUTING.md",
    oldEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6" },
    newEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "6da82fe40285dcf59ea6db47ef5e5c23a2516e094c34c374b6ca6f7a33a5d9ef" } },
  { path: "test/unit/packageAssets.test.ts",
    oldEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "f997715e94243a5dd66f2facbf8b1e24be3a60654e6e2253f8a60f43b7b66faf" },
    newEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "0e939a64867b7f7fbd2d037d0be57022d0104eb09c2cb59fa3ed6f076a40cfca" } }
];
const branch = "policy/220-migrate-release-state";

describe("exact #220 policy bootstrap", () => {
  it("admits only the selected forward migration on its named policy branch", () => {
    assert.equal(migration()(structuredClone(approved), branch), true);
  });
  for (const wrong of [undefined, "", "policy/220-register-0.13.x", "policy/221-migrate-release-state", "codex/220-migrate-release-state"] ) {
    it(`rejects the exact endpoints from branch ${String(wrong)}`, () => {
      assert.equal(migration()(approved, wrong), false);
    });
  }
  const mutations: Array<[string, (changes: ScopeChange[]) => unknown]> = [
    ["a missing file", changes => changes.slice(1)],
    ["duplicate endpoints", changes => [...changes, changes[0]!]],
    ["an unrelated product edit", changes => [...changes, { path: "src/extension.ts", oldEntry: null,
      newEntry: { path: "src/extension.ts", mode: "100644", contentDigest: "a".repeat(64) } }]],
    ["reversed file endpoints", changes => changes.map(change => ({ ...change, oldEntry: change.newEntry, newEntry: change.oldEntry }))],
    ["changed original test bytes", changes => { changes[1]!.oldEntry!.contentDigest = "a".repeat(64); return changes; }],
    ["changed resulting test bytes", changes => { changes[1]!.newEntry!.contentDigest = "a".repeat(64); return changes; }],
    ["changed resulting documentation", changes => { changes[0]!.newEntry!.contentDigest = "a".repeat(64); return changes; }],
    ["an executable mode change", changes => { changes[1]!.newEntry!.mode = "100755"; return changes; }],
    ["a symlink mode", changes => { changes[1]!.newEntry!.mode = "120000"; return changes; }],
    ["a removed endpoint", changes => { changes[1]!.newEntry = null; return changes; }],
    ["an added endpoint", changes => { changes[1]!.oldEntry = null; return changes; }],
    ["a renamed target", changes => { changes[1]!.newEntry!.path = "test/unit/other.test.ts"; return changes; }],
    ["a different scope path", changes => { changes[1]!.path = "test/unit/other.test.ts"; return changes; }],
    ["extra endpoint fields", changes => { Object.assign(changes[1]!.newEntry!, { ignored: true }); return changes; }]
  ];
  for (const [name, mutate] of mutations) {
    it(`rejects ${name}`, () => {
      assert.equal(migration()(mutate(structuredClone(approved)), branch), false);
    });
  }
  for (const invalid of [undefined, null, {}, [], "approved"]) {
    it(`rejects malformed scope ${JSON.stringify(invalid)}`, () => {
      assert.equal(migration()(invalid, branch), false);
    });
  }
});
