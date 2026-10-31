param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [Parameter(Mandatory = $true)][string]$DecoderPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$bitmap = $null

function Write-DecoderResult {
    param([string]$Status, [string]$Message)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
    $payload = [Convert]::ToBase64String($bytes)
    # Write to a staging file and rename so the polling script never reads a
    # partially written result.
    $stagingPath = $OutputPath + '.partial'
    try {
        [System.IO.File]::WriteAllText(
            $stagingPath,
            $Status + ':' + $payload,
            [System.Text.Encoding]::ASCII
        )
        Move-Item -LiteralPath $stagingPath -Destination $OutputPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $stagingPath) {
            Remove-Item -LiteralPath $stagingPath -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
        throw 'The selected QR image does not exist.'
    }
    if (-not (Test-Path -LiteralPath $DecoderPath -PathType Leaf)) {
        throw 'The ZXing decoder library is missing.'
    }

    Add-Type -AssemblyName System.Drawing
    try {
        [void][System.Reflection.Assembly]::Load([System.IO.File]::ReadAllBytes($DecoderPath))
    } catch {
        Add-Type -LiteralPath $DecoderPath
    }

    $bitmap = [System.Drawing.Bitmap]::FromFile($ImagePath)
    $reader = New-Object ZXing.BarcodeReader
    $reader.AutoRotate = $true
    $reader.TryInverted = $true
    $reader.Options.TryHarder = $true
    $possibleFormats = New-Object 'System.Collections.Generic.List[ZXing.BarcodeFormat]'
    [void]$possibleFormats.Add([ZXing.BarcodeFormat]::QR_CODE)
    $reader.Options.PossibleFormats = $possibleFormats

    $result = $reader.Decode($bitmap)
    if ($null -eq $result -or [string]::IsNullOrEmpty($result.Text)) {
        throw 'No readable QR code was found in the selected image.'
    }

    Write-DecoderResult -Status 'OK' -Message $result.Text
    exit 0
}
catch {
    Write-DecoderResult -Status 'ERROR' -Message $_.Exception.Message
    exit 2
}
finally {
    if ($null -ne $bitmap) {
        $bitmap.Dispose()
    }
}
