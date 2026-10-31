param(
    [Parameter(Mandatory = $true)]
    [string]$MessageFile
)

$ErrorActionPreference = 'Stop'
$preferencesDirectory = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Ozo Illustrator Scripts'
$configPath = Join-Path $preferencesDirectory 'telegram.json'
$failureLogPath = Join-Path $preferencesDirectory 'telegram-errors.log'

function Write-FailureLog {
    param([string]$Message)

    try {
        if (-not (Test-Path -LiteralPath $preferencesDirectory)) {
            New-Item -ItemType Directory -Path $preferencesDirectory -Force | Out-Null
        }
        $entry = '{0:u} {1}' -f (Get-Date), ($Message -replace '[\r\n]+', ' ')
        Add-Content -LiteralPath $failureLogPath -Value $entry -Encoding UTF8
    } catch {
        # Reporting must never interfere with Illustrator.
    }
}

try {
    if (-not (Test-Path -LiteralPath $MessageFile -PathType Leaf)) {
        throw 'The temporary error report is missing.'
    }

    $botToken = [Environment]::GetEnvironmentVariable('OZO_TELEGRAM_BOT_TOKEN', 'Process')
    $chatId = [Environment]::GetEnvironmentVariable('OZO_TELEGRAM_CHAT_ID', 'Process')

    $possibleConfigPaths = @(
        $configPath,
        (Join-Path $PSScriptRoot 'telegram.json'),
        (Join-Path $PSScriptRoot 'telegram-config.txt')
    )

    if ([string]::IsNullOrWhiteSpace($botToken) -or [string]::IsNullOrWhiteSpace($chatId)) {
        foreach ($candidatePath in $possibleConfigPaths) {
            if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
                try {
                    $config = Get-Content -LiteralPath $candidatePath -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ([string]::IsNullOrWhiteSpace($botToken) -and -not [string]::IsNullOrWhiteSpace($config.bot_token)) {
                        $botToken = [string]$config.bot_token
                    }
                    if ([string]::IsNullOrWhiteSpace($chatId) -and -not [string]::IsNullOrWhiteSpace($config.chat_id)) {
                        $chatId = [string]$config.chat_id
                    }
                    if (-not [string]::IsNullOrWhiteSpace($botToken) -and -not [string]::IsNullOrWhiteSpace($chatId)) {
                        break
                    }
                } catch {}
            }
        }
    }

    # Check for placeholder credentials
    if ($botToken -match 'YOUR_TELEGRAM|replace_with|123456789:|<token>|EXAMPLE' -or $chatId -match 'YOUR_TELEGRAM|replace_with|<chat_id>|EXAMPLE') {
        # Placeholders present; skip reporting without failing
        return
    }

    if ([string]::IsNullOrWhiteSpace($botToken) -or [string]::IsNullOrWhiteSpace($chatId)) {
        throw "Telegram reporting is not configured. Configure environment variables or copy telegram-config.example.json to '$configPath'."
    }

    $message = Get-Content -LiteralPath $MessageFile -Raw -Encoding UTF8
    if ($message.Length -gt 3900) {
        $message = $message.Substring(0, 3880) + "`n[report truncated]"
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $requestBody = @{
        chat_id = $chatId
        text = $message
        disable_notification = $false
    } | ConvertTo-Json -Compress

    $response = Invoke-RestMethod `
        -Uri ("https://api.telegram.org/bot{0}/sendMessage" -f $botToken) `
        -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes($requestBody)) `
        -TimeoutSec 10

    if (-not $response.ok) {
        throw 'Telegram rejected the error report.'
    }
} catch {
    Write-FailureLog -Message $_.Exception.Message
} finally {
    try {
        if (Test-Path -LiteralPath $MessageFile -PathType Leaf) {
            Remove-Item -LiteralPath $MessageFile -Force
        }
    } catch {
        # The next temporary report uses a unique filename.
    }
}
