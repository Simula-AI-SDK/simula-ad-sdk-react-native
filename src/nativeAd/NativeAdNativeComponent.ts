/**
 * Codegen spec for the native view backing `<NativeAd>`.
 *
 * `codegenNativeComponent` generates a static Fabric component config at build time (via
 * the `codegenConfig` in package.json) on platforms that opt in — Android only for now
 * (`excludedPlatforms: ['iOS']`, since the iOS side is still an old-architecture-only
 * `RCTViewManager`; see the Phase 3 iOS Fabric port). It also works with zero build-time
 * codegen: at runtime it falls back to `requireNativeComponent`, so this is safe to import
 * unconditionally on both architectures and both platforms.
 */
import type { HostComponent, ViewProps } from "react-native";
import type {
  DirectEventHandler,
  Double,
  Int32,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";
import codegenNativeComponent from "react-native/Libraries/Utilities/codegenNativeComponent";

export interface NativeAdSizeChangeEventData {
  height: Double;
  // Identity of the slot the height was measured for. Native emits size events
  // asynchronously, so after a recycled list cell rebinds to a new slot a late event can
  // still describe the previous creative — JS uses these to drop such stale events.
  adUnitId?: string;
  adPosition?: Int32;
  preloadedAdId?: string;
}

export interface NativeAdImpressionEventData {
  impressionId: string;
  adFormat: string;
  adUnitId?: string;
}

export interface NativeAdPaidEventData {
  valueMicros: Double;
  currencyCode: string;
  precisionType: string;
  expectedCpm: Double;
  expectedRevenue: Double;
}

export interface NativeAdErrorEventData {
  code: string;
  message: string;
}

export interface NativeProps extends ViewProps {
  adUnitId?: string;
  // Named `adPosition` on the wire: `position` is a reserved RN layout prop
  // (LayoutShadowNode expects the Yoga string "relative"/"absolute"/"static"), and an
  // Int prop with that name crashes Android's shadow-node update. The public JS API
  // still exposes `position`; NativeAd.tsx maps it.
  adPosition?: WithDefault<Int32, 0>;
  theme?: string;
  metadataJson?: string;
  preloadedAdId?: string;
  previewHtml?: string;
  onAdSizeChange?: DirectEventHandler<NativeAdSizeChangeEventData>;
  onAdImpression?: DirectEventHandler<NativeAdImpressionEventData>;
  onAdClick?: DirectEventHandler<Readonly<{}>>;
  onAdPaid?: DirectEventHandler<NativeAdPaidEventData>;
  onAdError?: DirectEventHandler<NativeAdErrorEventData>;
}

export default codegenNativeComponent<NativeProps>("SimulaNativeAdView", {
  excludedPlatforms: ["iOS"],
}) as HostComponent<NativeProps>;
