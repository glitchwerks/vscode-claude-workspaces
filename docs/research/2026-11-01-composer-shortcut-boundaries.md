# Composer shortcut capability boundary

Target: 0.11.2; #204 and #205. Status: the requested automatic winning-binding
detection and forced capture of arbitrary customized shortcuts remain blocked.
This document records a limitation, not completion of those behaviors.

The maintainer chose **Keep VS Code mode only** after reviewing an optional
editor-local shortcut list and its separate customization source. Preserve
VS Code's existing user bindings, disabled defaults, keymap extensions and chords.
Do not introduce a second binding list or silently reactivate hardcoded defaults.
[Decision and execution authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145#issuecomment-6558551426).

## Evidence

- The public command API documents command registration, execution and listing
  command identifiers. No effective-keybinding lookup or resolver was established
  in the reviewed public API. This is a research result, not proof that a future
  VS Code release cannot add one. Source: https://code.visualstudio.com/api/references/vscode-api#commands
  (fetched 2026-11-01).
- VS Code resolves shortcut rules using context, source and ordering. The native
  Keyboard Shortcuts UI provides Show Same Keybindings, while Developer: Toggle
  Keyboard Shortcuts Troubleshooting records actual dispatch. Sources:
  https://code.visualstudio.com/docs/configure/keybindings#keyboard-rules and
  https://code.visualstudio.com/docs/configure/keybindings#detecting-keyboard-shortcut-conflicts
  and https://code.visualstudio.com/docs/configure/keybindings#troubleshooting-keyboard-shortcuts
  (fetched 2026-11-01).
- The bundled webview preloads inspected in the pinned 1.128.0 and 1.136.1 test
  distributions register a bubbling window keydown listener and forward key
  events to the workbench. Merely calling preventDefault is not a supported
  effective-binding resolver. Current upstream source:
  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html
  (fetched 2026-11-01). These fixture versions are identified in .vscode-test.js.
- Existing native composer bindings deliberately omit modified shortcuts from
  the local editor keymap. Source: src/panel/webview/composer/editor.ts:L10-L15;
  package.json:L297-L327. The original customization requirement is #145.

## Consequence

Inference: without a supported effective-binding source, a local handler cannot
reliably honor arbitrary user changes, disabled defaults, chords, keyboard layout
and context while also forcing those actions ahead of VS Code. Reading a guessed
profile keybindings file or registering unconditional local defaults would not
satisfy that contract. The maintainer declined a separate local binding list
(#204, #205; decision above).

The candidate retains native command routing and documents the native conflict
tools. Completion navigation/acceptance and IME suppression remain local where
their context is known. They never submit implicitly (#202). These scoped local
actions do not imply arbitrary customized-shortcut capture is implemented.

#204 and #205 need a supported upstream mechanism or an explicit maintainer
decision accepting a reduced requirement. Keep both open; do not count this
research or the native troubleshooting instructions as automatic detection or
forced capture. The 0.11.2 candidate must not be published without approval.

## Artifact check

The source references above are existing tracked files. Before this report is
committed, verify with git ls-tree HEAD -- .vscode-test.js package.json
src/panel/webview/composer/editor.ts. External source URLs are the durable
references for downloaded VS Code distributions; those binaries are not shipped
as project artifacts.
