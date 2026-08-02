import type { SimulaAdContext } from "../ads/context";
import { toNativeAdContext } from "../ads/context";
import { sanitizePrivacy } from "../privacy/sanitize";
import type { SimulaPrivacyConfig } from "../privacy/types";

export interface ProviderPayload<T> {
  key: string;
  value: T | null;
}

/** Provider identity and bridge value derived from the same field-local sanitizer. */
export function normalizeProviderPrivacyPayload(
  value: SimulaPrivacyConfig | undefined,
): ProviderPayload<SimulaPrivacyConfig> {
  const sanitized = value === undefined ? null : sanitizePrivacy(value);
  return {
    key: JSON.stringify(sanitized),
    value: sanitized as SimulaPrivacyConfig | null,
  };
}

export function normalizeProviderAdContextPayload(
  value: SimulaAdContext | undefined,
): ProviderPayload<SimulaAdContext> {
  const sanitized = value === undefined ? null : toNativeAdContext(value);
  return {
    key: JSON.stringify(sanitized),
    value: sanitized as SimulaAdContext | null,
  };
}
