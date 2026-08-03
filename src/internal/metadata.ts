import type { SimulaMetadata } from "../ads/types";
import { IS_DEVELOPMENT } from "./environment";

const MAX_METADATA_ENTRIES = 10;
const MAX_METADATA_KEY_LENGTH = 64;
const MAX_METADATA_VALUE_LENGTH = 256;

function warnInvalidMetadata(): void {
  if (IS_DEVELOPMENT) {
    console.warn(
      "[SimulaAds] Some metadata was ignored because it is invalid or exceeds SDK limits.",
    );
  }
}

let warnedPreloadMetadataOverride = false;
let warnedPreloadMetadataUnavailable = false;
const trackedPreloadMetadata = new Map<string, boolean>();
const MAX_TRACKED_PRELOADS = 32;

/** @internal Tracks only presence, never publisher values, for bounded diagnostics. */
export function rememberPreloadMetadata(
  preloadedAdId: string,
  hasMetadata: boolean,
): void {
  if (trackedPreloadMetadata.size >= MAX_TRACKED_PRELOADS) {
    const oldest = trackedPreloadMetadata.keys().next().value;
    if (oldest != null) trackedPreloadMetadata.delete(oldest);
  }
  trackedPreloadMetadata.set(preloadedAdId, hasMetadata);
}

/** @internal Releases diagnostics retained for an unused preload. */
export function forgetPreloadMetadata(preloadedAdId: string): void {
  trackedPreloadMetadata.delete(preloadedAdId);
}

/** @internal Mount metadata cannot rewrite the snapshot owned by an existing preload. */
export function warnPreloadMetadataOverride(
  preloadedAdId: string | undefined,
  metadataJson: string | undefined,
): void {
  if (
    !IS_DEVELOPMENT ||
    warnedPreloadMetadataOverride ||
    preloadedAdId == null ||
    metadataJson == null ||
    trackedPreloadMetadata.get(preloadedAdId) !== false
  ) {
    return;
  }
  warnedPreloadMetadataOverride = true;
  console.warn(
    "[SimulaAds] This preloadedAdId was created without metadata. <NativeAd metadata> is used " +
      "only if the preload falls back to a live load; pass the same metadata to preloadNativeAd.",
  );
}

/** @internal Protects JS-only OTA updates running against an older native binary. */
export function warnPreloadMetadataUnavailable(): void {
  if (!IS_DEVELOPMENT || warnedPreloadMetadataUnavailable) return;
  warnedPreloadMetadataUnavailable = true;
  console.warn(
    "[SimulaAds] Native preload metadata is unavailable in this native binary; preload was skipped. " +
      "Rebuild the app with the current Simula native SDKs.",
  );
}

/** @internal Runtime guard for the single-value bridge API. */
export function isValidMetadataValue(key: unknown, value: unknown): boolean {
  const valid =
    typeof key === "string" &&
    key.length > 0 &&
    Array.from(key).length <= MAX_METADATA_KEY_LENGTH &&
    !key.startsWith("$") &&
    !key.includes(".") &&
    typeof value === "string" &&
    Array.from(value).length <= MAX_METADATA_VALUE_LENGTH;
  if (!valid) warnInvalidMetadata();
  return valid;
}

/** @internal Deterministic wire encoding shared by native and fullscreen ads. */
export function serializeMetadata(
  metadata: SimulaMetadata | undefined,
): string | null {
  if (metadata == null) return null;

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    warnInvalidMetadata();
    return null;
  }

  let keys: string[];
  try {
    keys = Object.keys(metadata).sort();
  } catch {
    warnInvalidMetadata();
    return null;
  }

  const accepted: Record<string, string> = Object.create(null);
  let acceptedCount = 0;
  let dropped = false;

  for (const key of keys) {
    let value: unknown;
    try {
      value = (metadata as Record<string, unknown>)[key];
    } catch {
      dropped = true;
      continue;
    }

    const validKey =
      key.length > 0 &&
      Array.from(key).length <= MAX_METADATA_KEY_LENGTH &&
      !key.startsWith("$") &&
      !key.includes(".");
    const validValue =
      typeof value === "string" &&
      Array.from(value).length <= MAX_METADATA_VALUE_LENGTH;

    if (!validKey || !validValue || acceptedCount >= MAX_METADATA_ENTRIES) {
      dropped = true;
      continue;
    }

    accepted[key] = value as string;
    acceptedCount += 1;
  }

  if (dropped) warnInvalidMetadata();
  return acceptedCount > 0 ? JSON.stringify(accepted) : null;
}
