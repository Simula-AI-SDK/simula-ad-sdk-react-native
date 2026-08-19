# Test Ownership and Remaining Work

This document separates wrapper behavior from native SDK behavior so a passing
React Native test does not overstate what was validated.

## React Native Repository

The React Native repository owns behavior at the JavaScript lifecycle and native
bridge boundary.

Implemented automated coverage:

- Shared imperative-ad event routing, replacement registration, late events,
  reload-safe IDs, and 500 concurrent instances.
- Interstitial and rewarded hook mount, retry, replacement, isolation, and
  unmount cleanup.
- Mini-game menu, invitation, interstitial, and character-selector rejection,
  late-event, duplicate-close, unmount, and 50-cycle visibility stress.
- Mini-game button sizing and current callback delivery.
- Provider initialization, runtime updates, and StrictMode effect replay.
- Concurrent native-ad preload promise routing.
- Native-ad recycled-cell height identity, cache reseeding, metadata snapshots,
  and current callbacks.
- Optimized native bridge builds against the pinned SDK versions.

Remaining React Native implementation and test work:

- Harden iOS module invalidation, then test late event/promise suppression and
  split synchronous UIKit/WebView detach from deferred object release.
- Add teardown signposts and assert direct invalidation finishes under a bounded
  watchdog.
- Add a real RN 0.82 Bridgeless host that replaces the React instance while ads,
  overlays, preview WebViews, and a virtualized native-ad list are active.
- Add an RN 0.77 legacy-architecture host or fixture.
- Test Android minigame preload and overlay session reuse after the native SDK
  exposes a shared provider/session seam.
- Fix and test Android preview HTML A-to-B remount identity.
- Harden and test the iOS mini-game button attach/detach/deinit lifecycle.
- Add presentation IDs to mini-game bridge events so a delayed event from a
  closed generation cannot affect a newly reopened singleton surface.
- Add TurboModule specifications and either iOS Fabric components or an explicit
  legacy-interoperability support contract.

Jest stress tests validate JavaScript routing, state, promise settlement, and
cleanup. They do not prove native thread safety, WebView disposal, or absence of
main-thread deadlocks.

## Swift SDK Repository

The Swift repository owns:

- PPID consent and COPPA gating at every Swift transmission boundary.
- Transactionally durable crash replay.
- File- or row-backed telemetry persistence and migration.
- Visibility JavaScript throttling with immediate threshold transitions.
- Per-slot single-flight native loads, global concurrency limits, and paced
  release after session initialization.
- Deferred connection/device-signal startup and removal of eager `SimulaAPI`
  first touches.
- Zero-WebView preload, one-mount-per-frame, and background-versus-pressure
  cooldown invariants.
- Native metric and signpost emission used by integration dashboards.

These behaviors require Swift unit, filesystem failure-injection, concurrency,
and iOS lifecycle tests in `simula-ad-sdk-swift`.

## Kotlin SDK Repository

The Kotlin repository owns:

- Declarative `SimulaProvider` bootstrap parity with `SimulaAds.initialize`.
- A shared provider/session seam for the React Native minigame wrapper.
- PPID consent and COPPA gating at every Kotlin transmission boundary.
- Transactionally durable crash replay.
- Visibility JavaScript throttling with immediate threshold transitions.
- Per-slot single-flight native loads, global concurrency limits, and paced
  release after session initialization.
- Zero-WebView preload, one-mount-per-frame, and background-versus-pressure
  cooldown invariants.
- Native metric emission used by integration dashboards.

These behaviors require Kotlin unit, failure-injection, coroutine concurrency,
Compose lifecycle, and Android instrumentation tests in `simula-ad-sdk-kotlin`.

## Shared Native and Policy Work

Swift and Kotlin should use mirrored behavior vectors for PPID gating, crash
replay, visibility throttling, and native-load concurrency.

IPv4 capture is blocked on a shared legal/product/backend decision. The decision
must define whether capture is required, consent-gated, publisher-configurable,
disabled by default, or removed. If retained, sensitive identifiers should move
from query strings to an authenticated request body before either SDK implements
the final contract.

## Integration Environment

The following do not belong to Jest or native package unit tests:

- Character AI/Pangle before-and-after hang comparison.
- CodePush-specific bundle replacement behavior.
- Release-mode physical-device Hangs and Time Profiler traces.
- Rapid production tab switching and feed scrolling with all host SDKs enabled.
- Older-device versus current-device comparison.
- First-five-second main-thread audit.
- Dashboard ingestion, retention, and alerting.

A generic reload and virtualized-list host should live in this repository. The
exact Character AI/Pangle configuration and physical-device acceptance suite
should remain in the internal integration environment.
