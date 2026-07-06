# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added (Android, New Architecture / Fabric)

- Fabric codegen support for the custom views: `codegenConfig` in package.json plus typed
  component specs (`src/nativeAd/NativeAdNativeComponent.ts`,
  `src/components/miniGame/MiniGameButtonNativeComponent.ts`). On New Architecture hosts the
  static view config is generated at build time (no more legacy `requireNativeComponent`
  round-trip), and the Android view managers implement the codegen-generated interfaces via
  architecture-specific `*ViewManagerSpec` base classes (`android/src/newarch` /
  `android/src/oldarch`), so one artifact serves both architectures across RN versions.
- The package's `react-native` entry point (top-level field and `exports` condition) now
  points at the TypeScript source (`src/index.ts`) so Metro can run the codegen babel
  transform; Node/tooling keep using `dist/` via `main`/`types`.
- iOS is excluded from component codegen for now (`excludedPlatforms: ["iOS"]`) and keeps its
  current interop path; the iOS Fabric port is tracked separately.

## 1.3.4

### Fixed (Android, New Architecture / Fabric)

- **Crash**: `<NativeAd>` and `<MiniGameButton>` no longer crash with `IllegalStateException: Cannot locate windowRecomposer` when Fabric measures the view before it's attached to a window (e.g. an inline ad in a `FlatList`). `SimulaNativeAdView` and `SimulaMiniGameButtonView` now defer measuring their hosted `ComposeView` until it's attached, and re-measure automatically once attach happens.
- **Events**: View events (`onAdSizeChange`, `onAdImpression`, `onAdClick`, `onAdPaid`, `onAdError`, `onButtonSizeChange`, `onButtonPress`) now dispatch through Fabric's `EventDispatcher` instead of the deprecated `RCTEventEmitter`, which throws once legacy bridge interop is disabled. This also fixes `<NativeAd>` staying at zero height on New Architecture, since `onAdSizeChange` previously never reached JS.
- **Events**: `SimulaAdsModule` and `SimulaMiniGameModule` now emit device events via `ReactContext.emitDeviceEvent(...)` instead of looking up `RCTDeviceEventEmitter` directly, which is unsupported under Bridgeless.

### Changed

- `peerDependencies.react-native` raised to `>=0.76.0` to reflect the minimum version actually tested (New Architecture / Fabric event APIs used by the fixes above require it).

### Notes

- iOS is unaffected by this release; the crash and event issues above are Android-only. iOS Fabric support is tracked separately.
