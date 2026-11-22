# Shared session header implementation plan

> Use the test-driven development and executing-plans skills for the implementation.

**Goal**

Give live tabs and the header actions one row in both dock positions. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253)

**Architecture**

Use the width remaining beside the fixed action group to fit the tabs. Reuse the existing session popup coordinator for the conditional live-session picker and the Restore Draft popup. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253), `049c822:src/panel/webview/renderer.ts:L140-L180`, `049c822:src/panel/webview/renderer.ts:L425-L469`

**Tech stack**

TypeScript, CSS, Mocha, and JSDOM. `049c822:package.json:L38-L49`, `049c822:test/unit/webviewRenderer.test.ts:L1-L22`

## Layout and overflow

- [ ] Add renderer tests for an exact fit, one-tab overflow after resizing, the active tab reserving space, label changes, and the picker reaching all sessions. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253)
- [ ] In `renderer.ts` and `styles.css`, place the live tabs and optional Sessions button on the left and the action group on the right. Use the measured tab widths, gaps, and remaining header width. Reserve picker width only after detecting overflow, and keep the active tab visible if it fits. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253), `049c822:src/panel/webview/styles.css:L33-L85`
- [ ] Recheck after resize and tab updates. Return focus to a visible control when resize hides the focused tab or removes the Sessions button. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253)

## Draft recovery

- [ ] Test that **Actions → Restore Draft…** opens recovery when the Sessions trigger is hidden. Keep the existing restore and forget behavior and verify focus after Escape and after the last recovery row disappears. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253), `049c822:src/panel/webview/renderer.ts:L1097-L1125`
- [ ] Move the existing recovery list to its own popup and update the user guide and dock verification instructions. [#253](https://github.com/glitchwerks/vscode-claude-workspaces/issues/253), `049c822:docs/user-guide.md:L61-L67`, `049c822:docs/user-guide.md:L263-L272`

## Verification

- [ ] Run the renderer tests, TypeScript checks, ESLint, and production build. `049c822:package.json:L38-L49`
- [ ] Check wide bottom and narrow right layouts using the production bundle. Verify resize in both directions, including a focused overflow control, and the 294-pixel right dock recorded in PR #249. [PR #249](https://github.com/glitchwerks/vscode-claude-workspaces/pull/249)
