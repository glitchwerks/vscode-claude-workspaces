import assert from "node:assert/strict";
import { listFiles } from "@vscode/vsce";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { JSDOM } from "jsdom";
import type * as TypeScript from "typescript";
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
    for(const developmentOnly of ["test/manual/companionNativeRendezvous.smoke.cjs","test/manual/companionNative.smoke.cjs","test/manual/companionNativeWebview.ts",
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
  for(const [label,extra] of [["string","SYNTHETIC_UNCHECKED_CONTENT"],["null",null]] as const) {
    it("rejects an appended "+label+" in an otherwise accepted gate matrix",()=>{
      const receipt=acceptedReceipt();const api=harness();assert.equal(api.validateReceipt(receipt).accepted,true);
      assert.equal(api.validateReceipt({...receipt,gates:[...receipt.gates,extra]}).accepted,false);
    });
  }
  it("checks the original exact gate count and rejects malformed or sparse members",()=>{
    const api=harness();const receipt=acceptedReceipt();assert.equal(api.validateReceipt(receipt).accepted,true);
    const invalid:unknown[]=[undefined,false,0,1,[],[receipt.gates[0]],{}];
    for(const extra of invalid){
      assert.equal(api.validateReceipt({...receipt,gates:[...receipt.gates,extra]}).accepted,false,"appended invalid member");
      const replaced:unknown[]=[...receipt.gates];replaced[0]=extra;
      assert.equal(api.validateReceipt({...receipt,gates:replaced}).accepted,false,"invalid member at original count");
    }
    const extendedSparse=[...receipt.gates];extendedSparse.length++;
    assert.equal(api.validateReceipt({...receipt,gates:extendedSparse}).accepted,false,"trailing sparse slot must not be filtered away");
    const sparse=[...receipt.gates];delete sparse[0];
    assert.equal(api.validateReceipt({...receipt,gates:sparse}).accepted,false,"sparse original slot");
    assert.equal(api.validateReceipt({...receipt,gates:receipt.gates.slice(1)}).accepted,false,"missing member");
    assert.equal(api.validateReceipt({...receipt,gates:[...receipt.gates,receipt.gates[0]]}).accepted,false,"extra object member");
    const duplicate=[...receipt.gates];duplicate[0]=duplicate[1]!;
    assert.equal(api.validateReceipt({...receipt,gates:duplicate}).accepted,false,"duplicate at original count");
    assert.equal(api.validateReceipt({...receipt,gates:{...receipt.gates}}).accepted,false,"non-array collection");
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


describe("Native Trial F source preparation", () => {
  const modulePath = path.resolve("test/manual/companionNativeRendezvous.smoke.cjs");
  it("ships an inert native rendezvous driver with explicit argument gates", async () => {
    assert.ok(fs.existsSync(modulePath), "Trial F source driver is missing");
    const driver = createRequire(__filename)(modulePath);
    assert.deepEqual(driver.parseArguments([]), { mode: "plan" });
    assert.deepEqual(driver.parseArguments(["--plan"]), { mode: "plan" });
    assert.deepEqual(driver.parseArguments(["--self-test"]), { mode: "self-test" });
    assert.equal(driver.parseArguments(["--run-live"]), undefined);
    assert.equal(driver.parseArguments(["--run-live", "--config", "relative.json"]), undefined);
    assert.equal(await driver.main([]), 0);
  });

  it("closes the live config and pins reviewed source/native/runtime identities", () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.validateConfig, "function", "closed live config is missing");
    // This pure Windows config fixture must not inherit the test host's path format.
    const config = { nativeExecutable: "C:/trial-f/native.exe", nativeSha256: "a".repeat(64),
      declarationPath: "C:/trial-f/external-sdk/index.d.ts", declarationSha256: d.DECLARATION_SHA256,
      nativeVersion: "2.1.322", sourceSha: "b".repeat(40), ownedParent: "C:/trial-f/.tmp",
      hostProfile: { platform: "win32", arch: "x64", node: "24.14.0", uv: "1.51.0", electron: null } };
    assert.deepEqual(d.validateConfig(config), config);
    const relocated = { ...config, declarationPath: "D:/reviewed-sdk/index.d.ts" };
    assert.deepEqual(d.validateConfig(relocated), relocated, "same pinned identity may be supplied at another absolute path");
    for (const key of ["nativeExecutable", "declarationPath", "ownedParent"] as const) {
      for (const invalid of ["relative.exe", "/tmp/native.exe", "\\\\server\\share\\native.exe", "file:///C:/trial-f/native.exe", "C:relative.exe"]) {
        assert.throws(() => d.validateConfig({ ...config, [key]: invalid }), /absolute-local-path/);
      }
    }
    for (const changed of [{ ...config, nativeVersion: "2.1.317" }, { ...config, extra: true },
      { ...config, nativeExecutable: "relative.exe" }, { ...config, nativeSha256: "x" },
      { ...config, declarationSha256: "f".repeat(64) },
      { ...config, hostProfile: { ...config.hostProfile, electron: "1.0.0" } }]) assert.throws(() => d.validateConfig(changed));
  });
  it("preserves only the exact PowerShell tool preference while rejecting auth and provider overrides", () => {
    const localRequire = createRequire(__filename);
    const vm = localRequire("node:vm");
    const context = { module: { exports: {} }, __dirname: path.dirname(modulePath),
      require: (name: string) => { assert.ok(name.startsWith("node:") && name !== "node:child_process"); return localRequire(name); } };
    vm.runInNewContext(fs.readFileSync(modulePath, "utf8") + "\nmodule.exports = { liveEnvironment };", context);
    const { liveEnvironment } = context.module.exports as { liveEnvironment(input: Record<string, string>): Record<string, string> };
    for (const key of ["CLAUDE_CODE_USE_POWERSHELL_TOOL", "claude_code_use_powershell_tool", "Claude_Code_Use_PowerShell_Tool"]) {
      for (const value of ["0", "1"]) {
        const input = Object.freeze({ [key]: value, SYNTHETIC_UNRELATED: "retained" });
        const output = liveEnvironment(input);
        assert.deepEqual({ ...output }, { ...input, DISABLE_AUTOUPDATER: "1" });
        assert.deepEqual(input, { [key]: value, SYNTHETIC_UNRELATED: "retained" });
        assert.notEqual(output, input);
      }
    }
    const blocked = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR",
      "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CODE_USE_UNKNOWN",
      "CLAUDE_CODE_USE_POWERSHELL_TOOL_SUFFIX", "CLAUDE_CODE_USE_POWERSHELL_TOOLS", "CLAUDE_CODE_USE_POWERSHELL_TOOL ",
      "CLAUDE_CODE_USE_POWERſHELL_TOOL", "CLAUDE_CODE_USE_POWERSHELL_TOOL\n"];
    for (const name of blocked) for (const key of [name, name.toLowerCase()]) {
      for (const shell of [{}, { CLAUDE_CODE_USE_POWERSHELL_TOOL: "1" }] as Record<string, string>[]) {
        assert.throws(() => liveEnvironment({ ...shell, [key]: "synthetic-nonempty" }), /auth-unverified/);
      }
      assert.equal(liveEnvironment({ [key]: "" })[key], "", "empty inherited values keep their existing behavior");
    }
  });

  it("bundles a real native hook, forwards unmatched operations, and holds one unchanged write", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.createControlPluginSource, "function", "native hook generator is missing");
    const { transformSync } = createRequire(__filename)("esbuild");
    const vm = createRequire(__filename)("node:vm");
    const crypto = createRequire(__filename)("node:crypto");
    const source = d.createControlPluginSource({ target: "C:/synthetic/request.upload", control: "C:/control", nonce: "a".repeat(32) });
    const transformed = transformSync(source, { format: "cjs", loader: "js" }).code;
    const context = { module: { exports: {} }, exports: {}, TextEncoder, Uint8Array, crypto: crypto.webcrypto, performance };
    vm.runInNewContext(transformed, context);
    type NativeHook = (...args: unknown[]) => Promise<unknown>;
    type HookRegister = (name: string, call: NativeHook) => { catch(handler: NativeHook): void };
    const hooks = new Map<string, { call: NativeHook; caught?: NativeHook }>();
    (context.module.exports as { register(on: HookRegister): void }).register((name: string, call: NativeHook) => {
      const entry = { call, caught: undefined as NativeHook | undefined }; hooks.set(name, entry);
      return { catch: (caught: NativeHook) => { entry.caught = caught; } };
    });
    const hook = hooks.get("fs.write")!;
    assert.ok(hook.caught, "guard must not silently fail open");
    const writes = new Map<string, string>(); let released = false; let forwards = 0;
    const $ = { fs: { write: async (p: string, text: string) => { writes.set(p, text); }, exists: async () => released },
      clock: { sleep: async () => { released = true; } } };
    const e = Object.freeze({ path: "C:/synthetic/request.upload", text: "synthetic original" });
    const next = Object.assign(async (actual: unknown) => { assert.equal(actual, e); forwards++; },
      { origin: { plugin: "other", tier: "user" }, signal: new AbortController().signal, budget: { remainingMs: 9000 }, trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: e }] });
    await hook.call($, e, next); assert.equal(forwards, 1); assert.equal(writes.size, 0);
    next.origin.plugin = "workspaces-attention";
    await hook.call($, e, next); assert.equal(forwards, 2);
    const entry = JSON.parse(writes.get("C:/control/entry.json")!);
    assert.equal(entry.sha256, createHash("sha256").update(e.text).digest("hex"));
    assert.equal(entry.bytes, Buffer.byteLength(e.text)); assert.equal(entry.forwardCount, 0);
    assert.equal(JSON.parse(writes.get("C:/control/forward.json")!).forwardCount, 1);
    assert.ok(writes.has("C:/control/returned.json"));
    assert.equal(JSON.parse(writes.get("C:/control/returned.json")!).coreCalls, 1, "actual engine continuation must be witnessed");
    await assert.rejects(() => hook.call($, e, next), /duplicate/);
    assert.equal(forwards, 2, "matching duplicate must never be forwarded");
    (context.module.exports as { register(on: HookRegister): void }).register((name, call) => {
      const entry = { call, caught: undefined as NativeHook | undefined }; hooks.set(name, entry);
      return { catch: caught => { entry.caught = caught; } };
    });
    const abort = new AbortController(); abort.abort(); next.signal = abort.signal; writes.clear();
    await assert.rejects(() => hooks.get("fs.write")!.call($, e, next), /abandoned/);
    assert.equal(forwards, 2); assert.equal(writes.size, 0);
    const denied = await hooks.get("fs.write")!.caught!($, e, next);
    assert.equal((denied as { deny: string }).deny, "trial-f-hook-failed");
    assert.equal(JSON.parse(writes.get("C:/control/failed.json")!).reason, "abandoned");
  });

  it("requires ordered real observations for both holds and rejects early, abandoned, missing or leaked evidence", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.observeTrial, "function", "bounded Trial F controller is missing");
    for (const holdMs of [100, 3000]) {
      let now = 0; let released = false; let checkpoints = 0;
      const sha256 = "a".repeat(64), nonce = "b".repeat(32);
      const entry = { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 20, sha256, forwardCount: 0 };
      const state = () => ({ started: { nonce, version: "2.1.322", turns: 0 }, entry,
        forward: released ? { nonce, forwardCount: 1 } : null,
        returned: released ? { nonce, dispatch: "returned", forwardCount: 1, coreCalls: 1 } : null,
        rejected: null, failed: null, unexpected: null, producerAlive: true, hostAlive: true,
        file: released ? { bytes: 20, sha256 } : null });
      const ops = { now: () => now, sleep: async (ms: number) => { now += ms; }, read: async () => state(),
        release: async () => { released = true; }, checkpoint: async () => { checkpoints++; } };
      const result = await d.observeTrial(ops, { nonce, holdMs });
      assert.equal(result.status, "observed"); assert.ok(result.holdMs >= holdMs); assert.ok(checkpoints >= 3);
      assert.equal(d.validateTrial(result), true);
      for (const mutation of [{ ...result, holdMs: -1 }, { ...result, extra: "private" },
        { ...result, events: result.events.slice().reverse() }, { ...result, forwardCount: 2 },
        { ...result, actualSha256: "c".repeat(64) }, { ...result, producerQuiescent: true }]) assert.equal(d.validateTrial(mutation), false);
      for (const mutation of [{ file: { bytes: 20, sha256 } }, { failed: { nonce, reason: "abandoned" } },
        { entry: { ...entry, text: "private" } }, { producerAlive: false }, { unexpected: { nonce, reason: "unexpected-activity" } }]) {
        now = 0; released = false;
        const failed = await d.observeTrial({ ...ops, read: async () => ({ ...state(), ...mutation }) }, { nonce, holdMs });
        assert.notEqual(failed.status, "observed"); assert.equal(released, false);
      }
      now = 0; released = false;
      const missing = await d.observeTrial({ ...ops, read: async () => ({ ...state(), entry: null }) }, { nonce, holdMs });
      assert.equal(missing.reason, "rendezvous-timeout"); assert.ok(now <= 60000);
    }
  });
  it("generates an actual capture host and keeps live orchestration behind the argument gate", () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.createHostSource, "function", "actual host generator is missing");
    const source = d.createHostSource(path.resolve("src/companion/companionCapture.ts"));
    assert.match(source, /new CompanionCapture/); assert.match(source, /startProtocol/);
    assert.match(source, /markProducerExposed/); assert.doesNotMatch(source, /confirmManagedPtyExit|writeFile|fakeNode/);
    assert.equal(typeof d.runLive, "function", "runnable live controller is missing");
  });

  it("rejects incomplete Trial F receipts and leaves every production/lifetime gate pending", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.selfTest, "function", "safe self-test is missing");
    const result = await d.selfTest();
    assert.equal(result.synthetic, true); assert.equal(result.nativeExecuted, false);
    assert.equal(result.tests, 2);
    assert.equal(d.validateReceipt(result.receipt), true);
    for (const mutation of [{ ...result.receipt, extra: "private" }, { ...result.receipt, productionAdmission: true },
      { ...result.receipt, trials: result.receipt.trials.slice(0, 1) }, { ...result.receipt, lifetimeTrials: "passed" },
      { ...result.receipt, teardown: new Array(2) },
      { ...result.receipt, after: { ...result.receipt.after, native: "f".repeat(64) } },
      { ...result.receipt, sources: [{ path: "C:/private", sha256: "a".repeat(64) }] }]) assert.equal(d.validateReceipt(mutation), false);
    assert.equal(await d.main(["--self-test"]), 0);
  });
  it("classifies checkpoint failures and never releases an unacknowledged operation", async () => {
    const d = createRequire(__filename)(modulePath); let releases = 0;
    const result = await d.observeTrial({ now: () => 0, read: async () => { throw new Error("private content"); },
      release: async () => { releases++; }, checkpoint: async () => { throw new Error("private path"); } },
      { nonce: "a".repeat(32), holdMs: 100 });
    assert.equal(result.status, "failed"); assert.equal(result.reason, "checkpoint-failed"); assert.equal(releases, 0);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  });

  it("does not load child processes or the native adapter on import or plan", async () => {
    const vm = createRequire(__filename)("node:vm"); const localRequire = createRequire(__filename);
    const loaded: string[] = [];
    const context = { module: { exports: {} }, __dirname: path.dirname(modulePath), console: { log() {} },
      require: (name: string) => { loaded.push(name); assert.ok(name.startsWith("node:") && name !== "node:child_process"); return localRequire(name); } };
    vm.runInNewContext(fs.readFileSync(modulePath, "utf8"), context);
    for (const args of [["--plan"], ["--diagnostic-plan"]]) assert.equal(await (context.module.exports as { main(args: string[]): Promise<number> }).main(args), 0);
    assert.ok(!loaded.some(name => /pty|child_process/.test(name)));
  });
  it("bundles the emitted host from actual capture source without starting it", async () => {
    const d = createRequire(__filename)(modulePath);
    const { build } = createRequire(__filename)("esbuild");
    const result = await build({ stdin: { contents: d.createHostSource(path.resolve("src/companion/companionCapture.ts")), resolveDir: process.cwd() },
      bundle: true, platform: "node", format: "cjs", write: false });
    assert.match(result.outputFiles[0].text, /unsupported capture backend/);
    assert.match(result.outputFiles[0].text, /companion-admission/);
  });

  it("bounds original-upload reads and owned termination without granting cleanup", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.readUpload, "function", "bounded upload reader is missing");
    const temp = fs.mkdtempSync(path.resolve(".tmp/trial-f-source-test-"));
    try {
      const file = path.join(temp, "original.upload"); fs.writeFileSync(file, "synthetic bytes");
      assert.deepEqual(await d.readUpload(file), { bytes: 15, sha256: createHash("sha256").update("synthetic bytes").digest("hex") });
      fs.writeFileSync(file, Buffer.alloc(4097)); await assert.rejects(() => d.readUpload(file));
    } finally { fs.rmSync(temp, { recursive: true }); }
    let killed = 0;
    const uncertain = { pty: { terminate: async () => new Promise(() => {}) }, host: { kill() { killed++; } }, teardownEvents: [] as string[] };
    assert.equal(await d.stopOwned(uncertain, 1), false);
    assert.equal(killed, 1, "failed-trial exception stops only the owned H1 once");
    assert.deepEqual(uncertain.teardownEvents, ["producer-exit-unobserved", "emergency-host-stop", "owned-process-cleanup-unresolved"]);
    assert.equal(await d.stopOwned(uncertain, 1), false); assert.equal(killed, 1);
  });

  it("requires an actual owned PID liveness check and refuses uncertain probes", () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.processAlive, "function", "owned PID probe is missing");
    let calls = 0;
    assert.equal(d.processAlive(123, (pid: number, signal: number) => { assert.equal(pid, 123); assert.equal(signal, 0); calls++; }), true);
    assert.equal(calls, 1);
    assert.equal(d.processAlive(undefined, () => { calls++; }), false);
    assert.equal(d.processAlive(123, () => { throw new Error("uncertain"); }), false);
  });

  it("keeps receipt hold duration consistent when observation and release consume real time", async () => {
    const d = createRequire(__filename)(modulePath); let time = 0, released = false;
    const nonce = "c".repeat(32), sha256 = "a".repeat(64);
    const result = await d.observeTrial({ now: () => { time += 0.125; return time; }, sleep: async (ms: number) => { time += ms; }, checkpoint: async () => { time += 1; },
      release: async () => { time += 2; released = true; }, read: async () => ({ producerAlive: true, hostAlive: true,
        started: { nonce, version: "2.1.322", turns: 0 }, entry: { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: 10, sha256, forwardCount: 0 },
        forward: released ? { nonce, forwardCount: 1 } : null, returned: released ? { nonce, dispatch: "returned", forwardCount: 1, coreCalls: 1 } : null,
        file: released ? { bytes: 10, sha256 } : null }) }, { nonce, holdMs: 100 });
    assert.equal(d.validateTrial(result), true);
  });

  it("bounds the launcher even when an owned operation never settles", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.runWithBudget, "function", "hard controller deadline is missing");
    let expired = 0;
    await assert.rejects(() => d.runWithBudget(() => new Promise(() => {}), 1, () => { expired++; }), /controller-deadline/);
    assert.equal(expired, 1);
    assert.equal(await d.runWithBudget(async () => 7, 100, () => { expired++; }), 7); assert.equal(expired, 1);
  });

  it("fails a stalled rendezvous read within its deadline without a late release", async () => {
    const d = createRequire(__filename)(modulePath); let release = 0;
    const result = await d.observeTrial({ now: () => 0, read: async () => new Promise(() => {}),
      release: async () => { release++; }, checkpoint: async () => {} }, { nonce: "a".repeat(32), holdMs: 100, timeoutMs: 1 });
    assert.equal(result.status, "unestablished"); assert.equal(result.reason, "rendezvous-timeout"); assert.equal(release, 0);
  });

  it("exits the standalone live launcher after a settled failure with unresolved handles", async () => {
    const vm = createRequire(__filename)("node:vm"), localRequire = createRequire(__filename);
    for (const args of [["--run-live", "--config", path.resolve(".tmp/synthetic-config.json")], ["--run-diagnostic", "--config", path.resolve(".tmp/synthetic-config.json")], ["--plan"], ["--diagnostic-plan"], ["--self-test"]]) {
      const moduleObject = { exports: {} }, timers = new Set<unknown>(), exits: number[] = [];
      const loader = Object.assign((name: string) => name === "./companionNative.smoke.cjs" ? { readBoundedJson: async () => ({}) } : localRequire(name), { main: moduleObject });
      const processObject = { argv: ["node", "synthetic", ...args], exitCode: undefined as number | undefined, exit: (code: number) => { exits.push(code); } };
      const source = fs.readFileSync(modulePath, "utf8"); const boundary = source.lastIndexOf("if (require.main === module)");
      const controlled = source.slice(0, boundary) + "runLive = async () => ({ status: 'unestablished', reason: 'teardown-unsettled' });\n" + source.slice(boundary);
      vm.runInNewContext(controlled, { module: moduleObject, require: loader, __dirname: path.dirname(modulePath), process: processObject,
        console: { log() {}, error() {} }, Buffer, structuredClone,
        setTimeout: (callback: () => void) => { timers.add(callback); return callback; }, clearTimeout: (id: unknown) => { timers.delete(id); } });
      for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
      if (["--run-live", "--run-diagnostic"].includes(args[0] ?? "")) assert.deepEqual(exits, [1], "exitCode plus a cleared timer leaves live handles unbounded");
      else { assert.deepEqual(exits, []); assert.equal(processObject.exitCode, 0); }
      assert.equal(timers.size, 0);
    }
  });

  it("tracks inspection children through timeout, overflow, failed kills and late close", async () => {
    const vm = createRequire(__filename)("node:vm"), localRequire = createRequire(__filename);
    const { EventEmitter } = localRequire("node:events");
    for (const fault of ["none", "timeout", "overflow", "kill-false", "kill-throw"]) {
      const timers = new Map<() => void, number>(); let kills = 0, spawns = 0, resolved = false;
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { kills++; if (fault === "kill-throw") throw new Error("private native text"); return fault !== "kill-false"; };
      const owner = { inspections: [] as Array<{ child: unknown; closed: boolean }> };
      const context = { module: { exports: {} }, __dirname: path.dirname(modulePath), Buffer,
        require: (name: string) => name === "node:child_process" ? { spawn: () => { spawns++; return child; } } : localRequire(name),
        setTimeout: (callback: () => void, ms: number) => { timers.set(callback, ms); return callback; }, clearTimeout: (callback: () => void) => { timers.delete(callback); } };
      vm.runInNewContext(fs.readFileSync(modulePath, "utf8") + ";module.exports.inspectCli = inspectCli;", context);
      const d = context.module.exports as { inspectCli(exe: string, args: string[], cwd: string, env: object, owner: object): Promise<{ code: number | null; output: string; exitObserved: boolean; reason: string; termination: string }> };
      const pending = d.inspectCli("synthetic-native", ["--version"], "synthetic-workspace", {}, owner).then(result => { resolved = true; return result; });
      const fire = () => { const callback = timers.keys().next().value; assert.ok(callback); timers.delete(callback); callback(); };
      if (fault === "none") { child.stdout.emit("data", Buffer.from("2.1.322")); child.emit("close", 0); }
      else {
        if (fault === "timeout") fire();
        else assert.doesNotThrow(() => child.stdout.emit("data", Buffer.alloc(65537)));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolved, false, "termination request is not observed child close");
        fire();
      }
      const result = await pending;
      assert.equal(result.exitObserved, fault === "none");
      assert.equal(owner.inspections.length, 1); assert.equal(owner.inspections[0]?.child, child);
      if (fault === "none") {
        assert.equal(result.code, 0); assert.equal(result.output, "2.1.322"); assert.equal(result.reason, "none");
        const next = d.inspectCli("synthetic-native", ["auth", "status"], "synthetic-workspace", {}, owner);
        child.emit("close", 0); assert.equal((await next).exitObserved, true); assert.equal(spawns, 2);
      }
      else {
        assert.equal(result.code, null); assert.equal(result.output, ""); assert.equal(kills, 1);
        assert.equal(result.termination, fault.startsWith("kill-") ? "request-failed" : "requested");
        await assert.rejects(() => d.inspectCli("synthetic-native", ["auth", "status"], "synthetic-workspace", {}, owner), /inspection-unresolved/);
        assert.equal(spawns, 1);
        child.emit("close", 0);
        assert.equal(owner.inspections[0]?.closed, true); assert.equal(result.exitObserved, false, "late close cannot rewrite the returned uncertainty");
      }
      assert.equal(timers.size, 0);
      assert.doesNotMatch(JSON.stringify(result), /private|synthetic-native|synthetic-workspace/);
    }
  });

  it("latches late disqualifications across hash verification and teardown before allowing another trial", async () => {
    const d = createRequire(__filename)(modulePath);
    assert.equal(typeof d.finalizeTrial, "function", "whole-producer-lifetime validation is missing");
    for (const stage of ["verification", "teardown"]) for (const fault of ["none", "output-limit", "startup-interaction", "unexpected-activity", "hook-failed", "dispatch-rejected"]) {
      const receipt = (await d.selfTest()).receipt; let attempts = 0;
      for (const record of receipt.trials) {
        attempts++;
        const guard = d.createTrialGuard(); record.lifecycle = guard.state;
        const nonce = record.observation.nonce, sha256 = record.observation.originalSha256, bytes = record.observation.bytes;
        let late: string | undefined;
        const inject = () => {
          if (fault === "output-limit" || fault === "startup-interaction") guard.reject(fault);
          else if (fault !== "none") late = fault;
        };
        const accepted = await d.finalizeTrial(record, guard, {
          verify: async () => { await new Promise(resolve => setImmediate(resolve)); if (stage === "verification") inject(); },
          stop: async () => { await new Promise(resolve => setImmediate(resolve)); if (stage === "teardown") inject(); return true; },
          checkpoint: async () => {}, readStatus: async () => ({
            started: { nonce, version: "2.1.322", turns: 0 },
            entry: { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes, sha256, forwardCount: 0 },
            forward: { nonce, forwardCount: 1 }, returned: { nonce, dispatch: "returned", forwardCount: 1, coreCalls: 1 }, file: { bytes, sha256 },
            unexpected: late === "unexpected-activity" ? { nonce, reason: late } : null,
            failed: late === "hook-failed" ? { nonce, reason: late } : null,
            rejected: late === "dispatch-rejected" ? { nonce, dispatch: "rejected", forwardCount: 1 } : null }) });
        assert.equal(accepted, fault === "none");
        if (!accepted) { receipt.status = "unestablished"; receipt.reason = record.observation.reason; break; }
      }
      assert.equal(attempts, fault === "none" ? 2 : 1);
      assert.equal(d.validateReceipt(receipt), fault === "none", stage + ":" + fault);
      if (fault !== "none") {
        assert.equal(receipt.trials[0].lifecycle.status, "disqualified");
        assert.ok(receipt.trials[0].lifecycle.disqualifications.includes(fault));
        assert.notEqual(receipt.trials[0].observation.status, "observed");
      }
    }
  });



  it("keeps diagnostic opt-in explicit and separate from the two-hold Trial F mode", async () => {
    const d = createRequire(__filename)(modulePath), config = path.resolve(".tmp/synthetic-diagnostic.json");
    assert.deepEqual(d.parseArguments(["--diagnostic-plan"]), { mode: "diagnostic-plan" });
    assert.deepEqual(d.parseArguments(["--run-diagnostic", "--config", config]), { mode: "diagnostic", config });
    for (const args of [["--run-diagnostic"], ["--run-diagnostic", "--config", "relative.json"], ["--run-diagnostic", "--run-live", "--config", config]]) assert.equal(d.parseArguments(args), undefined);
    assert.equal(await d.main(["--diagnostic-plan"]), 0);
    assert.deepEqual(d.trialHolds("diagnostic"), [100]); assert.deepEqual(d.trialHolds("live"), [100, 3000]);
    assert.throws(() => d.trialHolds("unknown"));
  });

  /** Execute the emitted module with only synthetic SDK methods; no engine or native adapter. */
  function diagnosticFixture() {
    const req = createRequire(__filename), d = req(modulePath), vm = req("node:vm");
    const source = d.createControlPluginSource({ target: "C:/synthetic/request.upload", control: "C:/control", nonce: "a".repeat(32), diagnostic: true });
    const context = { module: { exports: {} }, exports: {}, TextEncoder, Uint8Array, crypto: req("node:crypto").webcrypto, performance };
    vm.runInNewContext(req("esbuild").transformSync(source, { format: "cjs", loader: "js" }).code, context);
    type Hook = (...args: any[]) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const hooks = new Map<string, Hook>();
    (context.module.exports as { register(on: (name: string, hook: Hook) => { catch(): void }): void }).register((name, hook) => { assert.equal(hooks.has(name), false); hooks.set(name, hook); return { catch() {} }; });
    const writes = new Map<string, string>();
    const sdk = { fs: { write: async (p: string, text: string) => { writes.set(p, text); }, exists: async () => true }, session: { version: async () => ({ base: "2.1.322", version: "2.1.322" }), turns: async () => 0 } };
    const invoke = async (name: string, event: object, value: unknown, options: { reject?: Error; plugin?: string; trace?: unknown[] } = {}) => {
      const hook = hooks.get(name); assert.ok(hook, "diagnostic hook missing: " + name); let calls = 0;
      const next = Object.assign(async (actual: unknown) => { calls++; assert.equal(actual, event); if (options.reject) throw options.reject; return value; },
        { origin: { plugin: options.plugin ?? "workspaces-attention", tier: "user" }, trace: options.trace ?? [], signal: new AbortController().signal, budget: { remainingMs: 9000 } });
      let rejected = false;
      try { const result = await hook(sdk, event, next); assert.equal(result, value); }
      catch (error) { rejected = true; assert.equal(error, options.reject); }
      assert.equal(rejected, options.reject !== undefined);
      assert.equal(calls, 1, "diagnostics must never replay the original continuation");
    };
    const events = () => [...writes.entries()].filter(([p]) => /diagnostic\.\d+\.json$/.test(p)).map(([, text]) => JSON.parse(text));
    return { d, hooks, writes, sdk, invoke, events };
  }



  it("reads diagnostic bytes only from bounded stable regular single-link handles", async () => {
    const req = createRequire(__filename), vm = req("node:vm"), payload = Buffer.from(' {"safe":true}');
    for (const fault of ["none", "link", "hardlink", "directory", "oversized", "handle-inode", "handle-device", "handle-directory", "handle-link", "grown", "changed-time", "path-swapped"]) {
      let opens = 0, closes = 0, offset = 0, stats = 0, lstats = 0;
      const stable = () => ({ isFile: () => true, isSymbolicLink: () => false, nlink: 1, ino: 5, dev: 2, size: payload.length, mtimeMs: 1, ctimeMs: 1 });
      const fakeFs = {
        lstat: async () => { const s = stable(); lstats++; if (fault === "link") s.isSymbolicLink = () => true; if (fault === "hardlink") s.nlink = 2; if (fault === "directory") s.isFile = () => false; if (fault === "oversized") s.size = 1537; if (fault === "path-swapped" && lstats > 1) s.ino++; return s; },
        open: async () => { opens++; return {
          stat: async () => { const s = stable(); stats++; if (fault === "handle-inode") s.ino++; if (fault === "handle-device") s.dev++; if (fault === "handle-directory") s.isFile = () => false; if (fault === "handle-link") s.nlink++; if (fault === "grown" && stats > 1) s.size++; if (fault === "changed-time" && stats > 1) s.mtimeMs++; return s; },
          read: async (b: Buffer, at: number, length: number) => { const count = Math.min(3, length, payload.length - offset); payload.copy(b, at, offset, offset + count); offset += count; return { bytesRead: count }; },
          close: async () => { closes++; }
        }; }
      };
      const context = { module: { exports: {} }, __dirname: path.dirname(modulePath), Buffer, require: (name: string) => name === "node:fs/promises" ? fakeFs : req(name) };
      vm.runInNewContext(fs.readFileSync(modulePath, "utf8"), context);
      const d = context.module.exports as { readDiagnosticBytes(file: string, limit: number): Promise<Buffer> };
      assert.equal(typeof d.readDiagnosticBytes, "function", "the collector needs exact bytes from a checked file handle");
      if (fault === "none") assert.deepEqual(await d.readDiagnosticBytes("PRIVATE_PATH", 1536), payload);
      else await assert.rejects(() => d.readDiagnosticBytes("PRIVATE_PATH", 1536), (e: Error) => e.message === "invalid-evidence", fault);
      assert.equal(closes, opens, fault);
    }
  });

  for (const mutation of ["whitespace", "duplicate-key"]) it("rejects semantic-equivalent raw checkpoint changes: " + mutation, async () => {
    const f = diagnosticFixture();
    await f.invoke("session.id", Object.freeze({}), Object.freeze({ value: "11111111-2222-3333-4444-555555555555" }));
    const scratch = path.resolve(".tmp"); fs.mkdirSync(scratch, { recursive: true });
    const directory = fs.mkdtempSync(path.join(scratch, "trial-f-integrity-"));
    try {
      for (const [file, text] of f.writes) fs.writeFileSync(path.join(directory, path.win32.basename(file)), text);
      const read = async (name: string, limit: number) => {
        try { return await f.d.readDiagnosticBytes(path.join(directory, name), limit); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
      };
      const clean = await f.d.collectDiagnostic(read, "a".repeat(32));
      assert.equal(clean.invalid, false); assert.equal(clean.events.length, 2);
      assert.equal(clean.integrity, "verified"); assert.equal(clean.status, "unverified");
      assert.equal(clean.writerOutcome, "unattested"); assert.equal(f.d.validDiagnosticEvidence(clean, "a".repeat(32)), true);
      const file = path.join(directory, "diagnostic.1.json"), original = fs.readFileSync(file, "utf8");
      const altered = mutation === "whitespace" ? " " + original : original.replace('"seq":1', '"seq":0,"seq":1');
      assert.deepEqual(JSON.parse(altered), JSON.parse(original));
      const marker = JSON.parse(fs.readFileSync(path.join(directory, "diagnostic.1.done.json"), "utf8"));
      assert.notEqual(Buffer.byteLength(altered), marker.bytes);
      assert.notEqual(createHash("sha256").update(altered).digest("hex"), marker.sha256);
      fs.writeFileSync(file, altered);
      const damaged = await f.d.collectDiagnostic(read, "a".repeat(32));
      assert.equal(damaged.invalid, true, "the marker must bind the exact file bytes, before JSON parsing");
      assert.equal(damaged.status, "unverified");
      assert.equal(damaged.events.some((e: { seq: number }) => e.seq === 1), false);
      assert.doesNotMatch(JSON.stringify(damaged), /11111111|C:\/|rawBytes/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("never qualifies a final completion write that stores bytes and then rejects", async () => {
    const f = diagnosticFixture(), d = f.d; let rejected = 0;
    const write = f.sdk.fs.write;
    f.sdk.fs.write = async (p, text) => { await write(p, text); if (p.endsWith("/diagnostic.24.done.json")) { rejected++; throw new Error("PRIVATE_AFTER_STORE"); } };
    await f.invoke("session.start", Object.freeze({}), Object.freeze({}), { trace: [{ plugin: "workspaces-attention", tier: "user", event: "session.start", outcome: "returned" }] });
    const control = { v: 1, token: "t".repeat(43), sessionId: "synthetic", claudeSessionId: "11111111-2222-3333-4444-555555555555", generation: "g", kind: "control", controlRevision: 1, state: "offered", offerId: "b".repeat(32), captureEpoch: null, grantId: null, predecessorEpoch: null, reasonCode: null, recoveriesRemaining: 1, lastRetired: null };
    await f.invoke("session.id", Object.freeze({}), Object.freeze({ value: control.claudeSessionId }));
    await f.invoke("session.version", Object.freeze({}), Object.freeze({ value: { base: "2.1.322", version: "2.1.322" } }));
    for (const [suffix, value] of Object.entries({ DIR: "C:/synthetic", TOKEN: control.token, SESSION_ID: control.sessionId, CLAUDE_SESSION_ID: control.claudeSessionId, GENERATION: control.generation })) await f.invoke("env.get", Object.freeze({ name: "CLAUDE_WORKSPACES_CAPTURE_" + suffix }), Object.freeze({ value }));
    await f.invoke("fs.stat", Object.freeze({ path: "C:/synthetic", resolve: true }), Object.freeze({ value: { kind: "dir", isLink: false, realPath: "C:/synthetic" } }));
    await f.invoke("fs.read", Object.freeze({ path: "C:/synthetic/control.json", as: "text" }), Object.freeze({ value: JSON.stringify(control) }));
    await f.invoke("fs.list", Object.freeze({ path: "C:/synthetic" }), Object.freeze({ value: [] }));
    const event = Object.freeze({ path: "C:/synthetic/request.upload", text: "synthetic unchanged" });
    await f.invoke("fs.write", event, Object.freeze({ value: undefined }), { trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: event }] });
    assert.equal(rejected, 1); assert.equal(f.events().length, 24);
    assert.ok(f.events().every(e => e.unverified === false), "the final snapshot predates its own write outcome");
    const native = await d.collectDiagnostic(async (name: string) => { const raw = f.writes.get("C:/control/" + name); return raw === undefined ? null : Buffer.from(raw); }, "a".repeat(32));
    const receipt = (await d.selfTest()).receipt;
    receipt.format = "native-trial-f-diagnostic-v1"; receipt.status = "unestablished"; receipt.reason = "invalid-evidence"; receipt.trials.length = 1; receipt.teardown.length = 1; receipt.inspections.length = 3;
    const observation = receipt.trials[0].observation;
    receipt.trials[0].diagnostic = { observationEnd: d.diagnosticObservationEnd(observation, 120), exits: { producer: d.diagnosticExit(0, undefined, 130), host: d.diagnosticExit(0, undefined, 140) }, native };
    assert.equal(d.validateDiagnosticReceipt(receipt), false, "a stored marker cannot attest that its SDK write resolved");
    assert.equal(native.status, "unverified"); assert.equal(native.integrity, "verified"); assert.equal(native.writerOutcome, "unattested");
    assert.equal(d.validateDiagnosticReceiptEvidence(receipt), true, "byte integrity does not establish writer success");
    assert.equal(d.validateReceipt(receipt), false);
    assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_AFTER_STORE|11111111|tttttttt/);
  });

  it("records first native startup and metadata stages without leaking values or changing continuations", async () => {
    const f = diagnosticFixture(), secret = "PRIVATE_SECRET_NEVER_PERSIST";
    await f.invoke("session.start", Object.freeze({ secret }), { untouched: secret }, { trace: [{ plugin: "workspaces-attention", tier: "user", event: "session.start", outcome: "returned", received: secret, returned: secret, reason: secret }] });
    await f.invoke("session.id", Object.freeze({}), { value: "11111111-2222-3333-4444-555555555555", secret });
    await f.invoke("session.version", Object.freeze({}), { value: { version: "2.1.322", base: "2.1.322", builtAt: secret }, secret });
    for (const suffix of ["DIR", "TOKEN", "SESSION_ID", "CLAUDE_SESSION_ID", "GENERATION"]) {
      await f.invoke("env.get", Object.freeze({ name: "CLAUDE_WORKSPACES_CAPTURE_" + suffix }), { value: suffix === "DIR" ? "C:/synthetic" : secret });
    }
    const prior = f.events().length;
    await f.invoke("env.get", Object.freeze({ name: secret }), { value: secret });
    await f.invoke("session.id", {}, { value: secret }, { plugin: secret });
    assert.equal(f.events().length, prior);
    assert.equal(prior, 16);
    const startup = f.events().find(e => e.stage === "startup" && e.phase === "returned");
    assert.equal(startup.trace.present, true); assert.equal(startup.trace.count, 1);
    assert.equal(f.events().find(e => e.stage === "id" && e.phase === "returned").checks.valid, true);
    assert.doesNotMatch(JSON.stringify(f.events()), /PRIVATE_SECRET|11111111|C:\/synthetic|builtAt|received/);
    for (const event of f.events()) assert.equal(f.d.validDiagnosticEvent(event, "a".repeat(32)), true);
  });

  it("bounds native diagnostic trace projection and preserves rejection and write-failure behavior", async () => {
    const f = diagnosticFixture(), secret = "PRIVATE_SECRET_NEVER_PERSIST";
    const trace = Array.from({ length: 10000 }, () => ({ plugin: "workspaces-attention", tier: "user", event: "session.start", outcome: "returned", received: { nested: secret }, returned: secret, reason: secret }));
    await f.invoke("session.start", {}, { secret }, { trace });
    const startup = f.events().find(e => e.stage === "startup" && e.phase === "returned");
    assert.equal(startup.trace.truncated, true); assert.equal(startup.trace.visited, 64); assert.equal(startup.trace.links.length, 8);
    const original = new Error(secret.repeat(10000));
    await f.invoke("session.id", {}, null, { reject: original });
    assert.equal(f.events().find(e => e.stage === "id" && e.phase === "rejected").unverified, false);
    const baseWrite = f.sdk.fs.write;
    f.sdk.fs.write = async (p, text) => { if (p.endsWith(".done.json")) throw original; await baseWrite(p, text); };
    await f.invoke("session.version", {}, { value: { version: "2.1.322", base: "2.1.322" } });
    f.sdk.fs.write = baseWrite;
    await f.invoke("env.get", { name: "CLAUDE_WORKSPACES_CAPTURE_DIR" }, { value: "C:/synthetic" });
    assert.equal(f.events().at(-1).unverified, true);
    for (let i = 0; i < 100; i++) await f.invoke("session.id", {}, { value: secret });
    assert.ok(f.events().length <= 26); assert.ok([...f.writes.values()].reduce((n, text) => n + Buffer.byteLength(text), 0) <= 65536);
    assert.doesNotMatch(JSON.stringify([...f.writes.values()]), /PRIVATE_SECRET/);
  });


  it("retains committed filesystem stage checks and rejects incomplete or poisoned diagnostic checkpoints", async () => {
    const f = diagnosticFixture(), privateText = "PRIVATE_SECRET_NEVER_PERSIST";
    const initial = { v: 1, token: "t".repeat(43), sessionId: "synthetic", claudeSessionId: "11111111-2222-3333-4444-555555555555", generation: "g", kind: "control", controlRevision: 1, state: "offered", offerId: "b".repeat(32), captureEpoch: null, grantId: null, predecessorEpoch: null, reasonCode: null, recoveriesRemaining: 1, lastRetired: null };
    await f.invoke("session.id", {}, { value: initial.claudeSessionId });
    for (const [suffix, value] of Object.entries({ DIR: "C:/synthetic", TOKEN: initial.token, SESSION_ID: initial.sessionId, CLAUDE_SESSION_ID: initial.claudeSessionId, GENERATION: initial.generation })) await f.invoke("env.get", { name: "CLAUDE_WORKSPACES_CAPTURE_" + suffix }, { value });
    await f.invoke("fs.stat", { path: "C:/synthetic", resolve: true }, { value: { kind: "dir", isLink: false, size: 0, mtimeMs: 1, realPath: "c:/synthetic", secret: privateText } });
    await f.invoke("fs.read", { path: "C:/synthetic/control.json", as: "text" }, { value: JSON.stringify(initial) });
    await f.invoke("fs.list", { path: "C:/synthetic" }, { value: [{ name: privateText, kind: "file", size: 1, mtimeMs: 1, isLink: false }] });
    await f.invoke("fs.write", { path: "C:/elsewhere/private", text: privateText }, { value: undefined }, { plugin: "private-plugin", trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned" }] });
    const before = f.events().length;
    await f.invoke("fs.write", { path: "C:/control/diagnostic.99.json", text: privateText }, { value: undefined });
    assert.equal(f.events().length, before, "diagnostic writes must not recursively record themselves");
    const event = { path: "C:/synthetic/request.upload", text: "synthetic unchanged" };
    await f.invoke("fs.write", event, { value: undefined }, { trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: event }] });
    const read = async (name: string) => { const raw = f.writes.get("C:/control/" + name); return raw === undefined ? null : Buffer.from(raw); };
    assert.equal(typeof f.d.collectDiagnostic, "function", "bounded committed-checkpoint collector missing");
    const evidence = await f.d.collectDiagnostic(read, "a".repeat(32));
    assert.equal(evidence.status, "unverified"); assert.equal(evidence.integrity, "verified"); assert.equal(f.d.validDiagnosticEvidence(evidence, "a".repeat(32)), true);
    const stat = evidence.events.find((e: { stage: string; phase: string }) => e.stage === "root-stat" && e.phase === "returned");
    assert.equal(stat.checks.realExact, false); assert.equal(stat.checks.realSlash, false); assert.equal(stat.checks.realCase, true); assert.equal(stat.checks.valid, false);
    const control = evidence.events.find((e: { stage: string; phase: string }) => e.stage === "control-read" && e.phase === "returned");
    for (const key of ["parsed", "schema", "dirEqual", "tokenEqual", "sessionEqual", "claudeEqual", "generationEqual", "nativeEqual"]) assert.equal(control.checks[key], true, key);
    const unmatched = evidence.events.find((e: { stage: string; phase: string }) => e.stage === "unmatched-write" && e.phase === "returned");
    assert.equal(unmatched.checks.pathExact, false); assert.equal(unmatched.checks.originMatch, false);
    assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_SECRET|private-plugin|C:\/|11111111|tttttttt/);
    for (const corrupt of ["missing-done", "wrong-hash", "unknown-field", "oversized", "out-of-order"]) {
      const damaged = await f.d.collectDiagnostic(async (name: string) => {
        const raw = await read(name); const data = raw === null ? null : JSON.parse(raw.toString("utf8"));
        if (name === "diagnostic.1.done.json") {
          if (corrupt === "missing-done") return null;
          if (corrupt === "wrong-hash") return Buffer.from(JSON.stringify({ ...data, sha256: "f".repeat(64) }));
        }
        if (name === "diagnostic.1.json") {
          if (corrupt === "unknown-field") return Buffer.from(JSON.stringify({ ...data, secret: privateText }));
          if (corrupt === "oversized") return Buffer.from(JSON.stringify({ ...data, secret: privateText.repeat(10000) }));
          if (corrupt === "out-of-order") return Buffer.from(JSON.stringify({ ...data, seq: 2 }));
        }
        return raw;
      }, "a".repeat(32));
      assert.equal(damaged.status, "unverified", corrupt); assert.equal(damaged.integrity, "unverified", corrupt); assert.doesNotMatch(JSON.stringify(damaged), /PRIVATE_SECRET/);
    }
    assert.equal(f.d.validDiagnosticEvidence({ ...evidence, secret: privateText }, "a".repeat(32)), false);
  });

  it("keeps a diagnostic receipt distinct and snapshots original observation and bounded exit classifications", async () => {
    const f = diagnosticFixture(), d = f.d;
    await f.invoke("session.start", {}, {}, { trace: [{ plugin: "workspaces-attention", tier: "user", event: "session.start", outcome: "returned" }] });
    const native = await d.collectDiagnostic(async (name: string) => { const raw = f.writes.get("C:/control/" + name); return raw === undefined ? null : Buffer.from(raw); }, "a".repeat(32));
    const receipt = (await d.selfTest()).receipt;
    receipt.format = "native-trial-f-diagnostic-v1"; receipt.status = "unestablished"; receipt.reason = "invalid-evidence"; receipt.trials.length = 1; receipt.teardown.length = 1; receipt.inspections.length = 3;
    const observation = receipt.trials[0].observation;
    receipt.trials[0].diagnostic = { observationEnd: d.diagnosticObservationEnd(observation, 120), exits: { producer: d.diagnosticExit(0, undefined, 130), host: d.diagnosticExit(null, "SIGTERM", 140) }, native };
    assert.equal(d.validateReceipt(receipt), false);
    assert.equal(d.validateDiagnosticReceipt(receipt), false, "a partial diagnostic must not qualify despite a short-hold observation");
    assert.equal(d.validateDiagnosticReceiptEvidence(receipt), false, "a partial record must fail the complete informational-evidence gate too");
    const control = { v: 1, token: "t".repeat(43), sessionId: "synthetic", claudeSessionId: "11111111-2222-3333-4444-555555555555", generation: "g", kind: "control", controlRevision: 1, state: "offered", offerId: "b".repeat(32), captureEpoch: null, grantId: null, predecessorEpoch: null, reasonCode: null, recoveriesRemaining: 1, lastRetired: null };
    await f.invoke("session.id", {}, { value: control.claudeSessionId }); await f.invoke("session.version", {}, { value: { base: "2.1.322", version: "2.1.322" } });
    for (const [suffix, value] of Object.entries({ DIR: "C:/synthetic", TOKEN: control.token, SESSION_ID: control.sessionId, CLAUDE_SESSION_ID: control.claudeSessionId, GENERATION: control.generation })) await f.invoke("env.get", { name: "CLAUDE_WORKSPACES_CAPTURE_" + suffix }, { value });
    await f.invoke("fs.stat", { path: "C:/synthetic", resolve: true }, { value: { kind: "dir", isLink: false, size: 0, mtimeMs: 1, realPath: "C:/synthetic" } });
    await f.invoke("fs.read", { path: "C:/synthetic/control.json", as: "text" }, { value: JSON.stringify(control) }); await f.invoke("fs.list", { path: "C:/synthetic" }, { value: [] });
    const e = { path: "C:/synthetic/request.upload", text: "synthetic unchanged" };
    await f.invoke("fs.write", e, { value: undefined }, { trace: [{ plugin: "engine", tier: "core", event: "fs.write", outcome: "returned", received: e }] });
    receipt.trials[0].diagnostic.native = await d.collectDiagnostic(async (name: string) => { const raw = f.writes.get("C:/control/" + name); return raw === undefined ? null : Buffer.from(raw); }, "a".repeat(32));
    assert.equal(d.validateDiagnosticReceipt(receipt), false, "byte integrity cannot attest the writer return");
    assert.equal(receipt.trials[0].diagnostic.native.status, "unverified");
    assert.equal(receipt.trials[0].diagnostic.native.integrity, "verified");
    assert.equal(receipt.trials[0].diagnostic.native.writerOutcome, "unattested");
    assert.equal(typeof d.validateDiagnosticReceiptEvidence, "function");
    assert.equal(d.validateDiagnosticReceiptEvidence(receipt), true, "complete bounded observations remain useful informational evidence");
    const completeNative = receipt.trials[0].diagnostic.native;
    for (const mutation of ["unknown-trace", "wrong-tier", "invalid-value"]) {
      const bad = structuredClone(receipt);
      const stage = bad.trials[0].diagnostic.native.events.find((item: {stage: string; phase: string}) => item.stage === (mutation === "invalid-value" ? "env-token" : "startup") && item.phase === "returned");
      if (mutation === "unknown-trace") stage.trace = null;
      else if (mutation === "wrong-tier") stage.trace.links[0].tier = "append";
      else stage.checks.valid = false;
      assert.equal(d.validateDiagnosticReceipt(bad), false, mutation);
      assert.equal(d.validateDiagnosticReceiptEvidence(bad), false, mutation);
    }
    for (const change of [{ status: "verified" }, { writerOutcome: "succeeded" }, { healthy: true }]) {
      const bad = structuredClone(receipt); Object.assign(bad.trials[0].diagnostic.native, change);
      assert.equal(d.validDiagnosticEvidence(bad.trials[0].diagnostic.native, "a".repeat(32)), false);
      assert.equal(d.validateDiagnosticReceiptEvidence(bad), false); assert.equal(d.validateDiagnosticReceipt(bad), false);
    }
    assert.ok(Buffer.byteLength(JSON.stringify(completeNative)) < 65536);
    for (const change of [{ ...receipt, format: "native-trial-f-v1" }, { ...receipt, status: "observed" }, { ...receipt, status: "diagnostic-observed" }, { ...receipt, trials: [receipt.trials[0], receipt.trials[0]] }]) {
      assert.equal(d.validateDiagnosticReceipt(change), false); assert.equal(d.validateDiagnosticReceiptEvidence(change), false);
    }
    const end = d.diagnosticObservationEnd({ ...observation, status: "unestablished", reason: "rendezvous-timeout", events: [] }, 60000);
    assert.deepEqual(end, { atMs: 60000, phase: "awaiting-entry", status: "unestablished", reason: "rendezvous-timeout" });
    assert.deepEqual(d.diagnosticExit(23, "PRIVATE_SIGNAL", 42), { observed: true, atMs: 42, code: "nonzero", signal: "other" });
    assert.deepEqual(d.diagnosticExit(undefined, undefined, 42), { observed: true, atMs: 42, code: "unknown", signal: "none" });
    assert.equal(d.validateDiagnosticReceipt({ ...receipt, trials: [{ ...receipt.trials[0], diagnostic: { ...receipt.trials[0].diagnostic, native: { ...native, status: "unverified" } } }] }), false);
  });


  it("retains the existing matching-write rejection guard in diagnostic mode without replay", async () => {
    const f = diagnosticFixture(), event = Object.freeze({ path: "C:/synthetic/request.upload", text: "synthetic" }); let calls = 0;
    const next = Object.assign(async (actual: unknown) => { assert.equal(actual, event); calls++; throw new Error("PRIVATE_DOWNSTREAM"); }, { origin: { plugin: "workspaces-attention", tier: "user" }, signal: new AbortController().signal, budget: { remainingMs: 9000 }, trace: [] });
    await assert.rejects(() => f.hooks.get("fs.write")!(f.sdk, event, next), /dispatch-rejected/);
    assert.equal(calls, 1); assert.equal(JSON.parse(f.writes.get("C:/control/rejected.json")!).dispatch, "rejected");
    assert.equal(f.events().find(e => e.stage === "write" && e.phase === "rejected").phase, "rejected");
    assert.doesNotMatch(JSON.stringify([...f.writes.values()]), /PRIVATE_DOWNSTREAM/);
  });

  it("applies the same hard controller deadline to both explicit execution modes", async () => {
    const req = createRequire(__filename), vm = req("node:vm");
    for (const mode of ["live", "diagnostic"]) {
      const moduleObject = { exports: {} }, timers = new Map<() => void, number>(), exits: number[] = [], calls: string[] = [];
      const loader = Object.assign((name: string) => name === "./companionNative.smoke.cjs" ? { readBoundedJson: async () => ({}) } : req(name), { main: moduleObject });
      const source = fs.readFileSync(modulePath, "utf8"), boundary = source.lastIndexOf("if (require.main === module)");
      vm.runInNewContext(source.slice(0, boundary) + "runLive = async (config, until, mode) => { calls.push(mode); return new Promise(() => {}); };\n" + source.slice(boundary), {
        module: moduleObject, require: loader, __dirname: path.dirname(modulePath), calls,
        process: { argv: ["node", "synthetic", "--run-" + mode, "--config", path.resolve(".tmp/config.json")], exit: (code: number) => exits.push(code) },
        console: { log() {}, error() {} }, Buffer, structuredClone,
        setTimeout: (callback: () => void, ms: number) => { timers.set(callback, ms); return callback; }, clearTimeout: (id: () => void) => timers.delete(id)
      });
      await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, [mode]);
      const deadline = [...timers].find(([, ms]) => ms === 300000); assert.ok(deadline); deadline[0]();
      for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
      assert.ok(exits.length >= 1); assert.ok(exits.every(code => code === 1)); assert.equal(timers.size, 0);
    }
  });


  it("executes only one diagnostic trial and stops either mode after the first unestablished observation", async function () {
    this.timeout(5000);
    const req = createRequire(__filename), vm = req("node:vm"), { EventEmitter } = req("node:events"), d = req(modulePath);
    const seed = (await d.selfTest()).receipt.trials[0].observation;
    for (const mode of ["live", "diagnostic"]) for (const fail of [false, true]) {
      const bytes = Buffer.from("synthetic"), digest = createHash("sha256").update(bytes).digest("hex"), files = new Map<string, Buffer | string>();
      const holds: number[] = []; let spawns = 0, directories = 0, current = seed;
      let producerExit: (event: { exitCode: number }) => void = () => {};
      const sources = ["src/companion/companionCapture.ts", "src/companion/companionTypes.ts", "media/attention/hooks/register.js", "media/attention/hooks/companion/filePublisher.js", "test/manual/companionNativeRendezvous.smoke.cjs"];
      const config = { nativeExecutable: "C:\\native.exe", nativeSha256: digest, declarationPath: "C:\\sdk.d.ts", declarationSha256: d.DECLARATION_SHA256, nativeVersion: "2.1.322", sourceSha: "a".repeat(40), ownedParent: "C:\\repo\\.tmp", hostProfile: { platform: "win32", arch: "x64", node: "24.14.0", uv: "1.51.0", electron: null } };
      class Factory {
        async spawn() { spawns++; return { onData() {}, onExit(callback: typeof producerExit) { producerExit = callback; }, async terminate() { await Promise.resolve(); producerExit({ exitCode: 0 }); } }; }
      }
      const helper = { createReceiptWriter: () => async () => {}, readBoundedJson: async (file: string) => {
        const name = path.win32.basename(file), nonce = current.nonce, sha256 = current.originalSha256;
        const markers: Record<string, object> = { "started.json": { nonce, version: "2.1.322", turns: 0 }, "entry.json": { nonce, origin: "workspaces-attention", tier: "user", targetKind: "epoch-request-upload", bytes: current.bytes, sha256, forwardCount: 0 }, "forward.json": { nonce, forwardCount: 1 }, "returned.json": { nonce, dispatch: "returned", forwardCount: 1, coreCalls: 1 } };
        if (markers[name]) return markers[name]; throw Object.assign(new Error("missing"), { code: "ENOENT" });
      } };
      const fakeFs = { realpath: async (p: string) => p, lstat: async (p: string) => mode === "diagnostic" && path.win32.basename(p) === "diagnostic.1.done.json" ? new Promise(() => {}) : ({ isFile: () => true, isSymbolicLink: () => false }), mkdtemp: async (p: string) => p + directories++, mkdir: async () => {}, writeFile: async (p: string, content: string | Buffer) => { files.set(p, content); }, readFile: async () => bytes };
      const child = { execFileSync: (_command: string, args: string[]) => Buffer.from(args.includes("rev-parse") ? config.sourceSha : args.includes("status") ? "" : args.includes("--stage") ? "fingerprint" : sources.join("\0")), fork: () => {
        const host = new EventEmitter(); host.stdout = new EventEmitter(); host.stderr = new EventEmitter(); host.kill = () => host.emit("exit", 0, null); return host;
      } };
      const context = { module: { exports: {} }, __dirname: "C:\\repo\\test\\manual", Buffer, structuredClone, setTimeout, clearTimeout,
        process: { platform: "win32", arch: "x64", versions: { node: "24.14.0", uv: "1.51.0" }, execPath: "C:\\node.exe", env: {} },
        require: (name: string) => {
          if (name === "node:path") return path.win32;
          if (name === "node:fs/promises") return fakeFs;
          if (name === "node:child_process") return child;
          if (name === "./companionNative.smoke.cjs") return helper;
          if (name === "esbuild") return { build: async (options: { outfile?: string }) => { if (options.outfile) files.set(options.outfile, bytes); return { outputFiles: [{ contents: bytes }] }; } };
          if (name.endsWith("adapter.cjs")) return { NodePtyFactory: Factory };
          if (name === "node-pty") return {};
          assert.ok(["node:assert/strict", "node:crypto", "node:perf_hooks"].includes(name)); return req(name);
        },
        hashInput: async (file: string) => file === config.declarationPath ? config.declarationSha256 : createHash("sha256").update(files.get(file) ?? bytes).digest("hex"),
        inspect: async (_file: string, args: string[], _cwd: string, _env: object, owner: { inspections: object[] }) => { owner.inspections.push({ closed: true, kind: args[0] === "--version" ? "version" : "auth", reason: "none", termination: "not-requested", code: 0, finished: Promise.resolve() }); return { exitObserved: true, reason: "none", code: 0, output: args[0] === "--version" ? "2.1.322" : '{"authMethod":"claude.ai"}' }; },
        exchangeInput: async (_host: object, message: { kind: string; storageRoot: string }) => message.kind === "prepare" ? { target: message.storageRoot + "\\namespace/request." + "b".repeat(32) + ".upload", environment: {} } : {},
        observe: async (_ops: object, options: { nonce: string; holdMs: number }) => { holds.push(options.holdMs); current = { ...structuredClone(seed), nonce: options.nonce, requestedHoldMs: options.holdMs, holdMs: options.holdMs, events: seed.events.map((e: { stage: string; atMs: number }, i: number) => ({ ...e, atMs: i < 2 ? 0 : options.holdMs })) }; if (fail) { current.status = "unestablished"; current.reason = "rendezvous-timeout"; } return current; },
        upload: async () => { if (fail) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return { bytes: current.bytes, sha256: current.originalSha256 }; }
      };
      vm.createContext(context);
      vm.runInContext(fs.readFileSync(modulePath, "utf8") + "\nhashFile = hashInput; inspectCli = inspect; exchange = exchangeInput; observeTrial = observe; readUpload = upload;", context);
      const receipt = await vm.runInContext("runLive(" + JSON.stringify(config) + ", performance.now() + 300000, " + JSON.stringify(mode) + ")", context);
      assert.deepEqual(holds, mode === "live" && !fail ? [100, 3000] : [100]); assert.equal(spawns, holds.length);
      assert.equal(receipt.format, mode === "live" ? "native-trial-f-v1" : "native-trial-f-diagnostic-v1");
      if (fail) { assert.equal(receipt.reason, "rendezvous-timeout"); assert.equal(receipt.trials[0].observation.reason, "rendezvous-timeout"); }
      if (mode === "diagnostic") { assert.equal(receipt.status, "unestablished"); assert.equal(d.validateDiagnosticReceipt(receipt), false); assert.equal(d.validateReceipt(receipt), false); assert.equal(receipt.trials[0].diagnostic.observationEnd.reason, fail ? "rendezvous-timeout" : "none"); assert.equal(receipt.trials[0].diagnostic.exits.producer.observed, true); assert.equal(receipt.trials[0].diagnostic.native?.status, "unverified", "a stalled collector must leave explicit missing diagnostic evidence"); }
    }
  });


  it("emits literal SDK references without passing the engine interface as a value", () => {
    const req = createRequire(__filename), d = req(modulePath), ts: typeof TypeScript = req("typescript");
    // Pinned declaration 8270-8296 requires literal on/$ capability spelling.
    for (const diagnostic of [false, true]) {
      const source = ts.createSourceFile("control.js", d.createControlPluginSource({ target: "C:/synthetic/request.upload", control: "C:/control", nonce: "a".repeat(32), diagnostic }), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const visit = (node: TypeScript.Node) => {
        if (ts.isIdentifier(node) && ["$", "on"].includes(node.text)) {
          const parent = node.parent;
          const binding = ts.isParameter(parent) && parent.name === node;
          const literalCall = node.text === "on" && ts.isCallExpression(parent) && parent.expression === node && ts.isStringLiteral(parent.arguments[0]!);
          const literalCapability = node.text === "$" && ts.isPropertyAccessExpression(parent) && parent.expression === node;
          assert.ok(binding || literalCall || literalCapability, "nonliteral SDK reference: " + parent.getText(source));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });


  it("starts the original continuation once even while a diagnostic checkpoint is pending", async () => {
    const f = diagnosticFixture(); let release: () => void = () => {}; const blocked = new Promise<void>(resolve => { release = resolve; });
    const write = f.sdk.fs.write; f.sdk.fs.write = async (p, text) => { await blocked; await write(p, text); };
    const e = Object.freeze({}), result = Object.freeze({ value: "11111111-2222-3333-4444-555555555555" }); let calls = 0, settled = false;
    const next = Object.assign(async (actual: unknown) => { calls++; assert.equal(actual, e); return result; }, { origin: { plugin: "workspaces-attention", tier: "user" }, trace: [] });
    const pending = f.hooks.get("session.id")!(f.sdk, e, next).then(actual => { settled = true; assert.equal(actual, result); });
    await new Promise(resolve => setImmediate(resolve));
    try { assert.equal(calls, 1); assert.equal(settled, false, "all diagnostic work must stay in the event frame"); }
    finally { release(); await pending; }
    assert.equal(calls, 1); assert.equal(settled, true); assert.equal(f.events().length, 2);
  });

  it("preserves an original failed observation when final evidence is absent and late failures arrive", async () => {
    const d = createRequire(__filename)(modulePath);
    for (const [status, reason] of [["failed", "io-failed"], ["unestablished", "rendezvous-timeout"], ["unestablished", "producer-lost"]]) {
      for (const missing of ["upload", "markers"]) {
        const receipt = (await d.selfTest()).receipt; let attempts = 0;
        for (const record of receipt.trials) {
          attempts++; record.observation.status = status; record.observation.reason = reason;
          const guard = d.createTrialGuard();
          const accepted = await d.finalizeTrial(record, guard, {
            verify: async () => { guard.reject("output-limit"); }, stop: async () => true,
            readStatus: async (final: boolean) => { if (final && missing === "upload") throw Object.assign(new Error("synthetic missing"), { code: "ENOENT" }); return {}; },
            checkpoint: async () => { guard.reject("startup-interaction"); }
          });
          assert.equal(accepted, false); assert.equal(record.observation.status, status); assert.equal(record.observation.reason, reason);
          assert.equal(record.lifecycle.status, "disqualified"); assert.equal(record.lifecycle.finalRead, "failed");
          assert.deepEqual(record.lifecycle.disqualifications, ["output-limit", "invalid-evidence", "startup-interaction"]);
          if (!accepted) break;
        }
        assert.equal(attempts, 1); assert.equal(d.validateReceipt(receipt), false);
      }
    }
  });

  it("refuses incomplete final markers and unresolved inspection evidence without rejecting the positive receipt", async () => {
    const d = createRequire(__filename)(modulePath); const receipt = (await d.selfTest()).receipt;
    assert.equal(d.validateReceipt(receipt), true);
    for (const change of [
      { ...receipt, inspections: receipt.inspections.map((item: object, i: number) => i === 0 ? { ...item, close: "unobserved" } : item) },
      { ...receipt, inspections: new Array(4) },
      { ...receipt, trials: receipt.trials.map((item: object, i: number) => i === 0 ? { ...item, lifecycle: { status: "verified", finalRead: "verified", disqualifications: ["output-limit"] } } : item) }
    ]) assert.equal(d.validateReceipt(change), false);
    const record = receipt.trials[0], guard = d.createTrialGuard();
    assert.equal(await d.finalizeTrial(record, guard, { verify: async () => {}, stop: async () => true,
      readStatus: async () => ({}), checkpoint: async () => {} }), false);
    assert.equal(record.lifecycle.finalRead, "failed"); assert.equal(record.observation.reason, "invalid-evidence");
  });
});
