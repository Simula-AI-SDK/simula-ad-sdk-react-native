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
import { UIManager, Platform } from "react-native";
import NativeAdViewComponent, {
  type NativeAdErrorEventData,
  type NativeAdImpressionEventData,
  type NativeAdPaidEventData,
  type NativeAdSizeChangeEventData,
} from "./NativeAdNativeComponent";
import type { NativeAdProps, NativeAdError } from "./types";
import type { AdValue } from "../ads/types";

const COMPONENT_NAME = "SimulaNativeAdView";

// The codegen-generated component (NativeAdNativeComponent.ts) resolves to a static
// Fabric config on Android when codegen ran at build time, or transparently falls back to
// `requireNativeComponent` otherwise (old architecture, iOS, or codegen not wired up yet).
// Either way, actually constructing the native view config is deferred until first render —
// so we still gate on `UIManager.getViewManagerConfig` here to render `null` with a warning
// instead of throwing when the view manager truly isn't registered (unsupported platform,
// app not rebuilt after adding the package, or a unit-test environment with a mocked
// react-native). This check works the same way on both architectures.
const NativeAdView =
  Platform?.OS != null &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any)?.getViewManagerConfig?.(COMPONENT_NAME) != null
    ? NativeAdViewComponent
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
    (event: { nativeEvent: NativeAdSizeChangeEventData }) => {
      const next = event?.nativeEvent?.height ?? 0;
      // Threshold sub-pixel churn so a measuring creative can't thrash the feed.
      setHeight((prev) => (Math.abs(prev - next) >= 1 ? next : prev));
    },
    [],
  );

  const handleImpression = useCallback(
    (event: { nativeEvent: NativeAdImpressionEventData }) => {
      // Structurally identical to NativeAdData; the codegen event type is the source of
      // truth for what actually crosses the bridge.
      onImpression?.(event.nativeEvent);
    },
    [onImpression],
  );

  const handleClick = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handlePaid = useCallback(
    (event: { nativeEvent: NativeAdPaidEventData }) => {
      // The codegen event type widens `precisionType` to `string` (codegen doesn't carry
      // our string-literal union across the bridge); narrow it back for the public API,
      // same trust boundary as the rest of the native payload.
      onPaid?.(event.nativeEvent as AdValue);
    },
    [onPaid],
  );

  const handleError = useCallback(
    (event: { nativeEvent: NativeAdErrorEventData }) => {
      // Same as above: the native side only ever sends one of the known NativeAdErrorCode
      // values (see errorCode() in SimulaNativeAdView.kt / SimulaNativeAdView.swift).
      onError?.(event.nativeEvent as NativeAdError);
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
