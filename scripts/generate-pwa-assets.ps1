param(
  [string]$LogoPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
if (-not $LogoPath) { $LogoPath = Join-Path $public "star-diary-logo.jpg" }
$source = [System.Drawing.Image]::FromFile($LogoPath)
$primary = [System.Drawing.ColorTranslator]::FromHtml("#2563A6")
$white = [System.Drawing.Color]::White

function New-SquarePng([string]$name, [int]$size, [bool]$maskable = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    if ($maskable) {
      $graphics.Clear($white)
      $inner = [int][Math]::Round($size * 0.80)
      $offset = [int](($size - $inner) / 2)
      $graphics.DrawImage($source, $offset, $offset, $inner, $inner)
    } else {
      $graphics.Clear($white)
      $graphics.DrawImage($source, 0, 0, $size, $size)
    }
    $bitmap.Save((Join-Path $public $name), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function New-SplashPng([int]$width, [int]$height) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear($primary)

    # The logo is 25% larger than the previous splash composition.
    $logoSize = [int][Math]::Round([Math]::Min($width * 0.525, $height * 0.30))
    $logoToTitleGap = [int][Math]::Round($width * 0.052)
    $titleBand = [int][Math]::Round($width * 0.072)
    $titleToSubtitleGap = [int][Math]::Round($width * 0.018)
    $subtitleBand = [int][Math]::Round($width * 0.042)
    $contentHeight = $logoSize + $logoToTitleGap + $titleBand + $titleToSubtitleGap + $subtitleBand
    $left = [int](($width - $logoSize) / 2)
    $top = [int](($height - $contentHeight) / 2)
    $diameter = [int][Math]::Round($logoSize * 0.36)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($left, $top, $diameter, $diameter, 180, 90)
    $path.AddArc($left + $logoSize - $diameter, $top, $diameter, $diameter, 270, 90)
    $path.AddArc($left + $logoSize - $diameter, $top + $logoSize - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($left, $top + $logoSize - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $graphics.SetClip($path)
    $graphics.DrawImage($source, $left, $top, $logoSize, $logoSize)
    $graphics.ResetClip()
    $path.Dispose()

    $titleFont = [System.Drawing.Font]::new("Microsoft JhengHei UI", [single]($width * 0.055), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $subtitleFont = [System.Drawing.Font]::new("Segoe UI", [single]($width * 0.028), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $titleBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $subtitleBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(205, 255, 255, 255))
    $format = [System.Drawing.StringFormat]::new()
    try {
      $format.Alignment = [System.Drawing.StringAlignment]::Center
      $format.LineAlignment = [System.Drawing.StringAlignment]::Center
      $titleTop = $top + $logoSize + $logoToTitleGap
      $titleText = -join @([char]0x661F, [char]0x661F, [char]0x65E5, [char]0x8A18)
      $graphics.DrawString($titleText, $titleFont, $titleBrush, [System.Drawing.RectangleF]::new(0, $titleTop, $width, $titleBand), $format)
      $subtitleTop = $titleTop + $titleBand + $titleToSubtitleGap
      $graphics.DrawString("S T A R   D I A R Y", $subtitleFont, $subtitleBrush, [System.Drawing.RectangleF]::new(0, $subtitleTop, $width, $subtitleBand), $format)
    } finally {
      $format.Dispose()
      $titleBrush.Dispose()
      $subtitleBrush.Dispose()
      $titleFont.Dispose()
      $subtitleFont.Dispose()
    }
    $bitmap.Save((Join-Path $public "splash-${width}x${height}.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

try {
  foreach ($size in @(72, 96, 128, 144, 152, 192, 384, 512)) { New-SquarePng "icon-$size.png" $size }
  New-SquarePng "icon-maskable-192.png" 192 $true
  New-SquarePng "icon-maskable-512.png" 512 $true
  New-SquarePng "android-chrome-192.png" 192
  New-SquarePng "android-chrome-512.png" 512
  New-SquarePng "apple-touch-icon.png" 180
  New-SquarePng "favicon-16.png" 16
  New-SquarePng "favicon-32.png" 32

  foreach ($splash in @(@(640,1136), @(750,1334), @(1125,2436), @(1170,2532), @(1179,2556), @(1290,2796))) {
    New-SplashPng $splash[0] $splash[1]
  }

  # Modern browsers accept a PNG-compressed image inside an ICO container.
  $png = [System.IO.File]::ReadAllBytes((Join-Path $public "favicon-32.png"))
  $stream = [System.IO.File]::Create((Join-Path $public "favicon.ico"))
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
    $writer.Write([byte]32); $writer.Write([byte]32); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
    $writer.Write($png)
  } finally {
    $writer.Dispose()
  }
} finally {
  $source.Dispose()
}
