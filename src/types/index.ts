/**
 * Type definitions for Simula Ad SDK React Native
 */

import { ReactNode } from "react";

/**
 * Message format for conversation context
 * Compatible with OpenAI chat format
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Props for SimulaProvider
 */
export interface SimulaProviderProps {
  apiKey: string;
  children: ReactNode;
  hasPrivacyConsent?: boolean;
}

/**
 * Internal context value
 */
export interface SimulaContextValue {
  apiKey: string;
  hasPrivacyConsent: boolean;
}

/**
 * Theme options for the mini-game menu.
 * Passed through to native SDKs (Kotlin/Swift).
 */
export interface MiniGameTheme {
  backgroundColor?: string;
  headerColor?: string;
  borderColor?: string;
  titleFont?: string;
  secondaryFont?: string;
  titleFontColor?: string;
  secondaryFontColor?: string;
  iconCornerRadius?: number;
  /**
   * Unified accent color for interactive elements.
   * Used for search bar focus border and pagination dots.
   * Default: '#3B82F6' (blue-500)
   */
  accentColor?: string;
  /**
   * Controls the height of the Mini Game iframe (not the ad).
   * Displayed as a bottom sheet with rounded corners at the top.
   * - Number: pixel value (e.g., 500 = 500px)
   * - String with %: percentage of screen height (e.g., "80%")
   * - "auto": full screen (default behavior)
   * Minimum height is 500px.
   */
  playableHeight?: number | string;
  /**
   * Controls the background color of the curved border area above the playable
   * when playableHeight is not 100% (bottom sheet mode).
   * This is the color of the rounded top corners and drag handle area.
   * Default: '#262626' (Instagram comments dark gray)
   */
  playableBorderColor?: string;
}

export interface MiniGameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  charName: string;
  charID: string;
  charImage: string;
  messages?: Message[];
  charDesc?: string;
  maxGamesToShow?: 3 | 6 | 9;
  theme?: MiniGameTheme;
  delegateChar?: boolean;
}
