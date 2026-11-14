import assert from "node:assert/strict";
import { listFiles } from "@vscode/vsce";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { JSDOM } from "jsdom";
import { diskCompanionHarness, fixtureTarget } from "../support/companionHarness";

const { extractChangelogSection } = createRequire(__filename)(
  path.resolve("scripts/extract-changelog.js")
) as {
  extractChangelogSection(markdown: string, version: string): string | undefined;
};

type ExtensionManifest = { readonly icon?: string };

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// VSCE traverses filesystem, Git, and npm boundaries and can exceed ten seconds on Windows.
const PACKAGE_ENUMERATION_TIMEOUT_MS = 30_000;
const USER_GUIDE_PATH = "docs/user-guide.md";
const VERSIONING_POLICY_PATH = "docs/versioning-policy.md";
const ATTENTION_HOOK_SCRIPT_PATH = "media/attention/report-activity.ps1";
const SNORETOAST_PATH = "media/attention/snoretoast/SnoreToast.exe";
const SNORETOAST_LICENSE_PATH = "media/attention/snoretoast/COPYING.LGPL-3";
const SNORETOAST_PROVENANCE_PATH = "media/attention/snoretoast/README.md";
const SNORETOAST_SHA256 = "6f923279ddb75dfaad02dcee1580a6122290802cbf1fc5ffc6f5db7e3a2f01d4";
const SCREENSHOT_PATHS = [
  "media/screenshots/workspace-configuration.png",
  "media/screenshots/session-tabs.png",
  "media/screenshots/running-session.png",
  "media/screenshots/prompt-composer-prerelease.png",
  "media/screenshots/prompt-preview-prerelease.png"
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
  it("requires the native-focus-capable host in both package and lock metadata", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    assert.equal(manifest.engines.vscode, "^1.128.0");
    assert.equal(lock.packages[""].engines.vscode, manifest.engines.vscode);
  });
  it("includes public documentation and screenshots in the packaged extension", async function () {
    this.timeout(PACKAGE_ENUMERATION_TIMEOUT_MS);
    const packagedFiles = await listFiles({
      cwd: process.cwd(),
      packagedDependencies: []
    });

    for (const documentPath of ["CONTRIBUTING.md", USER_GUIDE_PATH, VERSIONING_POLICY_PATH]) {
      for (const target of markdownLinks(fs.readFileSync(documentPath, "utf8"))) {
        const destination = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath),
          decodeURIComponent(target.split("#", 1)[0] ?? target)));
        assert.ok(packagedFiles.includes(destination),
          documentPath + " links to an excluded package file: " + target);
      }
    }

    assert.ok(packagedFiles.includes("CONTRIBUTING.md"));
    assert.deepEqual(
      packagedFiles.filter((filePath) => filePath.startsWith("docs/")).sort(),
      [USER_GUIDE_PATH, VERSIONING_POLICY_PATH].sort()
    );
    for(const developmentOnly of ["test/manual/companionNative.smoke.cjs","test/manual/companionNativeWebview.ts",
      "test/fixtures/companion/qualification.json","docs/manual-verification/215-companion.md"]) {
      assert.equal(packagedFiles.includes(developmentOnly),false,"qualification controllers and pending fixtures must stay out of the product VSIX");
    }
    for (const screenshotPath of SCREENSHOT_PATHS) {
      assert.ok(packagedFiles.includes(screenshotPath),
        `Packaged extension is missing ${screenshotPath}`);
    }
    assert.ok(
      packagedFiles.includes(ATTENTION_HOOK_SCRIPT_PATH),
      `Packaged extension is missing ${ATTENTION_HOOK_SCRIPT_PATH}`
    );
    for (const assetPath of [
      "media/attention/.claude-plugin/plugin.json",
      "media/attention/hooks/hooks.json",
      "media/attention/hooks/register.js",
      "media/attention/hooks/composer.js",
      "media/attention/hooks/completionRetry.js",
      "media/attention/hooks/companion/observer.js",
      "media/attention/hooks/companion/filePublisher.js"
    ]) {
      assert.ok(packagedFiles.includes(assetPath), `Packaged extension is missing ${assetPath}`);
    }
    const hookModules = JSON.parse(fs.readFileSync("media/attention/hooks/hooks.json", "utf8")).modules as string[];
    assert.equal(hookModules.length, 1, "the native SDK permits exactly one entry module per plugin");
    for (const modulePath of hookModules) {
      const asset = path.posix.join("media/attention/hooks", modulePath);
      assert.ok(packagedFiles.includes(asset), `Configured hook module is missing: ${asset}`);
    }
    assert.equal(packagedFiles.includes("media/attention/tsconfig.json"), false,
      "CLI-generated TypeScript scaffolding must not ship in the extension");
    assert.equal(packagedFiles.some((filePath) => filePath.startsWith("media/attention/.claude-plugin/types/")), false);
    for (const assetPath of [
      SNORETOAST_PATH,
      SNORETOAST_LICENSE_PATH,
      SNORETOAST_PROVENANCE_PATH
    ]) {
      assert.ok(packagedFiles.includes(assetPath),
        `Packaged extension is missing ${assetPath}`);
    }
  });

  it("excludes only the attention reporter's CLI-generated TypeScript scaffolding", () => {
    const exclusions = fs.readFileSync(".vscodeignore", "utf8").split(/\r?\n/);
    assert.ok(exclusions.includes("media/attention/tsconfig.json"));
    assert.ok(exclusions.includes("media/attention/.claude-plugin/types/**"));
    assert.ok(exclusions.includes("!media/attention/.claude-plugin/plugin.json"));
  });

  it("ships the pinned KDE-signed SnoreToast 0.9.0 executable", () => {
    // Replacing the vendored binary unnoticed would bypass the reviewed provenance decision.
    const executable = fs.readFileSync(SNORETOAST_PATH);
    assert.equal(executable.subarray(0, 2).toString("ascii"), "MZ");
    assert.equal(createHash("sha256").update(executable).digest("hex"), SNORETOAST_SHA256);
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

  it("documents live session activity indicator semantics", () => {
    const readme = fs.readFileSync(USER_GUIDE_PATH, "utf8");

    assert.match(readme, /working indicator/);
    assert.match(readme, /unread response/);
    assert.match(readme, /panel tab badge counts every live session waiting for input/i);
  });

  it("documents closing a specific live session from its tab menu", () => {
    const readme = fs.readFileSync(USER_GUIDE_PATH, "utf8");

    assert.match(readme, /choose \*\*Close Session\*\* to close that specific live\s+session/i);
  });

  it("ships the detailed user guide linked from the README", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    assert.ok(readme.includes("https://github.com/glitchwerks/vscode-claude-workspaces/blob/main/" + USER_GUIDE_PATH));
    assert.ok(fs.statSync(USER_GUIDE_PATH).isFile());
  });

  it("contributes an assignable Show Claude Workspaces command without a default shortcut", () => {
    // Adding a default keybinding would reserve a shortcut instead of leaving the choice to the user.
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      readonly contributes?: {
        readonly commands?: ReadonlyArray<{
          readonly command?: string;
          readonly title?: string;
          readonly category?: string;
        }>;
        readonly keybindings?: ReadonlyArray<{ readonly command?: string }>;
        readonly menus?: {
          readonly commandPalette?: ReadonlyArray<{
            readonly command?: string;
            readonly when?: string;
          }>;
        };
      };
    };
    const commandId = "claudeWorkspaces.show";

    assert.deepEqual(
      manifest.contributes?.commands?.find((command) => command.command === commandId),
      {
        command: commandId,
        title: "Show Claude Workspaces",
        category: "Claude Workspaces"
      }
    );
    assert.deepEqual(
      manifest.contributes?.menus?.commandPalette?.find((item) => item.command === commandId),
      { command: commandId, when: "claudeWorkspaces.savedWorkspace" }
    );
    assert.equal(
      manifest.contributes?.keybindings?.some((keybinding) => keybinding.command === commandId) ?? false,
      false
    );
  });

  it("contributes temporary activity capture only in saved workspaces", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const command = "claudeWorkspaces.captureActivityDiagnostics";
    assert.deepEqual(manifest.contributes.commands.find((value: { command: string }) => value.command === command),
      { command, title: "Capture Activity Diagnostics", category: "Claude Workspaces" });
    assert.deepEqual(manifest.contributes.menus.commandPalette.find((value: { command: string }) => value.command === command),
      { command, when: "claudeWorkspaces.savedWorkspace" });
  });

  it("links the root contribution guide from the README", () => {
    const readme = fs.readFileSync("README.md", "utf8");

    assert.ok(markdownLinks(readme).includes("CONTRIBUTING.md"));
    assert.ok(fs.statSync("CONTRIBUTING.md").isFile());
  });

  for (const documentPath of [
    "README.md",
    "CONTRIBUTING.md",
    USER_GUIDE_PATH,
    VERSIONING_POLICY_PATH
  ] as const) {
    it(`keeps local Markdown links in ${documentPath} resolvable`, () => {
      assert.ok(fs.existsSync(documentPath), `${documentPath} must exist`);
      const markdown = fs.readFileSync(documentPath, "utf8");

      const headingIds = new Set([...markdown.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
        (match[1] ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/ /g, "-")));
      for (const anchor of markdown.matchAll(/\]\(#([^\s)]+)\)/g)) {
        assert.ok(headingIds.has(decodeURIComponent(anchor[1] ?? "")),
          documentPath + " links to a missing heading: #" + anchor[1]);
      }

      for (const target of markdownLinks(markdown)) {
        const decodedTarget = decodeURIComponent(target.split("#", 1)[0] ?? target);
        const resolvedPath = path.resolve(path.dirname(documentPath), decodedTarget);
        assert.ok(fs.existsSync(resolvedPath),
          `${documentPath} links to missing local path: ${target}`);
      }
    });
  }

  it("preserves coherent root versions and the published 0.12.0 promotion history", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string };
    const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
      version: string; packages: Record<string, { version?: string }>;
    };
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(lockfile.version, manifest.version);
    assert.equal(lockfile.packages[""]?.version, manifest.version);
    const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
    const history = ["0.12.0", "0.11.3", "0.11.2", "0.11.1", "0.11.0"];
    assert.deepEqual([...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map(match => match[1]).filter(version => history.includes(version!)), history);
    const notes = extractChangelogSection(changelog, "0.12.0")?.replace(/\s+/g, " ");
    assert.ok(notes, "Published promotion history must remain available");
    for (const pattern of [/embedded prompt composer/i, /2\.1\.299/, /#145/, /#183/, /native draft/i, /Tab/, /#158/, /#180/, /#212/, /not published/i, /not\s+verified fixed/i]) {
      assert.match(notes, pattern);
    }
  });

  it("retains published stable and prerelease history during 0.12.0 preparation", () => {
    const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
    const contributing = fs.readFileSync("CONTRIBUTING.md", "utf8");
    const readme = fs.readFileSync("README.md", "utf8");
    assert.ok(fs.existsSync(VERSIONING_POLICY_PATH),
      `${VERSIONING_POLICY_PATH} must exist`);
    const versioningPolicy = fs.readFileSync(VERSIONING_POLICY_PATH, "utf8");
    assert.match(changelog, /^# Changelog\r?\n\r?\n## \[Unreleased\]\r?\n/);
    const stableNotes = extractChangelogSection(changelog, "0.10.0");
    assert.ok(stableNotes, "Publication must extract nonempty 0.10.0 notes");
    assert.match(stableNotes, /exact published 0\.9\.0 product snapshot/);
    assert.match(stableNotes, /Marketplace stable channel/);
    assert.match(stableNotes, /61925e9c04408c8b3b5b5ef6e245c0786d0609e3/);
    const candidateNotes = extractChangelogSection(changelog, "0.9.0");
    assert.ok(candidateNotes, "Publication must extract nonempty 0.9.0 notes");
    assert.match(changelog, /^## \[0\.9\.0\] - \d{4}-\d{2}-\d{2}\r?$/m);
    assert.match(candidateNotes, /Windows x64/);
    assert.match(candidateNotes, /channel for Windows x64 and VS Code 1\.128\.0 or later/);
    assert.doesNotMatch(candidateNotes, /development candidate|not yet published|Initialize the 0\.9/i);
    // Publication extracts only this section, so preserved features must be described here.
    for (const issue of [26, 114, 152, 28, 171, 174, 176]) {
      assert.match(candidateNotes, new RegExp(`\\(#${issue}\\)`));
    }
    assert.match(candidateNotes, /collapsed.*hover/is);
    assert.match(candidateNotes, /default workspace root/i);
    assert.match(candidateNotes, /natural.*exit/is);
    assert.match(candidateNotes, /--pre-release/);
    const recoveryNotes = changelog.match(
      /^## \[0\.8\.1\][^\r\n]*\r?\n([\s\S]*?)(?=^## \[)/m
    )?.[1];
    assert.ok(recoveryNotes, "CHANGELOG must retain the published 0.8.1 recovery notes");
    assert.match(recoveryNotes, /published 0\.7\.2 product snapshot/i);
    assert.match(recoveryNotes, /Marketplace stable channel/i);
    assert.match(recoveryNotes, /compatibility exception/i);
    assert.match(recoveryNotes, /directed imports/i);
    assert.match(recoveryNotes, /#155/);
    const releaseNotes = changelog.match(
      /^## \[0\.8\.0\][^\r\n]*\r?\n([\s\S]*?)(?=^## \[)/m
    )?.[1];
    assert.ok(releaseNotes, "CHANGELOG must include a nonempty 0.8.0 section");
    assert.match(releaseNotes, /release and tag were withdrawn/i);
    assert.match(changelog, /^## \[0\.8\.0\] - 2026-10-08\r?$/m);
    assert.match(releaseNotes, /Marketplace stable channel/i);
    assert.doesNotMatch(releaseNotes, /Pending bugfix pre-release|Publish only after/i);
    assert.match(releaseNotes, /default off/i);
    assert.match(releaseNotes, /256 events|five minutes/i);
    assert.match(releaseNotes, /reload VS Code/i);
    assert.doesNotMatch(releaseNotes, /Version 0\.6\.0 remains on the stable\s+channel/i);
    for (const issue of [26, 114, 51, 109, 113, 107, 108, 133, 137, 138, 143, 28, 152]) {
      assert.match(releaseNotes, new RegExp(`\\(#${issue}\\)`));
    }
    assert.doesNotMatch(readme, /\b0\.[456]\.\d+\b/);
    assert.ok(readme.includes("https://github.com/glitchwerks/vscode-claude-workspaces/blob/main/" + VERSIONING_POLICY_PATH));
    assert.match(
      readme,
      /code --install-extension cbeaulieu-gt\.vscode-claude-workspaces\s*$/m
    );
    assert.match(
      readme,
      /code --install-extension cbeaulieu-gt\.vscode-claude-workspaces --pre-release/
    );
    assert.match(versioningPolicy, /published `v0\.9\.0` snapshot[\s\S]*promoted unchanged to stable 0\.10\.0/i);
    assert.doesNotMatch(versioningPolicy, /Pending bugfix pre-release/i);
    assert.match(versioningPolicy, /npm run package:stable/);
    assert.match(versioningPolicy, /npm run package:prerelease/);
    assert.match(versioningPolicy, /promote the latest validated odd-minor\s+pre-release/i);
    assert.match(
      versioningPolicy,
      /Subsequent feature pull requests target\s+`prerelease\/0\.9\.x`/i
    );
    assert.match(versioningPolicy, /prerelease\/0\.9\.x/);
    assert.match(versioningPolicy, /release\/0\.8\.1/);
    assert.match(versioningPolicy, /selective promotion/i);
    assert.match(versioningPolicy, /full promotion/i);
    assert.match(versioningPolicy, /forward-port/i);
    assert.match(versioningPolicy, /source PR[\s\S]{0,100}squash commit/i);
    assert.ok(markdownLinks(contributing).includes(VERSIONING_POLICY_PATH));
    assert.doesNotMatch(contributing, /\b0\.[345]\.\d+\b/);
    assert.match(contributing, /base[\s\S]{0,100}active pre-release branch/i);
    assert.doesNotMatch(
      contributing,
      /use a focused branch based on the latest `main`/i
    );
    assert.match(readme, /versioned pre-release branch/i);
  });

  it("preserves promotion acceptance history and immutable screenshot sources", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    const notes = extractChangelogSection(fs.readFileSync("CHANGELOG.md", "utf8"), "0.12.0");
    assert.ok(notes);
    assert.match(notes, /ef5fd48f4b676881a8730afbf8e583e70565ca11/);
    assert.match(notes, /not\s+verified fixed/i);
    for (const issue of [56, 145, 158, 180, 183, 217]) {
      assert.match(notes, new RegExp("#" + issue + "\\b"));
    }
    for (const image of SCREENSHOT_PATHS) {
      assert.ok(readme.includes("https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/ef5fd48f4b676881a8730afbf8e583e70565ca11/" + image));
    }
  });

  it("pins integration coverage to the minimum and latest supported VS Code hosts", () => {
    const testConfig = fs.readFileSync(".vscode-test.js", "utf8");

    assert.match(testConfig, /version: "1\.128\.0"/);
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

  it("contributes the default-enabled native waiting-session notification setting", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      readonly contributes?: {
        readonly configuration?: {
          readonly properties?: Record<string, {
            readonly type?: unknown;
            readonly default?: unknown;
            readonly description?: unknown;
          }>;
        };
      };
    };

    assert.deepEqual(
      manifest.contributes?.configuration?.properties?.[
        "claudeWorkspaces.waitingSessionNotifications"
      ],
      {
        type: "boolean",
        default: true,
        description: "Controls native Windows notifications when a managed background session needs input."
      }
    );
  });

  it("documents live diagnostic verbosity and its redaction boundary", () => {
    const readme = fs.readFileSync(USER_GUIDE_PATH, "utf8");

    assert.match(readme, /claudeWorkspaces\.logLevel/);
    assert.match(readme, /`off`, `error`, `warn`, `info`, `debug`, or `trace`/);
    assert.match(readme, /defaults? to `?info`?/i);
    assert.match(readme, /appl(?:y|ies|ied) immediately/i);
    assert.match(readme, /\*\*Claude Workspaces\*\* Output channel/);
    assert.match(
      readme,
      /The channel never logs Claude prompts, responses, terminal traffic, environment\s+values, or sensitive carrier arguments\./
    );
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

  it("offers both sidebar placements and an expanded startup preference", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const properties = manifest.contributes.configuration.properties;
    assert.ok(properties["claudeWorkspaces.sessionSidebarPosition"]);
    assert.deepEqual(properties["claudeWorkspaces.sessionSidebarPosition"].enum, ["left", "right"]);
    assert.equal(properties["claudeWorkspaces.sessionSidebarPosition"].default, "right");
    assert.equal(properties["claudeWorkspaces.sessionSidebarPosition"].scope, "window");
    assert.equal(properties["claudeWorkspaces.sessionSidebarInitiallyExpanded"].type, "boolean");
    assert.equal(properties["claudeWorkspaces.sessionSidebarInitiallyExpanded"].default, true);
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
      const sourceUrl = "https://raw.githubusercontent.com/glitchwerks/vscode-claude-workspaces/" +
        "ef5fd48f4b676881a8730afbf8e583e70565ca11/" + screenshotPath;
      assert.ok(imagePaths.includes(sourceUrl),
        `README does not embed ${screenshotPath} with nonempty alt text`);
    });
  }
});

describe("companion qualification preparation",()=>{
  function harness() {
    const file=path.resolve("test/manual/companionNative.smoke.cjs");
    assert.ok(fs.existsSync(file),"import-safe companion qualification launcher is missing");
    return createRequire(__filename)(file) as {
      parseArguments(args:string[]):{mode:string;config?:string}|undefined;
      pendingReceipt(mode:string):Record<string,unknown>;
      validateReceipt(value:unknown):{accepted:boolean;reasons:string[]};
      clipboardComparison(expected:string,actual:string):{equal:boolean;expectedSha256:string;actualSha256:string;expectedBytes:number;actualBytes:number};
      validateLiveConfig(value:unknown):unknown;
      readBoundedJson(file:string,limit:number):Promise<unknown>;
      createReceiptWriter(file:string,io:{open(file:string,flags:string):Promise<{writeFile(value:string):Promise<void>;sync():Promise<void>;close():Promise<void>}>;rename(from:string,to:string):Promise<void>}):(value:unknown)=>Promise<void>;
      runClipboardCase(literals:string[],io:{write(value:string):Promise<void>;read():Promise<string>;ready(index:number):Promise<boolean>}):Promise<{status:string;comparisons:unknown[]}>;
      inspectFreshCapture(document:Document,challenge:{literal:string;nonce:string;installedExtension:string}):{viewId:string;targetId:string;groupId:string}|undefined;
      collectReceipt(receipt:Record<string,unknown>,operations:{save(value:unknown):Promise<void>;execute(control:{stage(name:string):void;checkpoint():Promise<void>;deadline():Error}):Promise<void>;cleanup():Promise<void>}):Promise<void>;
      collectionExitCode(host:{code:number|null;timedOut:boolean},receipt:unknown):number;
      runOwnedHost(executable:string,args:string[],timeoutMs:number):Promise<{code:number|null;timedOut:boolean;stdoutBytes:number;stderrBytes:number}>;
      activateInstalledCandidate(extension:unknown,root:string):Promise<void>;
      measurePublicationUpperBound(publish:()=>Promise<void>,ready:()=>Promise<boolean>,now:()=>number):Promise<number>;
      summarizeUpperBounds(samples:number[]):{p95ReadyCopyMs:number;latencyGate:string;timingBoundary:string};
      createSyntheticProducer(root:string,environment:Record<string,string>):Promise<{publisher:{poll():Promise<void>;snapshot():{phase:string};enqueue(value:unknown,window:unknown):boolean;window():unknown};stop():Promise<void>}>;
    };
  }
  /** Fully populated synthetic evidence tests schema acceptance, never actual qualification. */
  function acceptedReceipt() {
    const api=harness();const sha="a".repeat(64);const nonce="b".repeat(32);
    const fixture=createRequire(__filename)(path.resolve("test/fixtures/companion/qualification.json")) as {matrix:{id:string;kind:string;fixtureId?:string}[];commands:{id:string;literal:string}[]};
    const copies=createRequire(__filename)(path.resolve("test/fixtures/companion/copy-cases.json")) as {cases:{id:string;expected:{literal:string}[]}[]};
    const gates=fixture.matrix.map(item=>{
      const evidence:Record<string,unknown>={observed:true,artifactSha256:sha};
      if(item.kind==="clipboard") {
        const literals=item.fixtureId?copies.cases.find(value=>value.id===item.fixtureId)!.expected.map(value=>value.literal.replace(/\r?\n/g,"\r\n")):[fixture.commands.find(value=>value.id===item.id)!.literal];
        evidence.comparisons=literals.map(value=>api.clipboardComparison(value,value));
      } else if(item.kind==="performance") Object.assign(evidence,{sessions:4,durationMs:1800000,samples:50,p95ReadyCopyMs:100,timingBoundary:"before-publication-to-visible-ready-copy-upper-bound",transportBytes:100,transportFiles:2,globalRetentionBytes:100,sessionRetentionBytes:25,lostUnmarkedBlocks:0,ignoredTrafficSamples:1,duplicateSamples:1,machineSha256:sha,inputSamples:1,inputP95Ms:20});
      else evidence.kind="reviewed-native-observation";
      if(item.id==="native-escape")Object.assign(evidence,{escapeDispatches:1,inputSent:true,interruptionConfirmed:true});
      if(item.id==="producer-lifetime")Object.assign(evidence,{hostExited:true,independentProducerPending:true,parentRecreated:true,capacityRetained:true,transportBytes:100,transportFiles:2});
      if(item.id==="normal-observed-exit")evidence.normalExitObserved=true;
      return {id:item.id,status:"passed",evidence};
    });
    const literal="C:/synthetic/cw_"+nonce+".txt";
    const identity:Record<string,unknown>={sourceSha:"a".repeat(40),sourceFingerprint:sha,extensionVersion:"0.13.0",extensionSha256:sha,vsixSha256:sha,vscodeVersion:"1.136.1",platform:"win32",arch:"x64",node:"24.14.0",uv:"1.51.0",electron:"38.0.0",cliVersion:"2.1.322",cliBuild:"2.1.322",cliSha256:sha,schemaVersion:1,sdkSha256:sha};
    return {...api.pendingReceipt("packaged"),status:"passed",productionAdmission:true,finalReadBack:true,collectionComplete:true,identity,gates,
      authentication:{kind:"subscription",providerOverrideAbsent:true},freshCapture:{observed:true,route:"normal-installed-webview",nonce,sessionSha256:sha,viewSha256:sha,groupSha256:sha,targetSha256:sha,comparison:api.clipboardComparison(literal,literal)}};
  }
  it("accepts a complete closed synthetic receipt without claiming actual qualification",()=>{
    assert.deepEqual(harness().validateReceipt(acceptedReceipt()),{accepted:true,reasons:[]});
  });
  it("rejects unchecked nested identity, performance and unused gate union fields",()=>{
    const api=harness();const raw={rawTerminal:"SYNTHETIC_SHOULD_BE_REJECTED"};
    assert.equal(api.validateReceipt({...acceptedReceipt(),performance:raw}).accepted,false);
    for(const key of ["node","uv","electron","extensionVersion","vscodeVersion","cliVersion","cliBuild"]){
      for(const value of [raw,[],null,1,"1.2.3\n","1.2.3\r","1.2.3\u2028","1".repeat(70)+".2.3"]){
        const receipt=acceptedReceipt();receipt.identity[key]=value;assert.equal(api.validateReceipt(receipt).accepted,false,key+" must be a bounded version string");
      }
    }
    for(const key of ["sourceFingerprint","extensionSha256","vsixSha256","cliSha256","sdkSha256"]){
      const receipt=acceptedReceipt();receipt.identity[key]="a".repeat(64)+"\n";assert.equal(api.validateReceipt(receipt).accepted,false,"hash must have exactly 64 characters");
    }
    for(const [id,key] of [["path-P01","kind"],["four-session-performance","comparisons"],["native-escape","comparisons"],["producer-lifetime","normalExitObserved"],["normal-observed-exit","inputP95Ms"]]){
      const receipt=acceptedReceipt();const gate=receipt.gates.find(item=>item.id===id)!;assert.ok(gate,id);gate.evidence[key!]=raw;
      assert.equal(api.validateReceipt(receipt).accepted,false,"unused union field "+id+":"+key);
    }
    const receipt=acceptedReceipt();receipt.freshCapture.comparison={...receipt.freshCapture.comparison,actualSha256:raw} as unknown as typeof receipt.freshCapture.comparison;
    assert.equal(api.validateReceipt(receipt).accepted,false);
  });
  it("defaults to a non-executing plan and refuses implicit or ambiguous live requests",()=>{
    const api=harness();assert.deepEqual(api.parseArguments([]),{mode:"plan"});
    assert.deepEqual(api.parseArguments(["--plan"]),{mode:"plan"});
    for(const args of [["--run-live"],["--mode","packaged"],["--run-live","--mode","packaged","--config","relative.json"],["--plan","--run-live"],["--plan","--plan"],["--unknown"]])assert.equal(api.parseArguments(args),undefined);
    assert.deepEqual(api.parseArguments(["--run-live","--mode","bootstrap","--config",path.resolve("fixture.json")]),{mode:"bootstrap",config:path.resolve("fixture.json")});
  });
  it("cannot turn bootstrap, pending, incomplete or oversized receipts into qualification",()=>{
    const api=harness();
    const bootstrap=api.pendingReceipt("bootstrap");assert.equal(api.validateReceipt(bootstrap).accepted,false);
    assert.equal(api.validateReceipt({...bootstrap,mode:"packaged",status:"passed"}).accepted,false);
    assert.equal(api.validateReceipt(api.pendingReceipt("packaged")).accepted,false);
    for(const value of [null,{}, {status:"passed"}, {...bootstrap,rawTerminal:"x".repeat(2*1024*1024)}])assert.equal(api.validateReceipt(value).accepted,false);
  });
  it("compares literal clipboard bytes including surrounding spaces, CRLF and Unicode",()=>{
    const api=harness();const expected="  C:/fixture/雪 file.txt\r\n";
    const exact=api.clipboardComparison(expected,expected);assert.equal(exact.equal,true);assert.equal(exact.expectedBytes,Buffer.byteLength(expected));
    for(const actual of [expected.trim(),expected.replace("\r\n","\n"),expected.replace("雪","?")])assert.equal(api.clipboardComparison(expected,actual).equal,false);
    assert.equal("actual" in exact,false,"receipt must not retain uncontrolled clipboard content");
    assert.throws(()=>api.clipboardComparison("x","x".repeat(2*1024*1024)),/clipboard limit/);
  });
  it("requires an explicit pinned Windows host, candidate, SDK and CLI for live work",()=>{
    const api=harness();assert.equal(typeof api.validateLiveConfig,"function","live preflight validator is missing");
    for(const value of [null,{}, {profile:{platform:"win32",arch:"x64"}}, {authorization:"anything"}])assert.throws(()=>api.validateLiveConfig(value),/invalid live config/);
    const config={cliExecutable:path.resolve("synthetic-claude.exe"),cliVersion:"2.1.317",extensionsDirectory:path.resolve("synthetic-extensions"),
      installedExtension:path.resolve("synthetic-candidate"),playwrightModule:path.resolve("synthetic-playwright.cjs"),sdkFile:path.resolve("synthetic-sdk.d.ts"),
      sourceSha:"a".repeat(40),vscodeExecutable:path.resolve("synthetic-Code.exe"),vscodeVersion:"1.136.1",vsix:path.resolve("synthetic.vsix"),
      profile:{platform:"win32",arch:"x64",node:"24.14.0",uv:"1.51.0",electron:"38.0.0"}};
    assert.deepEqual(api.validateLiveConfig(config),config,"synthetic config validation is not profile qualification");
    assert.throws(()=>api.validateLiveConfig({...config,cliExecutable:"relative.exe"}),/invalid live config/);
    assert.throws(()=>api.validateLiveConfig({...config,providerOverride:true}),/invalid live config/);
  });
  it("saves allowlisted failure causes and signals failure separately from pending collection",async()=>{
    const api=harness();assert.equal(typeof api.collectReceipt,"function","sanitized collection boundary is missing");
    for(const stage of ["runtime-profile","cli-version","identity","activation","fresh-capture","performance","final-read-back"]){
      const receipt=api.pendingReceipt("packaged");const saved:Record<string,unknown>[]=[];let cleanups=0;
      await assert.rejects(api.collectReceipt(receipt,{save:async value=>{saved.push(JSON.parse(JSON.stringify(value)) as Record<string,unknown>);},
        execute:async control=>{control.stage(stage);throw new Error("SYNTHETIC_PRIVATE C:/private/output.txt");},cleanup:async()=>{cleanups++;}}),
      error=>error instanceof Error&&error.message==="qualification-failed:"+stage+":operation-failed");
      const final=saved.at(-1)!;assert.equal(final.status,"failed");assert.deepEqual(final.failure,{stage,reason:"operation-failed"});
      assert.equal(JSON.stringify(saved).includes("SYNTHETIC_PRIVATE"),false);assert.equal(JSON.stringify(saved).includes("C:/private"),false);assert.equal(cleanups,1);
      assert.equal(api.collectionExitCode({code:0,timedOut:false},final),1,"even a zero host exit cannot hide failed receipt");
    }
    const pending=api.pendingReceipt("packaged");await api.collectReceipt(pending,{save:async()=>{},execute:async control=>{control.stage("authentication");await control.checkpoint();},cleanup:async()=>{}});
    assert.equal(pending.status,"pending");assert.equal(pending.collectionComplete,true);assert.equal("failure" in pending,false);
    assert.equal(api.collectionExitCode({code:0,timedOut:false},pending),0);assert.equal(api.collectionExitCode({code:0,timedOut:true},pending),1);
    assert.equal(api.collectionExitCode({code:1,timedOut:false},pending),1);assert.equal(api.collectionExitCode({code:0,timedOut:false},api.pendingReceipt("packaged")),1);
    const failed=api.pendingReceipt("packaged");(failed.gates as {status:string}[])[0]!.status="failed";
    await assert.rejects(api.collectReceipt(failed,{save:async()=>{},execute:async()=>{},cleanup:async()=>{}}),/qualification-failed:matrix:gate-failed/);
  });
  it("retains safe checkpoint cleanup and deadline failures without accepting arbitrary reason text",async()=>{
    const api=harness();assert.equal(typeof api.collectReceipt,"function","sanitized collection boundary is missing");
    for(const kind of ["checkpoint","cleanup","deadline","unknown-stage"]){
      const receipt=api.pendingReceipt("packaged");let writes=0;let last:Record<string,unknown>|undefined;let cleaned=false;
      await assert.rejects(api.collectReceipt(receipt,{save:async value=>{writes++;if(kind==="checkpoint"&&writes===2)throw new Error("private write details");last=JSON.parse(JSON.stringify(value)) as Record<string,unknown>;},
        execute:async control=>{if(kind==="deadline")throw control.deadline();if(kind==="unknown-stage")control.stage("PRIVATE_CAUSE");await control.checkpoint();},
        cleanup:async()=>{cleaned=true;if(kind==="cleanup")throw new Error("private cleanup details");}}),error=>error instanceof Error&&/^qualification-failed:/.test(error.message)&&!error.message.includes("private"));
      assert.equal(cleaned,true);assert.equal(last!.status,"failed");assert.equal(JSON.stringify(last).includes("private"),false);assert.equal(JSON.stringify(last).includes("PRIVATE_CAUSE"),false);
      assert.deepEqual(last!.failure,{stage:kind==="unknown-stage"?"initialization":kind,reason:kind==="checkpoint"?"write-failed":kind==="deadline"?"deadline-exceeded":"operation-failed"});
    }
  });
  it("preserves and serializes checkpoints through write and replacement failures",async()=>{
    const api=harness();assert.equal(typeof api.createReceiptWriter,"function","checkpoint replacement writer is missing");
    const files=new Map<string,string>();const target=path.resolve("synthetic-owned/receipt.json");let failWrite=false;let failRename=false;
    let release:(()=>void)|undefined;let entered:(()=>void)|undefined;let activeWrites=0;let peakWrites=0;
    const io={open:async(file:string,flags:string)=>{assert.equal(flags,"wx");assert.equal(path.dirname(file),path.dirname(target));assert.equal(files.has(file),false);files.set(file,"");
      return {writeFile:async(value:string)=>{activeWrites++;peakWrites=Math.max(peakWrites,activeWrites);try {
        if(entered){const notify=entered;entered=undefined;notify();await new Promise<void>(resolve=>{release=resolve;});}
        if(failWrite){files.set(file,"{");throw new Error("private synthetic write cause");}files.set(file,value);
      } finally {activeWrites--;}},sync:async()=>{},close:async()=>{}};},
      rename:async(from:string,to:string)=>{if(failRename)throw new Error("private synthetic replace cause");files.set(to,files.get(from)!);files.delete(from);}};
    const save=api.createReceiptWriter(target,io);await save({sequence:1});
    failWrite=true;await assert.rejects(save({sequence:2}));assert.deepEqual(JSON.parse(files.get(target)!),{sequence:1});failWrite=false;
    failRename=true;await assert.rejects(save({sequence:3}));assert.deepEqual(JSON.parse(files.get(target)!),{sequence:1});failRename=false;
    const started=new Promise<void>(resolve=>{entered=resolve;});const first=save({sequence:4});await started;
    const mutable={sequence:5};const second=save(mutable);mutable.sequence=6;await Promise.resolve();
    assert.equal(activeWrites,1);assert.deepEqual(JSON.parse(files.get(target)!),{sequence:1});release!();await Promise.all([first,second]);
    assert.equal(peakWrites,1);assert.deepEqual(JSON.parse(files.get(target)!),{sequence:5},"snapshot must precede queuing");
    const count=files.size;await assert.rejects(save({payload:"x".repeat(262144)}),/receipt limit/);assert.equal(files.size,count);
  });
  it("bounds JSON reads before parsing and refuses linked receipt inputs",async()=>{
    const api=harness();assert.equal(typeof api.readBoundedJson,"function","bounded JSON reader is missing");
    await assert.rejects(api.readBoundedJson(path.resolve("package.json"),1),/input limit/);
    const manifest=await api.readBoundedJson(path.resolve("package.json"),128*1024) as {name:string};
    assert.equal(manifest.name,"vscode-claude-workspaces");
  });
  it("invalidates prior clipboard contents and never retries an uncertain platform write",async()=>{
    const api=harness();assert.equal(typeof api.runClipboardCase,"function","live clipboard transaction is missing");
    let value="C:/fixture/a.txt";let writes=0;
    const wrong=await api.runClipboardCase([value],{write:async text=>{value=text;writes++;},read:async()=>value,ready:async()=>true});
    assert.equal(wrong.status,"failed");assert.equal(writes,1,"prior clipboard cannot masquerade as a new Copy");
    writes=0;await assert.rejects(api.runClipboardCase(["x"],{write:async()=>{writes++;throw new Error("uncertain");},read:async()=>"x",ready:async()=>true}),/uncertain/);
    assert.equal(writes,1);
    const correct=await api.runClipboardCase(["  雪\r\n"],{write:async text=>{value=text;},read:async()=>value,ready:async()=>{value="  雪\r\n";return true;}});
    assert.equal(correct.status,"passed");
  });
  it("requires fresh admitted assistant output and a candidate-owned enabled Copy target",()=>{
    const api=harness();assert.equal(typeof api.inspectFreshCapture,"function","normal candidate observation predicate is missing");
    const nonce="1234567890abcdef1234567890abcdef",literal="C:/synthetic/cw_"+nonce+".txt";
    const dom=new JSDOM('<div id="app" data-companion-view-id="'+"a".repeat(32)+'"><div class="companion" data-mode="companion"><p class="companion-notice"></p><section class="companion-group companion-assistant" data-group-id="group"><span data-node-id="node"><code>'+literal+'</code><span><button data-target-id="target">Copy</button></span></span></section></div></div><script src="https://file+.vscode-resource.vscode-cdn.net/C:/candidate/dist/panel/webview/index.js"></script>');
    const challenge={nonce,literal,installedExtension:"C:/candidate"};
    assert.deepEqual(api.inspectFreshCapture(dom.window.document,challenge),{viewId:"a".repeat(32),targetId:"target",groupId:"group"});
    assert.equal(api.inspectFreshCapture(dom.window.document,{...challenge,nonce:"b".repeat(32)}),undefined);
    assert.equal(api.inspectFreshCapture(dom.window.document,{...challenge,installedExtension:"C:/development"}),undefined);
    const button=dom.window.document.querySelector("button")!;button.disabled=true;
    assert.equal(api.inspectFreshCapture(dom.window.document,challenge),undefined);button.disabled=false;
    dom.window.document.querySelector(".companion-notice")!.textContent="Capture unavailable";
    assert.equal(api.inspectFreshCapture(dom.window.document,challenge),undefined);
    dom.window.document.querySelector(".companion-notice")!.textContent="Earlier history is unavailable. ";
    assert.ok(api.inspectFreshCapture(dom.window.document,challenge),"a fresh current target remains observable after bounded history eviction");
    dom.window.close();
  });
  it("rejects claimed admission without fresh normal-path proof and rejects leaked receipt fields",()=>{
    const api=harness();const receipt={...api.pendingReceipt("packaged"),productionAdmission:true,finalReadBack:true};
    assert.ok(api.validateReceipt(receipt).reasons.includes("fresh-capture-unverified"));
    assert.ok(api.validateReceipt({...receipt,rawTerminal:"private"}).reasons.includes("unexpected-receipt-field"));
  });
  it("does not accept missing performance measurements as values within the limits",()=>{
    const api=harness();const receipt=api.pendingReceipt("packaged");
    const gates=receipt.gates as {id:string;status:string;evidence:unknown}[];
    const gate=gates.find(item=>item.id==="four-session-performance")!;
    gate.status="passed";gate.evidence={observed:true,artifactSha256:"a".repeat(64),sessions:4,durationMs:1800000,samples:50,p95ReadyCopyMs:100,timingBoundary:"source-receipt-to-visible-ready-copy",lostUnmarkedBlocks:0};
    assert.ok(api.validateReceipt(receipt).reasons.includes("performance-unconfirmed"));
  });
  it("bounds its owned host and records output counts without retaining raw process output",async function(){
    this.timeout(5000);const api=harness();assert.equal(typeof api.runOwnedHost,"function","bounded owned host launcher is missing");
    const done=await api.runOwnedHost(process.execPath,["-e","process.stdout.write('synthetic');process.stderr.write('private-fixture')"],2000);
    assert.equal(done.code,0);assert.equal(done.stdoutBytes,9);assert.equal(done.stderrBytes,15);assert.equal("stdout" in done,false);
    const stalled=await api.runOwnedHost(process.execPath,["-e","setTimeout(()=>{},10000)"],100);
    assert.equal(stalled.timedOut,true);
  });
  it("fails closed on malformed gate collections without throwing",()=>{
    const api=harness();
    for(const gates of [[null],[1],{}, {find:1}, ["passed"]]) {
      assert.equal(api.validateReceipt({...api.pendingReceipt("packaged"),gates}).accepted,false);
    }
  });
  it("requires the normal installed activation API without assuming a public ExtensionMode field",async()=>{
    const api=harness();assert.equal(typeof api.activateInstalledCandidate,"function","installed activation guard is missing");
    const extension={extensionPath:process.cwd(),isActive:false,packageJSON:{main:"./dist/extension.js"},activate:async()=>{extension.isActive=true;return {savedWorkspace:true};}};
    await api.activateInstalledCandidate(extension,process.cwd());
    await assert.rejects(api.activateInstalledCandidate({...extension,activate:async()=>({savedWorkspace:true,launchController:{}})},process.cwd()),/normal activation API/);
    await assert.rejects(api.activateInstalledCandidate({...extension,extensionPath:path.resolve("src")},process.cwd()),/candidate location/);
  });
  it("times before publication through observed ready with one clock and treats slow upper bounds as inconclusive",async()=>{
    const api=harness();assert.equal(typeof api.measurePublicationUpperBound,"function","conservative timing collector is missing");
    let clock=10;const order:string[]=[];
    const elapsed=await api.measurePublicationUpperBound(async()=>{order.push("publish");clock=30;},async()=>{order.push("ready");clock=110;return true;},()=>{order.push("clock");return clock;});
    assert.equal(elapsed,100);assert.deepEqual(order,["clock","publish","ready","clock"]);
    await assert.rejects(api.measurePublicationUpperBound(async()=>{},async()=>false,()=>1),/not observed/);
    assert.deepEqual(api.summarizeUpperBounds([100,200,300,400,500]),{p95ReadyCopyMs:500,latencyGate:"inconclusive-upper-bound",timingBoundary:"before-publication-to-visible-ready-copy-upper-bound"});
    assert.equal(api.summarizeUpperBounds([100,150,200]).latencyGate,"upper-bound-passed");
    for(const samples of [[],[NaN],[-1]])assert.throws(()=>api.summarizeUpperBounds(samples),/invalid timing samples/);
  });
  it("delivers synthetic observations through the real publisher and owned file protocol",async function(){
    this.timeout(5000);const api=harness();assert.equal(typeof api.createSyntheticProducer,"function","synthetic publisher adapter is missing");
    const disk=await diskCompanionHarness();let producer:Awaited<ReturnType<typeof api.createSyntheticProducer>>|undefined;
    try {
      const prepared=await disk.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);const binding=prepared.value;
      const events:unknown[]=[];const started=await disk.host.startProtocol(binding,{autoPoll:false,onEvent:event=>events.push(event)});assert.ok(started.ok);
      producer=await api.createSyntheticProducer(process.cwd(),{CLAUDE_WORKSPACES_CAPTURE_DIR:binding.directory,CLAUDE_WORKSPACES_CAPTURE_TOKEN:binding.token,
        CLAUDE_WORKSPACES_CAPTURE_SESSION_ID:binding.marker.sessionId,CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID:binding.marker.claudeSessionId,CLAUDE_WORKSPACES_CAPTURE_GENERATION:binding.marker.generation});
      const poll=async()=>{await producer!.publisher.poll();await started.value.poll();await new Promise(resolve=>setTimeout(resolve,10));};
      for(let i=0;i<50&&producer.publisher.snapshot().phase!=="active";i++)await poll();
      assert.equal(producer.publisher.snapshot().phase,"active");
      assert.equal(producer.publisher.enqueue({kind:"assistantRow",scope:{kind:"main"},rowId:"synthetic-performance",blocks:[{kind:"text",index:0,text:"`C:/synthetic/ready.txt`"}]},producer.publisher.window()),true);
      for(let i=0;i<50&&!events.some(event=>(event as {kind:string}).kind==="observation");i++)await poll();
      assert.ok(events.some(event=>(event as {kind:string;observation?:{rowId:string}}).kind==="observation"&&(event as {observation?:{rowId:string}}).observation?.rowId==="synthetic-performance"));
    } finally {await producer?.stop();await disk.dispose();}
  });
});
