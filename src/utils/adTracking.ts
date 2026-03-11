/**
 * Ad Tracking Consent Detection
 * Auto-detects ad tracking consent from OS settings
 *
 * iOS: Checks App Tracking Transparency (ATT) status
 * Android: Checks if Advertising ID is available (not opted out)
 */

import { Platform, NativeModules } from "react-native";

/**
 * Ad tracking authorization status
 */
export type AdTrackingStatus =
  | "authorized"    // User granted permission
  | "denied"        // User denied permission
  | "not-determined" // User hasn't been asked yet
  | "restricted"    // Device-level restriction (parental controls, etc.)
  | "unavailable";  // Native module not available

/**
 * Result of ad tracking detection
 */
export interface AdTrackingResult {
  /** Whether ad tracking is allowed */
  isAuthorized: boolean;
  /** Detailed status */
  status: AdTrackingStatus;
  /** Advertising ID if available (null if not authorized or unavailable) */
  advertisingId: string | null;
}

/**
 * Check if the tracking transparency module is available
 */
function getTrackingModule(): any | null {
  try {
    // Try to get react-native-tracking-transparency module
    const module = NativeModules.TrackingTransparency;
    if (module) return module;
  } catch {
    // Module not available
  }

  try {
    // Try alternative module name
    const module = NativeModules.RNTrackingTransparency;
    if (module) return module;
  } catch {
    // Module not available
  }

  return null;
}

/**
 * Check if advertising ID module is available
 */
function getAdvertisingIdModule(): any | null {
  try {
    const module = NativeModules.RNAdvertisingId;
    if (module) return module;
  } catch {
    // Module not available
  }

  try {
    const module = NativeModules.AdvertisingId;
    if (module) return module;
  } catch {
    // Module not available
  }

  return null;
}

/**
 * Detect ad tracking consent on iOS
 */
async function detectiOSAdTracking(): Promise<AdTrackingResult> {
  const trackingModule = getTrackingModule();

  if (!trackingModule) {
    // Module not installed - can't determine status
    return {
      isAuthorized: false,
      status: "unavailable",
      advertisingId: null,
    };
  }

  try {
    // Get tracking status
    const status = await trackingModule.getTrackingStatus();

    switch (status) {
      case "authorized":
        return {
          isAuthorized: true,
          status: "authorized",
          advertisingId: null, // Would need separate call to get IDFA
        };
      case "denied":
        return {
          isAuthorized: false,
          status: "denied",
          advertisingId: null,
        };
      case "restricted":
        return {
          isAuthorized: false,
          status: "restricted",
          advertisingId: null,
        };
      case "not-determined":
      default:
        return {
          isAuthorized: false,
          status: "not-determined",
          advertisingId: null,
        };
    }
  } catch {
    return {
      isAuthorized: false,
      status: "unavailable",
      advertisingId: null,
    };
  }
}

/**
 * Detect ad tracking consent on Android
 */
async function detectAndroidAdTracking(): Promise<AdTrackingResult> {
  const advertisingIdModule = getAdvertisingIdModule();

  if (!advertisingIdModule) {
    // Module not installed - can't determine status
    return {
      isAuthorized: false,
      status: "unavailable",
      advertisingId: null,
    };
  }

  try {
    const result = await advertisingIdModule.getAdvertisingId();

    // Check if user opted out (Android returns all zeros)
    const optedOut =
      !result?.advertisingId ||
      result.advertisingId === "00000000-0000-0000-0000-000000000000" ||
      result.isLimitAdTrackingEnabled === true;

    if (optedOut) {
      return {
        isAuthorized: false,
        status: "denied",
        advertisingId: null,
      };
    }

    return {
      isAuthorized: true,
      status: "authorized",
      advertisingId: result.advertisingId,
    };
  } catch {
    return {
      isAuthorized: false,
      status: "unavailable",
      advertisingId: null,
    };
  }
}

/**
 * Detect ad tracking consent from OS
 * Returns immediately with cached value if available
 */
export async function detectAdTrackingConsent(): Promise<AdTrackingResult> {
  if (Platform.OS === "ios") {
    return detectiOSAdTracking();
  } else if (Platform.OS === "android") {
    return detectAndroidAdTracking();
  }

  // Unsupported platform
  return {
    isAuthorized: false,
    status: "unavailable",
    advertisingId: null,
  };
}

/**
 * Synchronous check if ad tracking modules are available
 * Useful for determining if detection is even possible
 */
export function isAdTrackingDetectionAvailable(): boolean {
  if (Platform.OS === "ios") {
    return getTrackingModule() !== null;
  } else if (Platform.OS === "android") {
    return getAdvertisingIdModule() !== null;
  }
  return false;
}
