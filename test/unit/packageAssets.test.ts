import assert from "node:assert/strict";
import { listFiles } from "@vscode/vsce";
import fs from "node:fs";
import path from "node:path";

type ExtensionManifest = { readonly icon?: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SCREENSHOT_PATHS = [
  "media/screenshots/workspace-configuration.png",
  "media/screenshots/session-tabs.png",
  "media/screenshots/running-session.png"
] as const;

function markdownLinks(markdown: string): readonly string[] {
  const prose = markdown.replace(/^```[^\r\n]*[\r\n][\s\S]*?^```\s*$/gm, "");
  return [...prose.matchAll(/(?<!!)\[[^\]]+\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)]
    .flatMap((match) => match[1] === undefined ? [] : [match[1]])
    .filter((target) => !/^(?:[a-z]+:|#)/i.test(target));
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  const png = fs.readFileSync(filePath);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("Marketplace package assets", () => {
  it("includes the contribution guide and screenshots in the packaged extension", async function () {
    this.timeout(10_000);
    const packagedFiles = await listFiles({
      cwd: process.cwd(),
      packagedDependencies: []
    });

    assert.ok(packagedFiles.includes("CONTRIBUTING.md"));
    for (const screenshotPath of SCREENSHOT_PATHS) {
      assert.ok(packagedFiles.includes(screenshotPath),
        `Packaged extension is missing ${screenshotPath}`);
    }
  });

  it("introduces a concrete feature list before installation instructions", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const features = readme.match(/^## Features\s*$([\s\S]*?)^## ([^\r\n]+)\s*$/m);
    const featureBody = features?.[1];
    const nextHeading = features?.[2];

    assert.ok(featureBody, "README must include a nonempty Features section");
    assert.ok(/^\s*[-*+]\s+\S+/m.test(featureBody),
      "README Features section must contain a Markdown bullet list");
    assert.equal(nextHeading, "Install",
      "README Features must be followed immediately by Install");
  });

  it("links the root contribution guide from the README", () => {
    const readme = fs.readFileSync("README.md", "utf8");

    assert.ok(markdownLinks(readme).includes("CONTRIBUTING.md"));
    assert.ok(fs.statSync("CONTRIBUTING.md").isFile());
  });

  for (const documentPath of ["README.md", "CONTRIBUTING.md"] as const) {
    it(`keeps local Markdown links in ${documentPath} resolvable`, () => {
      const markdown = fs.readFileSync(documentPath, "utf8");

      for (const target of markdownLinks(markdown)) {
        const decodedTarget = decodeURIComponent(target.split("#", 1)[0] ?? target);
        const resolvedPath = path.resolve(path.dirname(documentPath), decodedTarget);
        assert.ok(fs.existsSync(resolvedPath),
          `${documentPath} links to missing local path: ${target}`);
      }
    });
  }

  it("keeps the 0.4.0 stable promotion and next pre-release guidance aligned", () => {
    const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
    const contributing = fs.readFileSync("CONTRIBUTING.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      readonly version?: string;
    };
    const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
      readonly version?: string;
      readonly packages?: Record<string, { readonly version?: string }>;
    };

    assert.equal(manifest.version, "0.4.0");
    assert.equal(lockfile.version, "0.4.0");
    assert.equal(lockfile.packages?.[""]?.version, "0.4.0");
    assert.match(changelog, /Claude Workspaces 0\.4\.0 targets the Marketplace stable channel/);
    assert.match(changelog, /promotes the validated 0\.3\.1 pre-release/i);
    assert.match(readme, /Version 0\.4\.0 targets the Marketplace stable channel/);
    assert.match(readme, /0\.3\.1 pre-release line is promoted to 0\.4\.0/i);
    assert.match(readme, /New features begin in\s+the 0\.5\.x pre-release line/i);
    assert.match(contributing, /promote the latest validated odd-minor\s+pre-release/i);
    assert.match(contributing, /new features begin in the next odd-minor pre-release line/i);
  });

  it("pins integration coverage to the minimum and latest supported VS Code hosts", () => {
    const testConfig = fs.readFileSync(".vscode-test.js", "utf8");

    assert.match(testConfig, /version: "1\.120\.0"/);
    assert.match(testConfig, /version: "1\.136\.1"/);
  });

  it("contributes the ordered live diagnostic verbosity setting", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      readonly contributes?: {
        readonly configuration?: {
          readonly properties?: Record<string, {
            readonly type?: unknown;
            readonly enum?: unknown;
            readonly default?: unknown;
            readonly description?: unknown;
          }>;
        };
      };
    };

    assert.deepEqual(
      manifest.contributes?.configuration?.properties?.["claudeWorkspaces.logLevel"],
      {
        type: "string",
        enum: ["off", "error", "warn", "info", "debug", "trace"],
        default: "info",
        description: "Controls diagnostic verbosity in the Claude Workspaces Output channel."
      }
    );
  });

  it("documents live diagnostic verbosity and its redaction boundary", () => {
    const readme = fs.readFileSync("README.md", "utf8");

    assert.match(readme, /claudeWorkspaces\.logLevel/);
    assert.match(readme, /`off`, `error`, `warn`, `info`, `debug`, or `trace`/);
    assert.match(readme, /defaults? to `?info`?/i);
    assert.match(readme, /appl(?:y|ies|ied) immediately/i);
    assert.match(readme, /\*\*Claude Workspaces\*\* Output channel/);
    assert.match(readme, /Claude prompts?/i);
    assert.match(readme, /responses?/i);
    assert.match(readme, /terminal traffic/i);
    assert.match(readme, /environment\s+values/i);
    assert.match(readme, /sensitive\s+carrier\s+arguments/i);
  });

  it("enables the collapsible session-details bar by default", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      readonly contributes?: {
        readonly configuration?: {
          readonly properties?: Record<string, { readonly default?: unknown }>;
        };
      };
    };

    assert.equal(
      manifest.contributes?.configuration?.properties?.[
        "claudeWorkspaces.sessionDetailsInitiallyExpanded"
      ]?.default,
      true
    );
  });

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
