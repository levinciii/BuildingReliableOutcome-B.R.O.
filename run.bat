@echo off
setlocal
cd /d "%~dp0"
title B.R.O.

if not exist ".venv\Scripts\python.exe" (
  echo First run: setting things up...
  call setup.bat
)
if not exist ".venv\Scripts\python.exe" exit /b 1

".venv\Scripts\python.exe" main.py %*
if errorlevel 1 (
  echo.
  echo B.R.O. stopped because of a problem. Read the message above.
  pause
)
