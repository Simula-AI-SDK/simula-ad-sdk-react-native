/**
 * useMiniGamePreload - warm ad delivery ahead of the first surface
 *
 * Returns a `preload()` callback that warms (and caches) the native SDK session
 * so the first MiniGame surface (menu / invitation / interstitial) reuses a live
 * session instead of paying the createSession() round-trip on the ad path.
 *
 * Call it early — e.g. on app start or a screen mount — inside a SimulaProvider:
 *
 *   const preload = useMiniGamePreload();
 *   useEffect(() => { preload(); }, [preload]);
 *
 * iOS: warms and caches the SDK session (and is reused by every surface).
 * Android: currently a no-op (the native SDK warms automatically on first
 * mount); safe to call on both platforms.
 */
import { useCallback } from 'react';
import { NativeModules } from 'react-native';
import { useSimulaContext } from '../context/SimulaProvider';

const { SimulaMiniGameModule } = NativeModules;

export function useMiniGamePreload(): () => Promise<void> {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } = useSimulaContext();

  return useCallback(async () => {
    if (!SimulaMiniGameModule?.preload) return;
    try {
      await SimulaMiniGameModule.preload({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
      });
    } catch (error: any) {
      console.error('[SimulaMiniGame] preload failed:', error?.message || error);
    }
  }, [apiKey, hasPrivacyConsent, devMode, primaryUserID]);
}
