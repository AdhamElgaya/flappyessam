Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot "essam.png"
$out = Join-Path $PSScriptRoot "essam-sprite.png"
$bmp = [System.Drawing.Bitmap]::FromFile($src)
$bmp.MakeTransparent([System.Drawing.Color]::Black)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Created $out"
