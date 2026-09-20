# Waiting-session notifications — manual verification

Use this checklist to close issue #51 on a local Windows x64 extension host.
It covers Windows, multi-window, and native-toast behavior that CI cannot prove.

## Prerequisites

- A Windows x64 machine with VS Code and the candidate extension installed or
  launched through the Extension Development Host.
- Claude Code on the local extension-host `PATH`, with `--settings` shown by
  `claude --help`.
- A saved `.code-workspace` file containing at least one configured root.
- A way to make Claude ask for permission or user input in a managed session.
- Optional: a Remote-SSH, WSL, or devcontainer window for the remote-host check.

Record results while testing. Save screenshots of each toast and the selected
session where practical.

| Check | Result (Pass / Fail / Not run) | Evidence or notes |
| --- | --- | --- |
| Local extension host and hook delivery |  |  |
| Two-window identity and click-through |  |  |
| Stage, focus, minimized, and toggle behavior |  |  |
| Remote-host no-op |  |  |
| Env-scrub diagnostic |  |  |

## Local host and hook delivery

1. Open the saved workspace locally in VS Code. Open **View: Output** and select
   **Claude Workspaces**. Confirm that the extension reports a ready attention
   channel and does not report an unsupported `--settings` capability.
2. Start a managed session in the Claude Workspaces panel. Cause a real Claude
   Code `permission_prompt`, `agent_needs_input`, or `elicitation_dialog` event
   in its embedded node-pty terminal. Do not simulate the hook by manually
   writing a channel file.
3. With the owner window unfocused or minimized, confirm one Windows toast for
   the newly opened waiting stage. Record the workspace and session identity
   shown in the toast.
4. Leave the same prompt open and confirm duplicate hook delivery does not add a
   second toast. Respond to the prompt (or otherwise send `UserPromptSubmit`) to
   close the stage, then cause a new eligible prompt. Confirm the reopened stage
   produces exactly one new toast.

## Focus and window behavior

1. Keep the owner window focused, then cause an eligible wait stage. Confirm no
   toast appears.
2. Without closing that stage, move focus away from VS Code. Confirm no toast
   appears on blur.
3. Repeat with the owner window minimized or unfocused before the stage opens.
   Confirm the toast is displayed. Confirm `idle_prompt` and `Stop` only leave
   the session idle and do not notify.

## Identity, selection, and two windows

1. Open two VS Code windows, each owning a different managed Claude session.
   If practical, open the same saved workspace twice so both the workspace label
   and session identity must distinguish the windows.
2. Cause an eligible wait stage in each unfocused window. Confirm each toast
   identifies the correct workspace/session and that only one toast is emitted
   for each stage.
3. Select the first toast. Confirm Claude Workspaces is revealed, the correct
   live session becomes active, and the other session remains unchanged. Repeat
   for the second toast.
4. Record the Windows taskbar result for each selection. The owning VS Code
   entry may highlight or flash; do not treat lack of programmatic foreground
   activation as a failure.

## Notification toggle

1. Set `claudeWorkspaces.waitingSessionNotifications` to `false` in the
   workspace settings. Open a new eligible waiting stage while the owner window
   is unfocused. Confirm no native toast appears and the session still changes
   activity through the panel/output diagnostics.
2. Close that stage. Set the setting to `true` without reloading VS Code, then
   open another eligible stage. Confirm exactly one native toast appears.
3. Set the setting to `false` while a stage is already open, then enable it
   again. Confirm that enabling does not retrospectively notify that stage.

## Remote-host no-op

When a Remote-SSH, WSL, or devcontainer environment is available, launch a
managed session there and cause an eligible prompt. Confirm the Output channel
records a remote-host disabled/no-op attention channel and no native Windows
toast appears. If no remote environment is available, enter `Not run` in the
evidence table with that reason.

## Env-scrub diagnostic

Use a disposable test session only. Do not change Claude settings files. Start
PowerShell in the extension repository root. Do not test from an already-running
VS Code window: its extension host cannot inherit this PowerShell process
environment. Restore the process environment only after testing the fresh
Extension Development Host:

```powershell
$extensionDevelopmentPath = (Get-Location).Path
$previousEnvScrub = $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB
try {
    $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1"
    Start-Process -FilePath "code" -ArgumentList @(
        "--new-window",
        "--extensionDevelopmentPath",
        $extensionDevelopmentPath
    )
    Read-Host "In the fresh Extension Development Host, test one disposable managed session, inspect Claude Workspaces output, then press Enter here to restore the environment"
}
finally {
    if ($null -eq $previousEnvScrub) {
        Remove-Item Env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB -ErrorAction SilentlyContinue
    }
    else {
        $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = $previousEnvScrub
    }
}
```

In the fresh Extension Development Host, launch one disposable managed session,
cause an eligible wait stage, and inspect **View: Output** > **Claude
Workspaces** for the routing diagnostic. Finish the disposable session before
pressing Enter in PowerShell. Confirm the environment variable has been
restored before testing normal behavior again.

## Final gate

Issue #51 passes manual verification only when every applicable check is
recorded as **Pass**, every unavailable remote check is explicitly **Not run**
with a reason, and evidence covers the two-window click-through and real
node-pty hook scenarios. Native-toast and multi-window click-through coverage
remain manual boundaries; do not represent them as CI coverage.
