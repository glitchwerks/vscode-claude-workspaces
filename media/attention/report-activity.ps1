#Requires -Version 5.1

<#
.SYNOPSIS
    Reports Claude Code hook activity to the owning Claude Workspaces extension host.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$inputUtf8 = [System.Text.UTF8Encoding]::new($false, $true)

function Publish-StopReply {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $ClaudeSessionId,

        [AllowNull()]
        [object] $Message,

        [Parameter(Mandatory)]
        [string] $InputJson
    )

    $portText = $env:CLAUDE_WORKSPACES_STOP_REPLY_PORT
    $token = $env:CLAUDE_WORKSPACES_STOP_REPLY_TOKEN
    if (
        $portText -cnotmatch '\A[1-9][0-9]{0,4}\z' -or
        [int]$portText -gt 65535 -or
        $token -cnotmatch '\A[0-9a-f]{64}\z' -or
        $ClaudeSessionId -cnotmatch '\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z'
    ) {
        return
    }

    try {
        $body = [ordered]@{
            hook_event_name = 'Stop'
            session_id = $ClaudeSessionId
        }
        $usable = $Message -is [string] -and $Message.Length -le 128KB -and
            -not [string]::IsNullOrWhiteSpace($Message) -and -not $Message.Contains([char]0)
        if ($usable -and $Message.Contains([char]0xfffd)) {
            # ConvertFrom-Json replaces lone surrogate escapes. Skip complete pairs
            # and escaped backslashes when checking whether text may have been repaired.
            $escapes = '\\(?:u[Dd][89A-Ba-b][0-9A-Fa-f]{2}\\u[Dd][C-Fc-f][0-9A-Fa-f]{2}|(?<invalid>u[Dd][89A-Fa-f][0-9A-Fa-f]{2})|.)'
            foreach ($escape in [regex]::Matches($InputJson, $escapes)) {
                if ($escape.Groups['invalid'].Success) {
                    $usable = $false
                    break
                }
            }
        }
        if ($usable) {
            try {
                if ($inputUtf8.GetByteCount($Message) -le 128KB) {
                    $body['last_assistant_message'] = $Message
                }
            }
            catch [System.Text.EncoderFallbackException] {
                # A malformed scalar leaves a qualified gap.
            }
        }
        $bytes = $inputUtf8.GetBytes((ConvertTo-Json -InputObject $body -Compress -Depth 2))
        if ($bytes.Length -gt 896KB) {
            $body.Remove('last_assistant_message')
            $bytes = $inputUtf8.GetBytes((ConvertTo-Json -InputObject $body -Compress -Depth 2))
        }

        Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
        $handler = [System.Net.Http.HttpClientHandler]::new()
        $client = $null
        $request = $null
        $response = $null
        try {
            $handler.UseProxy = $false
            $handler.AllowAutoRedirect = $false
            $handler.UseDefaultCredentials = $false
            $handler.UseCookies = $false
            $client = New-Object -TypeName System.Net.Http.HttpClient -ArgumentList $handler
            $deadlineMs = 750
            $client.Timeout = [TimeSpan]::FromMilliseconds($deadlineMs)
            $request = [System.Net.Http.HttpRequestMessage]::new(
                [System.Net.Http.HttpMethod]::Post,
                ('http://127.0.0.1:{0}/stop' -f [int]$portText)
            )
            $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
            $request.Content = [System.Net.Http.ByteArrayContent]::new($bytes)
            $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('application/json')
            $request.Content.Headers.ContentType.CharSet = 'utf-8'
            $task = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead)
            if ($task.Wait($deadlineMs)) {
                $response = $task.GetAwaiter().GetResult()
            }
        }
        finally {
            if ($null -ne $response) { $response.Dispose() }
            if ($null -ne $request) { $request.Dispose() }
            if ($null -ne $client) { $client.Dispose() }
            else { $handler.Dispose() }
        }
    }
    catch {
        # The relay is passive. Its failures and responses do not change hook output.
    }
}

