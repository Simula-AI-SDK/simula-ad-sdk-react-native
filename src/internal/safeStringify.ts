/**
 * JSON.stringify for effect-identity keys that can never throw. The provider's
 * `privacy` / `adContext` props are host-owned `Record<string, unknown>` shapes —
 * a circular reference or BigInt anywhere inside would throw synchronously
 * *during render* of the provider that wraps the host's whole tree, unmounting
 * the app (or crashing it with no error boundary in the package). Falls back to
 * a constant key: all unserializable configs share one identity, so effects
 * simply don't re-fire on contents we can't inspect.
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"__simula_unserializable__"';
  }
}
