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
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } =
    useSimulaContext();
  const wasOpenRef = useRef(false);

  // Show/hide native invitation based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule) return;
    const action = surfaceVisibilityAction(
      isOpen,
      wasOpenRef.current,
      isNonBlankString(apiKey),
    );

    if (action === 'show') {
      SimulaMiniGameModule.showMiniGameInvitation({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
        titleText: titleText ?? null,
        subText: subText ?? null,
        ctaText: ctaText ?? null,
        charImage,
        animation: animation ?? null,
        theme,
        autoCloseDuration: autoCloseDuration ?? null,
        width: width ?? null,
        top: top ?? null,
      }).catch((error: any) => {
        console.error('[SimulaMiniGame] showMiniGameInvitation failed:', error?.message || error);
      });
      wasOpenRef.current = true;
    } else if (action === 'hide') {
      SimulaMiniGameModule.hideMiniGameInvitation();
      wasOpenRef.current = false;
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
      onClickRef.current();
    });
    return () => subscription.remove();
  }, []);

  // Listen for native close event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameInvitationClose', () => {
      wasOpenRef.current = false;
      SimulaMiniGameModule.hideMiniGameInvitation();
      onCloseRef.current?.();
    });
    return () => subscription.remove();
  }, []);

  // If React unmounts while the native invitation is still open, tear it down.
  useEffect(() => {
    return () => {
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
