/**
 * Session management utilities
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

/**
 * Generate a unique session ID
 * Format: timestamp-random
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}`;
}

/**
 * Validate session ID format
 */
export function isValidSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== "string") {
    return false;
  }

  // Check basic format: timestamp-random
  const parts = sessionId.split("-");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}


