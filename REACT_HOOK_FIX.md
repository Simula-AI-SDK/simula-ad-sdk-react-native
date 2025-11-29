# Fix: Invalid Hook Call Error

## Problem
"Invalid hook call" error occurs when multiple React instances exist in your app.

## Solution 1: Add Resolutions to Your App's package.json

Edit `mobile-app-mock/package.json` and add:

```json
{
  "resolutions": {
    "react": "^18.2.0",
    "react-native": "0.81.5"
  },
  "overrides": {
    "react": "^18.2.0",
    "react-native": "0.81.5"
  }
}
```

**Note:** Use `resolutions` for yarn, `overrides` for npm.

## Solution 2: Downgrade React to 18.x

React 19.1.0 is very new and may not be compatible with React Native 0.81.5:

```bash
# In mobile-app-mock directory
npm install react@^18.2.0 react-dom@^18.2.0 --legacy-peer-deps
```

## Solution 3: Ensure SDK Doesn't Install React

The SDK should NOT have React in dependencies. Check:

1. In `simula-ad-sdk-react-native/package.json` - React should ONLY be in `peerDependencies`
2. Remove any React from SDK's `node_modules`:
   ```bash
   # In simula-ad-sdk-react-native directory
   rm -rf node_modules/react
   rm -rf node_modules/@types/react
   ```

## Solution 4: Use npm/yarn resolutions

### For npm (package.json):
```json
{
  "overrides": {
    "@simula/ads-react-native": {
      "react": "$react",
      "react-native": "$react-native"
    }
  }
}
```

### For yarn (package.json):
```json
{
  "resolutions": {
    "@simula/ads-react-native/react": "^18.2.0",
    "@simula/ads-react-native/react-native": "0.81.5"
  }
}
```

## Solution 5: Clean Install

```bash
# In mobile-app-mock directory
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm start -- --clear
```

## Recommended: Complete Fix

1. **Downgrade React in your app**:
   ```bash
   npm install react@^18.2.0 react-dom@^18.2.0 --legacy-peer-deps
   ```

2. **Add overrides to package.json**:
   ```json
   {
     "overrides": {
       "react": "^18.2.0",
       "react-native": "0.81.5"
     }
   }
   ```

3. **Clean install**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```

4. **Verify single React instance**:
   ```bash
   npm list react
   # Should show only ONE react installation
   ```

## Why This Happens

- React 19.1.0 is too new for React Native 0.81.5
- Local path installs can create duplicate React instances
- SDK must use the app's React, not its own

## Verify Fix

After applying fixes, check:
```bash
npm list react
```

You should see only ONE React installation at the root level.

