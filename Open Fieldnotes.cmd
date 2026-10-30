@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed to open Fieldnotes. Please install Node.js 24.
  pause
  exit /b 1
)
node scripts\open-app.mjs
if errorlevel 1 pause
