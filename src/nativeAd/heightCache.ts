/**
 * Last reported height per native-ad slot, surviving unmount/remount (FlatList virtualization
 * fully remounts rows). The native side already re-renders the cached ad at the right size on
 * its first frame, but without this the JS-owned height restarts at 0 on every remount and the
 * row collapses until the onAdSizeChange -> setState -> Yoga round trip completes — visible as
 * a flash/jump when scrolling back up a feed. Keyed like the native per-slot cache; bounded so
 * a long feed can't grow it unboundedly (Map preserves insertion order — evict the oldest).
 *
 * Internal module — not public API. `<NativeAd>` reads/writes it; `SimulaAds.invalidateNativeAd(s)`
 * clears it.
 */
const lastKnownHeights = new Map<string, number>();
const MAX_ENTRIES = 128;

// `|` separates key segments; escape it (and the escape char itself) so an adUnitId that
// contains `|` (e.g. "feed|1" at position 0 → "feed|1|0|") can't produce a key that
// collides with another slot's prefix in forgetNativeAdHeights.
function escapeSegment(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** The cache key for a slot — mirrors the native per-slot cache identity. */
export function nativeAdHeightKey(
  adUnitId: string | undefined,
  position: number,
  preloadedAdId: string | undefined,
): string {
  return `${escapeSegment(adUnitId ?? "")}|${position}|${escapeSegment(preloadedAdId ?? "")}`;
}

export function getLastKnownHeight(key: string): number | undefined {
  return lastKnownHeights.get(key);
}

export function rememberHeight(key: string, height: number): void {
  if (lastKnownHeights.has(key)) lastKnownHeights.delete(key);
  lastKnownHeights.set(key, height);
  if (lastKnownHeights.size > MAX_ENTRIES) {
    const oldest = lastKnownHeights.keys().next().value;
    if (oldest !== undefined) lastKnownHeights.delete(oldest);
  }
}

/**
 * Drop remembered heights so a deliberately-refreshed slot doesn't seed its next mount with the
 * previous ad's size. Omitting both arguments clears everything.
 */
export function forgetNativeAdHeights(adUnitId?: string, position?: number): void {
  if (adUnitId === undefined && position === undefined) {
    lastKnownHeights.clear();
    return;
  }
  const prefix = `${escapeSegment(adUnitId ?? "")}|${position ?? 0}|`;
  for (const key of Array.from(lastKnownHeights.keys())) {
    if (key.startsWith(prefix)) lastKnownHeights.delete(key);
  }
}
