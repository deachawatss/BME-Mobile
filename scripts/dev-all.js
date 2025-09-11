#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logPrefix(prefix, message, color = colors.reset) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n🛑 Shutting down development servers...', colors.yellow);
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n🛑 Shutting down development servers...', colors.yellow);
  process.exit(0);
});

// Parse command line arguments
const runBackend = args.includes('--backend') || args.length === 0;
const runFrontend = args.includes('--frontend') || args.length === 0;

if (args.includes('--help') || args.includes('-h')) {
  log('🚀 NWFTH Warehouse Management Development Script', colors.bright);
  log('');
  log('Usage:');
  log('  npm run dev:all           # Start both backend and frontend');
  log('  npm run dev:backend       # Start only backend (Rust)');
  log('  npm run dev:frontend      # Start only frontend (Angular)');
  log('');
  log('Options:');
  log('  --backend                 # Start only backend server');
  log('  --frontend                # Start only frontend server');
  log('  --help, -h                # Show this help message');
  process.exit(0);
}

// Function to kill existing processes
function killExistingProcesses() {
  log('🔧 Killing existing development processes...', colors.yellow);
  
  try {
    // Kill processes on port 4400 (backend)
    const { execSync } = require('child_process');
    
    try {
      execSync('lsof -ti:4400 | xargs kill -9 2>/dev/null || true', { stdio: 'pipe' });
      logPrefix('CLEANUP', 'Killed existing backend processes on port 4400', colors.green);
    } catch (error) {
      // Ignore errors - no processes to kill
    }
    
    try {
      execSync('lsof -ti:4200 | xargs kill -9 2>/dev/null || true', { stdio: 'pipe' });
      logPrefix('CLEANUP', 'Killed existing frontend processes on port 4200', colors.green);
    } catch (error) {
      // Ignore errors - no processes to kill  
    }
    
    // Small delay to ensure processes are fully terminated
    setTimeout(() => {
      log('✅ Process cleanup completed', colors.green);
    }, 1000);
    
  } catch (error) {
    logPrefix('CLEANUP', `Warning: ${error.message}`, colors.yellow);
  }
}

// Function to spawn a process with proper error handling
function spawnProcess(command, args, options = {}) {
  const defaultOptions = {
    stdio: 'pipe',
    shell: process.platform === 'win32',
    ...options
  };

  const child = spawn(command, args, defaultOptions);
  
  child.on('error', (error) => {
    logPrefix('ERROR', `Failed to start ${command}: ${error.message}`, colors.red);
  });

  return child;
}

async function startBackend() {
  log('🦀 Starting Rust backend server...', colors.cyan);
  
  const backendDir = path.join(process.cwd(), 'backend');
  
  // Check if backend directory exists
  const fs = require('fs');
  if (!fs.existsSync(backendDir)) {
    logPrefix('BACKEND', 'Backend directory not found!', colors.red);
    return null;
  }

  // Check if Cargo.toml exists
  if (!fs.existsSync(path.join(backendDir, 'Cargo.toml'))) {
    logPrefix('BACKEND', 'Cargo.toml not found in backend directory!', colors.red);
    return null;
  }

  const backend = spawnProcess('cargo', ['run'], { 
    cwd: backendDir,
    stdio: 'pipe'
  });

  backend.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      logPrefix('BACKEND', output, colors.cyan);
    }
  });

  backend.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('warning:')) {
      logPrefix('BACKEND', output, colors.yellow);
    }
  });

  backend.on('close', (code) => {
    if (code !== 0) {
      logPrefix('BACKEND', `Process exited with code ${code}`, colors.red);
    } else {
      logPrefix('BACKEND', 'Process exited normally', colors.green);
    }
  });

  return backend;
}

async function startFrontend() {
  log('🅰️ Starting Angular frontend server...', colors.magenta);
  
  const frontendDir = path.join(process.cwd(), 'frontend');
  
  // Check if frontend directory exists
  const fs = require('fs');
  if (!fs.existsSync(frontendDir)) {
    logPrefix('FRONTEND', 'Frontend directory not found!', colors.red);
    return null;
  }

  // Check if package.json exists
  if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
    logPrefix('FRONTEND', 'package.json not found in frontend directory!', colors.red);
    return null;
  }

  const frontend = spawnProcess('npm', ['start'], { 
    cwd: frontendDir,
    stdio: 'pipe'
  });

  frontend.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      logPrefix('FRONTEND', output, colors.magenta);
    }
  });

  frontend.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('warning')) {
      logPrefix('FRONTEND', output, colors.yellow);
    }
  });

  frontend.on('close', (code) => {
    if (code !== 0) {
      logPrefix('FRONTEND', `Process exited with code ${code}`, colors.red);
    } else {
      logPrefix('FRONTEND', 'Process exited normally', colors.green);
    }
  });

  return frontend;
}

async function main() {
  log('🚀 NWFTH Warehouse Management Development Environment', colors.bright);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);
  
  // Kill any existing processes first
  killExistingProcesses();
  
  // Wait for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const processes = [];

  if (runBackend) {
    const backend = await startBackend();
    if (backend) {
      processes.push(backend);
    }
  }

  if (runFrontend) {
    // Small delay to let backend start first
    if (runBackend) {
      log('⏳ Waiting 2 seconds for backend to initialize...', colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const frontend = await startFrontend();
    if (frontend) {
      processes.push(frontend);
    }
  }

  if (processes.length === 0) {
    log('❌ No processes started. Check your setup and try again.', colors.red);
    process.exit(1);
  }

  // Display information
  log('', colors.reset);
  log('📋 Development Server Information:', colors.bright);
  if (runBackend) {
    log('   🔗 Backend API: http://localhost:4400/api/', colors.cyan);
    log('   🏥 Health Check: http://localhost:4400/api/health', colors.cyan);
  }
  if (runFrontend) {
    log('   🌐 Frontend App: http://localhost:4200/', colors.magenta);
    log('   📱 Mobile Access: http://[your-ip]:4200/', colors.magenta);
  }
  log('   🛑 Stop servers: Ctrl+C', colors.yellow);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  // Wait for all processes to complete
  const exitCodes = await Promise.all(processes.map(process => {
    return new Promise((resolve) => {
      process.on('close', (code) => resolve(code));
    });
  }));

  const failedProcesses = exitCodes.filter(code => code !== 0);
  if (failedProcesses.length > 0) {
    log(`\n❌ ${failedProcesses.length} process(es) failed`, colors.red);
    process.exit(1);
  } else {
    log('\n✅ All processes completed successfully', colors.green);
  }
}

main().catch((error) => {
  log(`\n💥 Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});