const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const production = process.argv.includes("--production");

async function main() {
  if (production) {
    for (const map of ["extension.js.map", "panel/webview/index.js.map"]) {
      fs.rmSync(path.join(__dirname, "dist", map), { force: true });
    }
  }

  await esbuild.build({
    entryPoints: [{ in: "src/extension.ts", out: "extension" }],
    bundle: true,
    external: ["node-pty", "vscode"],
    format: "cjs",
    logLevel: "info",
    minify: production,
    outdir: "dist",
    platform: "node",
    sourcemap: !production,
    sourcesContent: false,
    target: "node20"
  });

  await esbuild.build({
    entryPoints: [{ in: "src/panel/webview/index.ts", out: "panel/webview/index" }],
    bundle: true,
    format: "iife",
    logLevel: "info",
    minify: production,
    outdir: "dist",
    platform: "browser",
    sourcemap: !production,
    sourcesContent: false,
    target: "es2022"
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
