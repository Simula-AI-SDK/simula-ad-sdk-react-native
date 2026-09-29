const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dev = /^\d+\.\d+\.\d+-dev\.\d+$/.test(pkg.version);
const nativeVersions = [
  fs.readFileSync(path.join(root, 'android/build.gradle'), 'utf8').match(/implementation ['"]ad\.simula:ad-sdk:([^'"]+)/)?.[1],
  fs.readFileSync(path.join(root, 'simula-ads-react-native.podspec'), 'utf8').match(/s\.dependency "SimulaAdSDK", "([^"]+)/)?.[1],
];
if (nativeVersions.some(version => !version || /^\d+\.\d+\.\d+-dev\.\d+$/.test(version) !== dev)) {
  throw new Error('Wrapper and native dependency artifact channels must match');
}
const markers = ['hidePlayableCompanion', 'SimulaDevOptions', 'X-Simula-Dev-Hide-Companion'];
const roots = ['src', 'dist', 'ios', 'android/src'];
function visit(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['__tests__', 'test', 'build', 'Pods'].includes(item.name) || /\.test\./.test(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) visit(file);
    else if (!dev && markers.some(marker => fs.readFileSync(file).includes(marker))) {
      throw new Error(`Stable package retains developer code: ${file}`);
    }
  }
}
roots.forEach(dir => visit(path.join(root, dir)));
for (const file of ['src/internal/artifactOptions.ts', 'ios/ArtifactOptions.swift', 'android/src/main/java/com/simulaads/reactnative/ArtifactOptions.kt']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (source.includes('hidePlayableCompanion') !== dev) throw new Error(`Wrong artifact implementation: ${file}`);
}
console.log(`Verified ${dev ? 'development' : 'stable'} artifact options`);
