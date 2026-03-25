/**
 * SimulaProvider - Context provider for Simula Ad SDK
 *
 * Provides apiKey and hasPrivacyConsent to child components.
 * The native SDKs (Kotlin/Swift) handle session creation, ad tracking,
 * and all other SDK logic internally.
 */

import React, { createContext, useContext, useMemo } from "react";
import { SimulaProviderProps, SimulaContextValue } from "../types";

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
}: SimulaProviderProps): React.JSX.Element {
  const contextValue = useMemo<SimulaContextValue>(
    () => ({ apiKey, hasPrivacyConsent, devMode, primaryUserID }),
    [apiKey, hasPrivacyConsent, devMode, primaryUserID],
  );

  return (
    <SimulaContext.Provider value={contextValue}>
      {children}
    </SimulaContext.Provider>
  );
}
