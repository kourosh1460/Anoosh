# Generates Android launcher + notification icons from the shared Anoosh icon.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = "D:\coding\Persoanl Productivity App\build\icon.png"
$res = "D:\coding\Persoanl Productivity App\mobile\android\app\src\main\res"
$source = [System.Drawing.Image]::FromFile($src)

function Save-Resized([System.Drawing.Image]$img, [int]$size, [string]$path, [double]$scale = 1.0) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $inner = [int]($size * $scale)
  $off = [int](($size - $inner) / 2)
  $g.DrawImage($img, $off, $off, $inner, $inner)
  $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Launcher icons (legacy + round) and adaptive foreground (icon at 62% of canvas)
$densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
foreach ($d in $densities.Keys) {
  $s = $densities[$d]
  Save-Resized $source $s "$res\mipmap-$d\ic_launcher.png"
  Save-Resized $source $s "$res\mipmap-$d\ic_launcher_round.png"
  Save-Resized $source ([int]($s * 2.25)) "$res\mipmap-$d\ic_launcher_foreground.png" 0.62
}

# Notification status icon: white "A" silhouette on transparent
$fontFamily = New-Object System.Drawing.FontFamily("Segoe UI")
$statSizes = @{ "mdpi" = 24; "hdpi" = 36; "xhdpi" = 48; "xxhdpi" = 72; "xxxhdpi" = 96 }
foreach ($d in $statSizes.Keys) {
  $s = $statSizes[$d]
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $font = New-Object System.Drawing.Font($fontFamily, ($s * 0.72), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $rect = New-Object System.Drawing.RectangleF(0, ($s * 0.02), $s, $s)
  $g.DrawString("A", $font, $white, $rect, $fmt)
  $g.Dispose()
  New-Item -ItemType Directory -Force "$res\drawable-$d" | Out-Null
  $bmp.Save("$res\drawable-$d\ic_stat_anoosh.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$source.Dispose()
Write-Host "icons generated"
