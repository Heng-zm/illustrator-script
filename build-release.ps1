# Ozo Tools - Release Packaging Script
param(
    [string]$Version
)

$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) { $ScriptRoot = (Get-Location).Path }

# version.json is the single source of truth. -Version is accepted only for
# backwards compatibility and must match it.
$versionFile = Join-Path $ScriptRoot "version.json"
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "version.json not found at $versionFile"
}

$jsonVersion = [string]((Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version)
$jsonVersion = $jsonVersion.Trim()
if ($jsonVersion.StartsWith('v', [System.StringComparison]::OrdinalIgnoreCase)) {
    $jsonVersion = $jsonVersion.Substring(1)
}

if ($Version) {
    $requested = $Version.Trim()
    if ($requested.StartsWith('v', [System.StringComparison]::OrdinalIgnoreCase)) {
        $requested = $requested.Substring(1)
    }
    if ($requested -ne $jsonVersion) {
        throw "Requested version $requested does not match version.json ($jsonVersion). Update version.json instead of passing -Version."
    }
}
$Version = $jsonVersion

$versionSync = Join-Path $ScriptRoot "sync-version.ps1"
if (Test-Path -LiteralPath $versionSync) {
    Write-Host "[*] Synchronizing version metadata..." -ForegroundColor Yellow
    & $versionSync
}

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
    Copy-Item -Path $launcherSource -Destination (Join-Path $scriptsSource "Script Launcher.jsx") -Force
    Copy-Item -Path $launcherSource -Destination (Join-Path $pluginScripts "Script Launcher.jsx") -Force
}

# 1b. Validate before packaging so a broken script can never be released.
$syntaxCheck = Join-Path $ScriptRoot "tools\check-syntax.js"
$unitTest = Join-Path $ScriptRoot "tools\test-hostscript.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    if (Test-Path -LiteralPath $syntaxCheck) {
        Write-Host "[*] Validating ExtendScript and panel syntax..." -ForegroundColor Yellow
        & node $syntaxCheck
        if ($LASTEXITCODE -ne 0) {
            throw "Syntax validation failed. Fix the errors above before releasing."
        }
    }
    if (Test-Path -LiteralPath $unitTest) {
        Write-Host "[*] Running host bridge unit tests..." -ForegroundColor Yellow
        & node $unitTest
        if ($LASTEXITCODE -ne 0) {
            throw "Unit tests failed. Fix the test failures before releasing."
        }
    }
} else {
    Write-Host "    [WARN] Node.js not found; skipping syntax and unit test validation." -ForegroundColor Yellow
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
    "setup.command",
    "push.bat",
    "Install as Plugin.jsx",
    "Script Launcher.jsx",
    "README.md",
    "README-PLUGIN.md",
    "LICENSE",
    "CHANGELOG.md",
    "version.json",
    "sync-version.ps1"
)

foreach ($item in $itemsToCopy) {
    $src = Join-Path $ScriptRoot $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $stageDir -Force
        Write-Host "  + $item" -ForegroundColor Gray
    }
}

$dirsToCopy = @("Script all", "lib", "plugin", "assets")
foreach ($dir in $dirsToCopy) {
    $src = Join-Path $ScriptRoot $dir
    if (Test-Path $src) {
        $dest = Join-Path $stageDir $dir
        Copy-Item -Path $src -Destination $dest -Recurse -Force
        Write-Host "  + $dir/" -ForegroundColor Gray
    }
}

# Remove unwanted temporary/junk files
Get-ChildItem -Path $stageDir -Recurse -Include ".DS_Store", "Thumbs.db", ".debug", "*.tmp", "*.log", "*.bak", "*~" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $stageDir -Recurse -Hidden -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ".git*" } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

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
