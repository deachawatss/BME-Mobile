@echo off
REM NWFTH Warehouse Management System - Production Deployment Script
REM This script builds both frontend and backend, then starts the server

echo ========================================
echo  NWFTH Warehouse Management System
echo  Production Deployment Script
echo ========================================
echo.

echo [1/3] Building Frontend for Production...
echo ========================================
cd /d "%~dp0frontend"

REM Check if npm is available
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm not found! Please install Node.js and npm.
    pause
    exit /b 1
)

REM Build frontend
echo Building Angular frontend...
call npm run build:prod
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed!
    echo Make sure all dependencies are installed: npm install
    pause
    exit /b 1
)

echo Frontend build completed successfully!
echo.

echo [2/3] Building Backend for Production...
echo ========================================
cd /d "%~dp0backend"

REM Check if cargo is available
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: cargo not found! Please install Rust.
    pause
    exit /b 1
)

REM Build backend
echo Building Rust backend...
cargo build --release
if %errorlevel% neq 0 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)

echo Backend build completed successfully!
echo.

echo [3/3] Starting Production Server...
echo ========================================

REM Check if the executable exists (Windows .exe or Linux binary)
if exist "target\release\bulk_picking_backend.exe" (
    set BACKEND_EXE=target\release\bulk_picking_backend.exe
) else if exist "target\release\bulk_picking_backend" (
    set BACKEND_EXE=target\release\bulk_picking_backend
) else (
    echo ERROR: Backend executable not found!
    echo Build may have failed.
    pause
    exit /b 1
)

echo Production deployment complete!
echo.
echo Server will be available at:
echo - Main Application: http://192.168.0.10:4400/
echo - API Health Check: http://192.168.0.10:4400/api/health
echo - Login Page: http://192.168.0.10:4400/login
echo - Dashboard: http://192.168.0.10:4400/dashboard
echo - Putaway: http://192.168.0.10:4400/putaway
echo.
echo Frontend: Built and ready to serve
echo Backend: Built and starting...
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Set environment variable for detailed logging
set RUST_LOG=bulk_picking_backend=info,tower_http=info,axum=info

REM Start the backend server with logging
echo Starting server with logging enabled...
echo Logs will be displayed in console and saved to: logs\server.log
echo Log level: %RUST_LOG%
if not exist "logs" mkdir logs

REM Try tee first, fallback to basic redirect if tee not available
%BACKEND_EXE% 2>&1 | tee logs\server.log 2>nul || (
    echo tee command not available, using basic logging...
    %BACKEND_EXE% > logs\server.log 2>&1
)

REM If the server exits, show a message
echo.
echo ========================================
echo Server has stopped.
echo ========================================
pause