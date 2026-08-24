import {
  markApiKeyAccepted,
  subscribeToAcceptedApiKey,
} from "../initializationState";

describe("accepted initialization key", () => {
  it("replays an acceptance that happened before subscription", () => {
    markApiKeyAccepted("accepted-before-mount");
    const listener = jest.fn();

    const unsubscribe = subscribeToAcceptedApiKey(listener);

    expect(listener).toHaveBeenCalledWith("accepted-before-mount");
    unsubscribe();
  });
});
