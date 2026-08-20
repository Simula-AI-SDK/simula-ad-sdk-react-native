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
import { toNativeAdContext } from "../ads/context";
import { isNonBlankString } from "../internal/identifiers";
import { safeJsonSnapshot } from "../internal/safeJson";

const SimulaContext = createContext<SimulaContextValue | null>(null);

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
}: SimulaProviderProps): React.JSX.Element {
  // Snapshot host objects so malformed values cannot crash render or cross the bridge.
  const privacySnapshot = useMemo(
    () => (privacy == null ? undefined : safeJsonSnapshot(privacy)),
    [privacy],
  );
  const adContextSnapshot = useMemo(
    () =>
      adContext == null
        ? undefined
        : safeJsonSnapshot(toNativeAdContext(adContext)),
    [adContext],
  );
  const privacyKey = privacySnapshot?.identity ?? "null";
  const adContextKey = adContextSnapshot?.identity ?? "null";
  const safePrivacy = privacySnapshot?.value;
  const safeAdContext = adContextSnapshot?.value;
  const initializationConfig = useMemo(
    () => ({
      apiKey,
      devMode,
      primaryUserID,
      hasPrivacyConsent,
      privacy: safePrivacy,
      telemetryEnabled,
      adContext: safeAdContext,
    }),
    [
      apiKey,
      devMode,
      primaryUserID,
      hasPrivacyConsent,
      telemetryEnabled,
      privacyKey,
      adContextKey,
    ],
  );
  const contextValue = useMemo<SimulaContextValue>(
    () => ({
      apiKey,
      hasPrivacyConsent,
      devMode,
      primaryUserID,
      initializationConfig,
    }),
    [apiKey, hasPrivacyConsent, devMode, primaryUserID, initializationConfig],
  );

  // Eager init: warms the native session off the first ad's critical path, and on
  // Android is the only path that enables telemetry. Native init is idempotent
  // (first valid call wins), so re-running on a prop change is a harmless no-op.
  useEffect(() => {
    if (!initializeOnMount || !isNonBlankString(apiKey)) return;
    SimulaAds.initialize(initializationConfig).catch((error: unknown) => {
      console.error("[Simula] initialize failed:", error);
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
  const privacyRuntimeKey = `${hasPrivacyConsent}:${privacyKey}`;
  const previousPrivacyKey = useRef(privacyRuntimeKey);
  useEffect(() => {
    if (previousPrivacyKey.current === privacyRuntimeKey) return;
    previousPrivacyKey.current = privacyRuntimeKey;
    SimulaPrivacy.apply({ hasPrivacyConsent, ...(safePrivacy ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacyRuntimeKey]);

  // Runtime ad-context changes after mount → replace the native targeting context.
  // Skipped on the first run since initialize already applied the initial value.
  const previousAdContextKey = useRef(adContextKey);
  useEffect(() => {
    if (previousAdContextKey.current === adContextKey) return;
    previousAdContextKey.current = adContextKey;
    SimulaAds.updateContext(safeAdContext ?? null);
    // adContextKey stands in for the (deep) adContext object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adContextKey]);

  // Runtime primaryUserID changes after mount (login/logout) → patch the native PPID
  // (init is idempotent, so it wouldn't re-apply a changed id on its own). Skipped on
  // the first run since initialize already carried the initial value.
  const previousPrimaryUserID = useRef(primaryUserID ?? null);
  useEffect(() => {
    if (previousPrimaryUserID.current === (primaryUserID ?? null)) return;
    previousPrimaryUserID.current = primaryUserID ?? null;
    SimulaAds.updatePrimaryUserID(primaryUserID ?? null);
  }, [primaryUserID]);

  return (
    <SimulaContext.Provider value={contextValue}>
      {children}
    </SimulaContext.Provider>
  );
}
