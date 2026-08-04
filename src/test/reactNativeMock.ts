/**
 * Minimal `react-native` mock for unit tests. Provides controllable
 * `NativeModules` + `NativeEventEmitter` so we can assert bridge calls and
 * simulate native events without a device.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Listener = (payload: any) => void;
const registry: Record<string, Set<Listener>> = {};

export class NativeEventEmitter {
  constructor(_module?: unknown) {}
  addListener(name: string, cb: Listener) {
    (registry[name] ||= new Set()).add(cb);
    return {
      remove: () => {
        registry[name]?.delete(cb);
      },
    };
  }
  removeAllListeners(name: string) {
    delete registry[name];
  }
}

/** Test helper: emit a raw native event to all current listeners. */
export function __emit(name: string, payload: any): void {
  registry[name]?.forEach((cb) => cb(payload));
}

/** Test helper: how many listeners are currently registered for an event. */
export function __listenerCount(name: string): number {
  return registry[name]?.size ?? 0;
}

/** Test helper: reset all listener state between tests. */
export function __reset(): void {
  for (const key of Object.keys(registry)) delete registry[key];
}

function makeAdsModule() {
  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    isInitialized: jest.fn().mockResolvedValue(true),
    updateContext: jest.fn(),
    updatePrimaryUserID: jest.fn(),
    checkFrequencyCap: jest.fn().mockResolvedValue(false),
    getUserAgent: jest.fn().mockResolvedValue("Simula-UA/1.0"),
    getDeviceId: jest.fn().mockResolvedValue("device-123"),
    preloadNativeAd: jest.fn().mockResolvedValue("preloaded_1"),
    destroyPreloadedAd: jest.fn(),
    invalidateNativeAd: jest.fn(),
    invalidateNativeAds: jest.fn(),
    createInterstitial: jest.fn(),
    createRewarded: jest.fn(),
    setMetadataValue: jest.fn(),
    setMetadata: jest.fn(),
    loadAd: jest.fn(),
    showAd: jest.fn(),
    showAdPreview: jest.fn(),
    destroyAd: jest.fn(),
    applyConsent: jest.fn(),
    updateConsent: jest.fn(),
    clearConsent: jest.fn(),
    requestTrackingAuthorization: jest.fn().mockResolvedValue("authorized"),
    getTrackingAuthorizationStatus: jest.fn().mockResolvedValue("not_determined"),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
}

export const NativeModules: any = {
  SimulaAdsModule: makeAdsModule(),
  SimulaMiniGameModule: {
    showMiniGameMenu: jest.fn().mockResolvedValue(null),
    preload: jest.fn().mockResolvedValue(null),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
};

export const Platform = {
  OS: "ios" as const,
  select: (obj: Record<string, any>) => obj.ios ?? obj.default,
};

// Type-only export so `import { EmitterSubscription } from "react-native"` in the
// source elides cleanly under ts-jest.
export type EmitterSubscription = { remove: () => void };
