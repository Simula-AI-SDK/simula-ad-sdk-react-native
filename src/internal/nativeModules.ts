/**
 * Native module accessors for the Simula Ad SDK.
 *
 * Centralizes the bridge to the two native modules so the rest of the JS code
 * never reaches into `NativeModules` directly:
 *
 * - `SimulaMiniGameModule` — the declarative MiniGame surfaces (existing).
 * - `SimulaAdsModule` — the imperative ad + privacy surface (new).
 *
 * The imperative surface routes every callback through ONE `NativeEventEmitter`
 * and ONE event name (`SimulaAds_onAdEvent`); see `../ads/eventRouter`. Keeping a
 * single emitter here means the subscription count is constant regardless of how
 * many ad instances or listeners exist.
 *
 * This module is written codegen-shaped (flat params, promise/void methods, a
 * single event) so a future TurboModule migration is mechanical.
 */
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

/** The single event name the imperative ad surface emits on. */
export const AD_EVENT_NAME = "SimulaAds_onAdEvent";

/**
 * Typed view of the native imperative ad module. All ad-lifecycle methods are
 * fire-and-forget `void` (outcomes arrive as `AD_EVENT_NAME` events); only
 * `initialize`, `isInitialized`, and the ATT queries return promises.
 */
export interface NativeSimulaAdsModule {
  // ── Lifecycle ──────────────────────────────────────────────────────────
  initialize(config: Record<string, unknown>): Promise<void>;
  isInitialized(): Promise<boolean>;
  updateContext(context: Record<string, unknown>): void;

  // ── Native ad (imperative) ─────────────────────────────────────────────
  preloadNativeAd(
    adUnitId: string | null,
    position: number,
    theme: string | null,
  ): Promise<string | null>;
  destroyPreloadedAd(preloadedAdId: string): void;
  invalidateNativeAd(adUnitId: string | null, position: number): void;
  invalidateNativeAds(): void;

  // ── Imperative ads (instanceId-routed) ─────────────────────────────────
  createInterstitial(instanceId: string, adUnitId: string): void;
  createRewarded(
    instanceId: string,
    adUnitId: string,
    options: Record<string, unknown>,
  ): void;
  loadAd(instanceId: string, options: Record<string, unknown>): void;
  showAd(instanceId: string): void;
  showAdPreview(instanceId: string, options: Record<string, unknown>): void;
  destroyAd(instanceId: string): void;

  // ── Privacy ────────────────────────────────────────────────────────────
  applyConsent(config: Record<string, unknown>): void;
  updateConsent(partial: Record<string, unknown>): void;
  clearConsent(flags: Record<string, unknown>): void;
  requestTrackingAuthorization(): Promise<string>;
  getTrackingAuthorizationStatus(): Promise<string>;

  // ── NativeEventEmitter boilerplate ─────────────────────────────────────
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const { SimulaAdsModule, SimulaMiniGameModule } = NativeModules;

export const NativeAds: NativeSimulaAdsModule | undefined = SimulaAdsModule;
export const NativeMiniGame = SimulaMiniGameModule;

/**
 * Shared emitter for the imperative ad surface. Lazily created once — `null` when
 * the native module isn't linked (e.g. on an unsupported platform or in tests
 * without the native binary).
 */
let sharedEmitter: NativeEventEmitter | null = null;
let sharedEmitterResolved = false;

export function getAdsEmitter(): NativeEventEmitter | null {
  if (!sharedEmitterResolved) {
    sharedEmitterResolved = true;
    sharedEmitter = SimulaAdsModule
      ? new NativeEventEmitter(SimulaAdsModule)
      : null;
  }
  return sharedEmitter;
}

/** True when the imperative native module is linked on this platform. */
export function isAdsModuleAvailable(): boolean {
  return SimulaAdsModule != null;
}

/** Logs a one-time-style warning when the native module is missing. */
export function warnAdsUnavailable(method: string): void {
  console.warn(
    `[SimulaAds] Native module unavailable; ${method} is a no-op. ` +
      `Did you rebuild the app after adding @simula/ads-react-native? ` +
      `(platform: ${Platform.OS})`,
  );
}
