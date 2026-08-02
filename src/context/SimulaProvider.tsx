/**
 * SimulaProvider - Context provider for Simula Ad SDK
 *
 * Provides apiKey and hasPrivacyConsent to child components, and (by default)
 * eagerly initializes the native SDK on mount so the first ad/surface reuses a
 * warm session instead of paying createSession() on the critical path. The native
 * SDKs (Kotlin/Swift) handle session creation, ad tracking, consent resolution,
 * and all other logic internally.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { SimulaProviderProps, SimulaContextValue } from "../types";
import { SimulaAds } from "../ads/SimulaAds";
import { SimulaPrivacy } from "../privacy/SimulaPrivacy";
import { safeStringify, UNSERIALIZABLE_SENTINEL } from "../internal/safeStringify";

const SimulaContext = createContext<SimulaContextValue | null>(null);

/** Dev-only, one-time-per-surface warning for unserializable provider props. */
const warnedUnserializable = new Set<string>();
function warnUnserializableOnce(prop: string): void {
  if (!__DEV__ || warnedUnserializable.has(prop)) return;
  warnedUnserializable.add(prop);
  console.warn(
    `[Simula] "${prop}" prop is not JSON-serializable (circular structure or BigInt). ` +
      "It was NOT sent to the native SDK — fix the value to enable it.",
  );
}

export function useSimulaContext(): SimulaContextValue {
  const context = useContext(SimulaContext);
  if (!context) {
    throw new Error("useSimulaContext must be used within SimulaProvider");
  }
  return context;
}

export function SimulaProvider({
  apiKey,
  children,
  hasPrivacyConsent = true,
  devMode = false,
  primaryUserID,
  privacy,
  telemetryEnabled = true,
  adContext,
  initializeOnMount = true,
  onInitError,
}: SimulaProviderProps): React.JSX.Element {
  const contextValue = useMemo<SimulaContextValue>(
    () => ({ apiKey, hasPrivacyConsent, devMode, primaryUserID }),
    [apiKey, hasPrivacyConsent, devMode, primaryUserID],
  );
  const onInitErrorRef = useRef(onInitError);
  onInitErrorRef.current = onInitError;

  // Stable identity for the (otherwise inline) privacy object so the effects below
  // re-run only on a real consent change, not on every render.
  const privacyKey = useMemo(() => safeStringify(privacy ?? null), [privacy]);
  // Same, for the ad-targeting context.
  const adContextKey = useMemo(
    () => safeStringify(adContext ?? null),
    [adContext],
  );
  // An unserializable prop must NOT cross the bridge: rendering survived via the
  // sentinel key, but the raw object would fail (or infinitely recurse, on JSI) in
  // the native argument marshalling — and the promise rejection would be swallowed
  // by the fire-and-forget call below. Omit it instead (and warn in dev).
  const privacySafe = privacyKey !== UNSERIALIZABLE_SENTINEL;
  const adContextSafe = adContextKey !== UNSERIALIZABLE_SENTINEL;
  if (!privacySafe) warnUnserializableOnce("privacy");
  if (!adContextSafe) warnUnserializableOnce("adContext");

  // Eager init: warms the native session off the first ad's critical path, and on
  // Android is the only path that enables telemetry. Native init is idempotent
  // (first valid call wins), so re-running on a prop change is a harmless no-op.
  useEffect(() => {
    if (!initializeOnMount || !apiKey) return;
    SimulaAds.initialize({
      apiKey,
      devMode,
      primaryUserID,
      hasPrivacyConsent,
      privacy: privacySafe ? privacy : undefined,
      telemetryEnabled,
      adContext: adContextSafe ? adContext : undefined,
    }).catch((error) => {
      onInitErrorRef.current?.(error);
      if (__DEV__) console.warn("[Simula] initialize failed:", error);
    });
    // privacyKey / adContextKey stand in for the (deep) privacy / adContext objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initializeOnMount,
    apiKey,
    devMode,
    primaryUserID,
    hasPrivacyConsent,
    telemetryEnabled,
    privacyKey,
    adContextKey,
  ]);

  // Runtime consent changes after mount → push to the native store (which debounces
  // and re-syncs the session). Skipped on the first run since initialize already
  // applied the initial consent.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    // The coarse consent flag is always pushed; only the (possibly unserializable)
    // granular object is gated — a revocation must never be dropped with a bad prop.
    SimulaPrivacy.update({
      hasPrivacyConsent,
      ...(privacySafe ? (privacy ?? {}) : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPrivacyConsent, privacyKey]);

  // Runtime ad-context changes after mount → replace the native targeting context.
  // Skipped on the first run since initialize already applied the initial value.
  const didMountContext = useRef(false);
  useEffect(() => {
    if (!didMountContext.current) {
      didMountContext.current = true;
      return;
    }
    if (adContextSafe) SimulaAds.updateContext(adContext ?? null);
    // adContextKey stands in for the (deep) adContext object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adContextKey]);

  // Runtime primaryUserID changes after mount (login/logout) → patch the native PPID
  // (init is idempotent, so it wouldn't re-apply a changed id on its own). Skipped on
  // the first run since initialize already carried the initial value.
  const didMountPpid = useRef(false);
  useEffect(() => {
    if (!didMountPpid.current) {
      didMountPpid.current = true;
      return;
    }
    SimulaAds.updatePrimaryUserID(primaryUserID ?? null);
  }, [primaryUserID]);

  return (
    <SimulaContext.Provider value={contextValue}>
      {children}
    </SimulaContext.Provider>
  );
}
