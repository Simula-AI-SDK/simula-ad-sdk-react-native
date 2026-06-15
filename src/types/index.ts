/**
 * Type definitions for Simula Ad SDK React Native
 */

import { ReactNode } from "react";
import { SimulaPrivacyConfig } from "../privacy/types";
import { SimulaAdContext } from "../ads/context";

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
  devMode?: boolean;
  primaryUserID?: string;
  /** Granular privacy / consent configuration. Takes precedence over hasPrivacyConsent. */
  privacy?: SimulaPrivacyConfig;
  /** Opt out of in-house SDK telemetry. Default true. */
  telemetryEnabled?: boolean;
  /**
   * Native-ad targeting context auto-attached to every native-ad request. Applied
   * at init and pushed to native on change (a full replacement, not a merge).
   */
  adContext?: SimulaAdContext;
  /**
   * Eagerly call `SimulaAds.initialize(...)` on mount to warm the native session
   * off the first ad's critical path (and, on Android, enable telemetry). Default
   * true. Set false if you call `SimulaAds.initialize` yourself.
   */
  initializeOnMount?: boolean;
}

/**
 * Internal context value
 */
export interface SimulaContextValue {
  apiKey: string;
  hasPrivacyConsent: boolean;
  devMode: boolean;
  primaryUserID?: string;
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

// ── MiniGameButton Types ────────────────────────────────────────────────────

/**
 * Theme options for the mini-game trigger button.
 */
export interface MiniGameButtonTheme {
  cornerRadius?: number;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  /** String (e.g. "10px 20px") or Number (px) */
  padding?: number | string;
  borderWidth?: number;
  borderColor?: string;
  /** Color for the pulsate glow animation. Falls back to backgroundColor. */
  pulsateColor?: string;
  /** Color for the notification badge dot. Default: '#EF4444' */
  badgeColor?: string;
}

export interface MiniGameButtonProps {
  text?: string;
  showPulsate?: boolean;
  showBadge?: boolean;
  theme?: MiniGameButtonTheme;
  width?: number | string;
  onClick: () => void;
}

// ── MiniGameInvitation Types ────────────────────────────────────────────────

export type MiniGameInvitationAnimation =
  | "auto"
  | "slideDown"
  | "slideUp"
  | "fadeIn"
  | "none";

/**
 * Theme options for the mini-game invitation banner.
 */
export interface MiniGameInvitationTheme {
  cornerRadius?: number;
  backgroundColor?: string;
  /** Fallback text color for all text if specific colors are not set. */
  textColor?: string;
  titleTextColor?: string;
  subTextColor?: string;
  ctaTextColor?: string;
  ctaColor?: string;
  charImageCornerRadius?: number;
  /** "left" or "right" — which side the character image appears on. */
  charImageAnchor?: "left" | "right";
  borderWidth?: number;
  borderColor?: string;
  fontFamily?: string;
  fontSize?: number;
}

export interface MiniGameInvitationProps {
  titleText?: string;
  subText?: string;
  ctaText?: string;
  charImage: string;
  animation?: MiniGameInvitationAnimation;
  theme?: MiniGameInvitationTheme;
  isOpen: boolean;
  /** Auto-close duration in milliseconds. */
  autoCloseDuration?: number;
  width?: number | string;
  /** Top offset — number (px) or fraction (0.05 = 5% of screen). */
  top?: number | string;
  onClick: () => void;
  onClose?: () => void;
}

// ── MiniGameInterstitial Types ──────────────────────────────────────────────

/**
 * Theme options for the full-screen mini-game interstitial.
 */
export interface MiniGameInterstitialTheme {
  ctaCornerRadius?: number;
  characterSize?: number;
  titleTextColor?: string;
  titleFontSize?: number;
  ctaTextColor?: string;
  ctaFontSize?: number;
  ctaColor?: string;
  fontFamily?: string;
}

export interface MiniGameInterstitialProps {
  charImage: string;
  invitationText?: string;
  ctaText?: string;
  backgroundImage?: string;
  theme?: MiniGameInterstitialTheme;
  isOpen: boolean;
  onClick: () => void;
  onClose?: () => void;
}

// ── CharacterSelector Types ─────────────────────────────────────────────────

/** A character the host offers (the backend backfills the grid + adds fallbacks). */
export interface CharacterData {
  id: string;
  name: string;
  /** 1:1 portrait URL. */
  imageUrl: string;
  description: string;
}

/** Theme options for the full-screen character selector. */
export interface CharacterSelectorTheme {
  backgroundColor?: string;
  titleFontColor?: string;
  /** Character-name color. */
  secondaryFontColor?: string;
  /** Selected-card border + active CTA color. */
  accentColor?: string;
  ctaFontColor?: string;
  cardBackgroundColor?: string;
  cardBorderColor?: string;
  cardCornerRadius?: number;
  fontFamily?: string;
}

export interface CharacterSelectorProps {
  isOpen: boolean;
  /** Dismissed without confirming a character. Set `isOpen` to false here. */
  onClose: () => void;
  /** The user confirmed a character (tapped the CTA). The selector then closes. */
  onCharacterSelected: (character: CharacterData) => void;
  /** A card was tapped (before the CTA confirms). The selector stays open. */
  onCharacterPreview?: (character: CharacterData) => void;
  /** Default: "Select Your Game Partner". */
  title?: string;
  /** Default: "🚀 Launch Game". */
  ctaText?: string;
  /** Host roster; the backend backfills the gap and adds bundled fallbacks. */
  characters?: CharacterData[];
  theme?: CharacterSelectorTheme;
}
