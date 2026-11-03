# Ozo Tools - Version Synchronization
#
# version.json is the single source of truth. This script propagates that
# version into the manifest, panel, docs and the shared ExtendScript library.
#
#   powershell -ExecutionPolicy Bypass -File .\sync-version.ps1
#   powershell -ExecutionPolicy Bypass -File .\sync-version.ps1 -Check
#
# -Check writes nothing and exits non-zero when any file is out of sync, so CI
# can reject a release whose committed metadata disagrees with version.json.

param(
    [switch]$Check
)

$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) { $ScriptRoot = (Get-Location).Path }

$versionFile = Join-Path $ScriptRoot "version.json"
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "version.json not found: $versionFile"
}

$version = [string]((Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version)
$version = $version.Trim()
if ($version.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) {
    $version = $version.Substring(1)
}
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "version.json must contain a semantic version such as 2.6.1 (found '$version')."
}

$targets = @(
    @{
        Path        = "plugin\com.ozo.illustrator.tools\CSXS\manifest.xml"
        Pattern     = 'ExtensionBundleVersion="[^"]+"'
        Replacement = 'ExtensionBundleVersion="' + $version + '"'
    },
    @{
        Path        = "plugin\com.ozo.illustrator.tools\CSXS\manifest.xml"
        Pattern     = '(<Extension Id="com\.ozo\.illustrator\.tools\.panel" Version=")[^"]+(")'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "plugin\com.ozo.illustrator.tools\index.html"
        Pattern     = '(id="brandBadge"[^>]*>v)[0-9]+\.[0-9]+\.[0-9]+(<)'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "plugin\com.ozo.illustrator.tools\js\main.js"
        Pattern     = 'var CURRENT_VERSION = "[^"]+";'
        Replacement = 'var CURRENT_VERSION = "' + $version + '";'
    },
    @{
        Path        = "README.md"
        Pattern     = '(Automation Script Suite \(v)[0-9.]+(\))'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "README-PLUGIN.md"
        Pattern     = '(Plugin Suite \(v)[0-9.]+(\))'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "lib\OzoShared.jsxinc"
        Pattern     = '(version:\s*")[0-9]+\.[0-9]+\.[0-9]+(")'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "Script all\lib\OzoShared.jsxinc"
        Pattern     = '(version:\s*")[0-9]+\.[0-9]+\.[0-9]+(")'
        Replacement = '${1}' + $version + '${2}'
    },
    @{
        Path        = "plugin\com.ozo.illustrator.tools\scripts\lib\OzoShared.jsxinc"
        Pattern     = '(version:\s*")[0-9]+\.[0-9]+\.[0-9]+(")'
        Replacement = '${1}' + $version + '${2}'
    }
)

$outOfSync = @()
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($target in $targets) {
    $path = Join-Path $ScriptRoot $target.Path
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Version target not found: $($target.Path)"
    }

    $text = [System.IO.File]::ReadAllText($path)
    if (-not [regex]::IsMatch($text, $target.Pattern)) {
        throw "Version pattern not found in $($target.Path). Update sync-version.ps1 if the file format changed."
    }

    $updated = [regex]::Replace($text, $target.Pattern, $target.Replacement)
    if ($updated -eq $text) {
        continue
    }

    if ($Check) {
        $outOfSync += $target.Path
    } else {
        [System.IO.File]::WriteAllText($path, $updated, $utf8NoBom)
        Write-Host "  [OK] $($target.Path)" -ForegroundColor Green
    }
}

if ($Check) {
    if ($outOfSync.Count -gt 0) {
        throw "Version metadata does not match version.json (v$version):`n  " +
            ($outOfSync -join "`n  ") + "`nRun sync-version.ps1 to update these files."
    }
    Write-Host "[OK] All version metadata matches version.json (v$version)." -ForegroundColor Green
} else {
    Write-Host "[OK] Version metadata synchronized to v$version." -ForegroundColor Green
}
