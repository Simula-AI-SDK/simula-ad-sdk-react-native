/**
 * Global entry point for the imperative ad API.
 *
 * Call `SimulaAds.initialize(...)` once at app startup (or mount a `SimulaProvider`
 * with `initializeOnMount`, which does this for you). It warms a shared server
 * session off the ad critical path, installs telemetry, and — on Android — is the
 * only way to enable telemetry. Idempotent: the first valid call wins natively.
 */
import {
  NativeAds,
  isAdsModuleAvailable,
  warnAdsUnavailable,
} from "../internal/nativeModules";
import { beaconOnInit, beaconOnPpidUpdate } from "../internal/ipv4Beacon";
import { SimulaPrivacyConfig } from "../privacy/types";
import { SimulaAdContext, toNativeAdContext } from "./context";
import type { SimulaNativeAdTheme } from "../nativeAd/types";

export interface SimulaInitConfig {
  apiKey: string;
  /** Development mode. Default false. */
  devMode?: boolean;
  /** Optional primary user identifier (suppressed without consent / under COPPA). */
  primaryUserID?: string;
  /** Legacy coarse consent flag. Default true. */
  hasPrivacyConsent?: boolean;
  /** Granular privacy / consent configuration. Takes precedence over hasPrivacyConsent. */
  privacy?: SimulaPrivacyConfig;
  /** Opt out of in-house SDK telemetry. Default true. */
  telemetryEnabled?: boolean;
  /** Native-ad targeting context auto-attached to every native-ad request. */
  adContext?: SimulaAdContext;
}

/** Marshals an init config into the flat shape the native modules expect. */
function toNativeConfig(config: SimulaInitConfig): Record<string, unknown> {
  return {
    apiKey: config.apiKey,
    devMode: config.devMode ?? false,
    primaryUserID: config.primaryUserID ?? null,
    hasPrivacyConsent: config.hasPrivacyConsent ?? true,
    telemetryEnabled: config.telemetryEnabled ?? true,
    privacy: config.privacy ? toNativePrivacy(config.privacy) : null,
    adContext: config.adContext ? toNativeAdContext(config.adContext) : null,
  };
}

/** Drops undefined keys so absent fields map to native defaults / "unchanged". */
export function toNativePrivacy(
  privacy: SimulaPrivacyConfig,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(privacy)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export const SimulaAds = {
  /** Initializes the SDK. Resolves once native init returns (session warms in the background). */
  async initialize(config: SimulaInitConfig): Promise<void> {
    if (!isAdsModuleAvailable()) {
      warnAdsUnavailable("initialize");
      return;
    }
    if (!config.apiKey) {
      throw new Error("[SimulaAds] initialize requires a non-empty apiKey");
    }
    await NativeAds!.initialize(toNativeConfig(config));
    // Temporary RN-only IPv4 capture (see internal/ipv4Beacon.ts). Fired AFTER
    // native init so the device id is primed; fire-and-forget so it can never
    // block or fail initialize. No-op until IPV4_BEACON_URL is configured.
    // Intentionally not consent-gated — fires on every init.
    beaconOnInit({
      apiKey: config.apiKey,
      primaryUserID: config.primaryUserID,
    });
  },

  /** Whether the SDK has been initialized with a valid API key. */
  async isInitialized(): Promise<boolean> {
    if (!isAdsModuleAvailable()) return false;
    return NativeAds!.isInitialized();
  },

  /**
   * Replace the native-ad targeting context at runtime (e.g. when the feed
   * category changes). A full replacement, not a merge. Pass `null`/`undefined`
   * (or omit) to clear it. No-op before `initialize`.
   */
  updateContext(context?: SimulaAdContext | null): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("updateContext");
    NativeAds!.updateContext(context ? toNativeAdContext(context) : {});
  },

  /**
   * Update the primary user identifier at runtime (e.g. after login/logout). The
   * new value is carried by the next session and patched onto a live session
   * server-side. Pass `null`/empty (or omit) to clear it (logout). No-op before
   * `initialize`. Suppressed without consent / under COPPA, like the init value.
   */
  updatePrimaryUserID(id?: string | null): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("updatePrimaryUserID");
    NativeAds!.updatePrimaryUserID(id ?? null);
    // A ppid change (login) is a session update — re-capture the IPv4 against
    // the new identity. No-op on logout / before init / until configured.
    beaconOnPpidUpdate(id ?? null);
  },

  /**
   * Imperatively preload one native ad before its slot scrolls into view. Fires a
   * single native-ad request using the current targeting context, caches it, and
   * resolves a `preloadedAdId` to pass to a `<NativeAd preloadedAdId={...}>` (which
   * then renders from cache with no live request). Resolves `null` before
   * `initialize` or when the cache cap (5) is reached.
   */
  async preloadNativeAd(options?: {
    adUnitId?: string;
    position?: number;
    theme?: SimulaNativeAdTheme;
  }): Promise<string | null> {
    if (!isAdsModuleAvailable()) {
      warnAdsUnavailable("preloadNativeAd");
      return null;
    }
    return NativeAds!.preloadNativeAd(
      options?.adUnitId ?? null,
      options?.position ?? 0,
      options?.theme ?? null,
    );
  },

  /** Release a preloaded native ad that was never consumed (cancels an in-flight request). */
  destroyPreloadedAd(preloadedAdId: string): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("destroyPreloadedAd");
    NativeAds!.destroyPreloadedAd(preloadedAdId);
  },

  /**
   * Drop the cached ad for a native slot so its next appearance fetches a fresh one.
   * A `<NativeAd>` caches its resolved ad per `(adUnitId, position)`, so scrolling it
   * out and back reuses the same serve; call this to force a refresh for that slot.
   */
  invalidateNativeAd(options?: { adUnitId?: string; position?: number }): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("invalidateNativeAd");
    NativeAds!.invalidateNativeAd(options?.adUnitId ?? null, options?.position ?? 0);
  },

  /** Clear every cached native ad (all slots). */
  invalidateNativeAds(): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("invalidateNativeAds");
    NativeAds!.invalidateNativeAds();
  },

  /**
   * The custom User-Agent the SDK stamps on its requests (for server-side
   * logging / debugging). Resolves `null` before `initialize` or when the native
   * module isn't linked.
   */
  async userAgent(): Promise<string | null> {
    if (!isAdsModuleAvailable()) return null;
    return NativeAds!.getUserAgent();
  },

  /**
   * The SDK's device identifier (`X-Device-Id`). Resolves `null` before
   * `initialize` or when the native module isn't linked.
   */
  async deviceId(): Promise<string | null> {
    if (!isAdsModuleAvailable()) return null;
    return NativeAds!.getDeviceId();
  },
};
