@echo off
setlocal
cd /d "%~dp0"
title Auto Push to GitHub - Ozo Tools

if /i "%~1"=="--watch" goto :watch
if /i "%~1"=="-w" goto :watch
if /i "%~1"=="watch" goto :watch

call "%~dp0setup.bat" noelevate push %*
goto :done

:watch
call "%~dp0setup.bat" noelevate watch

:done
