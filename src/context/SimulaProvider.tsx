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
  initializeOnMount = true,
}: SimulaProviderProps): React.JSX.Element {
  const contextValue = useMemo<SimulaContextValue>(
    () => ({ apiKey, hasPrivacyConsent, devMode, primaryUserID }),
    [apiKey, hasPrivacyConsent, devMode, primaryUserID],
  );

  // Stable identity for the (otherwise inline) privacy object so the effects below
  // re-run only on a real consent change, not on every render.
  const privacyKey = useMemo(() => JSON.stringify(privacy ?? null), [privacy]);

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
      privacy,
      telemetryEnabled,
    }).catch((error: unknown) => {
      console.error("[Simula] initialize failed:", error);
    });
    // privacyKey stands in for the (deep) privacy object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initializeOnMount,
    apiKey,
    devMode,
    primaryUserID,
    hasPrivacyConsent,
    telemetryEnabled,
    privacyKey,
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
    SimulaPrivacy.update({ hasPrivacyConsent, ...(privacy ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPrivacyConsent, privacyKey]);

  return (
    <SimulaContext.Provider value={contextValue}>
      {children}
    </SimulaContext.Provider>
  );
}
