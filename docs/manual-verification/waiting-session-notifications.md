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
   Confirm the toast is displayed. Confirm `idle_prompt` leaves the session idle
   and `Stop` leaves it waiting for the next prompt; neither emits a native
   notification.

## Identity, selection, and two windows

1. Open two VS Code windows, each owning a different managed Claude session.
   If practical, open the same saved workspace twice so both the workspace label
   and session identity must distinguish the windows.
2. Cause an eligible wait stage in each unfocused window. Confirm each toast
   identifies the correct workspace/session and that only one toast is emitted
   for each stage.
3. Leave both banners to fade, then wait at least 65 seconds before selecting
   the first toast in Windows Notification Center. This exercises callback
   renewal beyond the bundled helper's one-minute lifetime (#174). Confirm Claude Workspaces is revealed, the correct
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

Run compatibility and missing-routing diagnostics separately. Credential
scrubbing does not necessarily remove the extension's custom routing variables.
The [official environment reference](https://code.claude.com/docs/en/env-vars#what-the-subprocess-environment-scrub-removes)
(fetched 2026-10-21) describes credential removal. Claude Code 2.1.307 retained
both routing variables in a real command-hook probe, and a managed session still
emitted its eligible waiting toast with scrubbing enabled (#174).

### Credential-scrub compatibility

1. Use a disposable saved workspace and a fresh VS Code user-data profile.
   Launch its Extension Development Host with
   `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` in that new process's environment. An
   already-running VS Code process cannot inherit a later environment change.
   Prefer setting the variable only for the launched child; otherwise save and
   restore its original value in the launching shell. Do not modify user,
   project or managed Claude settings files.
2. In that host's integrated PowerShell terminal, run
   `Write-Output $env:CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` and confirm `1`. Record
   the installed Claude Code version.
3. Start a managed session, request a delayed eligible question, and leave its
   owner unfocused before the question opens. When the routing environment is
   preserved, expect exactly one toast and normal Claude responses. Do not
   require a missing-environment notice merely because scrubbing is enabled.
4. If delivery fails, inspect the actual hook boundary before attributing it to
   scrubbing. A terminal's inherited flag alone does not establish which
   variables reach a hook. Record only presence booleans; do not dump the
   process environment or credentials.

### Controlled missing-routing notice

Use only the same disposable host. This check deliberately removes the two
routing variables inside a test hook process; it does not change the Claude
parent process or production hook implementation.

1. Back up the disposable host's extension-owned `.hooks-settings.json` under
   its `User/globalStorage/cbeaulieu-gt.vscode-claude-workspaces/attention-channels/`
   directory. Do not edit user, project or managed Claude settings.
2. Create a temporary PowerShell wrapper with this body, giving it the absolute
   path to the candidate's `media/attention/report-activity.ps1`:

   ```powershell
   #Requires -Version 5.1
   [CmdletBinding()]
   param([Parameter(Mandatory = $true)][string]$HookScriptPath)
   Set-StrictMode -Version Latest
   $ErrorActionPreference = 'Stop'
   Remove-Item Env:CLAUDE_WORKSPACES_ATTENTION_CHANNEL -ErrorAction SilentlyContinue
   Remove-Item Env:CLAUDE_WORKSPACES_SESSION_ID -ErrorAction SilentlyContinue
   if (-not [string]::IsNullOrWhiteSpace($env:CLAUDE_WORKSPACES_ATTENTION_CHANNEL) -or
       -not [string]::IsNullOrWhiteSpace($env:CLAUDE_WORKSPACES_SESSION_ID)) {
       throw 'Diagnostic routing-variable removal failed.'
   }
   & $HookScriptPath
   exit $LASTEXITCODE
   ```

3. In the disposable extension-owned settings, redirect only `UserPromptSubmit`
   to `powershell.exe` with `args` containing `-NoProfile`, `-NonInteractive`,
   `-ExecutionPolicy`, `Bypass`, `-File`, the wrapper's absolute path,
   `-HookScriptPath`, and the production hook's absolute path. Preserve the
   other hook entries. Verify the wrapper exits `1` and emits the expected
   stderr before testing the UI; keep any presence/exit evidence free of prompt
   text and environment values.
4. Start a fresh managed session in that host and send a simple prompt, such as
   `Reply with Diagnostic OK.` Confirm Claude replies and shows a non-blocking
   hook-error notice containing exactly:
   `Claude Workspaces attention hook failed: Attention channel environment is unavailable.`
   A Claude Workspaces Output message is not expected for this hook failure.
   Testing only `Notification` is insufficient because it ignores hook stderr.
5. Restore the original extension-owned hook settings. Close the entire
   disposable VS Code host, verify its processes have exited, and remove only
   its disposable profile and extension directory. Resolve and verify each
   cleanup target stays within the intended test directory before recursive
   removal. Confirm the launching environment is unchanged or restored.

The notice expectation follows the [Claude Code hook reference](https://code.claude.com/docs/en/hooks#other-exit-codes)
(fetched 2026-10-21): exit `1` with stderr is a non-blocking hook error under
this hook's default policy. This diagnostic must not add a blocking policy or
change the production hook's exit behavior.

## Final gate

Issues #51 and #137 pass manual verification only when every applicable check is
recorded as **Pass**, every unavailable remote check is explicitly **Not run**
with a reason, and evidence covers the two-window click-through and real
node-pty hook scenarios. Native-toast and multi-window click-through coverage
remain manual boundaries; do not represent them as CI coverage.
