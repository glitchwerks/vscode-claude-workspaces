# Restore WebGL in 0.5.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the WebGL renderer behavior removed in 0.5.1, publish the correction as pre-release 0.5.2, and preserve the unresolved terminal-corruption investigation.

**Architecture:** Reinstate the small WebGL lifecycle adapter and load it once after xterm opens, retaining safe fallback on activation failure or WebGL context loss. Update the pre-release metadata independently of the renderer behavior so the eventual 0.6.0 promotion can remain behavior-free.

**Tech Stack:** TypeScript 6, xterm 6, `@xterm/addon-webgl` 0.19.0, Mocha, VS Code extension packaging.

**Spec:** [Issue #56](https://github.com/glitchwerks/vscode-claude-workspaces/issues/56) and the [approved promotion ruling](https://github.com/glitchwerks/vscode-claude-workspaces/issues/56#issuecomment-5706077187) (fetched 2026-09-16).

## Global Constraints

- The stable channel remains 0.4.0 while 0.5.2 is validated (`docs/versioning-policy.md:L6-L24`).
- Odd-minor versions publish to the pre-release channel (`docs/versioning-policy.md:L55-L59`).
- The future 0.6.0 promotion changes version and release documentation only (`docs/versioning-policy.md:L61-L70`).
- Issue #56 remains open because manual validation found that PR #110 did not materially reduce the artifacts ([approved ruling](https://github.com/glitchwerks/vscode-claude-workspaces/issues/56#issuecomment-5706077187), fetched 2026-09-16).

---

### Task 1: Restore the WebGL renderer lifecycle

**Files:**
- Create: `src/panel/webview/webglRenderer.ts`
- Modify: `src/panel/webview/xtermTerminal.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `test/unit/webglRenderer.test.ts`
- Modify: `test/unit/xtermTerminal.test.ts`

**Interfaces:**
- Consumes: xterm's `Terminal.loadAddon`, `ITerminalAddon`, and `IEvent<void>` contracts.
- Produces: `activateWebglRenderer(terminal, createAddon): void` and `XtermTerminalDependencies.createWebglAddon(): WebglRendererAddon`.

- [ ] **Step 1: Write the failing lifecycle tests**

Restore tests that require WebGL to load after `Terminal.open`, load only once across repeated `open` calls, dispose after context loss, and fall back without throwing when activation fails. The focused helper contract is:

```ts
it("loads custom glyph rendering and falls back after context loss", () => {
  let contextLoss: (() => void) | undefined;
  let disposeCalls = 0;
  const addon: WebglRendererAddon = {
    activate: () => undefined,
    onContextLoss: (listener) => {
      contextLoss = listener;
      return { dispose: () => undefined };
    },
    dispose: () => { disposeCalls += 1; }
  };
  let loaded: unknown;

  activateWebglRenderer({ loadAddon: (candidate) => { loaded = candidate; } }, () => addon);
  contextLoss?.();

  assert.equal(loaded, addon);
  assert.equal(disposeCalls, 1);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm run test:unit -- --grep "xterm WebGL renderer|xterm terminal adapter"
```

Expected: TypeScript compilation fails because `webglRenderer.ts`, `WebglRendererAddon`, and the `createWebglAddon` dependency are absent from 0.5.1.

- [ ] **Step 3: Restore the minimal production behavior**

Add `@xterm/addon-webgl` version `0.19.0` as an exact dev dependency. Restore the adapter with the existing fallback semantics:

```ts
export function activateWebglRenderer(
  terminal: Pick<Terminal, "loadAddon">,
  createAddon: () => WebglRendererAddon
): void {
  let addon: WebglRendererAddon | undefined;
  try {
    addon = createAddon();
    terminal.loadAddon(addon);
    addon.onContextLoss(() => addon?.dispose());
  } catch {
    addon?.dispose();
  }
}
```

Load the addon once from `XtermTerminal.open()` after `terminal.open(parent)`, using a private `webglActivated` guard. This restores the exact defensive behavior removed by [PR #110](https://github.com/glitchwerks/vscode-claude-workspaces/pull/110) (fetched 2026-09-16).

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
npm run test:unit -- --grep "xterm WebGL renderer|xterm terminal adapter"
```

Expected: the restored WebGL lifecycle tests and all xterm terminal adapter tests pass.

### Task 2: Prepare the 0.5.2 corrective pre-release

**Files:**
- Modify: `test/unit/changelog.test.ts`
- Modify: `test/unit/packageAssets.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/versioning-policy.md`

**Interfaces:**
- Consumes: the repository's odd-minor pre-release guard and changelog extraction script.
- Produces: internally consistent 0.5.2 manifest, lockfile, release notes, and channel documentation.

- [ ] **Step 1: Update release-contract tests first**

Change the current pre-release assertions from 0.5.1 to 0.5.2. Require the 0.5.2 changelog section to state that WebGL is restored, 0.4.0 remains stable, and issue #56 remains unresolved rather than fixed.

- [ ] **Step 2: Run the release-contract tests and verify RED**

Run:

```powershell
npm run test:unit -- --grep "changelog extraction|Marketplace package assets|Marketplace channel guard|release metadata"
```

Expected: failures report the 0.5.1 manifest/lockfile/policy values and missing 0.5.2 changelog section.

- [ ] **Step 3: Update version and release documentation**

Run `npm version 0.5.2 --no-git-tag-version` so both package files stay aligned. Add a dated 0.5.2 changelog entry that restores WebGL because the 0.5.1 experiment showed minimal benefit, explicitly keeps #56 open, and retains 0.4.0 as the stable fallback. Update `docs/versioning-policy.md` to name 0.5.2 as the current pre-release.

- [ ] **Step 4: Run the release-contract tests and verify GREEN**

Run:

```powershell
npm run test:unit -- --grep "changelog extraction|Marketplace package assets|Marketplace channel guard|release metadata"
```

Expected: all targeted release-contract tests pass.

- [ ] **Step 5: Run full validation and package the pre-release**

Run:

```powershell
npm run check:types
npm run lint
npm test
npm run package:prerelease
```

Expected: types, lint, 379-or-more unit tests, both supported VS Code integration hosts, and pre-release packaging all pass.

- [ ] **Step 6: Commit and verify artifact persistence**

Commit the complete correction with:

```powershell
git add CHANGELOG.md docs/versioning-policy.md package.json package-lock.json src/panel/webview/webglRenderer.ts src/panel/webview/xtermTerminal.ts test/unit/changelog.test.ts test/unit/packageAssets.test.ts test/unit/webglRenderer.test.ts test/unit/xtermTerminal.test.ts
git commit -m "fix(panel): restore WebGL renderer for 0.5.2"
```

Then reconcile `git diff origin/release/0.5.x...HEAD --stat` against the files above and verify every referenced repository path exists with `git ls-tree HEAD -- <path>` before opening the PR.
