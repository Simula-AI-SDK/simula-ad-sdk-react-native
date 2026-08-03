/**
 * MiniGameButton — inline native button for React Native.
 *
 * Renders the SDK's native MiniGameButton (a styled trigger button with optional
 * pulsate glow + badge) as a real **inline** view: it sits where you place it and
 * occupies layout space, exactly like the native SwiftUI / Compose component. The
 * view self-sizes to the button's content height; tapping fires `onClick`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UIManager, Platform, type StyleProp, type ViewStyle } from "react-native";
import NativeMiniGameButtonComponent, {
  type MiniGameButtonSizeChangeEventData,
} from "./MiniGameButtonNativeComponent";
import { MiniGameButtonProps } from "../../types";
import { IS_DEVELOPMENT } from "../../internal/environment";

const COMPONENT_NAME = "SimulaMiniGameButtonView";

// The codegen-generated component (MiniGameButtonNativeComponent.ts) resolves to a static
// Fabric config on Android when codegen ran at build time, or transparently falls back to
// `requireNativeComponent` otherwise (old architecture, iOS, or codegen not wired up yet).
// We still gate on `UIManager.hasViewManagerConfig` — see NativeAd.tsx for why it must be
// `has` and not `get` — to render `null` with a warning instead of throwing when the view
// manager truly isn't registered.
const NativeMiniGameButton =
  Platform?.OS != null &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any)?.hasViewManagerConfig?.(COMPONENT_NAME) === true
    ? NativeMiniGameButtonComponent
    : null;

let warnedUnavailable = false;
function warnUnavailable(): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(
    `[SimulaMiniGame] <MiniGameButton> native view unavailable; rendering nothing. ` +
      `Did you rebuild the app after adding @simula/ads-react-native? ` +
      `(platform: ${Platform?.OS})`,
  );
}

export const MiniGameButton: React.FC<MiniGameButtonProps> = ({
  text,
  showPulsate = false,
  showBadge = false,
  theme = {},
  width,
  onClick,
}) => {
  // Provisional height (~the native 48pt button) until the native view reports its
  // measured content height.
  const [height, setHeight] = useState(48);

  const handleSize = useCallback(
    (event: { nativeEvent: MiniGameButtonSizeChangeEventData }) => {
      const next = event?.nativeEvent?.height ?? 0;
      // Threshold sub-pixel churn.
      setHeight((prev) => (next > 0 && Math.abs(prev - next) >= 1 ? next : prev));
    },
    [],
  );

  // Keep onClick fresh without re-rendering the native view.
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);
  const handlePress = useCallback(() => onClickRef.current(), []);

  // The button fills the given width and is centered by the host; `width` (if set)
  // pins the container, otherwise it fills the parent.
  const containerStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      width != null
        ? { width: width as ViewStyle["width"] }
        : { alignSelf: "stretch" },
      { height },
    ],
    [width, height],
  );

  if (!NativeMiniGameButton) {
    if (IS_DEVELOPMENT) warnUnavailable();
    return null;
  }

  return (
    <NativeMiniGameButton
      text={text ?? null}
      showPulsate={showPulsate}
      showBadge={showBadge}
      theme={theme}
      onButtonPress={handlePress}
      onButtonSizeChange={handleSize}
      style={containerStyle}
    />
  );
};
