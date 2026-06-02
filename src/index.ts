/**
 * Simula Ad SDK for React Native
 *
 * Pure wrapper around native Kotlin (Android) and Swift (iOS) SDKs.
 * The native SDKs handle menu display, game WebViews, external link
 * handling, and post-game ads.
 */

export { SimulaProvider, useSimulaContext } from "./context/SimulaProvider";
export { useMiniGamePreload } from "./hooks/useMiniGamePreload";
export { MiniGameMenu } from "./components/miniGame/MiniGameMenu";
export { MiniGameButton } from "./components/miniGame/MiniGameButton";
export { MiniGameInvitation } from "./components/miniGame/MiniGameInvitation";
export { MiniGameInterstitial } from "./components/miniGame/MiniGameInterstitial";

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
} from "./types";
