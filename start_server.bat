@echo off
REM NWFTH Warehouse Management System - Backend Server Startup Script
REM This script starts the Rust backend server that serves both API and Angular frontend

echo ========================================
echo  NWFTH Warehouse Management System
echo  Backend Server Startup
echo ========================================
echo.

REM Change to backend directory
cd /d "%~dp0backend"

REM Check if the executable exists
if not exist "target\release\bulk_picking_backend.exe" (
    echo ERROR: Backend executable not found!
    echo Please build the backend first with: cargo build --release
    echo.
    pause
    exit /b 1
)

echo Starting BME4 Bulk Picking Backend Server...
echo.
echo Server will be available at:
echo - Main Application: http://192.168.0.21:4400/
echo - API Health Check: http://192.168.0.21:4400/api/health
echo - Login Page: http://192.168.0.21:4400/login
echo - Dashboard: http://192.168.0.21:4400/dashboard
echo - Putaway: http://192.168.0.21:4400/putaway
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

REM Start the backend server
target\release\bulk_picking_backend.exe

REM If the server exits, show a message
echo.
echo ========================================
echo Server has stopped.
echo ========================================
pause