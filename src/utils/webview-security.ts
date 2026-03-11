/**
 * WebView Security Utilities for AdTech Sandboxing Compliance
 * Implements origin validation and security controls for App Store / Google Play compliance
 */

import type { WebViewSecurityConfig } from "../types";

/**
 * Default allowed origins for Simula ad content
 * These are the known trusted domains for ad delivery
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  // Simula production servers
  "https://simula.ad",
  "https://www.simula.ad",
  "https://cdn.simula.ad",
  "https://ads.simula.ad",
  // Google Cloud Run (production API)
  "https://simula-api-701226639755.us-central1.run.app",
  // Cloudflare tunnels (development/staging)
  "https://*.trycloudflare.com",
  // Common CDN origins for ad assets
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  // local ngrok domains
  "https://*.ngrok-free.dev",
] as const;

/**
 * Special URL schemes that should be allowed in WebView
 * These are internal browser URLs that don't represent external navigation
 */
export const ALLOWED_SPECIAL_SCHEMES: readonly string[] = [
  "about:",
  "data:",
  "blob:",
] as const;

/**
 * Check if a URL is a data URL (base64 encoded content)
 * @param url - The URL to check
 * @returns True if it's a data URL
 */
export function isDataUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Parse a data URL and extract its contents
 * Handles formats like: data:text/html;charset=utf-8;base64,<content>
 * @param dataUrl - The data URL to parse
 * @returns Object with mimeType, encoding, and decoded content, or null if invalid
 */
export function parseDataUrl(dataUrl: string): {
  mimeType: string;
  charset: string;
  isBase64: boolean;
  content: string;
  decodedHtml: string | null;
} | null {
  if (!isDataUrl(dataUrl)) {
    return null;
  }

  try {
    // Remove "data:" prefix
    const withoutPrefix = dataUrl.slice(5);
    
    // Split at the comma to separate metadata from content
    const commaIndex = withoutPrefix.indexOf(",");
    if (commaIndex === -1) {
      return null;
    }
    
    const metadata = withoutPrefix.slice(0, commaIndex);
    const content = withoutPrefix.slice(commaIndex + 1);
    
    // Parse metadata (e.g., "text/html;charset=utf-8;base64")
    const parts = metadata.split(";");
    const mimeType = parts[0] || "text/plain";
    
    let charset = "utf-8";
    let isBase64 = false;
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (part === "base64") {
        isBase64 = true;
      } else if (part.startsWith("charset=")) {
        charset = part.slice(8);
      }
    }
    
    // Decode content
    let decodedHtml: string | null = null;
    if (isBase64 && mimeType.includes("html")) {
      try {
        // Use atob for base64 decoding (available in React Native)
        const decoded = atob(content);
        // Handle UTF-8 encoding
        decodedHtml = decodeURIComponent(
          decoded.split("").map((c) => {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join("")
        );
      } catch (decodeError) {
        // Fallback: try direct atob
        try {
          decodedHtml = atob(content);
        } catch {
          console.warn("[Simula Security] Failed to decode base64 data URL");
          decodedHtml = null;
        }
      }
    }
    
    return {
      mimeType,
      charset,
      isBase64,
      content,
      decodedHtml,
    };
  } catch (error) {
    console.warn("[Simula Security] Failed to parse data URL:", error);
    return null;
  }
}

/**
 * Extract the origin (protocol + host) from a URL
 * @param url - The URL to extract origin from
 * @returns The origin string or null if invalid
 */
export function extractOrigin(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    // Handle special schemes
    for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
      if (url.startsWith(scheme)) {
        return scheme;
      }
    }

    // Handle javascript: URLs (should be blocked but log for debugging)
    if (url.startsWith("javascript:")) {
      return null;
    }

    // Parse URL to extract origin
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (error) {
    // Invalid URL
    console.warn("[Simula Security] Failed to parse URL:", url);
    return null;
  }
}

/**
 * Check if a URL matches an allowed origin pattern
 * Supports wildcard patterns like "https://*.example.com"
 * @param url - The URL to check
 * @param pattern - The origin pattern (may include wildcards)
 * @returns True if the URL matches the pattern
 */
export function matchesOriginPattern(url: string, pattern: string): boolean {
  if (!url || !pattern) {
    return false;
  }

  const origin = extractOrigin(url);
  if (!origin) {
    return false;
  }

  // Handle special schemes
  for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
    if (pattern === scheme && origin === scheme) {
      return true;
    }
  }

  // Check for wildcard pattern
  if (pattern.includes("*")) {
    // Convert wildcard pattern to regex
    // e.g., "https://*.trycloudflare.com" -> /^https:\/\/[^\/]+\.trycloudflare\.com$/
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
      .replace(/\*/g, "[^/]+"); // Replace * with match any subdomain
    
    try {
      const regex = new RegExp(`^${regexPattern}$`, "i");
      return regex.test(origin);
    } catch (error) {
      console.warn("[Simula Security] Invalid pattern:", pattern);
      return false;
    }
  }

  // Exact match (case-insensitive)
  return origin.toLowerCase() === pattern.toLowerCase();
}

/**
 * Check if a URL's origin is in the allowed list
 * @param url - The URL to validate
 * @param allowedOrigins - Array of allowed origin patterns
 * @returns True if the origin is allowed
 */
