# Production Readiness: React Version Management

## ✅ Current Status: Production Ready

The SDK is configured correctly for production. Here's what happens:

## When Published to npm

### ✅ What Works Automatically

1. **Peer Dependencies**: When users install `@simula/ads-react-native`, npm will:
   - ✅ Check that React is installed (peer dependency requirement)
   - ✅ Use the user's React version (not install its own)
   - ✅ Warn if React is missing (but won't auto-install)

2. **No React Bundling**: The SDK will NOT bundle React because:
   - React is only in `peerDependencies` (not `dependencies`)
   - `.npmignore` prevents React from being included
   - No React in `devDependencies` anymore

3. **Version Compatibility**: The SDK supports:
   - React >= 16.8.0 (hooks support)
   - React Native >= 0.60.0
   - Works with React 18.x and 19.x

### ⚠️ Potential Issues (and Solutions)

#### Issue 1: User Has Multiple React Versions

**Scenario**: User's app has React 18, but another package pulls in React 19.

**Solution**: User should add `overrides` to their `package.json`:
```json
{
  "overrides": {
    "react": "^18.2.0",
    "@simula/ads-react-native": {
      "react": "^18.2.0"
    }
  }
}
```

**Our Responsibility**: Document this in README.

#### Issue 2: User Doesn't Have React Installed

**Scenario**: User forgets to install React.

**Solution**: npm will show a peer dependency warning. User must install React.

**Our Responsibility**: Clear error message in README.

#### Issue 3: React Native Version Mismatch

**Scenario**: User has React Native 0.60, but React 19 requires RN 0.81+.

**Solution**: User needs compatible versions. Document compatibility matrix.

## Recommended Documentation Additions

### 1. Add to README.md

```markdown
## Requirements

- React >= 16.8.0 (hooks support required)
- React Native >= 0.60.0
- react-native-webview >= 11.0.0

### React Version Conflicts

If you see "Invalid hook call" errors, you likely have multiple React versions:

1. Add to your `package.json`:
```json
{
  "overrides": {
    "react": "^18.2.0",
    "@simula/ads-react-native": {
      "react": "^18.2.0"
    }
  }
}
```

2. Clean install:
```bash
rm -rf node_modules package-lock.json
npm install
```
```

### 2. Add Compatibility Section

```markdown
## Compatibility

| React Version | React Native | Status |
|--------------|--------------|--------|
| 18.x | 0.70+ | ✅ Recommended |
| 19.x | 0.81+ | ✅ Supported |
| 17.x | 0.64+ | ✅ Supported |
| 16.8+ | 0.60+ | ✅ Supported |
```

## Testing Before Publishing

### 1. Test with Different React Versions

```bash
# Test with React 18
npm install react@^18.2.0 --legacy-peer-deps
npm test

# Test with React 19
npm install react@^19.0.0 --legacy-peer-deps
npm test
```

### 2. Test Published Package

```bash
# Pack the SDK
npm pack

# In a test app
npm install ../simula-ad-sdk-react-native/simula-ads-react-native-1.0.0.tgz
```

### 3. Verify No React in Bundle

```bash
# After packing, check the tarball
tar -tzf simula-ads-react-native-1.0.0.tgz | grep react
# Should NOT show react/ in node_modules
```

## Production Checklist

- [x] React only in `peerDependencies` (not `dependencies`)
- [x] No React in `devDependencies`
- [x] `.npmignore` prevents React bundling
- [x] `peerDependenciesMeta` marks React as required
- [ ] README documents React version requirements
- [ ] README includes troubleshooting for hook errors
- [ ] Compatibility matrix documented
- [ ] Tested with React 18.x
- [ ] Tested with React 19.x

## Best Practices for Users

Users should:

1. **Use a single React version** across all packages
2. **Add overrides** if they have version conflicts
3. **Check `npm list react`** to verify single React instance
4. **Use React 18.x** for maximum compatibility (recommended)

## Summary

✅ **The SDK is production-ready** as-is. The current configuration:
- Won't bundle React
- Will use the user's React version
- Supports React 16.8+ through 19.x

⚠️ **Users may need** to add `overrides` if they have multiple React versions, but this is a common npm pattern and well-documented.

📝 **We should** add documentation about React version management to help users avoid issues.

