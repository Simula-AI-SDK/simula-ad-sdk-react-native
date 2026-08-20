/**
 * Privacy / consent types. Mirror the native `SimulaPrivacyConfig`
 * (Kotlin/Swift) field-for-field. Every field is optional here; the native side
 * applies its documented defaults and IAB CMP auto-read. Consent resolution
 * (IAB auto-read, debounce, ppid gating) lives entirely in the native SDKs —
 * the wrapper only forwards raw values.
 */
export interface SimulaPrivacyConfig {
  /** Legacy coarse consent flag. When false, suppresses PII (the ppid). */
  hasPrivacyConsent?: boolean;
  /** IAB TCF v2.2 consent string. */
  tcString?: string;
  /** IAB US Privacy (CCPA) string, e.g. "1YNN". */
  uspString?: string;
  /** IAB Global Privacy Platform string. */
  gppString?: string;
  /** Applicable GPP section IDs, comma-separated e.g. "2,6". */
  gppSid?: string;
  /** Whether GDPR applies. Omit for unknown/unset. */
  gdprApplies?: boolean;
  /** Explicit TCF Purpose 1 ("store/access information on a device") consent. */
  tcfPurpose1Consent?: boolean;
  /** Whether COPPA treatment applies. Suppresses PII, advertising ID, and iOS ATT status. */
  coppaApplies?: boolean;
  /**
   * Opt-in switch for advertising-identifier (IDFA/GAID) collection. Default false.
   * On iOS the SDK may still read and report ATT authorization status without prompting;
   * this flag controls IDFA collection, not ATT status reporting.
   */
  enableAdvertisingId?: boolean;
}

/**
 * Flags for `SimulaPrivacy.clearConsent` — each `true` flag clears that explicit
 * override back to "unset", so the store falls back to any auto-read IAB value.
 */
export interface SimulaClearConsentFlags {
  tcString?: boolean;
  uspString?: boolean;
  gppString?: boolean;
  gppSid?: boolean;
  gdprApplies?: boolean;
  tcfPurpose1Consent?: boolean;
}

/**
 * App Tracking Transparency authorization status. iOS returns one of the first
 * four; Android (no ATT) always resolves `'unavailable'`.
 */
export type TrackingAuthorizationStatus =
  | "authorized"
  | "denied"
  | "restricted"
  | "not_determined"
  | "unavailable";
