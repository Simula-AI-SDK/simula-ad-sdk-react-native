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
import { surfaceVisibilityAction } from '../../internal/surfaceVisibility';

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
  const shownForOpenCycleRef = useRef(false);

  // Show/hide native menu based on isOpen prop
  useEffect(() => {
    if (!SimulaMiniGameModule) return;
    const action = surfaceVisibilityAction(
      isOpen,
      shownForOpenCycleRef.current,
      isNonBlankString(apiKey),
    );

    if (action === 'show') {
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
      wasOpenRef.current = true;
      shownForOpenCycleRef.current = true;
    } else if (action === 'hide') {
      SimulaMiniGameModule.hideMiniGameMenu();
      wasOpenRef.current = false;
      shownForOpenCycleRef.current = false;
    }
  }, [isOpen, apiKey]);

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
      // Keep the open-cycle latch set until isOpen becomes false. Otherwise an
      // unrelated apiKey identity change would reopen a surface the user closed.
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
