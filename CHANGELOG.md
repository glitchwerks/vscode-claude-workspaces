# Changelog

## [Unreleased]

## [0.11.2] - 2026-11-01

Prepared prerelease candidate; **not published**. Release publication requires
the maintainer's approval. Continues the embedded prompt composer testing under
#145 and the 0.11.x reliability work in #183. Automatic composer sending still
requires Claude CLI 2.1.299+; stable 0.10.0 and published 0.11.1 are unchanged.

### Added

- Color native skill/command invocations and explicit @file references, with
  advisory warnings for confirmed unknown commands and missing files. Scope
  validation to the active session and discard stale results (#201).
- Suggest effective slash invocations while typing, preserving arguments and
  undo, alongside the searchable Skills / commands reference browser. Selecting
  a suggestion never sends the prompt (#202).

### Fixed

- Track Sessions webview focus for native composer shortcuts and forward the
  terminal's default Ctrl+G toggle gesture to VS Code's keybinding resolver (#145).
- Accept a selected slash suggestion with Tab while preserving normal Tab and
  Shift+Tab focus navigation outside completion (#202).
- Recover command discovery after a cold-start timeout with bounded read-only
  retries, so inline suggestions and command coloring can become available
  without manually refreshing the browser (#201, #202).
- Truncate long skill results with ellipsis and expose complete text on hover
  and keyboard focus in a bounded, scrollable tooltip (#199).
- Change Expand to Collapse while expanded and preserve the normal split (#200).
- Align composer buttons with the extension's existing dimensions and theme
  colors, including more prominent neutral Send and saved-draft Forget buttons
  in dark themes, plus disabled, toggled and high-contrast states (#203).

### Pending

- Reliable automatic shortcut-conflict detection and forced interception of
  arbitrary custom bindings remain constrained by VS Code's supported API.
  The maintainer chose to keep customization solely in VS Code; a separate
  local keymap is not included (#204, #205).

## [0.11.1] - 2026-10-31

Testing prerelease for the 0.11.x cycle, approved for hands-on testing before
physical keyboard, layout, native queue display and screenshot acceptance.
The earlier typing/rendering and broader activity validation remain open too
(#145, #180, #56, #158, #183).

### Added

- Add the embedded prompt composer below the terminal, with remembered split,
  per-session drafts, live skill/command selection, bounded file references,
  favorites, recent prompts and restricted Markdown preview (#145). Automatic
  native-queue sending requires Claude CLI 2.1.299+; ordinary terminal/activity
  support keeps its existing minimum. Physical keyboard and layout acceptance
  remain pending for this testing candidate.

### Fixed

- Avoid rebuilding saved-draft recovery pages during routine live-session draft
  autosaves; retain refreshes for recovery-visible and ownership changes (#145).
- Keep Send responsive when preflight rejects a changed or oversized draft,
  refresh Recent after acceptance while preserving newer typing, and clear an
  accepted draft after a failed save recovers (#145).
- Retry composer channel setup after transient filesystem failures, preserve
  saved-draft row focus during refresh, and remove composer data when Forget
  Session is chosen from a resume-failure notification (#145).

## [0.11.0] - 2026-10-30

Testing prerelease for the 0.11.x reliability investigation. Includes bounded
terminal diagnostics and confirmed-subagent-completion recovery. The reported
typing stalls and visual corruption are not verified fixed; real-keyboard,
rendering and full application acceptance remain open
(#180, #56, #158, #183).

### Added

- Add opt-in Capture Terminal Diagnostics with bounded, payload-free timing
  histograms across the webview, extension host and PTY, plus a reproducible
  Windows echo workload for investigating typing stalls (#180).

### Changed

- Establish the 0.11.x development baseline from stable 0.10.0 for the rendering,
  input responsiveness and activity reliability milestone (#183). Investigation
  and validation cover typing stalls (#180), terminal corruption (#56) and
  native status/mod integration (#158).

### Fixed

- Retry confirmed background-subagent completions through the retained mod so
  a lost publication can recover the working indicator. Correlate each tracked
  start and completion so a delayed retry cannot finish a newer run of the
  same agent. Keep parent completion, unread and input-wait behavior unchanged
  (#158).

## [0.10.0] - 2026-10-26

Claude Workspaces 0.10.0 promotes the exact published 0.9.0 product snapshot
to the Marketplace stable channel for Windows x64 and VS Code 1.128.0 or later.
Source: `v0.9.0` at `61925e9c04408c8b3b5b5ef6e245c0786d0609e3`.

### Added

- Automatically include the effective default workspace root in sessions started
  from other folders, with an opt-out in Configure Workspace. New configurations
  default to enabled; existing configurations migrate with the option disabled
  and directed imports preserved (#26).
- Choose a left or right session action sidebar, with actions at the top and
  an independently scrolling resumable-session list below. Collapsed buttons
  show action names on hover; a preference controls whether new Sessions views
  start expanded or collapsed. Defaults remain right and expanded (#114).

### Changed

- Require VS Code 1.128.0 or later so notification selection can request focus
  for its existing owner window through VS Code's native per-window command
  (#174).

### Fixed

- Request terminal input focus when a notification selects an already-active
  Claude session, including when focus was elsewhere in its VS Code window
  (#174).
- Keep native notification activation available after the banner fades by
  maintaining owned callback handlers while selectable notifications remain.
  Renew the signed helper before its native timeout and stop owned handlers
  during extension shutdown. Request native window focus after selecting the
  live session, without opening another window (#174).
- Cancel pending notification registrations when their managed session closes
  or exits, stopping unnecessary helper renewal while preserving delayed clicks
  for other live sessions (#174).
- Share each launch's capability probe result, including failures, instead of
  probing again during the same launch. Report malformed hook JSON accurately
  and refresh native notification shortcut identity transactionally across
  concurrent VS Code windows (#152).
- Release the Windows PTY input socket and output worker after natural process
  exit, allowing the host to exit without another kill signal. Handle expected
  output-pipe disconnections during cleanup (#171).

### Known limitations

- Selecting a waiting-session toast can flash its owning VS Code taskbar entry
  without bringing the window forward or giving Claude keyboard focus. Click
  the owning window to activate it; enhanced Windows activation remains a
  separate follow-up (#176).
- The official Claude Code IDE integration can focus the native Terminal panel
  when opening a diff, even with the managed Claude Workspaces panel active.
  Preserving the IDE integration also preserves this focus behavior (#28).

### Installation

After the `v0.10.0` publication workflow succeeds, install or switch to the
Marketplace stable channel, then reload VS Code.

## [0.9.0] - 2026-10-22

Claude Workspaces 0.9.0 brings the changes below to the Marketplace pre-release
channel for Windows x64 and VS Code 1.128.0 or later. Stable 0.8.1 remains on the
stable channel. This pre-release includes feature work preserved separately
during the stable recovery (#155).

### Added

- Automatically include the effective default workspace root in sessions started
  from other folders, with an opt-out in Configure Workspace. New configurations
  default to enabled; existing configurations migrate with the option disabled
  and directed imports preserved (#26).
- Choose a left or right session action sidebar, with actions at the top and
  an independently scrolling resumable-session list below. Collapsed buttons
  show action names on hover; a preference controls whether new Sessions views
  start expanded or collapsed. Defaults remain right and expanded (#114).

### Changed

- Require VS Code 1.128.0 or later so notification selection can request focus
  for its existing owner window through VS Code's native per-window command
  (#174).

### Fixed

- Request terminal input focus when a notification selects an already-active
  Claude session, including when focus was elsewhere in its VS Code window
  (#174).
- Keep native notification activation available after the banner fades by
  maintaining owned callback handlers while selectable notifications remain.
  Renew the signed helper before its native timeout and stop owned handlers
  during extension shutdown. Request native window focus after selecting the
  live session, without opening another window (#174).
- Cancel pending notification registrations when their managed session closes
  or exits, stopping unnecessary helper renewal while preserving delayed clicks
  for other live sessions (#174).
- Share each launch's capability probe result, including failures, instead of
  probing again during the same launch. Report malformed hook JSON accurately
  and refresh native notification shortcut identity transactionally across
  concurrent VS Code windows (#152).
- Release the Windows PTY input socket and output worker after natural process
  exit, allowing the host to exit without another kill signal. Handle expected
  output-pipe disconnections during cleanup (#171).

### Known limitations

- Selecting a waiting-session toast can flash its owning VS Code taskbar entry
  without bringing the window forward or giving Claude keyboard focus. Click
  the owning window to activate it; enhanced Windows activation remains a
  separate follow-up (#176).
- The official Claude Code IDE integration can focus the native Terminal panel
  when opening a diff, even with the managed Claude Workspaces panel active.
  Preserving the IDE integration also preserves this focus behavior (#28).

### Installation

After the 0.9.0 publication workflow succeeds, install or switch to the
Marketplace pre-release channel with
`code --install-extension cbeaulieu-gt.vscode-claude-workspaces --pre-release`,
then reload VS Code. Stable 0.8.1 remains available on the stable channel.

## [0.8.1] - 2026-10-10

Claude Workspaces 0.8.1 promotes the published 0.7.2 product snapshot to the
Marketplace stable channel for Windows x64 and VS Code 1.120.0 or later.
This corrects the scope of the withdrawn GitHub 0.8.0 release (#155).
Development after that snapshot is preserved on the 0.9.x pre-release line.
The recovery includes a compatibility exception that preserves workspace
settings saved by Marketplace 0.8.0 without retaining its prerelease features.

### Added

- Emit one native Windows notification when an unfocused managed session enters
  a waiting-for-input stage, then route notification selection back to the
  correct workspace session while highlighting its VS Code window (#51).
- Show each live session's working indicator and green unread-response marker,
  clearing the unread marker after the response is viewed while preserving its
  waiting state (#109).
- Show a waiting-session badge on the Claude Workspaces panel tab that counts
  every live session waiting for input (#113).
- Choose **Close Session** from a live tab's context menu without first
  activating that session (#107).
- Add an assignable **Show Claude Workspaces** command for the Command Palette
  and Keyboard Shortcuts editor without reserving a default shortcut (#108).
- Provide **Capture Activity Diagnostics**, default off, for activity indicator
  reports. Capture records only event metadata and hashed IDs, stops after 256
  events or five minutes, and changes no settings. Run the command again to stop,
  including after the workspace becomes ineligible (#143).

### Fixed

- Preserve saved default-root selections and directed imports when upgrading
  from Marketplace 0.8.0, convert schema-v2 settings to schema v1, and discard
  the removed automatic-import preference (#155).
- Clear a session's waiting state and the aggregate panel badge immediately
  after its next prompt is submitted, without waiting for a later hook signal
  (#133).
- Clear stale waiting-session badge state as soon as work resumes, while
  ignoring background-agent stop signals that do not mean the parent session
  is waiting for input (#138).
- Route native Windows toast selections through the existing owning VS Code
  window without opening a new empty window, and ignore stale selections after
  their session or owner window closes (#137).
- Keep the session working indicator visible while background subagents remain
  active after the parent response ends. Track concurrent agents independently,
  preserve genuine input waits, and clear the indicator when work finishes (#143).
- Retry transient attention-signal file I/O failures before reporting a delivery
  error, reducing lost background-agent stop signals (#143).
- Confirm completion through a bundled reporter so blocking stop hooks keep
  their agents working. Background tracking requires Claude Code 2.1.287 or later
  and an admitted mod; unavailable reporters produce an explicit warning (#143).

### Installation

After the `v0.8.1` publication workflow succeeds, install or switch to the
Marketplace stable channel, then reload VS Code so the running extension host
loads the update. New feature development continues on `prerelease/0.9.x`.

## [0.8.0] - 2026-10-08

The GitHub release and tag were withdrawn under the maintainer's one-time
exception (#155). These notes record the withdrawn release's original contents.

Claude Workspaces 0.8.0 promotes the completed 0.7.x development line to the
Marketplace stable channel for Windows x64 and VS Code 1.120.0 or later.

### Added

- Automatically include the effective default workspace root in sessions started
  from other folders, with an opt-out in Configure Workspace. New configurations
  default to enabled; existing configurations migrate with the option disabled
  and directed imports preserved (#26).

- Choose a left or right session action sidebar, with actions at the top and
  an independently scrolling resumable-session list below. Collapsed buttons
  show action names on hover; a preference controls whether new Sessions views
  start expanded or collapsed (#114).

- Emit one native Windows notification when an unfocused managed session enters
  a waiting-for-input stage, then route notification selection back to the
  correct workspace session while highlighting its VS Code window (#51).
- Show each live session's working indicator and green unread-response marker,
  clearing the unread marker after the response is viewed while preserving its
  waiting state (#109).
- Show a waiting-session badge on the Claude Workspaces panel tab that counts
  every live session waiting for input (#113).
- Choose **Close Session** from a live tab's context menu without first
  activating that session (#107).
- Add an assignable **Show Claude Workspaces** command for the Command Palette
  and Keyboard Shortcuts editor without reserving a default shortcut (#108).
- Provide **Capture Activity Diagnostics**, default off, for activity indicator
  reports. Capture records only event metadata and hashed IDs, stops after 256
  events or five minutes, and changes no settings. Run the command again to stop,
  including after the workspace becomes ineligible (#143).

### Fixed

- Reuse one capability result per executable throughout each new, resumed, or
  restarted launch, including failed checks, while allowing the next launch to
  retry (#152).
- Classify malformed hook JSON as invalid payload without writing signals,
  leaking input content, or incorrectly reporting a file-write failure (#152).
- Refresh Windows notification identity to the current extension helper through
  a staged shortcut installation. Commit the shared shortcut only after success;
  preserve working shortcuts on installation failure and avoid removing another
  window's replacement during cleanup (#152).

- Clear a session's waiting state and the aggregate panel badge immediately
  after its next prompt is submitted, without waiting for a later hook signal
  (#133).
- Clear stale waiting-session badge state as soon as work resumes, while
  ignoring background-agent stop signals that do not mean the parent session
  is waiting for input (#138).
- Route native Windows toast selections through the existing owning VS Code
  window without opening a new empty window, and ignore stale selections after
  their session or owner window closes (#137).
- Keep the session working indicator visible while background subagents remain
  active after the parent response ends. Track concurrent agents independently,
  preserve genuine input waits, and clear the indicator when work finishes (#143).
- Retry transient attention-signal file I/O failures before reporting a delivery
  error, reducing lost background-agent stop signals (#143).
- Confirm completion through a bundled reporter so blocking stop hooks keep
  their agents working. Background tracking requires Claude Code 2.1.287 or later
  and an admitted mod; unavailable reporters produce an explicit warning (#143).

### Changed

- Document the upstream Claude Code IDE integration's Terminal panel-switch
  limitation and the loss of IDE features when disconnecting that integration
  (#28).

### Installation

After the `v0.8.0` publication workflow succeeds, install or switch to the
Marketplace stable channel, then reload VS Code so the running extension host
loads the update. New feature development continues in the 0.9.x pre-release
line after stable publication.

### Known limitations

- Claude Code's IDE integration can switch to the Terminal panel during a diff
  request. Disabling the integration avoids that behavior but removes its IDE
  features; retaining the integration retains this upstream limitation (#28).
- Notification selection highlights the owning window's taskbar entry; Windows
  does not reliably permit the extension to force that window to the foreground
  (#51).

## [0.7.2] - 2026-10-04

Claude Workspaces 0.7.2 targets the Marketplace pre-release channel for Windows
x64. Version 0.6.0 remains on the stable channel.

### Added

- Retain **Capture Activity Diagnostics**, default off, for activity indicator
  reports. Capture records only event metadata and hashed IDs, stops after 256
  events or five minutes, and changes no settings. Run the command again to stop,
  including after the workspace becomes ineligible (#143).

### Fixed

- Keep the session working indicator visible while background subagents remain
  active after the parent response ends. Track concurrent agents independently,
  preserve genuine input waits, and clear the indicator when work finishes (#143).
- Retry transient attention-signal file I/O failures before reporting a delivery
  error, reducing lost background-agent stop signals (#143).
- Confirm completion through a bundled reporter so blocking stop hooks keep
  their agents working. Background tracking requires Claude Code 2.1.287 or
  later and an admitted mod; unavailable reporters produce an explicit warning.

### Installation

After the `v0.7.2` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later, then reload VS Code
so the running extension host loads the update.

### Validation note

The user could no longer reproduce a reported indicator drop. A stale extension
host remains an unconfirmed explanation; diagnostic capture is available if
the symptom returns.

## [0.7.1] - 2026-09-26

Claude Workspaces 0.7.1 targets the Marketplace pre-release channel for
Windows x64. Version 0.6.0 remains available on the stable channel for VS Code
1.120.0 or later.

### Fixed

- Clear stale waiting-session badge state as soon as work resumes, while
  ignoring background-agent stop signals that do not mean the parent session
  is waiting for input (#138).
- Route native Windows toast selections through the existing owning VS Code
  window without opening a new empty window, and ignore stale selections after
  their session or owner window closes (#137).

### Installation

After the `v0.7.1` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.6.0 remains available on the stable channel.

## [0.7.0] - 2026-09-23

Claude Workspaces 0.7.0 targets the Marketplace pre-release channel for
Windows x64. Version 0.6.0 remains available on the stable channel for VS Code
1.120.0 or later.

### Added

- Emit one native Windows notification when an unfocused managed session enters
  a waiting-for-input stage, then route notification selection back to the
  correct workspace session while highlighting its VS Code window (#51).
- Show each live session's working indicator and green unread-response marker,
  clearing the unread marker after the response is viewed while preserving its
  waiting state (#109).
- Show a waiting-session badge on the Claude Workspaces panel tab that counts
  every live session waiting for input (#113).
- Choose **Close Session** from a live tab's context menu without first
  activating that session (#107).
- Add an assignable **Show Claude Workspaces** command for the Command Palette
  and Keyboard Shortcuts editor without reserving a default shortcut (#108).

### Fixed

- Clear a session's waiting state and the aggregate panel badge immediately
  after its next prompt is submitted, without waiting for a later hook signal
  (#133).

### Installation

After the `v0.7.0` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.6.0 remains available on the stable channel.

## [0.6.0] - 2026-09-17

Claude Workspaces 0.6.0 targets the Marketplace stable channel for Windows x64.
This release promotes the validated 0.5.2 pre-release without adding product
behavior during the promotion.

### Added

- Add configurable `off`, `error`, `warn`, `info`, `debug`, and `trace`
  diagnostic verbosity levels that apply immediately in the Claude Workspaces
  Output channel, with privacy-safe redaction boundaries (#84).
- Show each live session's immutable launch-root label and starting path
  separately from its added directories, while clarifying that later `cd`
  commands do not change this launch detail (#86).
- Show a relative **Last opened** time for every resumable session, refresh it
  in place, and expose the precise local timestamp in hover and accessible text
  (#87).

### Changed

- Preselect the saved default root and check the saved directed imports when
  reopening workspace configuration, while preserving cancellation and
  first-run behavior (#85).
- Replace the ambiguous “New in Folder…” square glyph with a distinct
  directory icon (#92).

### Fixed

- Preserve terminal input submitted while a new session's PTY is starting and
  add privacy-safe trace diagnostics across input and output delivery (#93).
- Prevent hidden zero-area terminal fits from reflowing scrollback into a
  permanently compressed grid (#94).

### Known Issues

- Issue #56 remains unresolved: intermittent terminal grid artifacts can still
  occur. The 0.5.1 default-renderer experiment produced minimal improvement,
  so 0.5.2 restored the WebGL renderer.

### Installation

After the `v0.6.0` publication workflow succeeds, install or switch to the
Marketplace stable channel on Windows x64 with VS Code 1.120.0 or later.

## [0.5.2] - 2026-09-16

Claude Workspaces 0.5.2 targets the Marketplace pre-release channel for Windows
x64. Version 0.4.0 remains available on the stable channel for VS Code 1.120.0
or later.

### Changed

- 0.5.2 restores the WebGL renderer because the 0.5.1 experiment showed minimal
  benefit. Issue #56 remains unresolved and is not marked fixed by this
  corrective release.

### Installation

After the `v0.5.2` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.4.0 remains available on the stable channel.

## [0.5.1] - 2026-09-14

Claude Workspaces 0.5.1 targets the Marketplace pre-release channel for Windows
x64. Version 0.4.0 remains available on the stable channel for VS Code 1.120.0
or later.

### Fixed

- Use xterm's default renderer for session terminals to avoid intermittent
  glyph corruption during concurrent command output (#56).

### Installation

After the `v0.5.1` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.4.0 remains available on the stable channel.

## [0.5.0] - 2026-09-12

Claude Workspaces 0.5.0 targets the Marketplace pre-release channel for Windows
x64. Version 0.4.0 remains available on the stable channel for VS Code 1.120.0
or later.

### Added

- Add configurable `off`, `error`, `warn`, `info`, `debug`, and `trace`
  diagnostic verbosity levels that apply immediately in the Claude Workspaces
  Output channel, with privacy-safe redaction boundaries (#84).
- Show each live session's immutable launch-root label and starting path
  separately from its added directories, while clarifying that later `cd`
  commands do not change this launch detail (#86).
- Show a relative **Last opened** time for every resumable session, refresh it
  in place, and expose the precise local timestamp in hover and accessible text
  (#87).

### Changed

- Preselect the saved default root and check the saved directed imports when
  reopening workspace configuration, while preserving cancellation and
  first-run behavior (#85).
- Replace the ambiguous “New in Folder…” square glyph with a distinct
  directory icon (#92).

### Fixed

- Preserve terminal input submitted while a new session's PTY is starting and
  add privacy-safe trace diagnostics across input and output delivery (#93).
- Prevent hidden zero-area terminal fits from reflowing scrollback into a
  permanently compressed grid (#94).

### Installation

After the `v0.5.0` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.4.0 remains available on the stable channel.

## [0.4.0] - 2026-09-10

Claude Workspaces 0.4.0 targets the Marketplace stable channel for Windows x64.
This release promotes the validated 0.3.1 pre-release without adding product
behavior during the promotion.

### Added

- Resume supported Claude sessions and recover from unexpected session exits.
  (#27)
- Propagate live workspace-root renames to active session labels (#37).
- Show richer session details, including the exact `--add-dir` paths used at
  launch (#38).
- Open HTTP and HTTPS links in session output through VS Code (#52).
- Reuse available root-local terminal ordinals after sessions close (#53).
- Provide New Session and related actions from the collapsible session sidebar
  (#54).
- Restore reliable multiline paste behavior in the embedded terminal (#55).
- Forget individual saved sessions directly from the resume-list context menu
  without attempting a resume first (#73).
- Show the full Claude session ID in each resume entry to distinguish duplicate
  default names (#77).

### Fixed

- Hide resume entries with no saved conversation, including sessions closed
  without a prompt, while preserving their metadata (#77).
- Match the embedded terminal background to the VS Code theme when no explicit
  terminal background is provided (#70).
- Use neutral session-action controls in dark themes while retaining primary
  controls in light themes (#71).
- Keep the workspace area filling the panel when no live sessions are open
  (#72).
- Keep the Claude Workspaces panel mounted while another bottom-panel tab is
  selected, and restore state if VS Code recreates the renderer document (#81).

### Installation

After the `v0.4.0` publication workflow succeeds, install or switch to the
Marketplace stable channel on Windows x64 with VS Code 1.120.0 or later.

## [0.3.1] - 2026-09-09

Claude Workspaces 0.3.1 targets the Marketplace pre-release channel for Windows x64.
Version 0.2.1 targets the stable channel for VS Code 1.120.0 or later.

### Fixed

- Keep the Claude Workspaces panel mounted while another bottom-panel tab is
  selected, and restore state if VS Code recreates the renderer document (#81).

### Installation

After the `v0.3.1` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.2.1 targets the stable channel in its maintenance release.

## [0.3.0] - 2026-09-07

Claude Workspaces 0.3.0 targets the Marketplace pre-release channel for Windows x64.
Version 0.2.0 remains the stable channel for VS Code 1.120.0 or later.

### Added

- Resume supported Claude sessions and recover from unexpected session exits.
  (#27)
- Propagate live workspace-root renames to active session labels (#37).
- Show richer session details, including the exact `--add-dir` paths used at
  launch (#38).
- Open HTTP and HTTPS links in session output through VS Code (#52).
- Reuse available root-local terminal ordinals after sessions close (#53).
- Provide New Session and related actions from the collapsible session sidebar
  (#54).
- Restore reliable multiline paste behavior in the embedded terminal (#55).
- Forget individual saved sessions directly from the resume-list context menu
  without attempting a resume first (#73).

- Show the full Claude session ID in each resume entry to distinguish duplicate
  default names (#77).

### Fixed

- Hide resume entries with no saved conversation, including sessions closed
  without a prompt, while preserving their metadata (#77).
- Match the embedded terminal background to the VS Code theme when no explicit
  terminal background is provided (#70).
- Use neutral session-action controls in dark themes while retaining primary
  controls in light themes (#71).
- Keep the workspace area filling the panel when no live sessions are open
  (#72).

### Installation

After the `v0.3.0` publication workflow succeeds, install or switch to the
Marketplace pre-release on Windows x64 with VS Code 1.120.0 or later. Version
0.2.0 remains available on the stable channel.

## [0.2.0] - 2026-09-05

Claude Workspaces 0.2.0 is the first stable release.

### Added

- Manage separate Claude Code sessions for each root in a saved VS Code
  multi-root workspace.
- Configure an optional default root and directed cross-root imports, with
  each available import passed to Claude as a separate `--add-dir` argument.
- Start, switch, close, retry, and restart managed sessions in the Claude
  Workspaces panel and its embedded terminal.
- Validate launch roots with bounded availability checks and preserve session
  ownership through extension shutdown.
- Add a Marketplace icon and a README feature tour with sanitized product
  screenshots (#46).
- Publish tag-driven stable and pre-release packages with matching GitHub
  releases and SHA-256 checksums (#44).

### Fixed

- Prevent a streamed-output cursor artifact from obscuring terminal text
  (#32).
- Restart a session from its original selected workspace root (#30).
- Prevent repeated Claude intro messages when the session view is re-resolved
  or replaced (#29).
- Prevent non-cooperative availability probes from starving later reachable
  roots while preserving bounded launch planning (#19).

### Installation

This is the first regular Windows x64 release for VS Code 1.120.0 or later.

## [0.1.3] - 2026-09-05

### Fixed

- Prevent repeated Claude intro messages when the session view is re-resolved
  or replaced (#29).
- Prevent non-cooperative availability probes from starving later reachable
  roots while preserving bounded launch planning (#19).

### Installation

This remains a Windows x64 pre-release for VS Code 1.120.0 or later.
