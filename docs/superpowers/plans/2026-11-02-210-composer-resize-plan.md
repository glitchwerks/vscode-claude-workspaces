# Composer Divider Resize Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution; implementation is approved in the current chat. GitHub #210 is the execution-status source of truth.

**Goal:** Smooth the internal terminal/composer divider and prevent persistence replies from rewinding newer drag positions (#210).

**Architecture:** Render pointer movement once per animation frame, save the final ratio at interaction end, and correlate layout replies with the originating request and local intent. Preserve the existing terminal instance and let its ResizeObserver follow the settled browser layout (#210; commit 7f7d1c1, src/panel/webview/renderer.ts:L516-L534).

**Tech Stack:** Existing TypeScript, CodeMirror, xterm, Mocha/JSDOM and VS Code integration harness (package.json:L36-L48).

**Spec:** #210, including the controlled delayed-save reproduction and maintainer-confirmed internal-divider scope.

## Constraints and review focus

- Keep the existing 0.15–0.75 split bounds, five-percentage-point keyboard step, normal/expanded behavior, drafts and native shortcuts (#145; src/composer/composerTypes.ts:L9-L10; src/panel/webview/composer/view.ts:L294-L303).
- Cover delayed replies during and after a newer drag, hydration during local interaction, pointer cancellation/lost capture, release before a scheduled frame, and disposal (#210).
- Keep save-error feedback and restore the final settled split on reload (#210; test/unit/composerView.test.ts:L272-L285).
- Target unpublished 0.11.2; publication remains a separate authorized action (#210).

## Task 1 — Correlate layout persistence

**Files:** src/panel/composerProtocol.ts, src/composer/composerController.ts, src/composer/composerRuntime.ts; protocol/controller/view/integration fixtures.

**Interface:** Require a canonical `requestId: string` on composerLayoutChanged and composerLayoutStatus. Pass it through `updateLayout(documentId, layout, requestId)` and echo it on success/error; persisted storage schema stays unchanged (existing request-correlation pattern in src/panel/composerProtocol.ts:L10-L38).

- [ ] Add failing decoder/controller tests for missing/invalid correlation and exact reply identity; verify RED.
- [ ] Add the field to the closed codec and host wiring; update existing fixtures; verify focused protocol/controller tests and commit.

## Task 2 — Own live drag layout

**Files:** src/panel/webview/composer/view.ts and test/unit/composerView.test.ts.

- [ ] Add failing tests for frame coalescing, continuous pointer precision, one final save, stale success/error replies, rapid successive drags, hydration, cancellation and disposal; verify RED (#210).
- [ ] Track pointer origin/ratio and pending frame; flush the final frame on interaction end. Guard persistence replies using request identity plus local intent, and guard hydration during local ownership (#210).
- [ ] Retain keyboard bounds/error feedback; verify view and all composer/renderer tests, then commit.

## Task 3 — Verify and integrate

**Files:** CHANGELOG.md and docs/manual-verification/prompt-composer.md; any additional regression required by observed failures.

- [ ] Repeat the controlled actual-editor/xterm drag comparison from #210; require no backward jumps and bounded frame/resize traffic. Run typecheck/lint/build and composer extension-host tests in all four pinned configurations (.vscode-test.js:L4-L59).
- [ ] Obtain independent code review, rebuild the local candidate and let the maintainer sanity-test the native divider. Inspect exact-head CI/reviews and audit committed referenced artifacts before merge (#210; #145).
- [ ] Preserve durable decisions in #210/PR discussion and remove this plan when its work is complete; keep #145/#183 open for their broader acceptance. No publication (#210).
