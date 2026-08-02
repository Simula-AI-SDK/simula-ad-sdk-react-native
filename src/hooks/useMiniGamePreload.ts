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
import { withTimeout, NATIVE_COMPLETION_TIMEOUT_MS } from '../internal/withTimeout';
import {
  devLogRejection,
  warnNativeSurfaceUnavailable,
} from '../internal/nativeModules';

const { SimulaMiniGameModule } = NativeModules;

export function useMiniGamePreload(): () => Promise<void> {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } = useSimulaContext();

  return useCallback(async () => {
    if (!SimulaMiniGameModule?.preload) {
      warnNativeSurfaceUnavailable("useMiniGamePreload", "SimulaMiniGameModule.preload");
      return;
    }
    try {
      // Bounded like every other native completion (RN-6): a dropped native
      // completion must not strand the caller's await forever.
      await withTimeout(
        SimulaMiniGameModule.preload({
          apiKey,
          hasPrivacyConsent,
          devMode,
          primaryUserID: primaryUserID ?? null,
        }),
        NATIVE_COMPLETION_TIMEOUT_MS,
        () => undefined,
      );
    } catch (e) {
      devLogRejection("useMiniGamePreload", e);
    }
  }, [apiKey, hasPrivacyConsent, devMode, primaryUserID]);
}
