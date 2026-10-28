param($x, $y, [int]$double = 1)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M2 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
}
"@
[M2]::SetProcessDPIAware() | Out-Null
[M2]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 150
[M2]::mouse_event(0x02,0,0,0,[UIntPtr]::Zero); [M2]::mouse_event(0x04,0,0,0,[UIntPtr]::Zero)
if ($double -eq 1) {
  Start-Sleep -Milliseconds 90
  [M2]::mouse_event(0x02,0,0,0,[UIntPtr]::Zero); [M2]::mouse_event(0x04,0,0,0,[UIntPtr]::Zero)
}
Write-Output "clicked $x,$y dbl=$double"
