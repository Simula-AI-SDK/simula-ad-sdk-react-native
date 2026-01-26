/**
 * Simula API client for fetching contextual ads
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import { Message, AdData, SimulaTheme, GameData } from "../types";
import { NormalizedTheme, DEFAULT_THEME } from "../types/theme";

/**
 * Catalog response containing menu ID and games
 */
export interface CatalogResponse {
  menuId: string;
  games: GameData[];
}

// Production API URL (from original SDK)
const API_BASE_URL = "https://simula-api-701226639755.us-central1.run.app";
// const API_BASE_URL = "https://62d01abed0fd.ngrok-free.app";
// const API_BASE_URL = "https://splittable-unpatient-maxine.ngrok-free.dev";
// const API_BASE_URL = "https://murray-rats-prominent-tackle.trycloudflare.com";
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

    // Read response body (even on errors to see what server returned)
    let data: AdResponse;
    try {
      const responseText = await response.text();
      
      // Try to parse as JSON
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        data = { error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
      }
    } catch (readError) {
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
    // Silently fail
  }
}

/**
 * Track minigame menu click (matches original SDK)
 */
export async function trackMenuGameClick(
  menuId: string,
  gameName: string,
  apiKey: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    await fetch(`${API_BASE_URL}/minigames/menu/track/click`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        menu_id: menuId,
        game_name: gameName,
      }),
    });
  } catch (error) {
    // Silently fail - tracking is best effort
    console.log("Failed to track menu game click:", error);
  }
}

/**
 * Fetch game catalog (matches original SDK)
 */
export async function fetchCatalog(): Promise<CatalogResponse> {
  try {
    const response: Response = await fetch(`${API_BASE_URL}/minigames/catalogv2`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData: any = await response.json();
    
    // Extract menu_id from response
    const menuId: string = responseData.menu_id ?? '';
    
    // Handle different response formats: catalog.data or direct data array
    let gamesList: any[];
    if (responseData.catalog != null) {
      // New format: catalog is in the response
      const catalog = responseData.catalog;
      if (Array.isArray(catalog)) {
        gamesList = catalog;
      } else if (catalog && catalog.data != null) {
        // Nested format: catalog.data
        gamesList = catalog.data as any[];
      } else {
        // Fallback: try responseData.data for backwards compatibility
        gamesList = responseData.data ?? [];
      }
    } else {
      // Fallback: try responseData.data for backwards compatibility
      gamesList = responseData.data ?? [];
    }
    
    // Map API response to GameData format (icon -> iconUrl)
    const games: GameData[] = gamesList.map((game: any) => ({
      id: game.id,
      name: game.name,
      iconUrl: game.icon, // API returns 'icon', we use 'iconUrl'
      description: game.description ?? '',
      iconFallback: game.iconFallback,
    }));
    
    return {
      menuId,
      games,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Request interface for initializing minigame
 */
export interface InitMinigameRequest {
  gameType: string;
  sessionId: string;
  convId?: string | null;
  currencyMode?: boolean;
  w: number;
  h: number;
  char_id?: string;
  char_name?: string;
  char_image?: string;
  char_desc?: string;
  messages?: Message[];
  delegate_char?: boolean;
  menuId?: string;
}

/**
 * Response interface for minigame initialization
 */
export interface MinigameResponse {
  adType: "minigame";
  adInserted: boolean;
  adResponse: {
    ad_id: string;
    iframe_url: string;
  };
}

/**
 * Initialize minigame and get iframe URL (matches original SDK)
 */
export async function getMinigame(params: InitMinigameRequest): Promise<MinigameResponse> {
  try {
    const requestBody: Record<string, any> = {
      game_type: params.gameType,
      session_id: params.sessionId,
      conv_id: params.convId ?? null,
      currency_mode: params.currencyMode ?? false,
      w: params.w,
      h: params.h,
      char_id: params.char_id,
      char_name: params.char_name,
      char_image: params.char_image,
      char_desc: params.char_desc,
      messages: params.messages,
      delegate_char: params.delegate_char ?? true,
    };
    
    // Include menu_id if provided
    if (params.menuId) {
      requestBody.menu_id = params.menuId;
    }
    
    const response: Response = await fetch(`${API_BASE_URL}/minigames/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: MinigameResponse = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch fallback ad after minigame closes (matches original SDK)
 */
export async function fetchAdForMinigame(aid: string): Promise<string | null> {
  try {
    const response: Response = await fetch(`${API_BASE_URL}/minigames/fallback_ad/${aid}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: MinigameResponse = await response.json();
    
    if (data.adResponse && data.adResponse.iframe_url) {
      return data.adResponse.iframe_url;
    }

    return null;
  } catch (error) {
    return null;
  }
}

