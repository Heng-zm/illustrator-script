# =====================================================================
# Ozo Tools Plugin Installer for Adobe Illustrator (Windows)
# Installs both:
# 1. Dockable CEP Extension Panel (Window -> Extensions -> Ozo Tools)
# 2. Native Menu Integration (File -> Scripts -> Ozo Tools)
# =====================================================================

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) {
    $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       Ozo Tools - Adobe Illustrator Plugin Installer      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Enable PlayerDebugMode for CEP Extensions in Windows Registry
Write-Host "[1/3] Configuring Adobe Extension Developer Mode (PlayerDebugMode)..." -ForegroundColor Yellow
$regBase = "HKCU:\Software\Adobe"
for ($ver = 6; $ver -le 16; $ver++) {
    $keyPath = "$regBase\CSXS.$ver"
    if (-not (Test-Path $keyPath)) {
        New-Item -Path $keyPath -Force | Out-Null
    }
    Set-ItemProperty -Path $keyPath -Name "PlayerDebugMode" -Value "1" -Type String -Force
}
Write-Host "      [OK] PlayerDebugMode enabled for CSXS 6 through 16" -ForegroundColor Green

# 2. Install CEP Extension Panel into User AppData
Write-Host ""
Write-Host "[2/3] Installing Dockable CEP Panel Plugin..." -ForegroundColor Yellow
$cepSource = Join-Path $ScriptRoot "plugin\com.ozo.illustrator.tools"
$cepTarget = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.ozo.illustrator.tools"
$scriptsSource = Join-Path $ScriptRoot "Script all"
$launcherSource = Join-Path $ScriptRoot "Script Launcher.jsx"

# Ensure plugin bundled scripts are up-to-date
if ((Test-Path $cepSource) -and (Test-Path $scriptsSource)) {
    $pluginScripts = Join-Path $cepSource "scripts"
    if (-not (Test-Path $pluginScripts)) {
        New-Item -Path $pluginScripts -ItemType Directory -Force | Out-Null
    }
    Copy-Item -Path "$scriptsSource\*" -Destination $pluginScripts -Recurse -Force
    if (Test-Path $launcherSource) {
        Copy-Item -Path $launcherSource -Destination (Join-Path $pluginScripts "Script Launcher.jsx") -Force
    }
}

if (-not (Test-Path $cepSource)) {
    Write-Host "      [ERROR] CEP source folder not found at: $cepSource" -ForegroundColor Red
} else {
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
    Write-Host "      [OK] Dockable panel installed to:" -ForegroundColor Green
    Write-Host "           $cepTarget" -ForegroundColor Gray
    Write-Host "           (Accessible in Illustrator: Window -> Extensions -> Ozo Tools)" -ForegroundColor Green
}

# 3. Install Native Menu Scripts into Illustrator Presets
Write-Host ""
Write-Host "[3/3] Installing Native Menu Scripts (File -> Scripts -> Ozo Tools)..." -ForegroundColor Yellow
$scriptsSource = Join-Path $ScriptRoot "Script all"
$launcherSource = Join-Path $ScriptRoot "Script Launcher.jsx"

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

$installedMenuCount = 0
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
                    Write-Host "      [OK] Installed into $($aiDir.Name) ($($loc.Name)):" -ForegroundColor Green
                    Write-Host "           $targetScripts" -ForegroundColor Gray
                    $installedMenuCount++
                } catch {
                    if (-not $isAdmin) {
                        Write-Host "      [INFO] Writing to $($aiDir.Name) requires Administrator privileges." -ForegroundColor Yellow
                    } else {
                        Write-Host "      [ERROR] Copying to $($aiDir.Name): $($_.Exception.Message)" -ForegroundColor Red
                    }
                }
            }
        }
    }
}

if ($installedMenuCount -eq 0 -and -not $isAdmin) {
    Write-Host ""
    Write-Host "NOTE: To install into the native 'File -> Scripts' menu inside Program Files," -ForegroundColor Yellow
    Write-Host "      please right-click 'install-plugin.bat' and select 'Run as administrator'." -ForegroundColor Yellow
    Write-Host "      (The dockable panel plugin was already installed successfully without admin!)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "              Installation Complete!                     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor White
Write-Host "1. Restart Adobe Illustrator." -ForegroundColor White
Write-Host "2. Open the dockable panel via: Window -> Extensions -> Ozo Tools" -ForegroundColor White
Write-Host "3. Or run scripts from: File -> Scripts -> Ozo Tools" -ForegroundColor White
Write-Host ""
