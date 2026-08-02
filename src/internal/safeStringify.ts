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

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return UNSERIALIZABLE_SENTINEL;
  }
}
