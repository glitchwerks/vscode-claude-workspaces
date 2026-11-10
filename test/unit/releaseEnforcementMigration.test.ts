import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import type { GuardResult, PolicyState, PullRequestEvaluationInput, PullRequestIdentity, ScopeChange } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence } from "./helpers/releasePolicyFixture";

const evaluatorPath = path.resolve("scripts/release-enforcement/evaluate.js");
const loader = createRequire(evaluatorPath);
const scope = loader("./snapshot.js") as Record<string, unknown>;
const { loadPolicy } = loader("./records.js") as {
  loadPolicy(repo: string, authorityCommit: string): PolicyState;
};

// Frozen Git-source endpoint metadata from PR #229; no history fetch is needed in CI.
const formerMigration: ScopeChange[] = [
  { path: "CONTRIBUTING.md",
    oldEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6" },
    newEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "6da82fe40285dcf59ea6db47ef5e5c23a2516e094c34c374b6ca6f7a33a5d9ef" } },
  { path: "test/unit/packageAssets.test.ts",
    oldEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "f997715e94243a5dd66f2facbf8b1e24be3a60654e6e2253f8a60f43b7b66faf" },
    newEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "0e939a64867b7f7fbd2d037d0be57022d0104eb09c2cb59fa3ed6f076a40cfca" } }
];

describe("retired #220 policy bootstrap", function () {
  this.timeout(30000);
  it("rejects the former exact migration endpoints on their original policy branch", async () => {
    const fixture = createGitFixture();
    try {
      const authority = fixture.commit({
        ".github/release-policy/config.json": JSON.stringify({ schemaVersion: 1,
          repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" },
          activePrerelease: "prerelease/0.13.x" }),
        "CONTRIBUTING.md": "Before migration\n",
        "test/unit/packageAssets.test.ts": "Before extraction\n"
      });
      const head = fixture.commit({ "CONTRIBUTING.md": "After migration\n", "test/unit/packageAssets.test.ts": "After extraction\n" });
      const pr: PullRequestIdentity = { number: 220, state: "open",
        head: { sha: head, ref: "policy/220-migrate-release-state", repositoryId: 1344170098 },
        base: { sha: authority, ref: "main", repositoryId: 1344170098 } };
      const evaluator = { exports: {} as { evaluatePullRequest(options: PullRequestEvaluationInput): Promise<GuardResult> } };
      // Only reconstruct the historical endpoint metadata. Routing, ordinary Git scope,
      // package identity and policy validation all run through their real implementations.
      runInNewContext(fs.readFileSync(evaluatorPath, "utf8"), {
        require: (id: string): unknown => id === "./snapshot.js"
          ? { ...scope, diffScope: () => ({ changes: structuredClone(formerMigration) }) }
          : loader(id),
        module: evaluator
      });
      await assert.rejects(evaluator.exports.evaluatePullRequest({ repositoryPath: fixture.repo, pr,
        policy: loadPolicy(fixture.repo, authority), github: fixtureEvidence(pr) }), /E_POLICY_SCOPE/);
    } finally { fixture.remove(); }
  });
});
