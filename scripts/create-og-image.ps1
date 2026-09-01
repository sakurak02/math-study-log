Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630
$outputPath = Join-Path (Split-Path $PSScriptRoot -Parent) "public/og-image.png"
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f7fafa"))

  $accent = [System.Drawing.ColorTranslator]::FromHtml("#315f63")
  $ink = [System.Drawing.ColorTranslator]::FromHtml("#192323")
  $soft = [System.Drawing.ColorTranslator]::FromHtml("#6b7777")
  $line = [System.Drawing.ColorTranslator]::FromHtml("#d4e1e1")
  $panel = [System.Drawing.Color]::White

  $graphics.FillRectangle([System.Drawing.SolidBrush]::new($accent), 0, 0, 28, $height)
  $graphics.DrawLine([System.Drawing.Pen]::new($line, 2), 78, 82, 1120, 82)

  $mono = [System.Drawing.Font]::new("Consolas", 25, [System.Drawing.FontStyle]::Bold)
  $jp = [System.Drawing.Font]::new("Yu Gothic UI", 58, [System.Drawing.FontStyle]::Bold)
  $tagline = [System.Drawing.Font]::new("Yu Gothic UI", 25, [System.Drawing.FontStyle]::Regular)
  $small = [System.Drawing.Font]::new("Consolas", 18, [System.Drawing.FontStyle]::Regular)
  $accentBrush = [System.Drawing.SolidBrush]::new($accent)
  $inkBrush = [System.Drawing.SolidBrush]::new($ink)
  $softBrush = [System.Drawing.SolidBrush]::new($soft)
  $panelBrush = [System.Drawing.SolidBrush]::new($panel)
  $linePen = [System.Drawing.Pen]::new($line, 2)

  $graphics.DrawString("MATH STUDY LOG", $mono, $accentBrush, 78, 112)
  $graphics.DrawString("数学学習記録", $jp, $inkBrush, 72, 174)
  $graphics.DrawString("間違い・迷い・修正まで、そのまま残す。", $tagline, $softBrush, 78, 286)

  $cardX = 78
  $cardY = 385
  $cellWidth = 90
  $cellHeight = 70
  for ($index = 0; $index -lt 10; $index++) {
    $x = $cardX + ($index * ($cellWidth + 10))
    $graphics.FillRectangle($panelBrush, $x, $cardY, $cellWidth, $cellHeight)
    $graphics.DrawRectangle($linePen, $x, $cardY, $cellWidth, $cellHeight)
    if ($index -in @(1, 2, 4, 5, 6, 8, 9)) {
      $level = 35 + (($index * 17) % 55)
      $fill = [System.Drawing.Color]::FromArgb(255, 49, 95 + [Math]::Min($level, 35), 99 + [Math]::Min($level, 35))
      $graphics.FillRectangle([System.Drawing.SolidBrush]::new($fill), $x + 8, $cardY + 8, $cellWidth - 16, $cellHeight - 16)
    }
  }

  $graphics.DrawString("64歳から、5年後の難関大受験数学へ。", $tagline, $inkBrush, 78, 500)
  $graphics.DrawString("sakurak02.github.io/math-study-log", $small, $softBrush, 78, 561)

  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
