<# : batch section
@echo off
setlocal
cd /d "%~dp0"
title Ozo Tools - Plugin Suite Manager

set "SCRIPT_FILE=%~f0"
set "ARG1=%~1"
set "ARG2=%~2"
if /i "%ARG1%"=="noelevate" (
    set "ARG1=%~2"
    set "ARG2=%~3"
)

:: Attempt Administrator elevation if not already elevated and not explicitly bypassed
net session >nul 2>&1
if %errorlevel% neq 0 (
    if /i "%ARG1%" neq "noelevate" if /i "%ARG1%" neq "user" (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process cmd -ArgumentList '/c \"\"%SCRIPT_FILE%\" noelevate %*\"' -Verb RunAs; exit 0 } catch { exit 1 }"
        if %errorlevel% equ 0 exit /b
    )
)

:: Run embedded PowerShell logic
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$script = (Get-Content -LiteralPath $env:SCRIPT_FILE) -join [char]10; & ([scriptblock]::Create($script)) $env:ARG1"

:: Keep console open when double-clicked interactively
if "%ARG1%"=="" pause
exit /b %ERRORLEVEL%
#>

param(
    [string]$Action = ""
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot -and $env:SCRIPT_FILE) {
    $ScriptRoot = Split-Path -Parent $env:SCRIPT_FILE
}
if (-not $ScriptRoot -or -not (Test-Path (Join-Path $ScriptRoot "Script all"))) {
    $ScriptRoot = (Get-Location).Path
}

$cepSource       = Join-Path $ScriptRoot "plugin\com.ozo.illustrator.tools"
$cepTarget       = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.ozo.illustrator.tools"
$scriptsSource   = Join-Path $ScriptRoot "Script all"
$libSource       = Join-Path $ScriptRoot "lib"
$launcherSource  = Join-Path $ScriptRoot "Script Launcher.jsx"

function Show-Header {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "     Ozo Tools - Adobe Illustrator Plugin Suite Manager   " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Enable-PlayerDebugMode {
    Write-Host "[*] Configuring Adobe Extension Developer Mode (PlayerDebugMode)..." -ForegroundColor Yellow
    $regBase = "HKCU:\Software\Adobe"
    for ($ver = 6; $ver -le 16; $ver++) {
        $keyPath = "$regBase\CSXS.$ver"
        if (-not (Test-Path $keyPath)) {
            New-Item -Path $keyPath -Force | Out-Null
        }
        Set-ItemProperty -Path $keyPath -Name "PlayerDebugMode" -Value "1" -Type String -Force
    }
    Write-Host "    [OK] PlayerDebugMode enabled for CSXS 6 through 16" -ForegroundColor Green
}

function Sync-PluginBundle {
    Write-Host "[*] Synchronizing script files into plugin bundle..." -ForegroundColor Yellow
    if (-not (Test-Path $scriptsSource)) {
        Write-Host "    [ERROR] 'Script all' directory not found at: $scriptsSource" -ForegroundColor Red
        return $false
    }
    $pluginScripts = Join-Path $cepSource "scripts"
    if (-not (Test-Path $pluginScripts)) {
        New-Item -Path $pluginScripts -ItemType Directory -Force | Out-Null
    }
    if (Test-Path $libSource) {
        $scriptAllLib = Join-Path $scriptsSource "lib"
        $pluginLib = Join-Path $pluginScripts "lib"
        if (-not (Test-Path $scriptAllLib)) { New-Item -Path $scriptAllLib -ItemType Directory -Force | Out-Null }
        if (-not (Test-Path $pluginLib)) { New-Item -Path $pluginLib -ItemType Directory -Force | Out-Null }
        Copy-Item -Path "$libSource\*" -Destination $scriptAllLib -Recurse -Force
        Copy-Item -Path "$libSource\*" -Destination $pluginLib -Recurse -Force
    }
    Copy-Item -Path "$scriptsSource\*" -Destination $pluginScripts -Recurse -Force
    if (Test-Path $launcherSource) {
        Copy-Item -Path $launcherSource -Destination (Join-Path $pluginScripts "Script Launcher.jsx") -Force
    }
    Write-Host "    [OK] Plugin script bundle synchronized." -ForegroundColor Green
    return $true
}

function Install-CepPanel {
    Write-Host "[*] Updating Dockable CEP Extension Panel..." -ForegroundColor Yellow
    if (-not (Test-Path $cepTarget)) {
        New-Item -Path $cepTarget -ItemType Directory -Force | Out-Null
    }
    try {
        Get-ChildItem -Path $cepTarget -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            $rel = $_.FullName.Substring($cepTarget.Length)
            $srcFile = $cepSource + $rel
            if (-not (Test-Path $srcFile)) {
                Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    Copy-Item -Path "$cepSource\*" -Destination $cepTarget -Recurse -Force
    Write-Host "    [OK] Dockable panel installed/updated at:" -ForegroundColor Green
    Write-Host "         $cepTarget" -ForegroundColor Gray
    Write-Host "         (Access in Illustrator: Window -> Extensions -> Ozo Tools)" -ForegroundColor Green
}

function Get-IllustratorRoots {
    $adobeSearchRoots = @(
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        $env:ProgramW6432,
        "C:\Program Files",
        "D:\Program Files"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    $aiRoots = @()
    foreach ($progRoot in $adobeSearchRoots) {
        $adobeDir = Join-Path $progRoot "Adobe"
        if (Test-Path $adobeDir) {
            $found = Get-ChildItem -Path $adobeDir -Directory -Filter "Adobe Illustrator*" -ErrorAction SilentlyContinue
            if ($found) { $aiRoots += $found }
        }
    }
    return ($aiRoots | Sort-Object -Property FullName -Unique)
}

function Install-MenuScripts {
    Write-Host "[*] Installing Native Menu Scripts (File -> Scripts -> Ozo Tools)..." -ForegroundColor Yellow
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $illustratorRoots = Get-IllustratorRoots

    if (-not $illustratorRoots) {
        Write-Host "    [INFO] No Adobe Illustrator installation folders found in Program Files." -ForegroundColor Gray
        return
    }

    $installedAny = $false
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
                        Copy-Item -Path $launcherSource -Destination $targetScripts -Force
                    }
                    Write-Host "    [OK] Installed to: $targetScripts" -ForegroundColor Green
                    $installedAny = $true
                } catch {
                    if (-not $isAdmin) {
                        Write-Host "    [INFO] Administrator privileges required to write to: $($aiDir.Name)" -ForegroundColor Yellow
                    } else {
                        Write-Host "    [WARN] Could not copy to: $targetScripts ($($_.Exception.Message))" -ForegroundColor Yellow
                    }
                }
            }
        }
    }

    if (-not $installedAny -and -not $isAdmin) {
        Write-Host ""
        Write-Host "NOTE: To install native menu scripts into 'File -> Scripts', right-click 'setup.bat'" -ForegroundColor Yellow
        Write-Host "      and choose 'Run as administrator'." -ForegroundColor Yellow
        Write-Host "      (The dockable CEP panel plugin is already fully installed for your user account!)" -ForegroundColor Green
    }
}

