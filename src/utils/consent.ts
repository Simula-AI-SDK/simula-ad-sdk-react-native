/**
 * Consent management for App Store / Play Store compliance
 * Parent apps should handle consent UI and call setUserConsent()
 */

/**
 * Data collection disclosure for privacy policies
 * Apps MUST disclose these in their App Store / Play Store listings
 */
export const PRIVACY_DISCLOSURE = {
  dataCollected: [
    "Conversation context (messages)",
    "Session identifiers (temporary)",
    "Ad interaction events (impressions, clicks)",
    "Device type (iOS/Android)",
    "Screen dimensions",
  ],
  dataNotCollected: [
    "Device identifiers (IDFA/AAID)",
    "Location data",
    "Personal information",
    "Contacts or photos",
  ],
  purpose: "Contextual ad delivery and performance measurement",
  thirdParties: ["Simula Ad Network"],
} as const;

/**
 * Consent state manager
 */
class ConsentManager {
  private hasConsent: boolean = false;
  private listeners: Set<(consent: boolean) => void> = new Set();

  /**
   * Set user consent status
   */
  setConsent(consent: boolean): void {
    this.hasConsent = consent;
    this.notifyListeners();
  }

  /**
   * Get current consent status
   */
  getConsent(): boolean {
    return this.hasConsent;
  }

  /**
   * Subscribe to consent changes
   */
  subscribe(listener: (consent: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of consent change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.hasConsent));
  }
}

// Global consent manager instance
export const consentManager = new ConsentManager();

/**
 * Check if consent is required
 * Based on basic heuristics - apps should implement proper consent flow
 */
export function isConsentRequired(): boolean {
  // In production, this would check user's region (GDPR, CCPA, etc.)
  // For now, we assume consent is always required for privacy-first approach
  return true;
}

/**
 * Generate consent request message for parent apps
 */
export function getConsentMessage(): string {
  return (
    "This app uses ads to support development. " +
    "We collect conversation context to show relevant ads. " +
    "No personal data or device identifiers are collected. " +
    "Do you consent to contextual advertising?"
  );
}


