/**
 * SimulaProvider - Context provider for Simula Ad SDK
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { SimulaProviderProps, SimulaContextValue } from "../types";
import { createSession } from "../api/client";
import { privacyConsentManager, isPrivacyConsentRequired } from "../utils/consent";
import { detectAdTrackingConsent } from "../utils/adTracking";

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
  hasPrivacyConsent = false,
  onPrivacyConsentRequired,
}: SimulaProviderProps): React.JSX.Element {
  // Create session ID from API on mount (matches original SDK)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessionError, setSessionError] = useState<Error | null>(null);

  // Privacy consent state (controlled by parent app)
  const [privacyConsent, setPrivacyConsentState] = useState(hasPrivacyConsent);

  // Ad tracking consent state (auto-detected from OS)
  const [adTrackingConsent, setAdTrackingConsentState] = useState(false);

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

  // Sync privacy consent with manager
  useEffect(() => {
    privacyConsentManager.setConsent(hasPrivacyConsent);
  }, [hasPrivacyConsent]);

  // Auto-detect ad tracking consent from OS
  useEffect(() => {
    let mounted = true;

    detectAdTrackingConsent().then((result) => {
      if (mounted) {
        setAdTrackingConsentState(result.isAuthorized);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Check if privacy consent is required
  useEffect(() => {
    if (!privacyConsent && isPrivacyConsentRequired() && onPrivacyConsentRequired) {
      onPrivacyConsentRequired();
    }
  }, [privacyConsent, onPrivacyConsentRequired]);

  // Subscribe to privacy consent changes
  useEffect(() => {
    const unsubscribe = privacyConsentManager.subscribe((consent) => {
      setPrivacyConsentState(consent);
    });
    return unsubscribe;
  }, []);

  // Log session errors
  useEffect(() => {
    if (sessionError) {
      console.error("Simula session error:", sessionError.message);
    }
  }, [sessionError]);

  // Set privacy consent
  const setPrivacyConsent = (consent: boolean): void => {
    privacyConsentManager.setConsent(consent);
  };

  // Context value
  const contextValue = useMemo<SimulaContextValue>(
    () => ({
      apiKey,
      sessionId,
      devMode,
      hasPrivacyConsent: privacyConsent,
      hasAdTrackingConsent: adTrackingConsent,
      setPrivacyConsent,
      onPrivacyConsentRequired,
    }),
    [apiKey, sessionId, devMode, privacyConsent, adTrackingConsent, onPrivacyConsentRequired]
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

