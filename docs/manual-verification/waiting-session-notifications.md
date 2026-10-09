# Waiting-session notifications — manual verification

Use this checklist to verify issues #51 and #137 on a local Windows x64 extension host.
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

1. Open the saved workspace locally in VS Code. Before activation/reload, note
   the current `claudeWorkspaces.logLevel` workspace setting and temporarily
   set it to `debug`. Run **Developer: Reload Window**, then open **View:
   Output** and select **Claude Workspaces**. Confirm the visible ready-channel
   message and no unsupported `--settings` capability. Restore the prior log
   level after this check.
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
   live session becomes active in its existing owner window, no additional VS
   Code window opens, and the other session remains unchanged. Repeat for the
   second toast and again confirm that no additional window opens.
4. Record the Windows taskbar result for each selection. The owning VS Code
   entry may highlight or flash; do not treat lack of programmatic foreground
   activation as a failure.
5. Leave a new toast in Action Center, close its managed session, and then select
   the stale toast. Confirm no VS Code window opens and no unrelated session is
   activated. Repeat after closing the toast's owner window and confirm the
   stale selection still does not open an empty VS Code window.

## Notification toggle

1. Set `claudeWorkspaces.waitingSessionNotifications` to `false` in the
   workspace settings. Open a new eligible waiting stage while the owner window
   is unfocused. Confirm no native toast appears.
2. Respond to that waiting prompt to close its stage. Set the setting to `true`
   without reloading VS Code, then open another eligible stage. Confirm exactly
   one native toast appears. This proves detection remains active while native
   toast emission is disabled.
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
environment. Set `$disposableWorkspacePath` to a saved `.code-workspace` file
used only for this check. Restore the process environment only after testing the
isolated Extension Development Host:

```powershell
$extensionDevelopmentPath = (Get-Location).Path
$disposableWorkspacePath = "C:\path with spaces\env-scrub-test.code-workspace"
$temporaryProfilePath = Join-Path ([System.IO.Path]::GetTempPath()) (
    "claude-workspaces-env-scrub-" + [guid]::NewGuid().ToString()
)
$previousEnvScrub = $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB
try {
    $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1"
    $codeArguments = @(
        "--new-window",
        "--user-data-dir",
        ('"{0}"' -f $temporaryProfilePath),
        "--extensionDevelopmentPath",
        ('"{0}"' -f $extensionDevelopmentPath),
        ('"{0}"' -f $disposableWorkspacePath)
    )
    Start-Process -FilePath "code" -ArgumentList $codeArguments
    Read-Host "In the isolated Extension Development Host, verify the env value, test one disposable session, close the isolated host, then press Enter here to clean up"
}
finally {
    if ($null -eq $previousEnvScrub) {
        Remove-Item Env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB -ErrorAction SilentlyContinue
    }
    else {
        $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = $previousEnvScrub
    }
    if (Test-Path -LiteralPath $temporaryProfilePath) {
        Remove-Item -LiteralPath $temporaryProfilePath -Recurse -Force
    }
}
```

In the isolated Extension Development Host, open an integrated PowerShell
terminal and run `Write-Output $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`; it must
print `1`. Launch one disposable managed session, cause an eligible wait stage,
and respond once with `UserPromptSubmit`. Do not expect a Claude Workspaces
Output diagnostic: `Notification` ignores hook stderr. Instead, the managed
Claude session must show a non-blocking hook-error notice beginning exactly
`Claude Workspaces attention hook failed: Attention channel environment is
unavailable.` Close the isolated host before pressing Enter in the originating
PowerShell session. Confirm the temporary profile has been removed and the
environment variable restored before testing normal behavior again.

This expected transcript notice follows the [Claude Code hook reference](https://code.claude.com/docs/en/hooks)
(fetched 2026-09-20): a nonzero command-hook exit other than `2` on standard
events displays the first stderr line as a non-blocking notice, while
`Notification` ignores stderr.

## Final gate

Issues #51 and #137 pass manual verification only when every applicable check is
recorded as **Pass**, every unavailable remote check is explicitly **Not run**
with a reason, and evidence covers the two-window click-through and real
node-pty hook scenarios. Native-toast and multi-window click-through coverage
remain manual boundaries; do not represent them as CI coverage.
