import {
  assertInitializationCompatible,
  markInitializationAccepted,
  resetAcceptedInitializationForTests,
  subscribeToAcceptedInitialization,
} from "../initializationState";

describe("accepted initialization key", () => {
  beforeEach(resetAcceptedInitializationForTests);

  it("replays an acceptance that happened before subscription", () => {
    markInitializationAccepted("accepted-before-mount", "staging");
    const listener = jest.fn();

    const unsubscribe = subscribeToAcceptedInitialization(listener);

    expect(listener).toHaveBeenCalledWith({
      apiKey: "accepted-before-mount",
      apiEnvironment: "staging",
    });
    unsubscribe();
  });

  it("treats the API key as process ownership", () => {
    markInitializationAccepted("same-key", "production");

    expect(() =>
      assertInitializationCompatible("different-key", "production"),
    ).toThrow(/different Simula SDK configuration/);
    expect(() =>
      assertInitializationCompatible("same-key", "production"),
    ).not.toThrow();
  });
});
