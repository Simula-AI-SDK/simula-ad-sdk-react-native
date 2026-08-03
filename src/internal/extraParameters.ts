import type { SimulaExtraParameters } from "../ads/types";

const MAX_EXTRA_PARAMETERS = 10;
const MAX_EXTRA_PARAMETER_KEY_LENGTH = 64;
const MAX_EXTRA_PARAMETER_VALUE_LENGTH = 256;

function warnInvalidExtraParameters(): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(
      "[SimulaAds] Some extra parameters were ignored because they are invalid or exceed SDK limits.",
    );
  }
}

/** @internal Runtime guard for the single-value bridge API. */
export function isValidExtraParameter(key: unknown, value: unknown): boolean {
  const valid =
    typeof key === "string" &&
    key.length > 0 &&
    Array.from(key).length <= MAX_EXTRA_PARAMETER_KEY_LENGTH &&
    !key.startsWith("$") &&
    !key.includes(".") &&
    typeof value === "string" &&
    Array.from(value).length <= MAX_EXTRA_PARAMETER_VALUE_LENGTH;
  if (!valid) warnInvalidExtraParameters();
  return valid;
}

/** @internal Deterministic wire encoding shared by native and fullscreen ads. */
export function serializeExtraParameters(
  parameters: SimulaExtraParameters | undefined,
): string | null {
  if (parameters == null) return null;

  if (typeof parameters !== "object" || Array.isArray(parameters)) {
    warnInvalidExtraParameters();
    return null;
  }

  let keys: string[];
  try {
    keys = Object.keys(parameters).sort();
  } catch {
    warnInvalidExtraParameters();
    return null;
  }

  const accepted: Record<string, string> = Object.create(null);
  let acceptedCount = 0;
  let dropped = false;

  for (const key of keys) {
    let value: unknown;
    try {
      value = (parameters as Record<string, unknown>)[key];
    } catch {
      dropped = true;
      continue;
    }

    const validKey =
      key.length > 0 &&
      Array.from(key).length <= MAX_EXTRA_PARAMETER_KEY_LENGTH &&
      !key.startsWith("$") &&
      !key.includes(".");
    const validValue =
      typeof value === "string" &&
      Array.from(value).length <= MAX_EXTRA_PARAMETER_VALUE_LENGTH;

    if (!validKey || !validValue || acceptedCount >= MAX_EXTRA_PARAMETERS) {
      dropped = true;
      continue;
    }

    accepted[key] = value as string;
    acceptedCount += 1;
  }

  if (dropped) warnInvalidExtraParameters();
  return acceptedCount > 0 ? JSON.stringify(accepted) : null;
}
