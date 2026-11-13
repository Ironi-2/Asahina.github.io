@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js not found.
  echo  Install Node.js, or add node.exe to PATH, then try again.
  echo.
  pause
  exit /b 1
)

node "editor\server.js" --open
if errorlevel 1 pause
