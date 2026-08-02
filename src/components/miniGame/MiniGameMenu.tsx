/**
 * MiniGameMenu - Native wrapper component for React Native
 *
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs which handle
 * the entire mini-game flow: catalog display, game carousel/grid, game WebView,
 * post-game ads, and link handling (Chrome Custom Tabs / SFSafariViewController /
 * SKStoreProductViewController).
 */

import { useEffect, useRef } from 'react';
import { NativeModules } from 'react-native';
import { MiniGameMenuProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { miniGameEmitter as emitter, warnIfDuplicateSurface } from '../../internal/emitter';
import { isNonBlankString } from '../../internal/identifiers';

const { SimulaMiniGameModule } = NativeModules;

export const MiniGameMenu: React.FC<MiniGameMenuProps> = ({
  isOpen,
  onClose,
  charName,
  charID,
  charImage,
  messages = [],
  charDesc,
  maxGamesToShow,
  theme = {},
  delegateChar = true,
}) => {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } = useSimulaContext();
  const wasOpenRef = useRef(false);

  // Show/hide native menu based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule || !isNonBlankString(apiKey)) return;

    if (isOpen && !wasOpenRef.current) {
      SimulaMiniGameModule.showMiniGameMenu({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
        charName,
        charID,
        charImage,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        charDesc: charDesc ?? null,
        maxGamesToShow: maxGamesToShow ?? null,
        theme,
        delegateChar,
      }).catch((error: any) => {
        console.error('[SimulaMiniGame] showMiniGameMenu failed:', error?.message || error);
      });
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideMiniGameMenu();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Keep the latest onClose in a ref so the native listener subscribes once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Listen for native close event (subscribe once)
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameMenuClose', () => {
      wasOpenRef.current = false;
      onCloseRef.current();
    });
    return () => subscription.remove();
  }, []);

  // If React unmounts while the native menu is still open, tear it down.
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        SimulaMiniGameModule?.hideMiniGameMenu();
        wasOpenRef.current = false;
      }
    };
  }, []);

  // Dev-only guard: this surface is a singleton natively.
  useEffect(() => warnIfDuplicateSurface('MiniGameMenu'), []);

  // Native handles all rendering
  return null;
};
