/**
 * SimulaProvider - Context provider for Simula Ad SDK
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { SimulaProviderProps, SimulaContextValue } from "../types";
import { createSession } from "../api/client";
import { consentManager, isConsentRequired } from "../utils/consent";

/**
 * Simula context
 */
const SimulaContext = createContext<SimulaContextValue | null>(null);

/**
 * Hook to access Simula context
 */
export function useSimulaContext(): SimulaContextValue {
  const context = useContext(SimulaContext);
  
  if (!context) {
    throw new Error("useSimulaContext must be used within SimulaProvider");
  }
  
  return context;
}

/**
 * SimulaProvider component
 * Wraps chat/conversation components to provide ad SDK functionality
 */
export function SimulaProvider({
  apiKey,
  children,
  devMode = false,
  primaryUserID,
  onConsentRequired,
  hasUserConsent = false,
}: SimulaProviderProps): React.JSX.Element {
  // Create session ID from API on mount (matches original SDK)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  
  // Consent state
  const [hasConsent, setHasConsent] = useState(hasUserConsent);

  // Create session on mount
  useEffect(() => {
    let mounted = true;
    
    createSession(apiKey, devMode, primaryUserID)
      .then((id) => {
        if (mounted) {
          if (id) {
            setSessionId(id);
          } else {
            setSessionError(new Error("Failed to create session"));
          }
        }
      })
      .catch((error) => {
        if (mounted) {
          setSessionError(error);
          console.error("Session creation failed:", error);
        }
      });

    return () => {
      mounted = false;
    };
  }, [apiKey, devMode, primaryUserID]);

  // Initialize consent manager
  useEffect(() => {
    consentManager.setConsent(hasUserConsent);
  }, [hasUserConsent]);

  // Check if consent is required
  useEffect(() => {
    if (!hasConsent && isConsentRequired() && onConsentRequired) {
      // Notify parent app that consent is needed
      onConsentRequired();
    }
  }, [hasConsent, onConsentRequired]);

  // Subscribe to consent changes
  useEffect(() => {
    const unsubscribe = consentManager.subscribe((consent) => {
      setHasConsent(consent);
    });

    return unsubscribe;
  }, []);

  // Log session errors
  useEffect(() => {
    if (sessionError) {
      console.error("Simula session error:", sessionError.message);
    }
  }, [sessionError]);

  // Set user consent
  const setUserConsent = (consent: boolean): void => {
    consentManager.setConsent(consent);
  };

  // Context value
  const contextValue = useMemo<SimulaContextValue>(
    () => ({
      apiKey,
      sessionId,
      devMode,
      hasUserConsent: hasConsent,
      setUserConsent,
      onConsentRequired,
    }),
    [apiKey, sessionId, devMode, hasConsent, onConsentRequired]
  );

  return (
    <SimulaContext.Provider value={contextValue}>
      {children}
    </SimulaContext.Provider>
  );
}

/**
 * Export context for testing purposes
 */
export { SimulaContext };

