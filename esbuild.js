const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const production = process.argv.includes("--production");

async function main() {
  if (production) {
    fs.rmSync(path.join(__dirname, "dist", "extension.js.map"), {
      force: true
    });
  }

  await esbuild.build({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    entryNames: "extension",
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
