import type { SimulaPrivacyConfig } from "./types";

const booleanFields = [
  "hasPrivacyConsent",
  "gdprApplies",
  "tcfPurpose1Consent",
  "coppaApplies",
  "enableAdvertisingId",
] as const;

const stringFields = ["tcString", "uspString", "gppString"] as const;

function readField(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Allowlists and normalizes every privacy field independently. A malformed
 * sibling can never suppress an explicit revocation or COPPA signal.
 */
export function sanitizePrivacy(
  privacy: SimulaPrivacyConfig | unknown,
): Record<string, unknown> {
  if (privacy === null || typeof privacy !== "object" || Array.isArray(privacy)) {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const key of booleanFields) {
    const value = readField(privacy, key);
    if (typeof value === "boolean") out[key] = value;
  }
  for (const key of stringFields) {
    const value = readField(privacy, key);
    if (typeof value === "string") out[key] = value;
  }

  const gppSid = readField(privacy, "gppSid");
  if (typeof gppSid === "string") {
    out.gppSid = gppSid;
  } else if (typeof gppSid === "number" && Number.isFinite(gppSid)) {
    out.gppSid = String(gppSid);
  }

  return out;
}

/** Granular consent is authoritative when present; otherwise use the coarse flag/default. */
export function resolvePrivacyConsent(
  privacy: { hasPrivacyConsent?: unknown } | null,
  coarseConsent: unknown,
): boolean {
  const granularConsent = privacy?.hasPrivacyConsent;
  if (typeof granularConsent === "boolean") return granularConsent;
  return typeof coarseConsent === "boolean" ? coarseConsent : true;
}
