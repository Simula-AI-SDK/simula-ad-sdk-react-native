/**
 * useMiniGamePreload - warm ad delivery ahead of the first surface
 *
 * Returns a `preload()` callback that warms (and caches) the native SDK session
 * so the first MiniGame surface (menu / invitation / interstitial) reuses a live
 * session instead of paying the createSession() round-trip on the ad path.
 *
 * @deprecated `SimulaProvider` now warms the session on mount via
 * `initializeOnMount` (default true). Prefer that, or call `SimulaAds.initialize`
 * directly. This hook is retained for backward compatibility and now delegates to
 * the same native initialize path on both platforms.
 *
 *   const preload = useMiniGamePreload();
 *   useEffect(() => { preload(); }, [preload]);
 */
import { useCallback } from 'react';
import { NativeModules } from 'react-native';
import { useSimulaContext } from '../context/SimulaProvider';
import { SimulaAds } from '../ads/SimulaAds';
import { isNonBlankString } from '../internal/identifiers';

const { SimulaMiniGameModule } = NativeModules;

export function useMiniGamePreload(): () => Promise<void> {
  const { apiKey, initializationConfig } = useSimulaContext();

  return useCallback(async () => {
    if (!isNonBlankString(apiKey)) return;
    try {
      await SimulaAds.initialize(initializationConfig);
      // Preserve the legacy iOS contract: native preload resolves after the shared
      // provider's session is warm. Android keeps its existing best-effort behavior.
      await SimulaMiniGameModule?.preload?.(initializationConfig);
    } catch {}
  }, [apiKey, initializationConfig]);
}
