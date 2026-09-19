param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('read', 'write', 'delete')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PixelStudioCredentialManager
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL credential, UInt32 flags);

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

    [DllImport("advapi32.dll", SetLastError = false)]
    public static extern void CredFree(IntPtr buffer);
}
'@

$credentialType = [uint32]1
$persistLocalMachine = [uint32]2
$notFound = 1168

if ($Action -eq 'write') {
  $encoded = [Console]::In.ReadToEnd().Trim()
  if ([string]::IsNullOrWhiteSpace($encoded)) { throw 'Credential value is empty.' }
  $bytes = [Convert]::FromBase64String($encoded)
  if ($bytes.Length -eq 0 -or $bytes.Length -gt 2560) { throw 'Credential value has an invalid length.' }
  $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
    $credential = New-Object PixelStudioCredentialManager+CREDENTIAL
    $credential.Type = $credentialType
    $credential.TargetName = $Target
    $credential.CredentialBlobSize = [uint32]$bytes.Length
    $credential.CredentialBlob = $blob
    $credential.Persist = $persistLocalMachine
    $credential.UserName = 'OpenAI API key'
    if (-not [PixelStudioCredentialManager]::CredWrite([ref]$credential, 0)) {
      throw "CredWrite failed with Windows error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
    }
  } finally {
    for ($index = 0; $index -lt $bytes.Length; $index++) { $bytes[$index] = 0 }
    for ($index = 0; $index -lt $bytes.Length; $index++) { [Runtime.InteropServices.Marshal]::WriteByte($blob, $index, 0) }
    [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
  }
  [Console]::Out.Write('ok')
  exit 0
}

if ($Action -eq 'read') {
  $pointer = [IntPtr]::Zero
  if (-not [PixelStudioCredentialManager]::CredRead($Target, $credentialType, 0, [ref]$pointer)) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($errorCode -eq $notFound) { exit 0 }
    throw "CredRead failed with Windows error $errorCode."
  }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][PixelStudioCredentialManager+CREDENTIAL])
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    if ($bytes.Length -gt 0) { [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length) }
    [Console]::Out.Write([Convert]::ToBase64String($bytes))
    for ($index = 0; $index -lt $bytes.Length; $index++) { $bytes[$index] = 0 }
  } finally {
    [PixelStudioCredentialManager]::CredFree($pointer)
  }
  exit 0
}

if (-not [PixelStudioCredentialManager]::CredDelete($Target, $credentialType, 0)) {
  $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($errorCode -ne $notFound) { throw "CredDelete failed with Windows error $errorCode." }
}
[Console]::Out.Write('ok')
