/**
 * Theme configuration for Simula Ad rendering
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

export type ThemeMode = "light" | "dark" | "auto";

export type AccentColor =
  | "blue"
  | "red"
  | "green"
  | "yellow"
  | "purple"
  | "pink"
  | "orange"
  | "neutral"
  | "gray"
  | "tan"
  | "transparent"
  | "image";

export type FontOption = "sans-serif" | "serif" | "monospace";

/**
 * Theme configuration interface
 * Supports A/B testing by passing arrays for accent or font
 */
export interface SimulaTheme {
  /** Theme mode: light, dark, or auto (follows system) */
  mode?: ThemeMode;
  
  /** Accent color - pass array for A/B testing. Recommend including "image" for best CPM */
  accent?: AccentColor | AccentColor[];
  
  /** Font family - pass array for A/B testing */
  font?: FontOption | FontOption[];
  
  /** Width in pixels or percentage. Min 320px, default "auto" */
  width?: number | string;
  
  /** Corner radius in pixels. Default 8 */
  cornerRadius?: number;
}

/**
 * Normalized theme for internal use
 */
export interface NormalizedTheme {
  mode: ThemeMode;
  accent: AccentColor | AccentColor[];
  font: FontOption | FontOption[];
  width: number | string;
  cornerRadius: number;
}

/**
 * Default theme values
 */
export const DEFAULT_THEME: NormalizedTheme = {
  mode: "auto",
  accent: ["blue"],
  font: ["sans-serif"],
  width: "auto",
  cornerRadius: 8,
};

/**
 * Ad dimensions (fixed by Simula)
 */
export const AD_DIMENSIONS = {
  height: 265,
  minWidth: 320,
} as const;


