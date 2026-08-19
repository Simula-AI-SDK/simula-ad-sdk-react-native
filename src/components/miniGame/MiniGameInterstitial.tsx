/**
 * MiniGameInterstitial - Native wrapper component for React Native
 *
 * Full-screen interstitial overlay with character image, invitation text,
 * CTA button, and background image.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import { MiniGameInterstitialProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { miniGameEmitter as emitter, warnIfDuplicateSurface } from '../../internal/emitter';
import { isNonBlankString } from '../../internal/identifiers';
import { surfaceVisibilityAction } from '../../internal/surfaceVisibility';

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
  const shownForOpenCycleRef = useRef(false);
  const showGenerationRef = useRef(0);

  // Show/hide native interstitial based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule) return;
    const action = surfaceVisibilityAction(
      isOpen,
      shownForOpenCycleRef.current,
      isNonBlankString(apiKey),
    );

    if (action === 'show') {
      const generation = ++showGenerationRef.current;
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
        if (showGenerationRef.current === generation) {
          wasOpenRef.current = false;
          shownForOpenCycleRef.current = false;
        }
        console.error('[SimulaMiniGame] showMiniGameInterstitial failed:', error?.message || error);
      });
      wasOpenRef.current = true;
      shownForOpenCycleRef.current = true;
    } else if (action === 'hide') {
      showGenerationRef.current += 1;
      SimulaMiniGameModule.hideMiniGameInterstitial();
      wasOpenRef.current = false;
      shownForOpenCycleRef.current = false;
    }
  }, [isOpen, apiKey]);

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
      if (!wasOpenRef.current) return;
      onClickRef.current();
    });
    return () => subscription.remove();
  }, []);

  // Listen for native close event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameInterstitialClose', () => {
      if (!wasOpenRef.current) return;
      showGenerationRef.current += 1;
      wasOpenRef.current = false;
      SimulaMiniGameModule.hideMiniGameInterstitial();
      onCloseRef.current?.();
    });
    return () => subscription.remove();
  }, []);

  // If React unmounts while the native interstitial is still open, tear it down.
  useEffect(() => {
    return () => {
      showGenerationRef.current += 1;
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