$temporaryPath = $null
$publicationAttempt = 0

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

    try {
        $inputBuffer = [System.IO.MemoryStream]::new()
        $invalidUtf8 = $false
        try {
            [Console]::OpenStandardInput().CopyTo($inputBuffer)
            $inputBytes = $inputBuffer.GetBuffer()
            $byteCount = [int]$inputBuffer.Length
            try {
                $inputJson = $inputUtf8.GetString($inputBytes, 0, $byteCount)
            }
            catch [System.Text.DecoderFallbackException] {
                # Preserve the activity signal when the JSON envelope can still be read.
                $invalidUtf8 = $true
                $inputJson = [System.Text.Encoding]::UTF8.GetString($inputBytes, 0, $byteCount)
            }
        }
        finally {
            $inputBuffer.Dispose()
        }
        if ([string]::IsNullOrWhiteSpace($inputJson)) {
            throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
        }
        $payload = ConvertFrom-Json -InputObject $inputJson -ErrorAction Stop
    }
    catch {
        throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
    }
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

    $agentIdProperty = $payload.PSObject.Properties['agent_id']
    if (
        $hookEventProperty.Value -eq 'Stop' -and
        $null -ne $agentIdProperty -and
        $agentIdProperty.Value -is [string] -and
        -not [string]::IsNullOrWhiteSpace($agentIdProperty.Value)
    ) {
        exit 0
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
    # The session-scoped marker is set only by the admitted paired reporter.
    $reporterReady = $env:CLAUDE_WORKSPACES_COMPLETION_SESSION -eq $claudeSessionProperty.Value
    $readyProperty = $payload.PSObject.Properties['completion_reporter_ready']
    if ($null -ne $readyProperty -and $readyProperty.Value -is [bool]) {
        $reporterReady = $readyProperty.Value
    }
    $signal['completionReporterReady'] = $reporterReady
    $generationProperty = $payload.PSObject.Properties['agent_generation']
    if ($null -ne $generationProperty) {
        if (
            -not ($generationProperty.Value -is [string]) -or
            $generationProperty.Value -cnotmatch '\A[A-Za-z0-9.-]{1,128}\z'
        ) {
            throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
        }
        $signal['agentGeneration'] = $generationProperty.Value
    }
    if ($hookEventProperty.Value -eq 'TurnComplete') {
        $reasonProperty = $payload.PSObject.Properties['completion_reason']
        $abortedProperty = $payload.PSObject.Properties['is_aborted']
        if (
            -not $reporterReady -or
            $null -eq $reasonProperty -or
            $reasonProperty.Value -notin @('answer', 'aborted', 'refusal', 'error') -or
            $null -eq $abortedProperty -or
            -not ($abortedProperty.Value -is [bool])
        ) {
            throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
        }
        $signal['completionReason'] = $reasonProperty.Value
        $signal['isAborted'] = $abortedProperty.Value
        if ($null -ne $agentIdProperty) {
            if (-not ($agentIdProperty.Value -is [string]) -or
                [string]::IsNullOrWhiteSpace($agentIdProperty.Value)) {
                throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
            }
            $signal['agentId'] = $agentIdProperty.Value
        }
    }
    if ($hookEventProperty.Value -in @('SubagentStart', 'SubagentStop')) {
        if (
            $null -eq $agentIdProperty -or
            -not ($agentIdProperty.Value -is [string]) -or
            [string]::IsNullOrWhiteSpace($agentIdProperty.Value)
        ) {
            throw [System.IO.InvalidDataException]::new('Hook payload is invalid.')
        }
        $signal['agentId'] = $agentIdProperty.Value
    }
    $signalId = [Guid]::NewGuid().ToString('N')
    $temporaryPath = Join-Path -Path $channelPath -ChildPath "$signalId.tmp"
    $signalPath = Join-Path -Path $channelPath -ChildPath "$signalId.signal.json"
    $signalJson = ConvertTo-Json -InputObject $signal -Compress -Depth 3
    $utf8WithoutBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    for ($publicationAttempt = 1; $publicationAttempt -le 3; $publicationAttempt++) {
        try {
            [System.IO.File]::WriteAllText($temporaryPath, $signalJson, $utf8WithoutBom)
            [System.IO.File]::Move($temporaryPath, $signalPath)
            break
        }
        catch {
            $writeException = $_.Exception
            while ($null -ne $writeException.InnerException) {
                $writeException = $writeException.InnerException
            }
            if (
                -not ($writeException -is [System.IO.IOException]) -or
                $publicationAttempt -eq 3
            ) {
                throw
            }
            # Retry publication only; elapsed time never implies agent completion.
            Start-Sleep -Milliseconds 100
        }
    }
    $temporaryPath = $null
    if (
        $hookEventProperty.Name -ceq 'hook_event_name' -and
        $hookEventProperty.Value -ceq 'Stop' -and
        $claudeSessionProperty.Name -ceq 'session_id' -and
        $null -eq $agentIdProperty -and
        $inputJson -cmatch '\A[\x09\x0A\x0D\x20]*\{'
    ) {
        $reply = $null
        $replyProperty = $payload.PSObject.Properties['last_assistant_message']
        if (-not $invalidUtf8 -and $null -ne $replyProperty -and $replyProperty.Name -ceq 'last_assistant_message') {
            $reply = $replyProperty.Value
        }
        Publish-StopReply -ClaudeSessionId $claudeSessionProperty.Value -Message $reply -InputJson $inputJson
    }
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
        "Signal write failed after $publicationAttempt attempts ($($_.Exception.GetType().Name))."
    }
    [Console]::Error.WriteLine("Claude Workspaces attention hook failed: $diagnostic")
    exit 1
}
