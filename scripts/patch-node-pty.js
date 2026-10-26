"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// node-pty 1.1.0 leaves its ConPTY input socket and output worker alive after
// natural exit. Patch the dependency at build/test time, never kill an exited
// process from the managed adapter. See #171 and microsoft/node-pty#887/#947.
// Both original and patched LF-normalized hashes are pinned: an upstream
// upgrade must explicitly retire or revalidate this compatibility patch.
const patches = [
  {
    file: "lib/windowsPtyAgent.js",
    before: "8636d16b38266112204061a22b135734177c242837982fd3a4055be726efa64a",
    after: "4d1767aa24aec166ec377a8e1f17f80b75faa63889c67d091c67138a3a4bc35a",
    search: "        this._outSocket.destroy();\n    };",
    replacement: "        this._inSocket.destroy();\n" +
      "        this._conoutSocketWorker.dispose();\n" +
      "        this._outSocket.destroy();\n    };"
  },
  {
    file: "lib/worker/conoutSocketWorker.js",
    before: "3e4bac095ac3870c3248a7302f5d10217de625f30c32b7000fe48a34788e47ac",
    after: "1a01dae7ec1b241d0a6bb2fe8504e325b6c1676f00c2ebff4a0fd41b4c674bc1",
    search: "        conoutSocket.pipe(workerSocket);",
    replacement: "        workerSocket.on('error', function (error) {\n" +
      "            if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {\n" +
      "                throw error;\n" +
      "            }\n" +
      "            conoutSocket.unpipe(workerSocket);\n" +
      "            workerSocket.destroy();\n" +
      "        });\n" +
      "        conoutSocket.pipe(workerSocket);"
  }
];

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

function patchNodePty(directory = path.dirname(require.resolve("node-pty/package.json"))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  if (manifest.version !== "1.1.0") {
    throw new Error("Revalidate or remove the node-pty 1.1.0 cleanup patch before upgrading.");
  }
  // Validate every input before changing any files.
  const updates = patches.flatMap(patch => {
    const file = path.join(directory, patch.file);
    const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const hash = digest(source);
    if (hash === patch.after) { return []; }
    if (hash !== patch.before) {
      throw new Error(`Unexpected node-pty source for ${patch.file}; refusing to patch.`);
    }
    const patched = source.replace(patch.search, patch.replacement);
    if (digest(patched) !== patch.after) {
      throw new Error(`Invalid node-pty cleanup patch for ${patch.file}.`);
    }
    return [{ file, source: patched }];
  });
  for (const update of updates) {
    fs.writeFileSync(update.file, update.source);
  }
}

module.exports = { patchNodePty };

if (require.main === module) {
  try { patchNodePty(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
