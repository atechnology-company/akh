#!/usr/bin/env node
// netlify-build.js
// Script to create a production build for SvelteKit SSR on Netlify
import { execSync } from 'child_process';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}Starting Netlify SvelteKit SSR build process...${colors.reset}`);

try {
  console.log(`${colors.yellow}Syncing SvelteKit...${colors.reset}`);
  execSync('npx @sveltejs/kit sync', { stdio: 'inherit' });
  
  console.log(`${colors.yellow}Running SvelteKit build...${colors.reset}`);
  execSync('npm run build:web', { stdio: 'inherit' });
} catch (error) {
  console.error(`${colors.red}Build failed:${colors.reset}`, error);
  process.exit(1);
}

// Define __filename and __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure build directory exists
const buildDir = path.resolve(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
  console.error(`${colors.red}Build directory not found at: ${buildDir}${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.green}SvelteKit SSR build completed successfully!${colors.reset}`);
console.log(`${colors.cyan}Build artifacts created in: ${buildDir}${colors.reset}`);

// Check if netlify function was created
const netlifyFunctionsDir = path.resolve(buildDir, '.netlify', 'functions');
if (fs.existsSync(netlifyFunctionsDir)) {
  console.log(`${colors.green}Netlify Functions directory found - SSR is properly configured${colors.reset}`);
} else {
  console.log(`${colors.yellow}Note: No .netlify/functions directory found. This might be expected for static builds.${colors.reset}`);
}