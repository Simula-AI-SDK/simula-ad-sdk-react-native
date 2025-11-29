/**
 * Simula Ad SDK for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 * 
 * @packageDocumentation
 */

// Components
export { SimulaProvider, useSimulaContext } from "./context/SimulaProvider";
export { InChatAdSlot } from "./components/InChatAdSlot";

// Types
export type {
  Message,
  AdData,
  SimulaProviderProps,
  InChatAdSlotProps,
  SimulaContextValue,
  SimulaTheme,
  ThemeMode,
  AccentColor,
  FontOption,
  NormalizedTheme,
} from "./types";

// Utilities
export { 
  generateSessionId, 
  isValidSessionId 
} from "./utils/session";

export {
  consentManager,
  isConsentRequired,
  getConsentMessage,
  PRIVACY_DISCLOSURE,
} from "./utils/consent";

// Constants
export { AD_DIMENSIONS, DEFAULT_THEME } from "./types/theme";

// API client (for advanced use cases)
export { fetchAd, trackImpression, createSession } from "./api/client";

