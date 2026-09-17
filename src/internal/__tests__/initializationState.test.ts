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

  it("treats the environment as part of process ownership", () => {
    markInitializationAccepted("same-key", "production");

    expect(() =>
      assertInitializationCompatible("same-key", "staging"),
    ).toThrow(/different Simula SDK configuration/);
    expect(() =>
      assertInitializationCompatible("same-key", "production"),
    ).not.toThrow();
  });
});
