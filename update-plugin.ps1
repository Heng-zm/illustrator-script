# =====================================================================
# Ozo Tools Plugin Suite Updater for Adobe Illustrator (Windows)
# Synchronizes and updates:
# 1. Dockable CEP Extension Panel (Window -> Extensions -> Ozo Tools)
# 2. Native Menu Integration (File -> Scripts -> Ozo Tools)
# =====================================================================

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) {
    $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        Ozo Tools - Illustrator Plugin Suite Updater       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$scriptsSource   = Join-Path $ScriptRoot "Script all"
$libSource       = Join-Path $ScriptRoot "lib"
$launcherSource  = Join-Path $ScriptRoot "Script Launcher.jsx"
$cepSource       = Join-Path $ScriptRoot "plugin\com.ozo.illustrator.tools"
$cepTarget       = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.ozo.illustrator.tools"

# 1. Synchronize Source Scripts & Libraries into Plugin Bundle
Write-Host "[1/3] Synchronizing script files and libraries into plugin bundle..." -ForegroundColor Yellow

if (-not (Test-Path $scriptsSource)) {
    Write-Host "      [ERROR] 'Script all' directory not found at: $scriptsSource" -ForegroundColor Red
    exit 1
}

$pluginScripts = Join-Path $cepSource "scripts"
if (-not (Test-Path $pluginScripts)) {
    New-Item -Path $pluginScripts -ItemType Directory -Force | Out-Null
}

# Sync lib into Script all/lib and plugin/scripts/lib
if (Test-Path $libSource) {
    $scriptAllLib = Join-Path $scriptsSource "lib"
    $pluginLib = Join-Path $pluginScripts "lib"
    if (-not (Test-Path $scriptAllLib)) { New-Item -Path $scriptAllLib -ItemType Directory -Force | Out-Null }
    if (-not (Test-Path $pluginLib)) { New-Item -Path $pluginLib -ItemType Directory -Force | Out-Null }
    Copy-Item -Path "$libSource\*" -Destination $scriptAllLib -Recurse -Force
    Copy-Item -Path "$libSource\*" -Destination $pluginLib -Recurse -Force
}

# Sync all scripts
Copy-Item -Path "$scriptsSource\*" -Destination $pluginScripts -Recurse -Force
if (Test-Path $launcherSource) {
    Copy-Item -Path $launcherSource -Destination (Join-Path $pluginScripts "Script Launcher.jsx") -Force
}
Write-Host "      [OK] Plugin script bundle synchronized." -ForegroundColor Green

# 2. Update Dockable CEP Extension Panel in %APPDATA%
Write-Host ""
Write-Host "[2/3] Updating Dockable CEP Extension Panel..." -ForegroundColor Yellow

# Ensure PlayerDebugMode registry keys are set
$regBase = "HKCU:\Software\Adobe"
for ($ver = 6; $ver -le 16; $ver++) {
    $keyPath = "$regBase\CSXS.$ver"
    if (-not (Test-Path $keyPath)) {
        New-Item -Path $keyPath -Force | Out-Null
    }
    Set-ItemProperty -Path $keyPath -Name "PlayerDebugMode" -Value "1" -Type String -Force
}

# Deploy to CEP directory
if (-not (Test-Path $cepTarget)) {
    New-Item -Path $cepTarget -ItemType Directory -Force | Out-Null
}

try {
    # Clean up obsolete files that no longer exist in source
    Get-ChildItem -Path $cepTarget -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($cepTarget.Length)
        $srcFile = $cepSource + $rel
        if (-not (Test-Path $srcFile)) {
            Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}

Copy-Item -Path "$cepSource\*" -Destination $cepTarget -Recurse -Force

Write-Host "      [OK] Dockable panel updated successfully at:" -ForegroundColor Green
Write-Host "           $cepTarget" -ForegroundColor Gray
Write-Host "           (Access via: Window -> Extensions -> Ozo Tools)" -ForegroundColor Green

# 3. Update Native Menu Scripts in Adobe Illustrator Presets
Write-Host ""
Write-Host "[3/3] Updating Native Menu Scripts (File -> Scripts -> Ozo Tools)..." -ForegroundColor Yellow

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$adobeSearchRoots = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    $env:ProgramW6432,
    "C:\Program Files",
    "D:\Program Files"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$illustratorRoots = @()
foreach ($progRoot in $adobeSearchRoots) {
    $adobeDir = Join-Path $progRoot "Adobe"
    if (Test-Path $adobeDir) {
        $found = Get-ChildItem -Path $adobeDir -Directory -Filter "Adobe Illustrator*" -ErrorAction SilentlyContinue
        if ($found) {
            $illustratorRoots += $found
        }
    }
}
$illustratorRoots = $illustratorRoots | Sort-Object -Property FullName -Unique

$updatedMenuCount = 0
if ($illustratorRoots) {
    foreach ($aiDir in $illustratorRoots) {
        $presetsDir = Join-Path $aiDir.FullName "Presets"
        if (Test-Path $presetsDir) {
            $locales = Get-ChildItem -Path $presetsDir -Directory
            foreach ($loc in $locales) {
                $targetScripts = Join-Path $loc.FullName "Scripts\Ozo Tools"
                try {
                    if (-not (Test-Path $targetScripts)) {
                        New-Item -Path $targetScripts -ItemType Directory -Force | Out-Null
                    }
                    Copy-Item -Path "$scriptsSource\*" -Destination $targetScripts -Recurse -Force
                    if (Test-Path $launcherSource) {
                        Copy-Item -Path $launcherSource -Destination (Join-Path $targetScripts "Script Launcher.jsx") -Force
                    }
                    Write-Host "      [OK] Updated in $($aiDir.Name) ($($loc.Name)):" -ForegroundColor Green
                    Write-Host "           $targetScripts" -ForegroundColor Gray
                    $updatedMenuCount++
                } catch {
                    if (-not $isAdmin) {
                        Write-Host "      [INFO] Updating scripts in $($aiDir.Name) requires Administrator privileges." -ForegroundColor Yellow
                    } else {
                        Write-Host "      [ERROR] Updating $($aiDir.Name): $($_.Exception.Message)" -ForegroundColor Red
                    }
                }
            }
        }
    }
}

if ($updatedMenuCount -eq 0 -and -not $isAdmin) {
    Write-Host ""
    Write-Host "NOTE: To update the native 'File -> Scripts' menu inside Program Files," -ForegroundColor Yellow
    Write-Host "      please right-click 'update-plugin.bat' and select 'Run as administrator'." -ForegroundColor Yellow
    Write-Host "      (The dockable CEP panel plugin has already been updated for your user account!)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "               Plugin Update Complete!                    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Restart Adobe Illustrator to load the updated scripts & panel." -ForegroundColor White
Write-Host ""