export function isOriginAllowed(
  url: string,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS
): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  // Always allow special schemes
  for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
    if (url.startsWith(scheme)) {
      return true;
    }
  }

  // Block javascript: URLs for security
  if (url.startsWith("javascript:")) {
    console.warn("[Simula Security] Blocked javascript: URL");
    return false;
  }

  // Check against allowed origins
  for (const pattern of allowedOrigins) {
    if (matchesOriginPattern(url, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Build the origin whitelist array for WebView component
 * Extracts the origin from the iframe URL and combines with defaults
 * @param _iframeUrl - The ad iframe URL (reserved for future use)
 * @param _additionalOrigins - Additional origins to allow (reserved for future use)
 * @returns Array of origin patterns for WebView originWhitelist prop
 */
export function buildOriginWhitelist(
  _iframeUrl?: string,
  _additionalOrigins?: readonly string[]
): string[] {
  const origins = new Set<string>();

  // Add special schemes (required for WebView)
  origins.add("about:*");
  origins.add("data:*");
  origins.add("blob:*");

  // Add HTTPS (we only allow secure connections)
  origins.add("https://*");

  // Note: We use https://* but validate origins in onShouldStartLoadWithRequest
  // This is because react-native-webview's originWhitelist has limited pattern support
  // The _iframeUrl and _additionalOrigins parameters are reserved for future
  // enhancements where we might want to dynamically restrict the whitelist

  return Array.from(origins);
}

/**
 * Validate an ad iframe URL before loading
 * @param iframeUrl - The iframe URL to validate
 * @param allowedOrigins - Optional custom allowed origins
 * @returns Object with validation result and error message if invalid
 */
export function validateAdUrl(
  iframeUrl: string | undefined,
  allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS
): { isValid: boolean; error?: string } {
  if (!iframeUrl) {
    return { isValid: false, error: "No iframe URL provided" };
  }

  // Allow data URLs (base64 encoded HTML from API)
  // These are trusted as they come directly from our API
  if (isDataUrl(iframeUrl)) {
    const parsed = parseDataUrl(iframeUrl);
    if (!parsed) {
      return { isValid: false, error: "Invalid data URL format" };
    }
    if (!parsed.mimeType.includes("html")) {
      return { isValid: false, error: "Data URL must contain HTML content" };
    }
    return { isValid: true };
  }

  // Must be HTTPS for non-data URLs
  if (!iframeUrl.startsWith("https://")) {
    return { 
      isValid: false, 
      error: "Ad URL must use HTTPS for security compliance" 
    };
  }

  // Validate origin
  if (!isOriginAllowed(iframeUrl, allowedOrigins)) {
    const origin = extractOrigin(iframeUrl);
    console.warn(
      `[Simula Security] Blocked ad from untrusted origin: ${origin}`
    );
    return { 
      isValid: false, 
      error: `Ad origin not in allowed list: ${origin}` 
    };
  }

  return { isValid: true };
}

/**
 * Get security settings for WebView based on configuration
 * @param config - Optional security configuration
 * @returns Object with WebView security props
 */
export function getWebViewSecuritySettings(config?: WebViewSecurityConfig) {
  const debugMode = config?.debugMode ?? false;

  return {
    // Never allow mixed content (HTTP in HTTPS context)
    mixedContentMode: "never" as const,
    
    // Require user interaction for media playback
    mediaPlaybackRequiresUserAction: true,
    
    // Disable potentially dangerous features
    javaScriptCanOpenWindowsAutomatically: false,
    
    // Allow inline media playback (controlled by user interaction requirement)
    allowsInlineMediaPlayback: true,
    
    // Disable file access for security
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    
    // Enable safe browsing on Android
    setSafeBrowsingEnabled: true,
    
    // Content settings
    domStorageEnabled: true,
    javaScriptEnabled: true,
    
    // Logging for debug mode
    ...(debugMode && {
      onError: (syntheticEvent: any) => {
        const { nativeEvent } = syntheticEvent;
        console.warn("[Simula Security] WebView error:", nativeEvent);
      },
    }),
  };
}

/**
 * Log security event for debugging and monitoring
 * @param event - Event type
 * @param details - Event details
 */
export function logSecurityEvent(
  event: "origin_blocked" | "url_validated" | "navigation_blocked" | "security_error",
  details: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    ...details,
  };

  // In production, this could be sent to analytics
  // For now, just console log with prefix for easy filtering
  console.log(`[Simula Security] ${event}:`, JSON.stringify(logEntry));
}

/**
 * Compute WebView source from an iframe URL
 * Handles both HTTPS URLs and data URLs (base64 encoded HTML)
 * For data URLs, decodes the HTML and returns source.html with baseUrl
 * This is required because iOS WebView doesn't support data: URLs in source.uri
 *
 * @param iframeUrl - The iframe URL (HTTPS or data URL)
 * @returns WebView source object or null if invalid
 */
export function computeWebViewSource(
  iframeUrl: string | null | undefined
): { uri: string } | { html: string; baseUrl: string } | null {
  if (!iframeUrl) {
    return null;
  }

  // Check if it's a data URL (base64 encoded HTML)
  if (isDataUrl(iframeUrl)) {
    const parsed = parseDataUrl(iframeUrl);
    if (parsed?.decodedHtml) {
      // Use source.html for data URLs with a baseUrl for proper origin handling
      return { html: parsed.decodedHtml, baseUrl: 'https://simula.ad' };
    }
    // Decoding failed - return null and let the error state handle it
    console.error("[Simula] Failed to decode data URL");
    return null;
  }

  // Regular HTTPS URL
  return { uri: iframeUrl };
}

