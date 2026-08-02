/**
 * Runtime privacy / consent control. Thin pass-through to the native
 * `SimulaPrivacy` store (Kotlin/Swift), which is the single source of truth:
 * it auto-reads IAB CMP keys, merges explicit overrides, debounces, and re-syncs
 * the session. This wrapper performs field-local bridge sanitation, then forwards.
 *
 *   SimulaPrivacy.update({ tcString, gdprApplies: true });
 *   const status = await SimulaPrivacy.requestTrackingAuthorization(); // iOS
 */
import {
  NativeAds,
  isAdsModuleAvailable,
  warnAdsUnavailable,
} from "../internal/nativeModules";
import { withTimeout, NATIVE_COMPLETION_TIMEOUT_MS } from "../internal/withTimeout";
import { sanitizePrivacy } from "./sanitize";
import {
  SimulaPrivacyConfig,
  SimulaClearConsentFlags,
  TrackingAuthorizationStatus,
} from "./types";

export const SimulaPrivacy = {
  /** Replace the explicit configuration wholesale (provider init / CMP handoff). */
  apply(config: SimulaPrivacyConfig): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("apply");
    NativeAds!.applyConsent(sanitizePrivacy(config));
  },

  /** Merge a partial runtime update. Absent fields are left unchanged. */
  update(partial: SimulaPrivacyConfig): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("update");
    NativeAds!.updateConsent(sanitizePrivacy(partial));
  },

  /** Clear named explicit overrides back to "unset" (falls back to auto-read IAB values). */
  clearConsent(flags: SimulaClearConsentFlags): void {
    if (!isAdsModuleAvailable()) return warnAdsUnavailable("clearConsent");
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(flags)) {
      if (value) out[key] = true;
    }
    NativeAds!.clearConsent(out);
  },

  /**
   * iOS: presents the ATT prompt (if undetermined) and resolves the resulting
   * status. Requires `NSUserTrackingUsageDescription` in Info.plist. Android: no
   * ATT — resolves `'unavailable'`.
   */
  async requestTrackingAuthorization(): Promise<TrackingAuthorizationStatus> {
    if (!isAdsModuleAvailable()) {
      warnAdsUnavailable("requestTrackingAuthorization");
      return "unavailable";
    }
    // Deliberately unbounded: the native prompt is user-driven and taking longer
    // than a transport deadline does not mean ATT is unavailable.
    return NativeAds!.requestTrackingAuthorization() as Promise<TrackingAuthorizationStatus>;
  },

  /** Current ATT status without prompting. Android resolves `'unavailable'`. */
  async getTrackingAuthorizationStatus(): Promise<TrackingAuthorizationStatus> {
    if (!isAdsModuleAvailable()) {
      warnAdsUnavailable("getTrackingAuthorizationStatus");
      return "unavailable";
    }
    return withTimeout(
      NativeAds!.getTrackingAuthorizationStatus() as Promise<TrackingAuthorizationStatus>,
      NATIVE_COMPLETION_TIMEOUT_MS,
      () => "unavailable",
    );
  },
};
