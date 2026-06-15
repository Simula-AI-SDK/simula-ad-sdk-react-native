/**
 * Simula Ad SDK for React Native
 *
 * Pure wrapper around native Kotlin (Android) and Swift (iOS) SDKs.
 * The native SDKs handle menu display, game WebViews, external link
 * handling, post-game ads, dedup/staleness, and reward verification.
 */

// ── Declarative MiniGame surfaces ───────────────────────────────────────────
export { SimulaProvider, useSimulaContext } from "./context/SimulaProvider";
export { useMiniGamePreload } from "./hooks/useMiniGamePreload";
export { MiniGameMenu } from "./components/miniGame/MiniGameMenu";
export { MiniGameButton } from "./components/miniGame/MiniGameButton";
export { MiniGameInvitation } from "./components/miniGame/MiniGameInvitation";
export { MiniGameInterstitial } from "./components/miniGame/MiniGameInterstitial";
export { CharacterSelector } from "./components/CharacterSelector";

// ── Imperative ad API ───────────────────────────────────────────────────────
export { SimulaAds } from "./ads/SimulaAds";
export { SimulaInterstitialAd } from "./ads/SimulaInterstitialAd";
export { SimulaRewardedAd } from "./ads/SimulaRewardedAd";

// ── Native ad (inline feed card) ──────────────────────────────────────────────
export { NativeAd } from "./nativeAd/NativeAd";
export {
  SimulaAdEventType,
  SimulaRewardedAdEventType,
} from "./ads/types";
export { useInterstitialAd } from "./hooks/useInterstitialAd";
export { useRewardedAd } from "./hooks/useRewardedAd";

// ── Privacy / consent ───────────────────────────────────────────────────────
export { SimulaPrivacy } from "./privacy/SimulaPrivacy";

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  Message,
  SimulaProviderProps,
  SimulaContextValue,
  MiniGameTheme,
  MiniGameMenuProps,
  MiniGameButtonTheme,
  MiniGameButtonProps,
  MiniGameInvitationAnimation,
  MiniGameInvitationTheme,
  MiniGameInvitationProps,
  MiniGameInterstitialTheme,
  MiniGameInterstitialProps,
  CharacterData,
  CharacterSelectorTheme,
  CharacterSelectorProps,
} from "./types";

export type { SimulaInitConfig } from "./ads/SimulaAds";
export type { SimulaAdContext } from "./ads/context";
export type {
  NativeAdProps,
  NativeAdData,
  SimulaNativeAdTheme,
  NativeAdError,
  NativeAdErrorCode,
} from "./nativeAd/types";
export type {
  SimulaAdType,
  SimulaAnyAdEventType,
  SimulaAdErrorCode,
  SimulaAdError,
  SimulaAdLoadOptions,
  SimulaAdEvent,
  SimulaUnsubscribe,
  InterstitialPreviewOptions,
  RewardedPreviewOptions,
} from "./ads/types";
export type { UseInterstitialAd } from "./hooks/useInterstitialAd";
export type { UseRewardedAd } from "./hooks/useRewardedAd";
export type {
  SimulaPrivacyConfig,
  SimulaClearConsentFlags,
  TrackingAuthorizationStatus,
} from "./privacy/types";