function Do-Install {
    Show-Header
    Enable-PlayerDebugMode
    Write-Host ""
    if (-not (Sync-PluginBundle)) { return }
    Write-Host ""
    Install-CepPanel
    Write-Host ""
    Install-MenuScripts
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "              Installation Complete!                     " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Restart Adobe Illustrator to load the Ozo Tools suite." -ForegroundColor White
}

function Do-Update {
    Show-Header
    Write-Host "Updating Ozo Tools plugin bundle and installed extensions..." -ForegroundColor Yellow
    Write-Host ""
    Enable-PlayerDebugMode
    Write-Host ""
    if (-not (Sync-PluginBundle)) { return }
    Write-Host ""
    Install-CepPanel
    Write-Host ""
    Install-MenuScripts
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "                 Update Complete!                        " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Restart Adobe Illustrator to reload the updated scripts & panel." -ForegroundColor White
}

function Do-Uninstall {
    Show-Header
    Write-Host "Uninstalling Ozo Tools from Adobe Illustrator..." -ForegroundColor Yellow
    Write-Host ""

    # 1. Remove CEP Panel
    if (Test-Path $cepTarget) {
        Remove-Item -Path $cepTarget -Recurse -Force
        Write-Host "    [OK] Removed CEP panel from: $cepTarget" -ForegroundColor Green
    } else {
        Write-Host "    [INFO] CEP panel was not installed." -ForegroundColor Gray
    }

    # 2. Remove Menu Scripts
    $illustratorRoots = Get-IllustratorRoots
    if ($illustratorRoots) {
        foreach ($aiDir in $illustratorRoots) {
            $presetsDir = Join-Path $aiDir.FullName "Presets"
            if (Test-Path $presetsDir) {
                $locales = Get-ChildItem -Path $presetsDir -Directory
                foreach ($loc in $locales) {
                    $targetScripts = Join-Path $loc.FullName "Scripts\Ozo Tools"
                    if (Test-Path $targetScripts) {
                        try {
                            Remove-Item -Path $targetScripts -Recurse -Force
                            Write-Host "    [OK] Removed scripts from: $targetScripts" -ForegroundColor Green
                        } catch {
                            Write-Host "    [WARN] Administrator permissions needed to remove: $targetScripts" -ForegroundColor Yellow
                        }
                    }
                }
            }
        }
    }

    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "               Uninstallation Complete!                   " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Restart Adobe Illustrator to complete cleanup." -ForegroundColor White
}

# --- Action Dispatcher ---
$act = $Action.Trim().ToLower()
if ($act -eq "install" -or $act -eq "1" -or $act -eq "-install") {
    Do-Install
} elseif ($act -eq "update" -or $act -eq "sync" -or $act -eq "2" -or $act -eq "-update") {
    Do-Update
} elseif ($act -eq "uninstall" -or $act -eq "remove" -or $act -eq "3" -or $act -eq "-uninstall") {
    Do-Uninstall
} elseif ($act -eq "exit" -or $act -eq "quit" -or $act -eq "4") {
    exit 0
} else {
    # Interactive Menu
    Show-Header
    Write-Host "Select an action to perform:" -ForegroundColor White
    Write-Host "  [1] Install Plugin & Menu Scripts    (Recommended)" -ForegroundColor Green
    Write-Host "  [2] Update / Sync Installed Plugin   (Refresh scripts & panel)" -ForegroundColor Cyan
    Write-Host "  [3] Uninstall Plugin & Menu Scripts  (Clean removal)" -ForegroundColor Yellow
    Write-Host "  [4] Exit" -ForegroundColor Gray
    Write-Host ""
    $choice = Read-Host "Enter your choice (1-4) [Default: 1]"
    Write-Host ""
    if ([string]::IsNullOrWhiteSpace($choice) -or $choice.Trim() -eq "1") {
        Do-Install
    } elseif ($choice.Trim() -eq "2") {
        Do-Update
    } elseif ($choice.Trim() -eq "3") {
        Do-Uninstall
    } else {
        exit 0
    }
}
