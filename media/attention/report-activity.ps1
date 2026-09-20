#Requires -Version 5.1

<#
.SYNOPSIS
    Reports Claude Code hook activity to the owning Claude Workspaces extension host.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$temporaryPath = $null

try {
    $channelPath = $env:CLAUDE_WORKSPACES_ATTENTION_CHANNEL
    if ([string]::IsNullOrWhiteSpace($channelPath)) {
        throw [System.InvalidOperationException]::new(
            'Attention channel environment is unavailable.'
        )
    }
    if (-not (Test-Path -LiteralPath $channelPath -PathType Container)) {
        throw [System.IO.DirectoryNotFoundException]::new(
            'Attention channel is unavailable.'
        )
    }

    $managedSessionId = $env:CLAUDE_WORKSPACES_SESSION_ID
    if ([string]::IsNullOrWhiteSpace($managedSessionId)) {
        throw [System.InvalidOperationException]::new(
            'Managed session environment is unavailable.'
        )
    }

    $inputJson = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($inputJson)) {
        throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
    }
    $payload = ConvertFrom-Json -InputObject $inputJson -ErrorAction Stop
    $claudeSessionProperty = $payload.PSObject.Properties['session_id']
    $hookEventProperty = $payload.PSObject.Properties['hook_event_name']
    if (
        $null -eq $claudeSessionProperty -or
        -not ($claudeSessionProperty.Value -is [string]) -or
        [string]::IsNullOrWhiteSpace($claudeSessionProperty.Value) -or
        $null -eq $hookEventProperty -or
        -not ($hookEventProperty.Value -is [string]) -or
        [string]::IsNullOrWhiteSpace($hookEventProperty.Value)
    ) {
        throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
    }

    $notificationType = $null
    $notificationProperty = $payload.PSObject.Properties['notification_type']
    if ($null -ne $notificationProperty -and $notificationProperty.Value -is [string]) {
        $notificationType = $notificationProperty.Value
    }

    $signal = [ordered]@{
        schemaVersion = 1
        managedSessionId = $managedSessionId
        claudeSessionId = $claudeSessionProperty.Value
        hookEventName = $hookEventProperty.Value
        notificationType = $notificationType
        createdAt = [DateTimeOffset]::UtcNow.ToString('O')
    }
    $signalId = [Guid]::NewGuid().ToString('N')
    $temporaryPath = Join-Path -Path $channelPath -ChildPath "$signalId.tmp"
    $signalPath = Join-Path -Path $channelPath -ChildPath "$signalId.signal.json"
    $signalJson = ConvertTo-Json -InputObject $signal -Compress -Depth 3
    $utf8WithoutBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($temporaryPath, $signalJson, $utf8WithoutBom)
    [System.IO.File]::Move($temporaryPath, $signalPath)
    $temporaryPath = $null
}
catch {
    if ($null -ne $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    }
    $knownDiagnostic = $_.Exception.Message -in @(
        'Attention channel environment is unavailable.',
        'Attention channel is unavailable.',
        'Managed session environment is unavailable.',
        'Hook payload is invalid.'
    )
    $diagnostic = if ($knownDiagnostic) {
        $_.Exception.Message
    }
    else {
        "Signal write failed ($($_.Exception.GetType().Name))."
    }
    [Console]::Error.WriteLine("Claude Workspaces attention hook failed: $diagnostic")
    exit 1
}
