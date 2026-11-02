# Native Draft Import Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this authorized continuation task-by-task. The maintainer's goal is to drive each reported issue to completion; this document does not add a publication authorization.

**Goal:** Showing or expanding an empty composer moves the current Claude prompt into the editor without submitting it or overwriting newer text.

**Architecture:** Implementation choice: use the existing private, launch-scoped composer channel for read and conditional-clear operations. First persist the captured draft, then request deletion against that exact native text. Proposed deletion uses a guarded native edit; live compatibility is an execution gate, not an established result.

**Tech Stack:** Existing TypeScript controller/adapter/broker and JavaScript native mod; current project test runners (package.json).

**Spec:** #145, especially the [nine observations](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145#issuecomment-6589433979) and the [explicit move decision and execution authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145#issuecomment-6589882395).

## Global Constraints

- Preserve nonempty composer drafts and per-session launch identity (#145).
- Persist a recoverable editor copy before requesting native deletion; preserve newer native/composer text ([move decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145#issuecomment-6589882395)).
- Keep current support floors, native queue submission, no automatic uncertain-send retries, and separate prompt-bearing versus metadata-only channels (#145; src/composer/composerTypes.ts:L1-L12; src/composer/claudeComposerAdapter.ts:L33-L40).
- Native hooks are middleware; exact API shapes must be checked against the tested build's generated types. The prompt.edit execution budget is 50 ms, excluding ordinary SDK calls: https://code.claude.com/docs/en/plugins/mods/events (fetched 2026-11-02), https://code.claude.com/docs/en/plugins/mods/reference#limits (fetched 2026-11-02).
- No new model call is required to validate a draft transfer; use synthetic native drafts. This is an implementation choice, not a claim that broader #158/#180 acceptance is complete.

## Review Focus

- Capture resolves after typing, tab changes, hide, close or generation replacement: retain the newer draft and do not clear another target.
- Storage fails or is delayed: keep the native source until the imported copy is durable.
- Native text changes after capture: conditional deletion preserves the changed native text.
- Catalog/send operations overlap transfer: serialize the private slot; no unrelated prepared frame may write native keys (test/unit/claudeComposerAdapter.test.ts).
- Dialogs, empty native input, malformed/oversized frames and unsupported capability: leave ordinary terminal behavior usable (#145).

### Task 1: Native transfer protocol and broker

**Files:** src/composer/composerTypes.ts, src/composer/composerBroker.ts, src/composer/claudeComposerAdapter.ts, media/attention/hooks/composer.js.
**Tests:** test/unit/composerNativeMod.test.ts, test/unit/composerBroker.test.ts, test/unit/claudeComposerAdapter.test.ts.
**Interfaces (implementation choices):** NativeComposerDraft {text:string;cursor:number}; adapter readDraft(target):Promise<NativeComposerDraft|undefined> and clearDraft(target,expected):Promise<boolean>. Both remain optional on injected adapters. Private operations carry the normal token/request/target identity; read replies carry a bounded draft and clear replies carry a boolean.

- [x] Add failing native read/clear tests: no fill on read; mismatch/dialog/retired target preserves native input; clear never submits.
- [x] Add failing broker tests: strict frame identity/size/cursor validation, auxiliary-operation serialization with catalog/send, exactly one conditional-clear dispatch and disposal.
- [x] Implement read and clear requests. Proposed clear preparation appends an empty string to retain text while moving the native caret to its end, then handles one authenticated Backspace intent through prompt.edit. Compare the event's actual text before rewriting its deletion range; reject a changed source. Confirm the resulting box on a later native timer before acknowledging it.
- [x] Treat this native edit approach as unverified until the fixed no-model native control passes on 2.1.299 and the current installed build. If the generated contract or live control rejects it, investigate another supported conditional mechanism before integrating a destructive clear.
- [x] Run the three focused suites; commit protocol and native regression coverage when passing.

### Task 2: Durable import and show/expand integration

**Files:** src/composer/composerController.ts, src/panel/webview/composer/view.ts, src/panel/composerProtocol.ts if user-visible transfer outcomes need a new typed message.
**Tests:** test/unit/composerController.test.ts, test/unit/composerView.test.ts, test/unit/composerRuntime.test.ts.
**Interfaces (implementation choices):** controller.importNativeDraft():Promise<void>, deduplicated per live target. Visibility requests initiate import without blocking focus/selection. The editor's imported selection is the native cursor.

- [x] Add failing tests for empty versus nonempty drafts, a held native read, typing/session/generation changes, held/failed storage and visibility/expand triggers.
- [x] Capture only for an active, visible, empty, supported composer. Re-check ownership and revision after the native read.
- [x] Publish the imported draft to the editor, persist it, and request conditional native clear only after successful durability. Retain an explicit copy/uncertain outcome if native deletion cannot be confirmed; never auto-submit or retry.
- [x] Run controller/view/runtime/protocol suites and commit the integration.

### Task 3: Exact-source validation and durable evidence

**Files:** test/support/composerNativeProbe.ts, test/fixtures/composer/ (sanitized transfer receipts), README.md, docs/manual-verification/prompt-composer.md.
**Interfaces:** extend the existing opt-in no-model native probe with fixed transfer controls; preserve its privacy contract (test/unit/composerNativeProbe.test.ts).

- [x] Verify native move, changed-source refusal and editing/resubmission after move on the supported minimum and current CLI. Record only synthetic, sanitized observations and source hashes in committed fixtures.
- [ ] Verify actual browser show/expand, native/editor targeting, selection, focus and zero implicit submissions; run applicable unit, lint, type, build and real-host integration checks.
- [ ] Obtain independent code review, correct actionable findings, and update #145 / PR #213 with scope and evidence.
- [ ] Keep #158 and complete input-freeze acceptance (#180) open until their own evidence proves completion. Publication remains a separate action (#145 / #183).
- [ ] Delete this plan after its implementing issue closes, extracting durable decisions and redirecting committed references first (maintainer AGENTS.md lifecycle rule).

## Execution evidence

Tasks 1 and 2 are implemented in commits 7964490, 4e0de93 and bd13d29. Regression coverage and the native controls are committed in those changes; four independent review findings were reproduced and corrected in bd13d29. Native controls cover CLI 2.1.299 and 2.1.316; full controller move, persistence before clear and edited /context resubmission are recorded in test/fixtures/composer/0112-native-draft-controls.json. The actual CodeMirror browser boundary is recorded separately in test/fixtures/composer/0112-native-import-ui.json; its native adapter is synthetic. The parent issue remains open (#145), so this plan remains an execution artifact.
