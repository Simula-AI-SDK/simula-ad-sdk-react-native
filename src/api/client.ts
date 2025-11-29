/**
 * Simula API client for fetching contextual ads
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import { Message, AdData, SimulaTheme } from "../types";
import { NormalizedTheme, DEFAULT_THEME } from "../types/theme";

// Production API URL (from original SDK)
// const API_BASE_URL = "https://simula-api-701226639755.us-central1.run.app";
// const API_BASE_URL = "https://62d01abed0fd.ngrok-free.app";
// const API_BASE_URL = "https://splittable-unpatient-maxine.ngrok-free.dev";
const API_BASE_URL = "https://motherboard-pros-orleans-outsourcing.trycloudflare.com";
const REQUEST_TIMEOUT = 5000; // 5 seconds

/**
 * Request payload for ad fetch (matches original SDK)
 * Theme uses snake_case (corner_radius) for API
 */
interface AdRequest {
  messages: Message[];
  slot_id?: string;
  theme?: {
    mode?: string;
    accent?: string | string[];
    font?: string | string[];
    width?: number | string;
    corner_radius?: number; // snake_case for API
  };
  session_id?: string;
  char_desc?: string;
}

/**
 * API response format (matches original SDK)
 */
interface AdResponse {
  adInserted?: boolean;
  adType?: string;
  adResponse?: {
    ad_id?: string;
    id?: string;
    iframe_url?: string;
    iframeUrl?: string;
    format?: string;
  };
  ad?: AdData; // Legacy format
  error?: string;
}

/**
 * Session creation response
 */
interface SessionResponse {
  sessionId?: string;
}

/**
 * Normalize theme configuration (matches original SDK)
 */
export function normalizeTheme(theme?: SimulaTheme): NormalizedTheme {
  if (!theme) return DEFAULT_THEME;
  
  return {
    mode: theme.mode ?? DEFAULT_THEME.mode,
    // Convert accent and font to arrays for backend (A/B testing)
    accent: theme.accent 
      ? (Array.isArray(theme.accent) ? theme.accent : [theme.accent])
      : DEFAULT_THEME.accent,
    font: theme.font
      ? (Array.isArray(theme.font) ? theme.font : [theme.font])
      : DEFAULT_THEME.font,
    width: theme.width ?? DEFAULT_THEME.width,
    cornerRadius: theme.cornerRadius ?? DEFAULT_THEME.cornerRadius,
  };
}

/**
 * Create a server session and return its ID (matches original SDK)
 */
export async function createSession(
  apiKey: string,
  devMode?: boolean,
  primaryUserID?: string
): Promise<string | undefined> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Build query parameters
    const params = new URLSearchParams();
    if (devMode !== undefined) {
      params.append("devMode", String(devMode));
    }
    if (primaryUserID !== undefined && primaryUserID !== "") {
      params.append("ppid", primaryUserID);
    }

    const queryString = params.toString();
    const url = `${API_BASE_URL}/session/create${queryString ? `?${queryString}` : ""}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid API key (please check dashboard or contact Simula team for a valid API key)");
      }
      return undefined;
    }

    const data: SessionResponse = await response.json();
    if (data && typeof data.sessionId === "string" && data.sessionId) {
      return data.sessionId;
    }
    return undefined;
  } catch (error) {
    // Re-throw 401 errors with our custom message
    if (error instanceof Error && error.message.includes("Invalid API key")) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Fetch ad from Simula API (matches original SDK)
 */
export async function fetchAd(
  apiKey: string,
  sessionId: string | undefined,
  messages: Message[],
  theme?: SimulaTheme,
  slotId?: string,
  charDesc?: string
): Promise<{ ad?: AdData; error?: string }> {
  try {
    // Validate messages
    if (!messages || messages.length === 0) {
      return { error: "At least one message is required for contextual targeting" };
    }

    // Normalize theme
    const normalizedTheme = theme ? normalizeTheme(theme) : undefined;

    // Convert theme to API format (snake_case for cornerRadius, ensure font and accent are always arrays)
    const themeForAPI = normalizedTheme ? {
      mode: normalizedTheme.mode,
      accent: Array.isArray(normalizedTheme.accent) ? normalizedTheme.accent : [normalizedTheme.accent],
      font: Array.isArray(normalizedTheme.font) ? normalizedTheme.font : [normalizedTheme.font],
      width: normalizedTheme.width,
      corner_radius: normalizedTheme.cornerRadius, // Convert to snake_case
    } : undefined;

    // Prepare request payload (matches original SDK)
    const requestBody: AdRequest = {
      messages,
      slot_id: slotId,
      theme: themeForAPI,
      session_id: sessionId,
      char_desc: charDesc,
    };

    // Log request payload for debugging
    console.log("📤 API Request:", {
      url: `${API_BASE_URL}/render_ad/ssp`,
      method: "POST",
      body: JSON.stringify(requestBody, null, 2),
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/render_ad/ssp`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Log response status
    console.log("📥 Response Status:", response.status, response.statusText);

    // Read response body (even on errors to see what server returned)
    let data: AdResponse;
    try {
      const responseText = await response.text();
      console.log("📥 Raw API Response (text):", responseText);
      
      // Try to parse as JSON
      try {
        data = JSON.parse(responseText);
        console.log("📥 Raw API Response (parsed):", JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.log("⚠️ Response is not valid JSON");
        data = { error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
      }
    } catch (readError) {
      console.error("❌ Failed to read response:", readError);
      data = { error: `Failed to read response: ${readError instanceof Error ? readError.message : 'Unknown error'}` };
    }

    // Check if response is ok AFTER reading the body
    if (!response.ok) {
      const errorMessage = data?.error 
        ? `HTTP error! status: ${response.status} - ${data.error}` 
        : `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    // Handle new API shape (matches original SDK)
    if (data && typeof data === "object") {
      if (!data.adInserted) {
        return { error: "No fill" };
      }

      // New shape: { adType, adInserted, adResponse: { ad_id, iframe_url, ... } }
      if (data.adResponse && typeof data.adResponse === "object") {
        const ar = data.adResponse;
        const ad: AdData = {
          id: ar.ad_id ?? ar.id ?? "",
          format: (data.adType ?? ar.format ?? "iframe") as any,
          iframeUrl: ar.iframe_url ?? ar.iframeUrl,
          content: "", // Not used in React Native
        };

        if (ad.id && ad.iframeUrl) {
          return { ad };
        }

        return { error: "Invalid ad response" };
      }

      // Legacy shape: { ad: { ... } }
      if (data.ad) {
        return { ad: data.ad };
      }

      if (data.error) {
        return { error: data.error };
      }
    }

    return { error: "Unexpected response from ad server" };
  } catch (error) {
    console.error("❌ API Request failed:", error);
    
    if (error instanceof Error && error.name === "AbortError") {
      return { error: "Ad request timed out" };
    }
    
    return {
      error: error instanceof Error ? error.message : "Failed to fetch ad",
    };
  }
}

/**
 * Track ad impression (matches original SDK)
 */
export async function trackImpression(adId: string, apiKey: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    await fetch(`${API_BASE_URL}/track/engagement/impression/${adId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error("Failed to track impression:", error);
  }
}

