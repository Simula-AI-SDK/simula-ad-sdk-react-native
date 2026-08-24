let acceptedApiKey: string | null = null;
const listeners = new Set<(apiKey: string | null) => void>();

export function getAcceptedApiKey(): string | null {
  return acceptedApiKey;
}

export function markApiKeyAccepted(apiKey: string): void {
  if (acceptedApiKey === apiKey) return;
  acceptedApiKey = apiKey;
  listeners.forEach((listener) => listener(apiKey));
}

export function subscribeToAcceptedApiKey(
  listener: (apiKey: string | null) => void,
): () => void {
  listeners.add(listener);
  // Close the render-to-effect window: initialization may have completed before this subscriber
  // was installed, so always replay the current process owner.
  listener(acceptedApiKey);
  return () => listeners.delete(listener);
}
