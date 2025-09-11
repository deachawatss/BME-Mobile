#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

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
  log('\n🛑 Stopping E2E tests...', colors.yellow);
  process.exit(0);
});

async function runE2ETests() {
  log('🎭 Starting End-to-End Tests with Playwright', colors.bright);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue);

  // Check if tests directory exists
  const fs = require('fs');
  const testsDir = path.join(process.cwd(), 'tests');
  
  if (!fs.existsSync(testsDir)) {
    log('📁 Creating tests directory...', colors.yellow);
    fs.mkdirSync(testsDir, { recursive: true });
    
    // Create a basic example test
    const exampleTest = `import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page).toHaveTitle(/Warehouse Management/);
});

test('login page is accessible', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page.locator('h1')).toContainText('Warehouse Management System');
});
`;
    
    fs.writeFileSync(path.join(testsDir, 'basic.spec.ts'), exampleTest);
    log('✅ Created example test file: tests/basic.spec.ts', colors.green);
  }

  // Run Playwright tests
  const playwright = spawn('npx', ['playwright', 'test'], {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  playwright.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      logPrefix('PLAYWRIGHT', output, colors.cyan);
    }
  });

  playwright.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      logPrefix('PLAYWRIGHT', output, colors.yellow);
    }
  });

  return new Promise((resolve, reject) => {
    playwright.on('close', (code) => {
      if (code === 0) {
        log('\n✅ All E2E tests passed!', colors.green);
        resolve(code);
      } else {
        log(`\n❌ E2E tests failed with code ${code}`, colors.red);
        reject(code);
      }
    });

    playwright.on('error', (error) => {
      log(`\n💥 Failed to run Playwright: ${error.message}`, colors.red);
      log('💡 Try running: npm install @playwright/test', colors.yellow);
      reject(error);
    });
  });
}

async function main() {
  try {
    await runE2ETests();
  } catch (error) {
    log(`\n💥 E2E test execution failed: ${error}`, colors.red);
    process.exit(1);
  }
}

main();