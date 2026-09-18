import assert from "node:assert/strict";
import fs from "node:fs";

const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const publish = fs.readFileSync(".github/workflows/publish.yml", "utf8");

describe("release workflow contracts", () => {
  it("runs push CI on main and versioned prerelease branches", () => {
    assert.match(
      ci,
      /branches:\s*\n\s*- main\s*\n\s*- ["']?prerelease\/\*\*["']?/
    );
  });

  it("exposes one focused Release Policy check", () => {
    assert.match(ci, /name:\s*Release Policy/);
    assert.match(ci, /npm run test:release-policy/);
  });

  it("validates the tagged source before dependency installation", () => {
    const validation = publish.indexOf("Validate release source");
    const install = publish.indexOf("Install dependencies");
    const marketplace = publish.indexOf("Publish to VS Code Marketplace");
    assert.ok(validation >= 0);
    assert.ok(validation < install);
    assert.ok(validation < marketplace);
  });

  it("fetches only the derived authorized source branch", () => {
    assert.match(publish, /steps\.release\.outputs\.source_branch/);
    assert.match(publish, /refs\/heads\/\$SOURCE_BRANCH/);
  });
});
