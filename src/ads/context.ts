import { normalizeJson } from "../internal/safeStringify";

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

const stringFields = [
  "searchTerm",
  "category",
  "title",
  "description",
  "userProfile",
  "userEmail",
] as const;

function readField(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function sanitizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  let length: number;
  try {
    length = value.length;
  } catch {
    return undefined;
  }
  const tags: string[] = [];
  for (let index = 0; index < length; index += 1) {
    let tag: unknown;
    try {
      tag = value[index];
    } catch {
      continue;
    }
    if (typeof tag === "string") tags.push(tag);
  }
  return tags;
}

function sanitizeCustomContext(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return undefined;
  }

  const entries: Array<[string, unknown]> = [];
  for (const key of keys) {
    const normalized = normalizeJson(readField(value, key));
    if (normalized.serializable) entries.push([key, normalized.value]);
  }
  return Object.fromEntries(entries);
}

/**
 * Marshals known fields independently. Malformed siblings are skipped, tags keep
 * strings, and custom-context entries are cloned one at a time through JSON.
 */
export function toNativeAdContext(
  context: SimulaAdContext | unknown,
): Record<string, unknown> | null {
  if (context === null || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }

  const out: Record<string, unknown> = {};
  for (const key of stringFields) {
    const value = readField(context, key);
    if (typeof value === "string") out[key] = value;
  }

  const tags = sanitizeTags(readField(context, "tags"));
  if (tags !== undefined) out.tags = tags;

  const customContext = sanitizeCustomContext(readField(context, "customContext"));
  if (customContext !== undefined) out.customContext = customContext;

  const nsfw = readField(context, "nsfw");
  if (typeof nsfw === "boolean") out.nsfw = nsfw;

  return out;
}
