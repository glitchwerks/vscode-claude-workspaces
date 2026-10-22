#Requires -Version 5.1
<#
.SYNOPSIS
Invokes the pinned SnoreToast callback for the isolated native smoke test.
.DESCRIPTION
Exercises the real Windows COM interface without clicking or creating a toast.
Does not install an identity or modify Windows registration.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Payload)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

// Windows SDK notificationactivationcallback.h; SnoreToast 0.9.0 implements this interface.
[ComImport, Guid("53E31837-6600-4A81-9395-75CFFE746F94")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISnoreToastSmokeCallback {
    [PreserveSig]
    int Activate([MarshalAs(UnmanagedType.LPWStr)] string appId,
        [MarshalAs(UnmanagedType.LPWStr)] string arguments, IntPtr data, uint count);
}

public static class SnoreToastSmokeCallback {
    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(ref Guid clsid, IntPtr outer,
        uint context, ref Guid iid, out IntPtr instance);

    public static int Deliver(string payload) {
        var clsid = new Guid("849c2549-fe1e-4aa6-bb93-4690993ccb89");
        var iid = new Guid("53E31837-6600-4A81-9395-75CFFE746F94");
        IntPtr instance;
        int result = CoCreateInstance(ref clsid, IntPtr.Zero, 4, ref iid, out instance);
        if (result < 0) return result;
        object callback = null;
        try {
            callback = Marshal.GetObjectForIUnknown(instance);
            return ((ISnoreToastSmokeCallback)callback).Activate(
                "cbeaulieu-gt.ClaudeWorkspaces", payload, IntPtr.Zero, 0);
        } finally {
            if (callback != null) Marshal.FinalReleaseComObject(callback);
            Marshal.Release(instance);
        }
    }
}
"@

$result = [SnoreToastSmokeCallback]::Deliver($Payload)
[pscustomobject]@{ HResult = ('0x{0:X8}' -f $result) } | ConvertTo-Json -Compress
if ($result -lt 0) { exit 1 }
