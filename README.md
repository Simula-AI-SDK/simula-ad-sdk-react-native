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

- React Native 0.60+
- React 16.8+
- iOS 15.0+ / Android API 24+

## Getting Started

Full integration guides, API references, and examples are available at:

**[docs.simula.ad/react-native-sdk](https://docs.simula.ad/react-native-sdk/quick-start)**

- [Quick Start](https://docs.simula.ad/react-native-sdk/quick-start) -- installation, provider setup, privacy, and error handling
- [Native Ad](https://docs.simula.ad/react-native-sdk/native-ad-slot) -- inline ad component
- [Interstitial Ad](https://docs.simula.ad/react-native-sdk/interstitial-ad) -- full-screen ad with imperative and hook APIs
- [Rewarded Ad](https://docs.simula.ad/react-native-sdk/rewarded-ad) -- rewarded ad with server-side verification
- [Character Selector](https://docs.simula.ad/react-native-sdk/character-selector) -- character discovery component

## Dashboard

Create and manage ad units, view analytics, and configure server-side verification at [publisher.simula.ad](https://publisher.simula.ad).

## Diagnostics

`SimulaAds.userAgent()` resolves the native User-Agent string. `SimulaAds.deviceId()` is a
**nonblocking snapshot**: it resolves the current cached value immediately and may resolve
`null` while native resolution is still pending, before initialization, or when the native
module is unavailable. It never waits for device-ID resolution — call it freely at startup.

## Support

- Documentation: [docs.simula.ad](https://docs.simula.ad)
- Telemetry wire contract: [TELEMETRY_CONTRACT_V3.md](https://github.com/Simula-AI-SDK/simula-ad-sdk-react-native/blob/main/docs/TELEMETRY_CONTRACT_V3.md)
- Email: admin@simula.ad
- Website: [simula.ad](https://simula.ad)

## License

MIT
