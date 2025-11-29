# Local Development Setup (No Packing Needed)

## For Local Development with Expo

You **DO NOT** need to pack the SDK. Just use a local path install:

### In your `mobile-app-mock` directory:

```bash
# Option 1: Direct path install (Recommended)
npm install ../simula-ad-sdk-react-native --legacy-peer-deps

# Option 2: Using file: protocol in package.json
# Edit package.json and add:
{
  "dependencies": {
    "@simula/ads-react-native": "file:../simula-ad-sdk-react-native"
  }
}
# Then run: npm install
```

### Make sure SDK is built:

```bash
# In simula-ad-sdk-react-native directory
npx tsc
```

This creates the `dist/` folder with compiled JavaScript.

### Start your app:

```bash
# In mobile-app-mock directory
npm start -- --clear
```

## When You DO Need to Pack

Only pack if you want to:

1. **Publish to npm**:
   ```bash
   npm pack
   npm publish
   ```

2. **Share as tarball**:
   ```bash
   npm pack
   # Creates: simula-ads-react-native-1.0.0.tgz
   # Share this file, then install with:
   npm install ./simula-ads-react-native-1.0.0.tgz
   ```

3. **Test before publishing**:
   ```bash
   npm pack
   # In another project:
   npm install ../simula-ad-sdk-react-native/simula-ads-react-native-1.0.0.tgz
   ```

## Summary

- ✅ **Local development**: Use `npm install ../path` - NO packing needed
- ❌ **Publishing/Sharing**: Use `npm pack` - Packing needed

For your current Expo setup, just use the local path install!

