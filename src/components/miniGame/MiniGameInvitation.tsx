/**
 * MiniGameInvitation - Native wrapper component for React Native
 *
 * Banner invitation that invites the user to play a game.
 * Supports multiple animation types, auto-close, and character image display.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import { MiniGameInvitationProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { SimulaAds } from '../../ads/SimulaAds';
import { miniGameEmitter as emitter, warnIfDuplicateSurface } from '../../internal/emitter';
import { isNonBlankString } from '../../internal/identifiers';
import { surfaceVisibilityAction } from '../../internal/surfaceVisibility';

const { SimulaMiniGameModule } = NativeModules;

export const MiniGameInvitation: React.FC<MiniGameInvitationProps> = ({
  titleText,
  subText,
  ctaText,
  charImage,
  animation,
  theme = {},
  isOpen,
  autoCloseDuration,
  width,
  top,
  onClick,
  onClose,
}) => {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID, initializationConfig } =
    useSimulaContext();
  const wasOpenRef = useRef(false);
  const shownForOpenCycleRef = useRef(false);
  const showGenerationRef = useRef(0);

  // Show/hide native invitation based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule) return;
    const action = surfaceVisibilityAction(
      isOpen,
      shownForOpenCycleRef.current,
      isNonBlankString(apiKey),
    );

    if (action === 'show') {
      const generation = ++showGenerationRef.current;
      const show = async () => {
        await SimulaAds.initialize(initializationConfig);
        if (showGenerationRef.current !== generation) return;
        wasOpenRef.current = true;
        await SimulaMiniGameModule.showMiniGameInvitation({
          apiKey,
          hasPrivacyConsent,
          devMode,
          primaryUserID: primaryUserID ?? null,
          privacy: initializationConfig.privacy ?? null,
          telemetryEnabled: initializationConfig.telemetryEnabled ?? true,
          adContext: initializationConfig.adContext ?? null,
          titleText: titleText ?? null,
          subText: subText ?? null,
          ctaText: ctaText ?? null,
          charImage,
          animation: animation ?? null,
          theme,
          autoCloseDuration: autoCloseDuration ?? null,
          width: width ?? null,
          top: top ?? null,
        });
      };
      show().catch((error: any) => {
        if (showGenerationRef.current === generation) {
          wasOpenRef.current = false;
          shownForOpenCycleRef.current = false;
        }
        console.error('[SimulaMiniGame] showMiniGameInvitation failed:', error?.message || error);
      });
      shownForOpenCycleRef.current = true;
    } else if (action === 'hide') {
      showGenerationRef.current += 1;
      SimulaMiniGameModule.hideMiniGameInvitation();
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
    const subscription = emitter.addListener('onMiniGameInvitationClick', () => {
      if (!wasOpenRef.current) return;
      onClickRef.current();
    });
    return () => subscription.remove();
  }, []);

  // Listen for native close event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameInvitationClose', () => {
      if (!wasOpenRef.current) return;
      showGenerationRef.current += 1;
      wasOpenRef.current = false;
      SimulaMiniGameModule.hideMiniGameInvitation();
      onCloseRef.current?.();
    });
    return () => subscription.remove();
  }, []);

  // If React unmounts while the native invitation is still open, tear it down.
  useEffect(() => {
    return () => {
      showGenerationRef.current += 1;
      if (wasOpenRef.current) {
        SimulaMiniGameModule?.hideMiniGameInvitation();
        wasOpenRef.current = false;
      }
    };
  }, []);

  // Dev-only guard: this surface is a singleton natively.
  useEffect(() => warnIfDuplicateSurface('MiniGameInvitation'), []);

  // Native handles all rendering
  return null;
};
