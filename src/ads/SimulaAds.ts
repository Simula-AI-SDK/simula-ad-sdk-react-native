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
import { SimulaPrivacyConfig } from "../privacy/types";

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
  },

  /** Whether the SDK has been initialized with a valid API key. */
  async isInitialized(): Promise<boolean> {
    if (!isAdsModuleAvailable()) return false;
    return NativeAds!.isInitialized();
  },
};
