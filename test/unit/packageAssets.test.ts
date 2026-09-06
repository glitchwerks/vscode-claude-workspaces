import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type ExtensionManifest = { readonly icon?: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SCREENSHOT_PATHS = [
  "media/screenshots/workspace-configuration.png",
  "media/screenshots/session-tabs.png",
  "media/screenshots/running-session.png"
] as const;

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

  for (const screenshotPath of SCREENSHOT_PATHS) {
    it(`ships a readable 16:9 PNG screenshot at ${screenshotPath}`, () => {
      const { width, height } = readPngDimensions(path.resolve(screenshotPath));
      assert.ok(width >= 1200, `Screenshot width ${width}px is below 1200px`);
      assert.ok(Math.abs(height - width * 9 / 16) <= 1,
        `Screenshot ${width}x${height} is not 16:9 within one pixel`);
    });

    it(`embeds ${screenshotPath} as a README image`, () => {
      const readme = fs.readFileSync("README.md", "utf8");
      const imagePaths = [...readme.matchAll(/!\[[^\]]+\]\(([^\s)]+)\)/g)]
        .map((match) => match[1]);
      assert.ok(imagePaths.includes(screenshotPath),
        `README does not embed ${screenshotPath} with nonempty alt text`);
    });
  }
});
