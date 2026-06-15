/**
 * MiniGameButton — inline native button for React Native.
 *
 * Renders the SDK's native MiniGameButton (a styled trigger button with optional
 * pulsate glow + badge) as a real **inline** view: it sits where you place it and
 * occupies layout space, exactly like the native SwiftUI / Compose component. The
 * view self-sizes to the button's content height; tapping fires `onClick`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requireNativeComponent,
  UIManager,
  Platform,
  type HostComponent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MiniGameButtonProps, MiniGameButtonTheme } from "../../types";

const COMPONENT_NAME = "SimulaMiniGameButtonView";

interface NativeMiniGameButtonProps {
  text?: string | null;
  showPulsate?: boolean;
  showBadge?: boolean;
  theme?: MiniGameButtonTheme;
  onButtonPress?: (event: { nativeEvent: Record<string, never> }) => void;
  onButtonSizeChange?: (event: { nativeEvent: { height: number } }) => void;
  style?: StyleProp<ViewStyle>;
}

// Resolve the native view lazily and defensively: `null` when the view manager isn't
// registered (unsupported platform, app not rebuilt, or a unit-test environment).
const NativeMiniGameButton: HostComponent<NativeMiniGameButtonProps> | null =
  Platform?.OS != null &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any)?.getViewManagerConfig?.(COMPONENT_NAME) != null
    ? requireNativeComponent<NativeMiniGameButtonProps>(COMPONENT_NAME)
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
    (event: { nativeEvent: { height: number } }) => {
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
    if (__DEV__) warnUnavailable();
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
