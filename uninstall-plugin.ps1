# =====================================================================
# Ozo Tools Plugin Uninstaller for Adobe Illustrator
# =====================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      Ozo Tools - Adobe Illustrator Plugin Uninstaller     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Remove CEP Extension Panel
$cepTarget = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.ozo.illustrator.tools"
if (Test-Path $cepTarget) {
    Remove-Item -Path $cepTarget -Recurse -Force
    Write-Host "      [OK] Removed CEP panel from: $cepTarget" -ForegroundColor Green
} else {
    Write-Host "      [INFO] CEP panel was not installed." -ForegroundColor Gray
}

# 2. Remove Menu Scripts from Illustrator Presets
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
                        Write-Host "      [OK] Removed scripts from: $targetScripts" -ForegroundColor Green
                    } catch {
                        Write-Host "      [WARN] Administrator permissions needed to remove: $targetScripts" -ForegroundColor Yellow
                    }
                }
            }
        }
    }
}

Write-Host ""
Write-Host "Uninstallation complete. Restart Adobe Illustrator." -ForegroundColor Cyan
