#!/usr/bin/env node

/**
 * Script to fix React hook issues in the app
 * Run this in your mobile-app-mock directory
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(process.cwd(), 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found. Run this script in your app directory.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Add overrides if not present
if (!packageJson.overrides) {
  packageJson.overrides = {};
}

// Force React 18.x
packageJson.overrides.react = '^18.2.0';
packageJson.overrides['react-dom'] = '^18.2.0';
packageJson.overrides['@simula/ads-react-native'] = {
  react: '^18.2.0',
  'react-native': packageJson.dependencies['react-native'] || '0.81.5'
};

// Update React version if it's 19.x
if (packageJson.dependencies?.react?.startsWith('19.')) {
  console.log('⚠️  Detected React 19.x - updating to 18.2.0');
  packageJson.dependencies.react = '^18.2.0';
}

if (packageJson.dependencies?.['react-dom']?.startsWith('19.')) {
  packageJson.dependencies['react-dom'] = '^18.2.0';
}

// Write back
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log('✅ Updated package.json with React overrides');
console.log('\n📋 Next steps:');
console.log('1. npm install --legacy-peer-deps');
console.log('2. npm start -- --clear');

