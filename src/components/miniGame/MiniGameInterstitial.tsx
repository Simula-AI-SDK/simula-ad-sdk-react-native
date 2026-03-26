/**
 * MiniGameInterstitial - Native wrapper component for React Native
 *
 * Full-screen interstitial overlay with character image, invitation text,
 * CTA button, and background image.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';
import { MiniGameInterstitialProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';

const { SimulaMiniGameModule } = NativeModules;
const emitter = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

export const MiniGameInterstitial: React.FC<MiniGameInterstitialProps> = ({
  charImage,
  invitationText,
  ctaText,
  backgroundImage,
  theme = {},
  isOpen,
  onClick,
  onClose,
}) => {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } =
    useSimulaContext();
  const wasOpenRef = useRef(false);

  // Show/hide native interstitial based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule) return;

    if (isOpen && !wasOpenRef.current) {
      SimulaMiniGameModule.showMiniGameInterstitial({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
        charImage,
        invitationText: invitationText ?? null,
        ctaText: ctaText ?? null,
        backgroundImage: backgroundImage ?? null,
        theme,
      }).catch((error: any) => {
        console.error('[SimulaMiniGame] showMiniGameInterstitial failed:', error?.message || error);
      });
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideMiniGameInterstitial();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Listen for native click event
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener(
      'onMiniGameInterstitialClick',
      () => {
        onClick();
      },
    );
    return () => subscription.remove();
  }, [onClick]);

  // Listen for native close event
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener(
      'onMiniGameInterstitialClose',
      () => {
        wasOpenRef.current = false;
        onClose?.();
      },
    );
    return () => subscription.remove();
  }, [onClose]);

  // Native handles all rendering
  return null;
};
