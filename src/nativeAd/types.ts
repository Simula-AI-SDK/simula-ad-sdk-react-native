import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import type { AdValue, SimulaExtraParameters } from "../ads/types";

/**
 * Creative color theme for a native ad.
 * - `"dark"` / `"light"` — force the theme.
 * - `"system"` — follow the device's current UI mode.
 * Omitted → backend default (currently light).
 */
export type SimulaNativeAdTheme = "dark" | "light" | "system";

/**
 * Stable error codes a native ad can surface — a scoped subset of the imperative
 * `SimulaAdErrorCode`. Mirrors the native SDKs' `NativeAdError` (Kotlin / Swift enum).
 * `ad_unit_not_found` is a non-retryable misconfiguration (the ad unit id isn't
 * registered for this app).
 */
export type NativeAdErrorCode =
  | "not_initialized"
  | "no_session"
  | "no_fill"
  | "network"
  | "ad_unit_not_found";

/**
 * A failure surfaced on a native ad's `onError`. The slot collapses to zero height. Note
 * `no_fill` is a normal outcome (no ad available), not a hard error — branch on `code`.
 */
export interface NativeAdError {
  code: NativeAdErrorCode;
  /** Human-readable description (synthesized by the native bridge). */
  message: string;
}

/**
 * Payload delivered to a `NativeAd`'s `onImpression` when the viewability threshold
 * is met (≥50% visible for ≥1s — the same event that fires the server impression).
 */
export interface NativeAdData {
  /** Serve UUID used for impression / click reporting. */
  impressionId: string;
  /** Ad format — `"character_ad"` on fill. */
  adFormat: string;
  /** Echo of the slot's `adUnitId`, if one was set. */
  adUnitId?: string;
}

export interface NativeAdProps {
  /** Simula ad unit id (measurement + targeting). */
  adUnitId?: string;
  /** Index position of the slot in the feed (sent to the backend). Default 0. */
  position?: number;
  /** Creative color theme. */
  theme?: SimulaNativeAdTheme;
  /** Per-impression publisher metadata, validated and snapshotted by the native SDK. */
  extraParameters?: SimulaExtraParameters;
  /**
   * An id from `SimulaAds.preloadNativeAd()` — renders that cached ad with no live
   * request. An expired/unknown id falls back to a live call (no error surfaced).
   */
  preloadedAdId?: string;
  /**
   * Debug/QA only: render this HTML through the full pipeline (WebView + height
   * sizing + viewability) with no network call. Mirrors the imperative ads'
   * `showPreview`.
   */
  previewHtml?: string;
  /** Fired once when the viewability threshold is met. */
  onImpression?: (data: NativeAdData) => void;
  /**
   * Fired when the user taps the creative's CTA and it navigates out (a real
   * gesture-initiated click — not auto-redirects/pixels). The click-through itself
   * is handled natively; this is a signal for your own analytics.
   */
  onClick?: () => void;
  /**
   * Fired with the estimated per-impression revenue, co-timed with `onImpression`.
   * Mirrors the imperative ads' `PAID` event.
   */
  onPaid?: (adValue: AdValue) => void;
  /**
   * Fired with a `NativeAdError` on a load/render failure (`not_initialized`, `no_session`,
   * `network`) and on a no-fill (`no_fill`). The card collapses to zero height either way.
   */
  onError?: (error: NativeAdError) => void;
  /**
   * Card width (min 300; defaults to fill the parent), mirroring the `width` on the
   * Kotlin/Swift slots. Height is managed automatically — the card grows to its
   * creative and collapses to zero on a no-fill or error — so width is the only
   * dimension you control. For spacing/positioning, wrap `<NativeAd>` in a `<View>`.
   */
  width?: DimensionValue;
}

/** @internal Props for the underlying native view (height is JS-managed). */
export interface NativeAdViewProps {
  adUnitId?: string;
  position?: number;
  theme?: SimulaNativeAdTheme;
  extraParametersJson?: string;
  preloadedAdId?: string;
  previewHtml?: string;
  onAdSizeChange?: (event: {
    nativeEvent: { height: number };
  }) => void;
  onAdImpression?: (event: { nativeEvent: NativeAdData }) => void;
  onAdClick?: (event: { nativeEvent: Record<string, never> }) => void;
  onAdPaid?: (event: { nativeEvent: AdValue }) => void;
  onAdError?: (event: { nativeEvent: NativeAdError }) => void;
  style?: StyleProp<ViewStyle>;
}
