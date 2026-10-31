@echo off
setlocal
cd /d "%~dp0"
title Ozo Tools Plugin Installer

echo ==========================================================
echo      Ozo Tools - Adobe Illustrator Plugin Installer
echo ==========================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    if "%~1" neq "user" (
        echo Requesting Administrator privileges to complete full installation...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process cmd -ArgumentList '/c \"\"%~f0\" admin\"' -Verb RunAs; exit 0 } catch { exit 1 }"
        if %errorlevel% equ 0 (
            exit /b
        )
        echo.
        echo [INFO] Administrator elevation declined or unavailable.
        echo        Installing dockable CEP extension for current user...
        echo.
    )
)

:: Run the PowerShell installer script
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugin.ps1"

echo.
pause
