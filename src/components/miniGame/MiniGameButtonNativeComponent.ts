/**
 * Codegen spec for the native view backing `<MiniGameButton>`.
 *
 * See `NativeAdNativeComponent.ts` for the rationale (static Fabric config on Android via
 * `codegenConfig`, transparent `requireNativeComponent` fallback everywhere else). iOS is
 * excluded until the Phase 3 iOS Fabric port lands.
 */
import type { HostComponent, ViewProps } from "react-native";
import type {
  DirectEventHandler,
  Double,
  UnsafeMixed,
  WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";
import codegenNativeComponent from "react-native/Libraries/Utilities/codegenNativeComponent";

export interface MiniGameButtonSizeChangeEventData {
  height: Double;
}

export interface NativeProps extends ViewProps {
  // WithDefault<string, null> (not plain `string`) so an explicit `null` can be sent — the JS
  // wrapper does this deliberately (see MiniGameButton.tsx) to force the native setter to run
  // even when there's no text, rather than relying on the prop being omitted.
  text?: WithDefault<string, null>;
  showPulsate?: WithDefault<boolean, false>;
  showBadge?: WithDefault<boolean, false>;
  // The theme is a heterogeneously-typed config object (numbers, strings, a mixed
  // number|string padding) passed straight through to a native ReadableMap — not a fixed
  // codegen-typed shape. See MiniGameButtonTheme in ../../types. `UnsafeObject` isn't
  // recognized by @react-native/codegen's TypeScript parser (only `UnsafeMixed` is), even
  // though both exist in CodegenTypes and are just `unknown`/`object` aliases.
  theme?: UnsafeMixed;
  onButtonPress?: DirectEventHandler<Readonly<{}>>;
  onButtonSizeChange?: DirectEventHandler<MiniGameButtonSizeChangeEventData>;
}

export default codegenNativeComponent<NativeProps>("SimulaMiniGameButtonView", {
  excludedPlatforms: ["iOS"],
}) as HostComponent<NativeProps>;
