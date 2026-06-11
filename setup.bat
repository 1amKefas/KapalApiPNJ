@echo off
:: ============================================
:: PreVis — Windows Setup Script
:: Run this after cloning the repository
:: Requires: Node.js 18+, PostgreSQL 14+, Python 3.11
:: ============================================

setlocal enabledelayedexpansion
title PreVis Setup

echo.
echo  ============================
echo   PreVis -- Windows Setup
echo  ============================
echo.

:: ── 1. Check Node.js ─────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [X] Node.js is not installed.
    echo     Download from: https://nodejs.org/  ^(LTS version^)
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: ── 2. Check npm ─────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    echo [X] npm not found. Reinstall Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo [OK] npm %NPM_VER%

:: ── 3. Check PostgreSQL ───────────────────────
where psql >nul 2>&1
if errorlevel 1 (
    echo [X] PostgreSQL ^(psql^) not found in PATH.
    echo     Download from: https://www.postgresql.org/download/windows/
    echo     Make sure to add PostgreSQL bin to your PATH during install.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('psql --version') do set PG_VER=%%v
echo [OK] %PG_VER%

:: ── 4. Find Python 3.11 ──────────────────────
echo.
echo Searching for Python 3.11 (required for TensorFlow 2.15)...

set PYTHON_BIN=
for %%p in (py python3.11 python) do (
    where %%p >nul 2>&1
    if not errorlevel 1 (
        for /f "tokens=*" %%v in ('%%p --version 2^>^&1') do (
            echo %%v | findstr "3.11" >nul
            if not errorlevel 1 (
                set PYTHON_BIN=%%p
                echo [OK] Found %%p ^(%%v^)
                goto :python_found
            )
        )
    )
)

:: Try py launcher for specific version
py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_BIN=py -3.11
    echo [OK] Found Python 3.11 via py launcher
    goto :python_found
)

echo [!] Python 3.11 not found.
echo     TensorFlow 2.15.1 requires Python 3.9, 3.10, or 3.11.
echo     Download Python 3.11 from: https://www.python.org/downloads/release/python-3119/
echo.
echo     The web server ^(Node.js^) will still work without Python.
echo     You can skip the ML setup for now.
echo.
set PYTHON_BIN=
:python_found

:: ── 5. Install Node.js dependencies ──────────
echo.
echo Installing Node.js dependencies...
cd /d "%~dp0server"
call npm install
if errorlevel 1 (
    echo [X] npm install failed.
    pause
    exit /b 1
)
echo [OK] Node.js packages installed

:: ── 6. Create .env ────────────────────────────
if not exist .env (
    echo.
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    echo [OK] .env created
    echo      Edit server\.env if your PostgreSQL password is different from "postgres"
) else (
    echo [OK] .env already exists, skipping
)

:: ── 7. Check PostgreSQL connection ────────────
echo.
echo Checking PostgreSQL connection...
pg_isready -h localhost -p 5432 >nul 2>&1
if errorlevel 1 (
    echo [!] PostgreSQL is not running on localhost:5432
    echo     Start it from Services ^(services.msc^) or:
    echo       net start postgresql-x64-16
    echo.
    echo     After starting PostgreSQL, run this script again or seed manually:
    echo       cd server ^&^& node seed.js
    pause
    exit /b 1
)
echo [OK] PostgreSQL is running

:: ── 8. Seed database ──────────────────────────
echo.
echo Seeding database ^(creating tables + sample data^)...
node seed.js
if errorlevel 1 (
    echo [X] Database seed failed.
    echo     Check your PostgreSQL credentials in server\.env
    pause
    exit /b 1
)
echo [OK] Database seeded

:: ── 9. Python ML environment ──────────────────
cd /d "%~dp0"
if not "%PYTHON_BIN%"=="" (
    echo.
    echo Setting up Python ML environment...

    if not exist ml\.venv (
        echo Creating virtual environment...
        %PYTHON_BIN% -m venv ml\.venv
    )

    echo Installing ML packages ^(may take a few minutes^)...
    ml\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
    ml\.venv\Scripts\python.exe -m pip install -r ml\requirements.txt --quiet

    echo Verifying ML installation...
    ml\.venv\Scripts\python.exe -c "import tensorflow as tf; print('[OK] tensorflow', tf.__version__)" 2>nul
    if errorlevel 1 (
        echo [!] TensorFlow install may have issues. Check manually.
    )
    echo [OK] ML environment ready
)

:: ── Done! ─────────────────────────────────────
echo.
echo  ============================
echo   Setup Complete!
echo  ============================
echo.
echo  Start the web server:
echo    cd server
echo    node server.js
echo.
if not "%PYTHON_BIN%"=="" (
    echo  Start ML worker ^(separate terminal^):
    echo    ml\.venv\Scripts\python.exe ml\inference_worker.py
    echo.
)
echo  Open in browser: http://localhost:3000
echo.
echo  Login:
echo    admin    / admin123  ^(Admin^)
echo    teknisi1 / tech123   ^(Technician^)
echo.
pause
