/**
 * MiniGameInterstitial - Native wrapper component for React Native
 *
 * Full-screen interstitial overlay with character image, invitation text,
 * CTA button, and background image.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import { devLogRejection } from "../../internal/nativeModules";
import { MiniGameInterstitialProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { miniGameEmitter as emitter, warnIfDuplicateSurface } from '../../internal/emitter';

const { SimulaMiniGameModule } = NativeModules;

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
      }).catch((e: unknown) => devLogRejection("showMiniGameInterstitial", e));
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideMiniGameInterstitial();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Keep the latest callbacks in refs so native listeners subscribe once.
  const onClickRef = useRef(onClick);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onClickRef.current = onClick;
    onCloseRef.current = onClose;
  }, [onClick, onClose]);

  // Listen for native click event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameInterstitialClick', () => {
      onClickRef.current();
    });
    return () => subscription.remove();
  }, []);

  // Listen for native close event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameInterstitialClose', () => {
      wasOpenRef.current = false;
      SimulaMiniGameModule.hideMiniGameInterstitial();
      onCloseRef.current?.();
    });
    return () => subscription.remove();
  }, []);

  // If React unmounts while the native interstitial is still open, tear it down.
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        SimulaMiniGameModule?.hideMiniGameInterstitial();
        wasOpenRef.current = false;
      }
    };
  }, []);

  // Dev-only guard: this surface is a singleton natively.
  useEffect(() => warnIfDuplicateSurface('MiniGameInterstitial'), []);

  // Native handles all rendering
  return null;
};
