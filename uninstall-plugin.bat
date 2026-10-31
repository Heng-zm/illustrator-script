@echo off
setlocal
cd /d "%~dp0"
title Ozo Tools Plugin Uninstaller

echo ==========================================================
echo      Ozo Tools - Adobe Illustrator Plugin Uninstaller
echo ==========================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    if "%~1" neq "user" (
        echo Requesting Administrator privileges to remove menu scripts from Program Files...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process cmd -ArgumentList '/c \"\"%~f0\" admin\"' -Verb RunAs; exit 0 } catch { exit 1 }"
        if %errorlevel% equ 0 (
            exit /b
        )
        echo.
        echo [INFO] Administrator elevation declined or unavailable.
        echo        Removing dockable CEP extension for current user...
        echo.
    )
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-plugin.ps1"

echo.
pause
