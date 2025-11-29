/**
 * Type definitions for Simula Ad SDK React Native
 * Maintains API compatibility with https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import { ReactNode } from "react";
import { SimulaTheme } from "./theme";

/**
 * Message format for conversation context
 * Compatible with OpenAI chat format
 */
export interface Message {
  /** Role of the message sender */
  role: "user" | "assistant" | "system";
  
  /** Content of the message */
  content: string;
  
  /** Optional: LLM promise for trigger timing */
  llmPromise?: Promise<any>;
}

/**
 * Ad data returned from Simula API (matches original SDK)
 */
export interface AdData {
  /** Unique ad identifier */
  id: string;
  
  /** Ad format type */
  format: string;
  
  /** Iframe URL for rendering the ad */
  iframeUrl?: string;
  
  /** Ad creative HTML content (legacy, not used in React Native) */
  content?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Props for SimulaProvider (matches original SDK)
 */
export interface SimulaProviderProps {
  /** Your Simula API key from https://simula.ad */
  apiKey: string;
  
  /** Child components */
  children: ReactNode;
  
  /** Optional: Development mode flag */
  devMode?: boolean;
  
  /** Optional: Primary user ID for tracking */
  primaryUserID?: string;
  
  /** Optional: Callback when user consent is required (RN-specific) */
  onConsentRequired?: () => void;
  
  /** Optional: Initial consent state (RN-specific) */
  hasUserConsent?: boolean;
}

/**
 * Props for InChatAdSlot component (matches original SDK)
 */
export interface InChatAdSlotProps {
  /** Conversation messages for contextual targeting */
  messages: Message[];
  
  /** Optional: Theme configuration */
  theme?: SimulaTheme;
  
  /** Optional: Promise to wait for before fetching ad (e.g., LLM response) */
  trigger?: Promise<any>;
  
  /** Optional: Debounce delay in milliseconds. Default: 0 */
  debounceMs?: number;
  
  /** Optional: Character description for better targeting */
  charDesc?: string;
  
  /** Optional: Callback when ad impression is recorded */
  onImpression?: (ad: AdData) => void;
  
  /** Optional: Callback when ad is clicked */
  onClick?: (ad: AdData) => void;
  
  /** Optional: Callback when error occurs */
  onError?: (error: Error) => void;
}

/**
 * Internal context value (matches original SDK)
 */
export interface SimulaContextValue {
  apiKey: string;
  sessionId?: string;
  devMode: boolean;
  hasUserConsent: boolean;
  setUserConsent: (consent: boolean) => void;
  onConsentRequired?: () => void;
}

/**
 * WebView security configuration for AdTech sandboxing compliance
 * Used to configure security settings for ad WebView components
 */
export interface WebViewSecurityConfig {
  /** 
   * Additional origins to allow beyond the default Simula domains
   * Use with caution - adding untrusted origins may violate store policies
   */
  additionalAllowedOrigins?: string[];
  
  /** 
   * Whether to allow insecure HTTP content (NOT recommended)
   * Default: false - only HTTPS content is allowed
   */
  allowInsecureContent?: boolean;
  
  /** 
   * Enable verbose security logging for debugging
   * Default: false - only errors are logged
   */
  debugMode?: boolean;
}

/**
 * Security validation result for ad URLs
 */
export interface AdUrlValidationResult {
  /** Whether the URL passed security validation */
  isValid: boolean;
  
  /** Error message if validation failed */
  error?: string;
  
  /** The validated origin (if successful) */
  origin?: string;
}

/**
 * Security event types for logging and monitoring
 */
export type SecurityEventType = 
  | "origin_blocked"
  | "url_validated"
  | "navigation_blocked"
  | "security_error";

/**
 * Security event payload for logging
 */
export interface SecurityEvent {
  /** Timestamp of the event */
  timestamp: string;
  
  /** Type of security event */
  event: SecurityEventType;
  
  /** Additional event details */
  details: Record<string, any>;
}

// Re-export theme types
export * from "./theme";

