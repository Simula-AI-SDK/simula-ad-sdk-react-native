/**
 * MiniGameInvitation - Native wrapper component for React Native
 *
 * Banner invitation that invites the user to play a game.
 * Supports multiple animation types, auto-close, and character image display.
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs.
 */

import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';
import { MiniGameInvitationProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';

const { SimulaMiniGameModule } = NativeModules;
const emitter = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

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

    if (isOpen && !wasOpenRef.current) {
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
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideMiniGameInvitation();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Listen for native click event
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener(
      'onMiniGameInvitationClick',
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
      'onMiniGameInvitationClose',
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
