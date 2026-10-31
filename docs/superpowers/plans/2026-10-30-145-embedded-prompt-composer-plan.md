# Embedded Prompt Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver #145's approved adjustable-split composer in **0.13.0**, with restart-safe session drafts, skills/commands, four bounded extras, and native Claude queuing. [#145; S]

**Architecture:** A host-owned composer controller connects a versioned workspace-state store, a validated per-session Claude adapter, and the existing closed webview protocol. A CodeMirror-based view sits below the existing terminal, preserving direct terminal use and focus ownership. Live CLI semantics and acceptance acknowledgments are a blocking first investigation, not assumptions hidden in UI code. [S:L65-L139; R1; R2]

**Tech Stack:** Existing TypeScript/Node extension host, VS Code webviews/Memento/keybindings, esbuild, Mocha/JSDOM, and Windows PTY integration; CodeMirror 6 and a basic Markdown parser are the proposed browser dependencies, pinned only after the packaging check. [S:L123-L139; `package.json:L33-L49`; `esbuild.js:L16-L44`]

**Spec:** `docs/superpowers/specs/2026-10-30-embedded-prompt-editor-design.md` (approved design, S). Tracking source: [#145](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145). Documentation checkpoint: PR #195.

## Global Constraints

- Target **0.13.0**, not the current 0.11.x reliability release. Do not change active release authority or publish while executing feature tasks. Runtime work waits for an approved, initialized `prerelease/0.13.x` integration line. [#145; R0]
- **Ctrl+Enter** sends or normally queues; **Enter** inserts a newline; **Ctrl+G** shows/hides the composer. The native Ctrl+Enter send-now sequence must not be forwarded. Keybindings are customizable and scoped. [S:L53-L63; E1; E2]
- Keep one durable unsent draft per canonical Claude UUID, restore it across switching/restart/resume, and preserve it on rejected or uncertain delivery. Keep direct terminal input available. [S:L65-L83]
- Include workspace file references, composer-only recent prompts, workspace favorites, and basic Markdown preview. Use Claude's **native queue display**; no custom queue count, pane, or queue persistence. [S:L95-L121]
- Keep the attention channel metadata-only. Composer text gets its own authenticated session/generation boundary and never enters diagnostics or telemetry. Do not silently raise the support floor or claim untested remote support. [S:L123-L139; R5]
- Use issue-linked isolated worktrees and frequent commits. Keep this plan's checkboxes execution-only; #145 remains the work-item authority. Finish the plan review and obtain implementation authorization before Task 0. [#145; R0]

## Review Focus

1. **A busy Claude session or permission dialog:** composer Ctrl+Enter must normally queue, never interrupt work or answer a dialog. Pin this in Tasks 1, 3, and 8. [S:L113-L139; E1]
2. **A late acknowledgment after new typing, resume, or Forget:** preserve newer text, reject the old generation, and never recreate deleted state. Pin this in Tasks 2 and 4. [S:L65-L83,L113-L119]
3. **IME input, Unicode, clipboard, and competing keybindings:** composition Enter must not send; output/status events must not pull focus away. Pin this in Tasks 5 and 8. [S:L49-L63]
4. **A draft with no saved conversation, or a failed storage write:** make recovery discoverable and never label unsaved text Saved. Pin this in Tasks 2, 4, and 8. [S:L65-L83]
5. **File exclusions, symlink escapes, hostile preview text, and stale command lists:** do not broaden directory access, execute markup, or substitute an invocation. Pin this in Tasks 6 and 7. [S:L85-L111]

## Sources and artifact convention

Source baseline: `07060dbeafb7942573a701512ca46686ef87bedd`; the approved design first shipped in documentation commit `3695c398da9b47660030935287e735969e1a7327`. Source references below are verifiable at those commits. Before execution, reconcile exact line locations and changed interfaces against the then-current 0.13.x baseline; do not copy stale 0.10.0/0.11.x product metadata into the future release. [PR #195; R0]

- **S:** `docs/superpowers/specs/2026-10-30-embedded-prompt-editor-design.md:L5-L159`.
- **R0:** `docs/versioning-policy.md:L7-L19,L38-L63` and `.github/release-policy/config.json:L1-L5`: current active authority is `prerelease/0.11.x`, not 0.13.x.
- **R1:** `src/panel/sessionPanelProvider.ts:L23-L100,L260-L305`; `src/panel/protocol.ts:L29-L80,L119-L130`: existing host-owned panel boundary and closed input messages.
- **R2:** `src/sessions/sessionManager.ts:L69-L119,L319-L331`; `src/extension.ts:L635-L677`: session identity, PTY writes without Claude-acceptance acknowledgments, and attention integration.
- **R3:** `src/sessions/resumableSessionStore.ts:L8-L25,L65-L85,L114-L160`; `src/launch/sessionLaunch.ts:L22-L49`: UUID-backed persistence and new/resumed launch planning.
- **R4:** `src/panel/webview/renderer.ts:L282-L312,L430-L451`; `src/panel/webview/index.ts:L1-L42`: terminal focus, fit observation, and browser state bridge.
- **R5:** `media/attention/hooks/register.js:L1-L24`; `README.md:L120-L131`; `src/launch/claudeCapabilities.ts:L15-L24,L95-L137`: metadata-only reporter and capability/fallback constraints.
- **R6:** `test/support/memoryMemento.ts:L1-L25`; `test/unit/resumableSessionStore.test.ts:L1-L65`; `test/unit/webviewRenderer.test.ts:L1-L55`; `.vscode-test.js:L1-L65`: test patterns and extension-host fixtures.
- **E1:** https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works (fetched 2026-10-30): native queue timing and send-now behavior.
- **E2:** https://code.visualstudio.com/docs/configure/keybindings and https://code.visualstudio.com/api/references/when-clause-contexts (fetched 2026-10-30): configurable and conditional keybindings.
- **E3:** https://code.claude.com/docs/en/plugins/mods/reference#mods-api-methods and https://code.claude.com/docs/en/plugins/mods/api (fetched 2026-10-30): command listing and prompt APIs; installed-version behavior still needs proof.
- **E4:** https://code.claude.com/docs/en/skills#where-you-write-the-skills-name (fetched 2026-10-30): placement-sensitive skill expansion and invocation semantics.
- **E5:** https://github.com/codemirror/basic-setup/blob/main/src/codemirror.ts and https://github.com/codemirror/dev (fetched 2026-10-30): candidate editor capabilities and source-host migration. No latest-package or measured-size claim is made.

Paths marked **Create** or **planned output** below are future implementation deliverables, not existing artifacts or dependencies shipped by this planning PR. Paths marked **Modify**, **Read**, and the spec are committed inputs. At every implementation PR, verify its claimed outputs and all actual input/fixture/evidence references with `git ls-tree HEAD`; do not confuse generated `out/` test files with committed fixtures. [S:L161-L173; PR #195]

## File and responsibility map

| Planned output to create | Responsibility |
| --- | --- |
| `src/composer/composerTypes.ts` | Shared immutable IDs, draft/catalog/submission contracts and bounds |
| `src/composer/composerStore.ts` | Versioned Memento document, revisions, tombstones, history and favorites |
| `src/composer/claudeComposerAdapter.ts` | Only the live Claude route proven by Task 1 |
| `src/composer/composerBroker.ts` | Private host/session bridge, validation, authentication and disposal |
| `src/composer/composerController.ts` | Draft/save/send state machine and lifecycle orchestration |
| `src/composer/composerCatalog.ts` | Session command listing, exact invocation insertion and favorites |
| `src/composer/composerFiles.ts` | Bounded, root-scoped file-reference selection |
| `src/panel/composerProtocol.ts` | Closed composer message codecs, imported by the existing protocol |
| `src/panel/webview/composer/editor.ts` | CodeMirror adapter: text, selection, history, find/replace and key routing |
| `src/panel/webview/composer/view.ts` | Split, toolbar, picker, saved state and focus ownership |
| `src/panel/webview/composer/styles.css` | Composer layout and VS Code theme variables |
| `src/panel/webview/composer/markdownPreview.ts` | Restricted Markdown rendering and link intents |
| `media/attention/hooks/composer.js` | Composer hook registration, isolated from attention reporting |
| `test/support/composerHarness.ts` | Controlled store, bridge, clock, lifecycle and DOM fixtures |
| `test/support/composerNativeProbe.ts` | Opt-in manual CLI evidence runner; never ordinary CI model calls |
| `docs/research/145-composer-bridge-evidence.md` | Committed sanitized versions, outcomes, constraints and route selection |

These units implement S's separated store/controller/view/adapter responsibilities. Existing wiring points are the extension activation, launch controller, session panel/provider, protocol, renderer, browser entry, manifest, build and package-asset tests. Avoid general refactors of their unrelated behavior. [S:L123-L159; R1-R6]

## Shared interface decisions

Implement these in Task 2; Task 1's probe uses a local fixture shape and must converge on them. Names here are planning contracts, not claims that symbols already exist. The numeric bounds are **author-selected planning defaults** for the spec's bounded extras and payloads, not measured performance budgets. [S:L95-L111,L115-L139]

```ts
type ComposerTarget = Readonly<{
  sessionId: string; claudeSessionId: string; generation: string;
}>;
type DraftState = Readonly<{
  revision: number; text: string;
  selection: Readonly<{ anchor: number; head: number }>;
}>;
type SavedComposerSession = Readonly<{
  claudeSessionId: string; rootId: string; rootPath: string; displayName: string;
  draft: DraftState; recent: readonly string[];
}>;
type ComposerCommand = Readonly<{
  invocation: string; description: string; source: string; plugin?: string;
}>;
type SubmitRequest = Readonly<{
  target: ComposerTarget; submissionId: string; draft: DraftState;
}>;
type SubmitResult =
  | Readonly<{ status: 'accepted'; submissionId: string; revision: number }>
  | Readonly<{ status: 'rejected'; submissionId: string;
      reason: 'unavailable' | 'dialog' | 'terminal-draft' | 'invalid' }>
  | Readonly<{ status: 'unconfirmed'; submissionId: string }>;
type SaveResult = 'saved' | 'stale' | 'forgotten' | 'too-large' | 'failed';
interface ClaudeComposerAdapter {
  listCommands(target: ComposerTarget): Promise<readonly ComposerCommand[]>;
  submit(request: SubmitRequest): Promise<SubmitResult>;
  disposeSession(target: ComposerTarget): Promise<void>;
}
```

Constants: `COMPOSER_STATE_KEY = "claudeWorkspaces.composerState"`, schema version `1`, `MAX_DRAFT_UTF8_BYTES = 1_048_576`, `RECENT_MAX_ITEMS = 20`, `RECENT_MAX_UTF8_BYTES = 262_144`, `FILE_RESULT_LIMIT = 100`, `SAVE_DEBOUNCE_MS = 200`, `CATALOG_TIMEOUT_MS = 2_000`, `SUBMIT_ACK_TIMEOUT_MS = 5_000`. Never truncate a draft to fit a bound: retain editable text, reject the oversized save/send explicitly, and keep Saved false. Oversized accepted prompts need not enter the bounded recent list. [S:L65-L111]

Protocol intents: browser `composerDraftChanged`, `composerSubmit`, `composerRequestCatalog`, `composerPickFile`, `composerHistorySelected`, `composerFavoriteChanged`, `composerFocusChanged`; host `composerHydrate`, `composerDraftStatus`, `composerSubmitResult`, `composerCatalog`, `composerInsertText`, `composerFocus`. Use exact-key codecs. Browser targets carry only IDs/generation, never filesystem paths or executable arguments. Definitions and decoder assertions belong in Task 4. [R1; S:L115-L139]

Exact payload decisions for Task 4 (all add a literal `type`): draft change `{ target, draft }`; submit `{ request: SubmitRequest }`; catalog/file request `{ target, requestId }`; history selection `{ target, index, mode: 'replace' | 'append', expectedRevision }`; favorite change `{ target, invocation, enabled }`; focus report `{ target, documentId, focused, pickerFocused }`. Host hydration carries `{ target, session: SavedComposerSession, visible, splitRatio, favorites, canSubmit }`; draft status `{ target, revision, status: 'saving' | 'saved' | 'error' | 'too-large' }`; submission result `{ target, result: SubmitResult }`; catalog `{ target, requestId, commands, status: 'ready' | 'unavailable' }`; insert `{ target, requestId, expectedRevision, text }`; focus `{ target, documentId, destination: 'editor' | 'terminal' }`. Add host `composerAction` with `{ target, documentId, action: 'submit' | 'toggle' | 'pickCommand' | 'find' | 'replace' | 'undo' | 'redo' }` so native VS Code commands can address the webview without a second hard-coded browser keymap. UUID/generation/request/document IDs are canonical UUIDs; live IDs are nonempty strings. Revisions and indexes are bounded nonnegative safe integers. Validate selection offsets against the corresponding text. [S:L65-L139; R1]

## Task 0: Verify the future release line and execution baseline

**Read:** `docs/versioning-policy.md`, `.github/release-policy/config.json`, the approved spec, PR #195, and #145. **Modify now:** none of the release files. **Interfaces:** produces a verified execution checkout on the authorized 0.13.x line; consumes the maintainer's release target. [#145; R0]

- [ ] Read the live release authority, existing milestones/PRs, local worktrees and current branch. Confirm #145 targets 0.13.0. If the milestone could not be created during planning, create/assign it once authenticated; do not invent its numeric ID. Planning encountered an invalid `gh` credential (HTTP 401); this does not block writing this plan.
- [ ] Require the policy-approved 0.13.x registration and initialized integration branch before runtime work. If absent, stop feature execution and track the necessary release-line preparation through its own issue/policy PR; do not retarget 0.11.x or bump stable main. The predecessor promotion/registration follows R0, not a guessed current version.
- [ ] Make sure this design/plan checkpoint is committed and accessible on the execution base. Create primary branch `codex/145-prompt-composer` in an isolated worktree from the registered integration line, with related workstream branches cut from that primary branch only if execution warrants them. Keep all runtime PRs out of stable main.
- [ ] Run `npm ci`, `npm run check:types`, `npm run lint`, and `npm run test:unit` in that execution worktree. Record the exact base SHA and failures before modifying product code. Do not fix unrelated baseline failures under #145.
- [ ] Record the baseline and actual compatibility matrix in the Task 1 evidence output. No release or feature commit is fabricated by completing this prerequisite. [R0; `CONTRIBUTING.md:L24-L63`]

## Task 1: Prove the session bridge and normal submission semantics

**Create:** `test/support/composerNativeProbe.ts`, `test/unit/composerNativeProbe.test.ts`, `test/fixtures/composer/bridge-contract.json`, `docs/research/145-composer-bridge-evidence.md` (planned outputs). **Read:** `media/attention/hooks/register.js`, `src/launch/claudeCapabilities.ts`, `src/launch/sessionLaunch.ts`. **Interfaces:** consumes actual installed CLI declarations; produces a documented passing route for `ClaudeComposerAdapter` and committed sanitized fixtures. Downstream runtime work is blocked until this task's gate passes. [S:L123-L139; R5; E1; E3; E4]

- [ ] Write probe-control tests: the runner does not launch a live/model session on import or default CI; fixtures record CLI/VS Code/extension SHAs; missing capabilities report unsupported; prompts, answers, tokens and user paths are excluded from committed evidence. Use harmless, explicitly created fixture text for assertions.
  Assertion targets for the import/no-opt-in fixture: `assert.equal(nativeLaunchCalls.length, 0)` and `assert.equal(modelCalls.length, 0)`. Probe output uses fixture IDs and booleans, not captured terminal content.
- [ ] Run `npm run compile:tests`, then `npx --no-install mocha "out/test/unit/composerNativeProbe.test.js"`. Confirm tests fail for the missing probe control before implementing it.
- [ ] Implement the opt-in probe and exercise supported live command listing plus candidate normal terminal fill/submit and command routes. Record actual commands/fixture definitions, installed versions, ordinary/skill/built-in/multiline/@file outcomes, a busy session, a native dialog, pre-existing terminal input, and interrupted/dropped requests. Determine whether acceptance can be acknowledged **before a response finishes**. Do not infer this from a PTY write or mod API documentation.
  Probe entry: `main(argv: readonly string[]): Promise<number>`, invoked explicitly as `node out/test/support/composerNativeProbe.js --run-live --claude-executable <configured-executable>`. No `--run-live` means no native/model calls and a nonzero result with setup guidance. The evidence file records the actual fixture command and sanitized output; the executable is passed as process data, never concatenated into a shell command.
- [ ] Assert Review Focus 1: native Ctrl+Enter is never the chosen queue action; the busy prompt enters normal queuing; a permission dialog receives no prompt keystrokes; existing terminal text is preserved or causes `terminal-draft` rejection. Verify identical displayed invocations execute as commands/skills, not model prose. Verify two sessions cannot receive one another's requests. Re-run the targeted tests against sanitized fixtures.
- [ ] Commit the evidence, probe and its fixtures together. Select the adapter route in the evidence and cite exact outputs. If any required behavior cannot be proved on the supported matrix, stop and return the demonstrated constraint to the maintainer; no later task may replace the contract with best-effort typing. [S:L129-L139]

## Task 2: Add versioned per-session composer persistence

**Create:** `src/composer/composerTypes.ts`, `src/composer/composerStore.ts`, `test/unit/composerStore.test.ts`, `test/support/composerHarness.ts` (planned outputs). **Read:** `src/sessions/resumableSessionStore.ts`, `test/support/memoryMemento.ts`. **Interfaces:** produces the shared contracts above and `ComposerStore` methods `get(uuid): SavedComposerSession | undefined`, `saveDraft(session: SavedComposerSession): Promise<SaveResult>`, `recordAccepted(uuid, requestId, text): Promise<void>`, `forget(uuid): Promise<void>`, `transferDraft(sourceUuid, target: SavedComposerSession): Promise<void>`, `setFavorite(invocation, enabled): Promise<void>`, `flush(): Promise<void>`. `favorites` is a readonly invocation list. [R3; R6; S:L65-L111]

- [ ] Write failing tests named `restores drafts by Claude UUID across new store instances`, `failed writes never report saved`, `late writes cannot resurrect a forgotten UUID`, `older revisions cannot replace newer drafts`, `draft-only transfer preserves source until destination persists`, and `recent history is accepted-composer-only and bounded`. Assert two distinct UUIDs keep distinct text and selections; schema-v1 composer state leaves the existing resumable-session key untouched.
  Revision regression assertions: `assert.equal(await store.saveDraft(olderSession), 'stale')`; `assert.equal(store.get(uuid)?.draft.text, 'newer draft')`. Both session fixtures use the same UUID with revisions 1 and 2 respectively.
- [ ] Run `npm run compile:tests`, then `npx --no-install mocha "out/test/unit/composerStore.test.js"`; confirm the expected missing store/contracts fail.
- [ ] Implement schema-v1 validation, immutable snapshots, serialized mutations, per-UUID generation/tombstone protection and the shared bounds. Save draft/accepted-request history transitions consistently; reject unknown/corrupt records without erasing other valid recoverable text. Persist favorites at workspace scope. Do not change the existing saved-session schema just to add composer fields.
- [ ] Add Unicode UTF-8-byte and UTF-16 selection-boundary tests; assert oversized drafts return `too-large` and remain visible/unsaved, history eviction removes oldest entries without truncating a draft, duplicate accepted request IDs add one recent entry, Forget removes associated draft/history, and failed transfer remains recoverable. Re-run targeted tests and typecheck.
- [ ] Commit this independently usable store and its tests. Store changes alone must not expose incomplete composer UI or alter session launch behavior. [S:L65-L83]

## Task 3: Implement the proven private Claude adapter

**Create:** `src/composer/claudeComposerAdapter.ts`, `src/composer/composerBroker.ts`, `media/attention/hooks/composer.js`, `test/unit/composerBroker.test.ts`, `test/unit/claudeComposerAdapter.test.ts` (planned outputs). **Modify:** `media/attention/hooks/register.js`, `src/launch/sessionLaunch.ts`, `test/unit/sessionLaunch.test.ts`, `test/unit/attentionCompletionMod.test.ts`, `test/unit/packageAssets.test.ts`. **Interfaces:** consumes Task 1's proven route and Task 2's contracts; produces `createClaudeComposerAdapter(options: ComposerBrokerOptions): Promise<ClaudeComposerAdapter>`. `ComposerBrokerOptions` includes the host storage/platform context, current-target resolver, a transport factory, monotonic clock, and redacted failure callback. [S:L123-L139; R2; R5]

- [ ] Write failing broker tests for wrong authentication, wrong session/generation, malformed or oversized envelopes, duplicate submission IDs, a timeout after possible delivery, unsupported mods, and disposal during a request. Pin that rejected/duplicate/stale requests cause zero extra native submissions and that diagnostics contain no prompt or credential content.
  Duplicate fixture assertions after submitting the same request twice: `assert.equal(nativeSubmitCalls.length, 1)` and `assert.equal(firstResult.submissionId, secondResult.submissionId)`. Timeout-after-dispatch assertion: `assert.equal(result.status, 'unconfirmed')`.
- [ ] Compile and run `npx --no-install mocha "out/test/unit/composerBroker.test.js" "out/test/unit/claudeComposerAdapter.test.js" "out/test/unit/sessionLaunch.test.js" "out/test/unit/attentionCompletionMod.test.js"`; confirm new behavior fails before implementation.
- [ ] Implement **only** the Task 1 route. Choose the smallest supported private same-host transport demonstrated by the probe; this transport selection is deliberately gated rather than invented in the plan. Validate per-host/session/generation authentication, bounded requests, one overall timeout, idempotent submission IDs and cleanup. Register a separate composer hook module without changing the attention message schema. The adapter must return the exact `accepted`/`rejected`/`unconfirmed` contract; never retry ambiguous sends.
- [ ] Verify real fixture cases for native busy queue timing, dialog rejection, pending terminal draft safety, namespaced skills, built-in commands, multiline and spaced @file references. Re-run existing reporter/readiness/lifecycle tests to prove composer unavailability or exceptions do not break ordinary launch or activity reporting. Add package-asset coverage for every new runtime mod file.
- [ ] Commit adapter, hook wiring, fixtures and tests together. A route/API floor change, new helper runtime, remote-support expansion, or failure of Task 1's contract returns to the maintainer before continuing. [S:L129-L139]

## Task 4: Add the host controller and closed composer protocol

**Create:** `src/composer/composerController.ts`, `src/panel/composerProtocol.ts`, `test/unit/composerController.test.ts`, `test/unit/composerProtocol.test.ts` (planned outputs). **Modify:** `src/panel/protocol.ts`, `test/unit/protocol.test.ts`. **Interfaces:** consumes `ComposerStore` and `ClaudeComposerAdapter`; produces `ComposerController.updateDraft(target, draft): Promise<SaveResult>`, `submit(request): Promise<SubmitResult>`, `select(target): Promise<SavedComposerSession | undefined>`, `close(target): Promise<void>`, `forget(uuid): Promise<void>`, `restoreDraft(uuid): Promise<void>`, `flush(): Promise<void>`. Controller dependencies resolve current targets/root launch permissions and emit typed host messages. [R1-R3; S:L65-L139]

- [ ] Write failing tests for all closed message variants and exact-key rejection. In controller tests, defer adapter acceptance, type revision 2 while revision 1 is in flight, then acknowledge revision 1; assert revision 2 remains. Resume the same UUID under a new generation and assert the old acknowledgment cannot alter it. Forget during delayed writes must not recreate the record. These pin Review Focus 2.
  After resolving revision-1 acceptance: `assert.equal(store.get(uuid)?.draft.revision, 2)` and `assert.equal(store.get(uuid)?.draft.text, 'newer draft')`. After Forget: `assert.equal(store.get(uuid), undefined)` even when the old save callback finishes.
- [ ] Compile and run the new controller/protocol tests plus the existing protocol tests, confirming the new operations fail before implementation.
- [ ] Implement target validation, per-session send serialization, submission-ID deduplication and revision-aware clearing. Persist accepted-composer history through the store without logging content. Clear only an unchanged accepted revision. Mark timeout/unknown delivery unconfirmed, preserve the draft, and require explicit user action for any subsequent send.
- [ ] Implement saved, saving, unsaved-error, unavailable and unconfirmed host states. For draft-only Restore, use the existing validated launch planner, retain the source until the new session and destination save succeed, and prohibit duplicate/live-source restoration. Reject missing/changed roots without losing text. Flush before normal hide/switch/close; correlate all resulting updates to their session/revision. Add storage-failure and draft-only tests for Review Focus 4.
  Also test acceptance followed by a failed local history/draft-clear write: delivery remains **accepted**, local storage is **error**, text is retained, and a second native submission is never triggered automatically. Do not mislabel that case rejected or invite an automatic retry.
- [ ] Re-run targeted tests and typecheck, then commit controller/protocol changes. The panel UI is wired in Task 8; no browser message gains authority to choose arbitrary roots or executables. [S:L65-L83,L113-L139]

## Task 5: Build the adjustable editor view and customizable shortcuts

**Create:** `src/panel/webview/composer/editor.ts`, `src/panel/webview/composer/view.ts`, `src/panel/webview/composer/styles.css`, `test/unit/composerEditor.test.ts`, `test/unit/composerView.test.ts` (planned outputs). **Modify:** `package.json`, `package-lock.json`, `esbuild.js`, `src/panel/webview/styles.css`, `src/activation.ts`, `test/unit/activation.test.ts`. **Interfaces:** produces `createComposerEditor(options: ComposerEditorOptions): ComposerEditor`, exposing `setDraft(draft)`, `getDraft(): DraftState`, `focus()`, `find()`, `replace()`, `undo()`, `redo()`, `dispose()`; `createComposerView(options: ComposerViewOptions): ComposerView` exposes `hydrate`, `handleHostMessage`, `focusEditor`, `setVisible`, `dispose`. Options use Task 4's typed message intents. [S:L27-L63; R4; E2; E5]

`ComposerEditorOptions` contains `parent: HTMLElement`, `initialDraft: DraftState`, and `onChange: (draft: DraftState) => void`; editor command methods return `void`. `ComposerViewOptions` contains `parent: HTMLElement`, `documentId: string`, `postMessage: (message: ComposerWebviewMessage) => void`, `focusTerminal: () => void`, and injected editor creation for tests. Task 4 defines `ComposerWebviewMessage`/`ComposerHostMessage` as the exact composer unions above. `hydrate` accepts the `composerHydrate` payload; `handleHostMessage(message: ComposerHostMessage): void`, `focusEditor(): void`, `setVisible(visible: boolean): void`, and `dispose(): void` are the remaining view signatures. [R1; R4; S:L123-L139]

- [ ] Write failing tests for Ctrl+Enter -> one `composerSubmit`, Enter -> newline, Ctrl+G -> draft-preserving hide/show, composition Enter -> no send, and native shortcut scope outside Claude Workspaces -> no interception. Test text/selection/undo independently of CodeMirror's real DOM layout. Add focus tests for background output/status and editor/picker/terminal transitions (Review Focus 3).
  Core assertion targets: `assert.equal(submitIntents.length, 1)` after the bound send command, `assert.equal(submitIntents.length, 0)` for an IME-only fixture, and `assert.equal(document.activeElement, editorElement)` after a background status update.
- [ ] Compile and run the new editor/view tests plus activation tests; confirm expected missing operations fail. Then resolve compatible exact versions of CodeMirror state/view/commands/search/autocomplete/Markdown packages from their primary package metadata and lock them with npm. Do not assume VS Code exposes its internal editor inside the webview.
- [ ] Implement the editor adapter, multiline clipboard, undo/redo, find/replace, wrapping and explicit input-mode handling. Preserve selection per session. Start at roughly one-third available height, remember workspace split, support pointer and keyboard divider resizing, expansion and narrow toolbar reflow. Keep terminal/editor DOM stable through ordinary draft/status updates.
- [ ] Register `claudeWorkspaces.composer.submit`, `.toggle`, `.focus`, `.pickCommand`, `.find`, `.replace`, `.undo`, `.redo`, `.configureShortcuts` as full command IDs using the same prefix, with typed command-registry coverage. Use focus contexts `claudeWorkspaces.composerFocused` and `claudeWorkspaces.composerPickerFocused`; use the existing focused view ID for toggle while hidden. Define one owner per key: customizable VS Code commands are authoritative; editor handlers must not double-submit or swallow a rebound key. Configure shortcuts opens the filtered native editor. Prove rebindings and chords in Task 8's real host.
- [ ] Run targeted tests, typecheck and `npm run build:production`. Confirm editor dependencies/CSS are bundled and do not require CDN/network resources; record actual package-size change without claiming a preselected budget. Commit view, manifest, lockfile and build changes together. [S:L53-L63,L123-L139]

## Task 6: Add live command selection, favorites and scoped file references

**Create:** `src/composer/composerCatalog.ts`, `src/composer/composerFiles.ts`, `test/unit/composerCatalog.test.ts`, `test/unit/composerFiles.test.ts` (planned outputs). **Modify:** `src/panel/webview/composer/view.ts`, `test/unit/composerView.test.ts`. **Interfaces:** catalog `list(target: ComposerTarget, refresh?: boolean): Promise<readonly ComposerCommand[]>`; pure `insertInvocation(text, selection, invocation): { text: string; selection: { anchor: number; head: number } }`; files `pick(target: ComposerTarget): Promise<string | undefined>` returning only a CLI-compatible reference. Dependencies use host-owned launch roots, existing imported-directory snapshots, workspace exclusions, and VS Code filesystem/picker APIs. [S:L85-L107; R2; E3; E4]

- [ ] Write failing tests for exact namespaced invocation insertion at the beginning, replacing an incomplete first slash token, no execution on selection, stale catalog results after tab switch, unavailable favorites, refresh rejection, duplicate display names, file-result bounding, and exclusion/symlink escapes. Assert manual editing remains usable when listing is unavailable.
  Pure insertion example: `assert.equal(insertInvocation('inspect this change', { anchor: 0, head: 0 }, '/fixture:review').text, '/fixture:review inspect this change')`; choosing that item must leave `nativeSubmitCalls.length === 0`.
- [ ] Compile and run the catalog/file tests and view tests. Confirm the absent services fail before implementing them.
- [ ] Implement a unified searchable command/skill picker with source information and workspace favorites. Refresh on open, target change and explicit request; bound cache by session/generation and timeout. Do not invent a skill-only discriminator absent from the API. Preserve unavailable favorite invocations and never substitute similar names.
- [ ] Implement bounded root/import-scoped file picking with workspace exclusions. Reject paths outside the allowed resolved roots, including symlink escapes; do not upload file bytes or scan unrelated roots. Insert the exact path quoting/escaping proven in Task 1. Verify Windows paths, spaces, cancellation, permission errors, and late results after closure. These pin Review Focus 5.
- [ ] Re-run targeted tests and a real command/file selection smoke check using the Task 1 runner, then commit. File selection and catalog reads must not launch model turns. [S:L85-L107]

## Task 7: Add bounded recent-prompt recall and restricted preview

**Create:** `src/panel/webview/composer/markdownPreview.ts`, `test/unit/composerWritingTools.test.ts` (planned outputs). **Modify:** `src/panel/webview/composer/view.ts`, `src/composer/composerController.ts`, `package.json`, `package-lock.json`, `test/unit/composerController.test.ts`, `test/unit/composerView.test.ts`. **Interfaces:** `renderComposerMarkdown(text: string): string` returns sanitized restricted markup; history uses Task 2's stored accepted entries and a `composerHistorySelected` intent with an index and explicit Replace/Append choice. [S:L101-L111]

- [ ] Write failing tests that only accepted composer sends enter history, selecting history does not send, a nonempty draft requires Replace/Append, and preview retains the original draft/selection. Assert `<script>`, raw HTML, JavaScript URLs, event attributes and remote images cannot execute or load; headings/lists/emphasis/fenced code still render.
  Restricted-output assertion: `assert.doesNotMatch(renderComposerMarkdown('<script>alert(1)</script>'), /<script/i)`. Parse the returned markup in JSDOM and assert there are no script/image elements, executable link protocols, or event-handler attributes; escaped literal text is allowed.
- [ ] Compile and run writing-tools, controller and view tests; confirm unsupported preview/history behavior fails first.
- [ ] Pin one established basic Markdown parser after checking its documented HTML/link/image controls; add a dedicated sanitizer or explicit renderer restrictions sufficient for the tests. No raw HTML, remote image fetching, executable code blocks or document-runtime features. Route links through the existing host external-link action after URL validation; submit the original source, never rendered HTML.
- [ ] Add recent snippets, explicit Replace/Append behavior and an Edit/Preview toggle inside the same composer area. Reuse the store's 20-item/256-KiB caps and accepted-request deduplication; oversized accepted prompts can be omitted from history with a visible explanation, never truncated into misleading text. Test persistence across reopen and removal on Forget.
- [ ] Run targeted tests, typecheck and production build, then commit these writing tools and dependency metadata. This task adds no transcript reading, global history, attachments or template manager. [S:L101-L111,L155-L159]

## Task 8: Wire activation, durable recovery and real-host behavior

**Create:** `test/integration/composer.test.ts` (planned output). **Modify:** `src/extension.ts`, `src/launch/launchController.ts`, `src/panel/sessionPanelProvider.ts`, `src/panel/webview/index.ts`, `src/panel/webview/renderer.ts`, `test/integration/activation.test.ts`, `test/unit/sessionResumeController.test.ts`, `test/unit/webviewRenderer.test.ts`, `test/integration/lifecycle.test.ts`. **Interfaces:** consumes Tasks 2-7 and attaches their factories/actions to the existing activation lifecycle; inject current-target and launch resolution rather than exposing process handles to presentation. Provider tests already live in the extension-host activation suite, not a nonexistent unit-provider file. [R1-R6; S:L65-L153; `test/integration/activation.test.ts:L1325-L1380`]

- [ ] Write failing integration fixtures for activation/hydration, hide/show and per-session switching; reconstruct activation with the same Memento and confirm draft recovery. Test Forget, changed root, a draft-only session, simultaneous windows/generations, and disposal with save/send/catalog work in flight. With fake PTYs, assert no raw Ctrl+Enter or dialog-answer keystrokes are written.
  Recreated-store assertions: `assert.equal(restoredStore.get(firstUuid)?.draft.text, 'first session draft')` and `assert.equal(restoredStore.get(secondUuid)?.draft.text, 'second session draft')`; the two live generation IDs differ from the previous activation.
- [ ] Run `npm run compile:tests`, then `npx --no-install mocha "out/test/unit/sessionResumeController.test.js" "out/test/unit/webviewRenderer.test.js"`, and `npm run test:integration` for provider/activation and the new composer cases. Confirm new wiring scenarios fail before adding the actual composition root; do not run extension-host tests with plain Node Mocha.
- [ ] Wire the host store/controller/broker and browser view. Merge composer hydration into the existing panel without overwriting saved sidebar/detail state. Show Restore draft for retained non-resumable drafts. Ensure normal terminal input, notification selection and activity tracking retain their existing owners; call prompt-submitted activity handling once after accepted ordinary prompt submission, not on every editor key or a rejected send.
- [ ] Run `npm run test:integration` in the supported saved-workspace and folder-window configurations. Use real Windows keyboard input to verify Ctrl+Enter, Ctrl+G, rebinding, chords, IME, clipboard, divider resizing, background-output focus, narrow/wide panels, and tab/reload/restart/resume behavior. Test 1.128.0 and the then-current supported VS Code configuration; record actual versions rather than calling a pinned historical fixture latest.
- [ ] Use a real managed Claude session for skills, built-ins, multiline, @file, pre-existing native input, native queue display, dialog ownership, unknown acknowledgments and shutdown. Add sanitized observations to the committed evidence output. Fake integration alone does not close these gates. Commit wiring and tests only when its matrix passes. [S:L141-L153; E1-E4]

## Task 9: Validate the candidate, document shipping behavior, and retire the plan

**Modify:** `README.md`, `CHANGELOG.md`, `test/unit/packageAssets.test.ts`, and the Task 1 evidence output. **Read:** the approved release policy and #145. **Interfaces:** consumes a fully integrated feature on the authorized 0.13.x line; produces an independently reviewable candidate and durable evidence, not automatic publication. [S:L141-L159; #145; R0]

- [ ] Reconcile every #145 acceptance criterion against the spec, tests and real-host evidence. Include all five Review Focus classes; unresolved bridge semantics, data loss, duplicate sends, wrong-session actions or keyboard-focus problems block completion.
- [ ] Run `npm run check:types`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run build:production`, and `npm run test:release-policy`. Expected: all commands exit 0. Package only after the registered integration metadata permits it with `npm run package:prerelease`; inspect the actual VSIX for browser assets, new mod files, and absence of test/probe/secret payloads. This is packaging, not publication. [R0; `package.json:L33-L49`]
- [ ] Document real shipped defaults, shortcuts/rebinding, composer capability/fallback, per-session draft/history storage and cleanup, file scope, native queue behavior, preview limits, and actual supported versions. Add the feature to the 0.13.0 prerelease changelog at the correct release-preparation point; do not rewrite a frozen/published version. Obtain screenshots from the real extension, not these design mockups. [`CONTRIBUTING.md:L65-L90`; S:L141-L159]
- [ ] Audit `git diff <integration-base>...HEAD --stat` against every claimed deliverable. Verify all committed consumers' actual fixture/data/evidence references with `git ls-tree HEAD -- <path>`. Before every push check the live PR is still open. Inspect live reviews, unresolved comments, outstanding requests and exact-head CI before any separately authorized merge. The implementing PR body must include `Closes #145`; intermediate checkpoint PRs must not close the parent prematurely.
- [ ] When #145 actually closes, extract durable rationale/evidence into the issue/PR or lasting design documentation, redirect committed references away from this execution plan, then **delete this plan**. Confirm no committed consumer still relies on it. Clean up merged worktrees with the local `clean-gone` skill. Publication and any stable promotion remain separately authorized actions. [#145; R0]

## Self-review and handoff

Coverage: layout/keys/focus -> Tasks 5/8; durable drafts/draft-only recovery/Forget -> Tasks 2/4/8; correct native submission -> Tasks 1/3/4/8; picker/favorites/files -> Task 6; history/preview -> Tasks 2/7; release targeting, documentation, artifacts and lifecycle -> Tasks 0/9. Interfaces are defined once above or in the owning task; downstream tasks consume those signatures. Each coding task uses a failing-test/run/implement/pass/commit cycle. [S:L11-L159]

This plan is prepared for review, not being executed. No live Claude bridge, new dependency, runtime feature, release-line change, or publication has been performed as part of planning. Proposed native execution is suitable for the tightly coupled adapter/controller/protocol interfaces; the user must choose or confirm the execution approach before implementation. [#145]
