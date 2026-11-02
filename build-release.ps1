# Ozo Tools - Release Packaging Script
param(
    [string]$Version = "2.2.0"
)

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) { $ScriptRoot = (Get-Location).Path }

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     Building Ozo Tools Release Package v$Version         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Sync script bundle into plugin first
Write-Host "[*] Synchronizing scripts..." -ForegroundColor Yellow
$scriptsSource = Join-Path $ScriptRoot "Script all"
$cepSource = Join-Path $ScriptRoot "plugin\com.ozo.illustrator.tools"
$pluginScripts = Join-Path $cepSource "scripts"
$libSource = Join-Path $ScriptRoot "lib"
$launcherSource = Join-Path $ScriptRoot "Script Launcher.jsx"

if (-not (Test-Path $pluginScripts)) { New-Item -Path $pluginScripts -ItemType Directory -Force | Out-Null }
Copy-Item -Path "$scriptsSource\*" -Destination $pluginScripts -Recurse -Force
if (Test-Path $libSource) {
    Copy-Item -Path "$libSource\*" -Destination (Join-Path $scriptsSource "lib") -Recurse -Force
    Copy-Item -Path "$libSource\*" -Destination (Join-Path $pluginScripts "lib") -Recurse -Force
}
if (Test-Path $launcherSource) {
    Copy-Item -Path $launcherSource -Destination (Join-Path $pluginScripts "Script Launcher.jsx") -Force
}

# 2. Stage files
$releaseDir = Join-Path $ScriptRoot "release"
$pkgFolder = "Ozo-Tools-v$Version"
$stageDir = Join-Path $releaseDir $pkgFolder

if (Test-Path $releaseDir) {
    Remove-Item $releaseDir -Recurse -Force
}
New-Item -Path $stageDir -ItemType Directory -Force | Out-Null

$itemsToCopy = @(
    "setup.bat",
    "Install as Plugin.jsx",
    "Script Launcher.jsx",
    "README.md",
    "README-PLUGIN.md"
)

foreach ($item in $itemsToCopy) {
    $src = Join-Path $ScriptRoot $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $stageDir -Force
        Write-Host "  + $item" -ForegroundColor Gray
    }
}

$dirsToCopy = @("Script all", "lib", "plugin")
foreach ($dir in $dirsToCopy) {
    $src = Join-Path $ScriptRoot $dir
    if (Test-Path $src) {
        $dest = Join-Path $stageDir $dir
        Copy-Item -Path $src -Destination $dest -Recurse -Force
        Write-Host "  + $dir/" -ForegroundColor Gray
    }
}

# Remove unwanted temporary/junk files
Get-ChildItem -Path $stageDir -Recurse -Include ".DS_Store", "Thumbs.db", "*.tmp" -Force | Remove-Item -Force

# 3. Create zip
$zipName = "Ozo-Tools-v$Version.zip"
$zipPath = Join-Path $releaseDir $zipName
Write-Host "[*] Compressing package to $zipName..." -ForegroundColor Yellow
Compress-Archive -Path $stageDir -DestinationPath $zipPath -CompressionLevel Optimal -Force

$zipInfo = Get-Item $zipPath
$zipSizeMb = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Package Created Successfully!" -ForegroundColor Green
Write-Host "  Path: $zipPath" -ForegroundColor White
Write-Host "  Size: $zipSizeMb MB ($($zipInfo.Length) bytes)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
