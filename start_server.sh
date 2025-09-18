#!/bin/bash

# NWFTH Warehouse Management System - Production Deployment Script
# This script builds both frontend and backend, then starts the server

echo "========================================"
echo "  NWFTH Warehouse Management System"
echo "  Production Deployment Script"
echo "========================================"
echo

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "[1/3] Building Frontend for Production..."
echo "========================================"
cd "$SCRIPT_DIR/frontend"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm not found! Please install Node.js and npm."
    exit 1
fi

# Build frontend
echo "Building Angular frontend..."
npm run build:prod
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed!"
    echo "Make sure all dependencies are installed: npm install"
    exit 1
fi

echo "Frontend build completed successfully!"
echo

echo "[2/3] Building Backend for Production..."
echo "========================================"
cd "$SCRIPT_DIR/backend"

# Check if cargo is available
if ! command -v cargo &> /dev/null; then
    echo "ERROR: cargo not found! Please install Rust."
    exit 1
fi

# Build backend
echo "Building Rust backend..."
cargo build --release
if [ $? -ne 0 ]; then
    echo "ERROR: Backend build failed!"
    exit 1
fi

echo "Backend build completed successfully!"
echo

echo "[3/3] Starting Production Server..."
echo "========================================"

# Check if the executable exists
BACKEND_EXE="target/release/bulk_picking_backend"
if [ ! -f "$BACKEND_EXE" ]; then
    echo "ERROR: Backend executable not found at $BACKEND_EXE"
    echo "Build may have failed."
    exit 1
fi

# Make executable if needed
chmod +x "$BACKEND_EXE"

echo "Production deployment complete!"
echo
echo "Server will be available at:"
echo "- Main Application: http://192.168.0.10:4400/"
echo "- API Health Check: http://192.168.0.10:4400/api/health"
echo "- Login Page: http://192.168.0.10:4400/login"
echo "- Dashboard: http://192.168.0.10:4400/dashboard"
echo "- Putaway: http://192.168.0.10:4400/putaway"
echo
echo "Frontend: Built and ready to serve"
echo "Backend: Built and starting..."
echo
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo

# Start the backend server
exec "$BACKEND_EXE"