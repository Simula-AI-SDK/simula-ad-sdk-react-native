/**
 * MiniGameMenu - Native wrapper component for React Native
 *
 * Delegates to the native Kotlin (Android) and Swift (iOS) SDKs which handle
 * the entire mini-game flow: catalog display, game carousel/grid, game WebView,
 * post-game ads, and link handling (Chrome Custom Tabs / SFSafariViewController /
 * SKStoreProductViewController).
 */

import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';
import { MiniGameMenuProps } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';

const { SimulaMiniGameModule } = NativeModules;
const emitter = SimulaMiniGameModule
  ? new NativeEventEmitter(SimulaMiniGameModule)
  : null;

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
    if (!SimulaMiniGameModule) return;

    if (isOpen && !wasOpenRef.current) {
      console.warn('[SimulaMiniGame] calling showMiniGameMenu...');
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
      }).then(() => {
        console.warn('[SimulaMiniGame] showMiniGameMenu resolved (presented successfully)');
      }).catch((error: any) => {
        console.error('[SimulaMiniGame] showMiniGameMenu failed:', error?.message || error);
      });
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideMiniGameMenu();
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Listen for native close event
  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameMenuClose', () => {
      wasOpenRef.current = false;
      onClose();
    });
    return () => subscription.remove();
  }, [onClose]);

  useEffect(() => {
    if (!emitter) return;
    const subscription = emitter.addListener('onMiniGameDiagnostic', (payload: any) => {
      console.warn('[SimulaMiniGame][iOS diagnostic]', payload);
    });
    return () => subscription.remove();
  }, []);

  // Native handles all rendering
  return null;
};
