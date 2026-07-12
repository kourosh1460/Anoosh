# Generates build/icon.png (512x512) and build/icon.ico for Aurora.
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded-rect path
function RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$rect = RoundedRect 8 8 496 496 110

# Background gradient (deep navy -> darker)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point(512, 512)),
  [System.Drawing.Color]::FromArgb(255, 26, 20, 55), [System.Drawing.Color]::FromArgb(255, 10, 11, 24))
$g.FillPath($bgBrush, $rect)

# Clip to the rounded rect for the glow blobs
$g.SetClip($rect)

function Blob([float]$cx, [float]$cy, [float]$r, $color) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx - $r, $cy - $r, $r * 2, $r * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $color
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
  $g.FillPath($brush, $path)
}

Blob 140 120 300 ([System.Drawing.Color]::FromArgb(210, 124, 92, 255))   # purple
Blob 430 420 320 ([System.Drawing.Color]::FromArgb(170, 62, 198, 255))   # cyan
Blob 100 430 240 ([System.Drawing.Color]::FromArgb(120, 255, 122, 195))  # pink

$g.ResetClip()

# Letter A with soft glow
$fontFamily = New-Object System.Drawing.FontFamily("Segoe UI")
$font = New-Object System.Drawing.Font($fontFamily, 250, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$layout = New-Object System.Drawing.RectangleF(0, 14, 512, 512)

for ($i = 8; $i -ge 1; $i--) {
  $glowFont = New-Object System.Drawing.Font($fontFamily, (250 + $i * 3), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $glow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb((6 + $i), 255, 255, 255))
  $g.DrawString("A", $glowFont, $glow, $layout, $fmt)
  $glowFont.Dispose(); $glow.Dispose()
}
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
$g.DrawString("A", $font, $white, $layout, $fmt)

$g.Dispose()
$out = Join-Path $PSScriptRoot "icon.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "wrote $out"
