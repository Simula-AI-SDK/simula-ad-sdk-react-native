/**
 * JSON.stringify for effect-identity keys that can never throw. The provider's
 * `privacy` / `adContext` props are host-owned `Record<string, unknown>` shapes —
 * a circular reference or BigInt anywhere inside would throw synchronously
 * *during render* of the provider that wraps the host's whole tree, unmounting
 * the app (or crashing it with no error boundary in the package). Falls back to
 * a constant key: all unserializable configs share one identity, so effects
 * simply don't re-fire on contents we can't inspect.
 */

/** Identity key produced when a value can't be JSON-serialized (circular / BigInt).
 * Callers must ALSO keep the raw object off the bridge: rendering succeeded via the
 * sentinel, but the unsanitized object would still fail (or, on JSI conversion,
 * infinitely recurse) inside the native argument marshalling. */
export const UNSERIALIZABLE_SENTINEL = '"__simula_unserializable__"';

export type NormalizedJson<T> =
  | { serializable: true; key: string; value: T }
  | { serializable: false; key: typeof UNSERIALIZABLE_SENTINEL };

/**
 * Serializes and parses a value so callers get both a stable identity key and a
 * detached, JSON-compatible clone. The raw host object must never be used as the
 * bridge payload after this check.
 */
export function normalizeJson<T>(value: T): NormalizedJson<T> {
  try {
    const key = JSON.stringify(value);
    if (key === undefined) {
      return { serializable: false, key: UNSERIALIZABLE_SENTINEL };
    }
    return { serializable: true, key, value: JSON.parse(key) as T };
  } catch {
    return { serializable: false, key: UNSERIALIZABLE_SENTINEL };
  }
}

export function safeStringify(value: unknown): string {
  return normalizeJson(value).key;
}

const warnedPayloads = new Set<string>();

/** Dev-only, once-per-entry-point diagnostic for a payload kept off the bridge. */
export function warnUnserializableOnce(entryPoint: string): void {
  if (!__DEV__ || warnedPayloads.has(entryPoint)) return;
  warnedPayloads.add(entryPoint);
  console.warn(
    `[Simula] ${entryPoint} contains a value that is not JSON-serializable. ` +
      "The invalid payload was not sent to the native SDK.",
  );
}
