#!/usr/bin/env node
// netlify-build.js
// Script to create a production build and ensure correct Netlify SPA fallback
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

console.log(`${colors.cyan}Starting Netlify build process...${colors.reset}`);

// Build the SvelteKit app
try {
  console.log(`${colors.yellow}Running vite build...${colors.reset}`);
  // Use npx to ensure vite is found
  execSync('npx vite build', { stdio: 'inherit' });
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

// Copy _redirects file to build directory
try {
  const redirectsSource = path.resolve(__dirname, '_redirects');
  const redirectsDest = path.resolve(buildDir, '_redirects');
  
  if (fs.existsSync(redirectsSource)) {
    fs.copyFileSync(redirectsSource, redirectsDest);
    console.log(`${colors.green}Copied _redirects file to build directory${colors.reset}`);
  } else {
    // Create _redirects file if it doesn't exist
    fs.writeFileSync(redirectsDest, '/* /index.html 200');
    console.log(`${colors.yellow}Created new _redirects file in build directory${colors.reset}`);
  }
} catch (error) {
  console.error(`${colors.red}Error handling _redirects file:${colors.reset}`, error);
  process.exit(1);
}

// Generate a fallback netlify.toml in the build directory (belt and suspenders approach)
try {
  const netlifyTomlContent = `
# This file was automatically generated during build
[build]
  publish = "."

# Fallback for SPA routing
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
  
  fs.writeFileSync(path.resolve(buildDir, 'netlify.toml'), netlifyTomlContent.trim());
  console.log(`${colors.green}Created netlify.toml in build directory${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error creating netlify.toml in build directory:${colors.reset}`, error);
}

console.log(`${colors.cyan}Build process completed successfully!${colors.reset}`);