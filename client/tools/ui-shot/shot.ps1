param($out)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiN { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[DpiN]::SetProcessDPIAware() | Out-Null
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$b = New-Object System.Drawing.Bitmap($vs.Width, $vs.Height)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $b.Size)
$b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "saved $out"
