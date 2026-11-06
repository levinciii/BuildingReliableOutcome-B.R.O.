@echo off
setlocal
cd /d "%~dp0"
title B.R.O. setup
echo.
echo === B.R.O. setup - one time only, takes a few minutes ===
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [!!] Python was not found.
  echo      Install Python 3.10 or newer from https://www.python.org/downloads/
  echo      and tick "Add python.exe to PATH" on the first screen.
  echo      Then run setup.bat again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating a private environment in the .venv folder...
  python -m venv .venv
  if errorlevel 1 (
    echo [!!] Could not create the environment.
    pause
    exit /b 1
  )
)

echo Installing libraries...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [!!] Installing libraries failed. Check your internet connection and run setup.bat again.
  pause
  exit /b 1
)

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo Checking everything and downloading the AI model if needed...
".venv\Scripts\python.exe" main.py --doctor
echo.
echo Setup finished. Start B.R.O. by double-clicking run.bat
pause
