# Prompt composer candidate verification

Use a local Windows x64 VS Code Extension Development Host with a saved multi-root workspace and an authenticated Claude CLI 2.1.299+ session. Repeat the UI checks on the pinned 1.128.0 and 1.136.1 test hosts; these are explicit fixtures, not a claim that either is the latest release. Record actual versions, candidate commit and results. Use synthetic prompts and no private project data. [#145; #183; `.vscode-test.js:L1-L55`]

Automated extension-host API tests cover composition and recovery; they do not replace physical keyboard input, visual inspection or native queue checks. The remaining acceptance scope is defined in the approved design. [#145; `docs/superpowers/specs/2026-10-30-embedded-prompt-editor-design.md:L141-L153`]

1. In the terminal, press Ctrl+G. Verify the embedded editor toggles and the CLI does not also invoke its own Ctrl+G action. Repeat while the editor and picker have focus, including a terminal session without a Claude session ID. Move to another VS Code view and back; composer shortcuts must follow focus. Open Shortcuts, rebind Toggle and Send, and assign a chord. Verify those bindings work and removed bindings no longer trigger composer actions. Enter must insert a newline; Ctrl+Enter must send once with the prompt editor focused. Hold the send shortcut through an unconfirmed result and verify no automatic resend. Finish an IME composition before testing send. Arbitrary customized terminal gestures remain subject to #205's documented native-routing limitations. [#145, #205]
2. Create two sessions. Type different drafts and selections, switch repeatedly, hide/show, close/reopen the view, restart VS Code and resume each session. Verify each draft, selection and normal split are restored. Type during an in-flight send: acceptance must not erase newer text. Rejected and unconfirmed sends retain the draft; inspect Claude's queue before explicit retry. Closing retains drafts and Forget removes them. [#145]
3. With only retained draft records, verify Saved drafts lists Restore and Forget. Restore opens a fresh UUID session at the original exact root and does not send. Missing/changed roots must preserve the source. An eligible conversation has one Resume row; live UUIDs have no saved row. Test with more than 100 drafts so the final page is reachable. [#145]
4. Resize the divider and expand/collapse at narrow and wide widths in light and dark themes. Verify terminal and editor remain usable, toolbars wrap, and the normal split survives reload. Background output must not steal focus. Exercise clipboard, undo/redo, Find/Replace and selection. Capture the real extension in synthetic 16:9 PNG screenshots at least 1200 pixels wide. [#145; `CONTRIBUTING.md:L72-L85`]
5. Select native skills and built-ins and insert quoted @file references with spaces. Selection alone must not run a model turn. Verify queue display in Claude during an active response, multiline acceptance and correct native file/skill expansion. Pre-existing native draft or dialog input must remain intact and prevent composer automation. Preview must not execute HTML, fetch images or alter the draft. [#145]

Do not mark the feature or release validation complete until observations are recorded in the issue and sanitized evidence. Publication and merge require their existing separate approvals. [#145; #183]

## 0.11.2 regression checks

- Start a fresh Claude session and type a leading slash prefix while it starts.
  Without opening Skills / commands or clicking Refresh, confirm the catalog
  recovers from an initial unavailable response and inline suggestions appear.
  A complete recognized command receives coloring. If discovery stays
  unavailable, retries must stop after six attempts and explicit Refresh must
  remain available. Switching sessions, losing bridge availability or reloading
  must cancel stale discovery work. No discovery retry may submit a prompt or
  replace the draft/selection. [#201, #202]
- At narrow widths and zoom, search long skill names, descriptions and provenance.
  Confirm ellipsis, reachable favorites, full-text search and exact insertion.
  Hover and keyboard-focus a result; its full text must be readable in the
  scrollable tooltip. Expand must become Collapse and restore the adjusted split.
  Compare composer buttons with existing actions in light/dark/high-contrast
  themes. [#199, #200, #203]
- Type a leading /command prefix, including a plugin namespace. Accept a
  suggestion with Tab and Enter, undo/redo it, and verify arguments remain intact.
  Tab acceptance keeps editor focus; Tab without a selected suggestion and
  Shift+Tab navigate between controls. Modified Tab shortcuts remain native,
  and Tab during IME composition must not accept a suggestion.
  Enter without a suggestion inserts a newline. Neither selecting a suggestion
  nor IME composition may submit; explicitly send only after selection ends.
  The searchable reference browser and favorites must remain available. [#202]
- Check recognized commands and quoted @paths with spaces. Unknown commands
  followed by whitespace and confirmed missing files receive advisory underlines;
  unfinished tokens, unavailable catalogs and inaccessible paths do not become
  false invalid-reference errors. Switch sessions or edit while validation is
  pending; stale results must not appear in the new draft. [#201]
- Customize shortcuts only through VS Code. Inspect conflicts with Show Same
  Keybindings and the documented troubleshooting log. Automatic winner detection
  and forced capture of arbitrary custom bindings are not implemented; #204 and
  #205 remain open under the maintainer's native-only decision. [#204, #205;
  https://github.com/glitchwerks/vscode-claude-workspaces/issues/145#issuecomment-6558551426]
