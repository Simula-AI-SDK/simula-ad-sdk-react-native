import type { SimulaAPIEnvironment } from "../ads/SimulaAds";

export interface AcceptedInitialization {
  apiKey: string;
  apiEnvironment: SimulaAPIEnvironment;
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
  apiEnvironment: SimulaAPIEnvironment,
): void {
  const accepted = acceptedInitialization;
  if (accepted == null || (accepted.apiKey === apiKey && accepted.apiEnvironment === apiEnvironment)) {
    return;
  }
  throw Object.assign(
    new Error("The process is already owned by a different Simula SDK configuration"),
    { code: "INITIALIZATION_CONFLICT" },
  );
}

export function markInitializationAccepted(
  apiKey: string,
  apiEnvironment: SimulaAPIEnvironment,
): void {
  assertInitializationCompatible(apiKey, apiEnvironment);
  if (acceptedInitialization != null) return;
  acceptedInitialization = { apiKey, apiEnvironment };
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
