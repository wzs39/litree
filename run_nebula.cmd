@echo off
setlocal
title Nebula Knowledge Graph Viewer

echo ============================================================
echo   Starting Interactive Nebula Graph View
echo ============================================================
echo.

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in system PATH.
    echo Please ensure Python 3.10+ is installed and added to PATH.
    pause
    exit /b 1
)

echo [1/2] Refreshing workspace nebula asset scan...
python scripts\scan_nebula_assets.py
if %errorlevel% neq 0 (
    echo [WARNING] Asset scanner finished with non-zero exit code.
)

echo.
echo [2/2] Launching local HTTP server and opening browser...
python run_nebula.py

endlocal
