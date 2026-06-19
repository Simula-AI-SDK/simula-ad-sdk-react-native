/**
 * `<NativeAd>` — an inline, contextually-targeted native ad card for feeds.
 *
 * Renders the native `SimulaNativeAdView` (which hosts the SDK's `NativeAdSlot`:
 * a content-sized WebView with built-in viewability + AdChoices). The native view
 * self-measures its creative and reports the height up through `onAdSizeChange`;
 * this component holds that height in state and applies it, so the card grows to its
 * creative and collapses to zero on a no-fill or error — keeping React's layout
 * authoritative. Targeting context comes from `SimulaProvider` / `SimulaAds`, not props.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  requireNativeComponent,
  UIManager,
  Platform,
  type HostComponent,
} from "react-native";
import type {
  NativeAdProps,
  NativeAdViewProps,
  NativeAdData,
  NativeAdError,
} from "./types";
import type { AdValue } from "../ads/types";

const COMPONENT_NAME = "SimulaNativeAdView";

// Resolve the native view lazily and defensively: `null` when the view manager isn't
// registered (unsupported platform, app not rebuilt, or a unit-test environment with a
// mocked react-native), so importing this module never throws.
const NativeAdView: HostComponent<NativeAdViewProps> | null =
  Platform?.OS != null &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any)?.getViewManagerConfig?.(COMPONENT_NAME) != null
    ? requireNativeComponent<NativeAdViewProps>(COMPONENT_NAME)
    : null;

let warnedUnavailable = false;
function warnNativeAdUnavailable(): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(
    `[SimulaAds] <NativeAd> native view unavailable; rendering nothing. ` +
      `Did you rebuild the app after adding @simula/ads-react-native? ` +
      `(platform: ${Platform?.OS})`,
  );
}

export function NativeAd({
  adUnitId,
  position = 0,
  theme,
  preloadedAdId,
  previewHtml,
  onImpression,
  onClick,
  onPaid,
  onError,
  width,
}: NativeAdProps): React.JSX.Element | null {
  // Collapsed until the native view reports a height (shimmer/provisional height
  // arrives on the first measure; a no-fill keeps it at 0).
  const [height, setHeight] = useState(0);

  const handleSize = useCallback(
    (event: { nativeEvent: { height: number } }) => {
      const next = event?.nativeEvent?.height ?? 0;
      // Threshold sub-pixel churn so a measuring creative can't thrash the feed.
      setHeight((prev) => (Math.abs(prev - next) >= 1 ? next : prev));
    },
    [],
  );

  const handleImpression = useCallback(
    (event: { nativeEvent: NativeAdData }) => {
      onImpression?.(event.nativeEvent);
    },
    [onImpression],
  );

  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handlePaid = useCallback(
    (event: { nativeEvent: AdValue }) => {
      onPaid?.(event.nativeEvent);
    },
    [onPaid],
  );

  const handleError = useCallback(
    (event: { nativeEvent: NativeAdError }) => {
      onError?.(event.nativeEvent);
    },
    [onError],
  );

  // Height is JS-managed; width comes from the caller (undefined → fill the parent,
  // matching the native slot). Memoized so an unrelated re-render doesn't hand the
  // native view a "new" style object.
  const containerStyle = useMemo(() => ({ width, height }), [width, height]);

  if (!NativeAdView) {
    if (__DEV__) warnNativeAdUnavailable();
    return null;
  }

  return (
    <NativeAdView
      adUnitId={adUnitId}
      position={position}
      theme={theme}
      preloadedAdId={preloadedAdId}
      previewHtml={previewHtml}
      onAdSizeChange={handleSize}
      onAdImpression={handleImpression}
      onAdClick={handleClick}
      onAdPaid={handlePaid}
      onAdError={handleError}
      style={containerStyle}
    />
  );
}
