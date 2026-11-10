"use strict";

const { isDeepStrictEqual } = require("node:util");

// Temporary bootstrap approved in #220; retire immediately after its exact migration.
// These are normalized Git-source content digests, not a test/directory exemption.
const expectedChanges = [
  { path: "CONTRIBUTING.md",
    oldEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6" },
    newEntry: { path: "CONTRIBUTING.md", mode: "100644", contentDigest: "6da82fe40285dcf59ea6db47ef5e5c23a2516e094c34c374b6ca6f7a33a5d9ef" } },
  { path: "test/unit/packageAssets.test.ts",
    oldEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "f997715e94243a5dd66f2facbf8b1e24be3a60654e6e2253f8a60f43b7b66faf" },
    newEntry: { path: "test/unit/packageAssets.test.ts", mode: "100644", contentDigest: "0e939a64867b7f7fbd2d037d0be57022d0104eb09c2cb59fa3ed6f076a40cfca" } }
];

function matchesPolicy220Migration(changes, incomingBranch) {
  return incomingBranch === "policy/220-migrate-release-state" && isDeepStrictEqual(changes, expectedChanges);
}
module.exports = { matchesPolicy220Migration };
