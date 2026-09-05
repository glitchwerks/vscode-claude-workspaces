import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type ExtensionManifest = { readonly icon?: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(filePath: string): { width: number; height: number } {
  const png = fs.readFileSync(filePath);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("Marketplace package assets", () => {
  it("ships a 256px square PNG through the extension icon manifest field", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as ExtensionManifest;
    assert.equal(manifest.icon, "media/claude-workspaces-icon.png");
    assert.deepEqual(readPngDimensions(path.resolve(manifest.icon)), {
      width: 256,
      height: 256
    });
  });
});
