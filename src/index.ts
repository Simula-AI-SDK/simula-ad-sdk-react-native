/**
 * Simula Ad SDK for React Native
 *
 * Pure wrapper around native Kotlin (Android) and Swift (iOS) SDKs.
 * The native SDKs handle menu display, game WebViews, external link
 * handling, and post-game ads.
 */

export { SimulaProvider, useSimulaContext } from "./context/SimulaProvider";
export { MiniGameMenu } from "./components/miniGame/MiniGameMenu";

export type {
  Message,
  SimulaProviderProps,
  SimulaContextValue,
  MiniGameTheme,
  MiniGameMenuProps,
} from "./types";
