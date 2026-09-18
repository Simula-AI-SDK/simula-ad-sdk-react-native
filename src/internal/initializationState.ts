export interface AcceptedInitialization {
  apiKey: string;
}

let acceptedInitialization: AcceptedInitialization | null = null;
const listeners = new Set<
  (initialization: AcceptedInitialization | null) => void
>();

export function getAcceptedInitialization(): AcceptedInitialization | null {
  return acceptedInitialization;
}

export function assertInitializationCompatible(
  apiKey: string,
): void {
  const accepted = acceptedInitialization;
  if (accepted == null || accepted.apiKey === apiKey) {
    return;
  }
  throw Object.assign(
    new Error("The process is already owned by a different Simula SDK configuration"),
    { code: "INITIALIZATION_CONFLICT" },
  );
}

export function markInitializationAccepted(
  apiKey: string,
): void {
  assertInitializationCompatible(apiKey);
  if (acceptedInitialization != null) return;
  acceptedInitialization = { apiKey };
  listeners.forEach((listener) => listener(acceptedInitialization));
}

export function subscribeToAcceptedInitialization(
  listener: (initialization: AcceptedInitialization | null) => void,
): () => void {
  listeners.add(listener);
  // Close the render-to-effect window: initialization may have completed before this subscriber
  // was installed, so always replay the current process owner.
  listener(acceptedInitialization);
  return () => listeners.delete(listener);
}

/** Test-only process reset; production code never clears first-owner state. */
export function resetAcceptedInitializationForTests(): void {
  acceptedInitialization = null;
  listeners.clear();
}
