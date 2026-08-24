# Simula Ad SDK for React Native

AI-powered native ads, interstitial ads, and rewarded ads for React Native apps.

Simula delivers ads that feel native to AI chat and character-driven applications. The SDK handles ad rendering, contextual targeting, privacy compliance, and server-side reward verification out of the box.

## Ad Formats

| Format | Description |
|---|---|
| **Native Ad** | Inline ad card that fits naturally into feeds and content streams |
| **Interstitial Ad** | Full-screen ad with preload/show lifecycle |
| **Rewarded Ad** | Play-to-earn ad with server-side reward verification |
| **Character Selector** | Pre-built character discovery UI |

## Requirements

- React Native 0.77+
- React 16.8+
- iOS 15.0+ with Xcode 26.4.1+ / Android API 24+

## Getting Started

Full integration guides, API references, and examples are available at:

**[docs.simula.ad/react-native-sdk](https://docs.simula.ad/react-native-sdk/quick-start)**

- [Quick Start](https://docs.simula.ad/react-native-sdk/quick-start) -- installation, provider setup, privacy, and error handling
- [Native Ad](https://docs.simula.ad/react-native-sdk/native-ad-slot) -- inline ad component
- [Interstitial Ad](https://docs.simula.ad/react-native-sdk/interstitial-ad) -- full-screen ad with imperative and hook APIs
- [Rewarded Ad](https://docs.simula.ad/react-native-sdk/rewarded-ad) -- rewarded ad with server-side verification
- [Character Selector](https://docs.simula.ad/react-native-sdk/character-selector) -- character discovery component

## Initialization

The first valid API key owns the native SDK for the lifetime of the app process. Repeated initialization with the same key is safe and idempotent. Attempting to switch to another key rejects with `INITIALIZATION_CONFLICT`; restart the app process to use a different key. Initialize through this React Native package rather than racing it with direct Kotlin or Swift initialization.

## Publisher Metadata

Attach publisher-defined dimensions to an ad before loading it:

```tsx
const ad = SimulaInterstitialAd.create("feed_interstitial");
ad.setMetadata("page_name", "Search");
ad.setMetadata({ page_name: "Search", experiment: "variant_b" });
ad.load();

<NativeAd
  adUnitId="feed_native"
  metadata={{ page_name: "Search" }}
/>

const preloadedAdId = await SimulaAds.preloadNativeAd({
  adUnitId: "feed_native",
});

<NativeAd
  adUnitId="feed_native"
  preloadedAdId={preloadedAdId ?? undefined}
  metadata={{ page_name: "Search" }}
/>
```

The exported `SimulaMetadata` type describes the metadata object. The overloaded `setMetadata` method is available on interstitial and rewarded ads, and as a callable function returned by both ad hooks. Pass either a key/value pair to upsert one value or a metadata object to replace all values.

Imperative-ad metadata is snapshotted when `load()` starts, so later `setMetadata` calls apply to the next load. `<NativeAd>` snapshots its `metadata` prop per slot identity. Normal and preload-fallback requests send it on `/load`; `preloadNativeAd` accepts no metadata, so a successfully consumed preload sends the component snapshot on `/seen` instead.

Metadata accepts at most 10 string entries. Keys must be non-empty, no longer than 64 Unicode code points, must not start with `$`, and must not contain `.`. Values are limited to 256 Unicode code points. Invalid entries are ignored without failing the ad request.

## Dashboard

Create and manage ad units, view analytics, and configure server-side verification at [publisher.simula.ad](https://publisher.simula.ad).

## Support

- Documentation: [docs.simula.ad](https://docs.simula.ad)
- Email: admin@simula.ad
- Website: [simula.ad](https://simula.ad)

## License

MIT
