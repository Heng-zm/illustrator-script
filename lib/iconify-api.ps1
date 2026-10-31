param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Search', 'Download', 'DownloadBatch')]
    [string]$Mode,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [string]$QueryFile,
    [string]$IconId,
    [string]$DestinationPath,
    [string]$Prefix,
    [string]$Color = '000000',
    [ValidateRange(1, 999)]
    [int]$Limit = 100,
    [ValidateRange(0, 999999)]
    [int]$Start = 0
)

$ErrorActionPreference = 'Stop'
$apiHosts = @('https://api.iconify.design', 'https://api.simplesvg.com',
    'https://api.unisvg.com')

function Write-Result {
    param([string]$Status, [string]$Message)
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Message))
    $temporaryOutput = $OutputPath + '.partial'
    try {
        [IO.File]::WriteAllText($temporaryOutput, $Status + ':' + $payload,
            [Text.Encoding]::ASCII)
        Move-Item -LiteralPath $temporaryOutput -Destination $OutputPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryOutput) {
            Remove-Item -LiteralPath $temporaryOutput -Force
        }
    }
}

function Invoke-WithFallback {
    param([scriptblock]$Request)
    $lastError = $null
    foreach ($hostName in $apiHosts) {
        try { return & $Request $hostName } catch { $lastError = $_.Exception }
    }
    if ($null -ne $lastError) { throw $lastError }
    throw 'No Iconify API host is available.'
}

function Test-SvgFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -lt 20) { return $false }
    try {
        $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        return $content -match '<svg(?:\s|>)'
    } catch {
        return $false
    }
}

function Save-IconSvg {
    param([string]$Id, [string]$Path, [string]$HexColor)
    if ($Id -notmatch '^([a-z0-9-]+):([a-z0-9-]+)$') {
        throw 'The selected Iconify icon name is invalid.'
    }
    $prefix = $Matches[1]
    $iconName = $Matches[2]
    if (Test-SvgFile -Path $Path) { return }
    $destinationDirectory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    $temporaryPath = $Path + '.' + $PID + '.partial'
    try {
        Invoke-WithFallback {
            param($hostName)
            if (Test-Path -LiteralPath $temporaryPath) {
                Remove-Item -LiteralPath $temporaryPath -Force
            }
            Invoke-WebRequest -Uri ($hostName + '/' + $prefix + '/' + $iconName +
                '.svg?color=%23' + $HexColor + '&box=1') -UseBasicParsing `
                -OutFile $temporaryPath `
                -TimeoutSec 12
        } | Out-Null
        if (-not (Test-SvgFile -Path $temporaryPath)) {
            throw 'Iconify returned an invalid SVG file.'
        }
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Color = $Color.Trim().TrimStart('#')
    if ($Color -notmatch '^[0-9a-fA-F]{6}$') {
        throw 'Color must be a six-digit hexadecimal value.'
    }
    $Color = $Color.ToUpperInvariant()
    if ($Mode -eq 'Search') {
        if ([string]::IsNullOrWhiteSpace($QueryFile) -or
                -not (Test-Path -LiteralPath $QueryFile -PathType Leaf)) {
            throw 'The icon search query is missing.'
        }
        $query = (Get-Content -LiteralPath $QueryFile -Raw -Encoding UTF8).Trim()
        if ([string]::IsNullOrWhiteSpace($query)) { throw 'Enter an icon search keyword.' }
        $Prefix = ([string]$Prefix).Trim()
        if (-not [string]::IsNullOrWhiteSpace($Prefix) -and
                $Prefix -notmatch '^[a-z0-9-]+$') {
            throw 'The icon-set prefix can contain only letters, numbers, and hyphens.'
        }
        $escapedQuery = [Uri]::EscapeDataString($query)
        $searchUriSuffix = '/search?query=' + $escapedQuery + '&limit=' + $Limit +
            '&start=' + $Start
        if (-not [string]::IsNullOrWhiteSpace($Prefix)) {
            $searchUriSuffix += '&prefix=' + [Uri]::EscapeDataString($Prefix)
        }
        $response = Invoke-WithFallback {
            param($hostName)
            Invoke-RestMethod -Uri ($hostName + $searchUriSuffix) -Method Get -TimeoutSec 12
        }
        $icons = @($response.icons | ForEach-Object { [string]$_ })
        $total = if ($null -ne $response.total) { [int]$response.total } else { $icons.Count }
        Write-Result -Status 'OK' -Message (('@total:' + $total) + "`n" +
            ($icons -join "`n"))
        exit 0
    }

    if ($Mode -eq 'DownloadBatch') {
        if ([string]::IsNullOrWhiteSpace($QueryFile) -or
                -not (Test-Path -LiteralPath $QueryFile -PathType Leaf)) {
            throw 'The icon download list is missing.'
        }
        if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
            throw 'The SVG destination folder is missing.'
        }
        if (-not (Test-Path -LiteralPath $DestinationPath)) {
            New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
        }
        $iconIds = @(Get-Content -LiteralPath $QueryFile -Encoding UTF8 |
            ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($iconIds.Count -eq 0) { throw 'No icons were selected for download.' }
        $downloaded = 0
        $failures = @()
        foreach ($batchIconId in $iconIds) {
            $fileName = $batchIconId.Replace(':', '--') + '--' +
                $Color.ToLowerInvariant() + '.svg'
            try {
                Save-IconSvg -Id $batchIconId -Path (Join-Path $DestinationPath $fileName) `
                    -HexColor $Color
                $downloaded++
            } catch {
                $failures += ($batchIconId + ' (' + $_.Exception.Message + ')')
            }
        }
        $summary = 'Downloaded ' + $downloaded + ' of ' + $iconIds.Count + ' icon(s).'
        if ($failures.Count -gt 0) {
            $summary += ' Failed: ' + ($failures -join ', ')
        }
        if ($downloaded -eq 0) {
            Write-Result -Status 'ERROR' -Message $summary
            exit 2
        }
        Write-Result -Status 'OK' -Message $summary
        exit 0
    }

    if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
        throw 'The SVG destination is missing.'
    }
    Save-IconSvg -Id $IconId -Path $DestinationPath -HexColor $Color
    Write-Result -Status 'OK' -Message $IconId
    exit 0
} catch {
    Write-Result -Status 'ERROR' -Message $_.Exception.Message
    exit 2
}
