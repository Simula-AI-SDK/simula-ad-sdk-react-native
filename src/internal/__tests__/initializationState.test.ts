import {
  assertInitializationCompatible,
  markInitializationAccepted,
  resetAcceptedInitializationForTests,
  subscribeToAcceptedInitialization,
} from "../initializationState";

describe("accepted initialization key", () => {
  beforeEach(resetAcceptedInitializationForTests);

  it("replays an acceptance that happened before subscription", () => {
    markInitializationAccepted("accepted-before-mount");
    const listener = jest.fn();

    const unsubscribe = subscribeToAcceptedInitialization(listener);

    expect(listener).toHaveBeenCalledWith({
      apiKey: "accepted-before-mount",
    });
    unsubscribe();
  });

  it("treats the API key as process ownership", () => {
    markInitializationAccepted("same-key");

    expect(() =>
      assertInitializationCompatible("different-key"),
    ).toThrow(/different Simula SDK configuration/);
    expect(() =>
      assertInitializationCompatible("same-key"),
    ).not.toThrow();
  });
});
