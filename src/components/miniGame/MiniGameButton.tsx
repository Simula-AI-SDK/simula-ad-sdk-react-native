/**
 * MiniGameButton - Native wrapper component for React Native
 *
 * Styled trigger button with optional pulsate glow animation and badge dot.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';
import { MiniGameButtonProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';

const { SimulaMiniGameModule } = NativeModules;
const emitter = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

export const MiniGameButton: React.FC<MiniGameButtonProps> = ({
  text,
  showPulsate = false,
  showBadge = false,
  theme = {},
  width,
  onClick,
}) => {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } =
    useSimulaContext();
  const isShownRef = useRef(false);

  useEffect(() => {
    if (!SimulaMiniGameModule) return;

    if (!isShownRef.current) {
      isShownRef.current = true;
      SimulaMiniGameModule.showMiniGameButton({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
        text: text ?? null,
        showPulsate,
        showBadge,
        theme,
        width: width ?? null,
      }).catch((error: any) => {
        console.error('[SimulaMiniGame] showMiniGameButton failed:', error?.message || error);
      });
    }

    return () => {
      if (isShownRef.current) {
        isShownRef.current = false;
        SimulaMiniGameModule.hideMiniGameButton();
      }
    };
  }, []);

  // Keep the latest onClick in a ref so the native listener subscribes once
  // and never goes stale (no re-subscription churn on every render).
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // Listen for native click event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameButtonClick', () => {
      onClickRef.current();
    });
    return () => subscription.remove();
  }, []);

  // Native handles all rendering
  return null;
};
