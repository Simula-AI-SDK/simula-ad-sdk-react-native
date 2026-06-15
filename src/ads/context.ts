/**
 * Native-ad targeting context.
 *
 * Set once on `SimulaProvider` / `SimulaAds.initialize`, or replaced at runtime via
 * `SimulaAds.updateContext`. The native SDKs auto-attach it to every native-ad
 * request (`POST /load/native`). Updating it is a full replacement, not a merge.
 */
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
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
