/**
 * Native-ad targeting context.
 *
 * Set once on `SimulaProvider` / `SimulaAds.initialize`, or replaced at runtime via
 * `SimulaAds.updateContext`. The native SDKs auto-attach it to every native-ad
 * request (`POST /load/native`). Updating it is a full replacement, not a merge.
 */
import { safeJsonSnapshot } from "../internal/safeJson";
import { IS_DEVELOPMENT } from "../internal/environment";

let warnedUnsafeAdContext = false;

function warnUnsafeAdContext(): void {
  if (!IS_DEVELOPMENT || warnedUnsafeAdContext) return;
  warnedUnsafeAdContext = true;
  console.warn(
    "[SimulaAds] Some ad context fields were ignored because they are not JSON-safe.",
  );
}

export interface SimulaAdContext {
  /** Current search / query term in the feed. */
  searchTerm?: string;
  /** Content tags (the backend keeps at most 10). */
  tags?: string[];
  /** Feed category. */
  category?: string;
  /** Title of the surrounding feed item. */
  title?: string;
  /** Description of the surrounding feed item. */
  description?: string;
  /** Opaque user-profile signal. */
  userProfile?: string;
  /** User email, if available. */
  userEmail?: string;
  /**
   * Arbitrary JSON-compatible key-values (the backend keeps at most 10 entries).
   * Values may be strings, numbers, booleans, arrays, or nested objects.
   */
  customContext?: Record<string, unknown>;
  /** Whether the surrounding content is NSFW. Default false. */
  nsfw?: boolean;
}

/**
 * Marshals an ad context into the shape the native modules expect, dropping
 * `undefined` keys so absent fields map to native defaults. `customContext` passes
 * through as a nested object (the native side converts it to its JSON value type).
 */
export function toNativeAdContext(
  context: SimulaAdContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let dropped = false;
  let keys: string[];
  try {
    keys = Object.keys(context);
  } catch {
    warnUnsafeAdContext();
    return out;
  }

  for (const key of keys) {
    let value: unknown;
    try {
      value = (context as Record<string, unknown>)[key];
    } catch {
      dropped = true;
      continue;
    }
    if (value === undefined) continue;

    if (key === "customContext") {
      const snapshot = safeJsonSnapshot(value);
      if (
        snapshot &&
        typeof snapshot.value === "object" &&
        snapshot.value !== null &&
        !Array.isArray(snapshot.value)
      ) {
        out[key] = snapshot.value;
      } else {
        dropped = true;
      }
    } else {
      const snapshot = safeJsonSnapshot(value);
      if (snapshot) {
        out[key] = snapshot.value;
      } else {
        dropped = true;
      }
    }
  }

  if (dropped) warnUnsafeAdContext();
  const snapshot = safeJsonSnapshot(out);
  return snapshot && typeof snapshot.value === "object" && snapshot.value !== null
    ? snapshot.value
    : {};
}
