@echo off
title Scent DNA - local run
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\start.ps1"
echo.
pause
