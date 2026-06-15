import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import type { SimulaAdError } from "../ads/types";

/**
 * Creative color theme for a native ad.
 * - `"dark"` / `"light"` — force the theme.
 * - `"system"` — follow the device's current UI mode.
 * Omitted → backend default (currently light).
 */
export type SimulaNativeAdTheme = "dark" | "light" | "system";

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
  /** Fired on a load/render failure (network, bad session). Not fired on a no-fill. */
  onError?: (error: SimulaAdError) => void;
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
  preloadedAdId?: string;
  previewHtml?: string;
  onAdSizeChange?: (event: {
    nativeEvent: { height: number };
  }) => void;
  onAdImpression?: (event: { nativeEvent: NativeAdData }) => void;
  onAdError?: (event: { nativeEvent: SimulaAdError }) => void;
  style?: StyleProp<ViewStyle>;
}
