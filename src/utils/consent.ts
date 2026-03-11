/**
 * Consent management for App Store / Play Store compliance
 *
 * Privacy consent (GDPR/TCF 2.0) - for processing conversation data
 * Note: Ad tracking consent is auto-detected from OS (see adTracking.ts)
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
 * Generic consent state manager
 */
class ConsentManager {
  private hasConsent: boolean = false;
  private listeners: Set<(consent: boolean) => void> = new Set();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_name: string) {}

  /**
   * Set consent status
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

/**
 * Privacy consent manager (GDPR/TCF 2.0)
 * Controls whether conversation data can be processed for ad targeting
 */
export const privacyConsentManager = new ConsentManager("privacy");

/**
 * Check if privacy consent is required
 * In production, this should check user's region (GDPR, CCPA, etc.)
 */
export function isPrivacyConsentRequired(): boolean {
  // Privacy-first approach: assume consent is always required
  // Parent apps can implement region-based logic
  return true;
}

/**
 * Generate privacy consent request message
 */
export function getPrivacyConsentMessage(): string {
  return (
    "This app uses ads to support development. " +
    "We collect conversation context to show relevant ads. " +
    "No personal data or device identifiers are collected. " +
    "Do you consent to contextual advertising?"
  );
}


