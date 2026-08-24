import React, { StrictMode } from "react";
import { SimulaProvider, useSimulaContext } from "../SimulaProvider";
import { SimulaAds } from "../../ads/SimulaAds";
import { NativeModules, __reset } from "../../test/reactNativeMock";
import { mount } from "../../test/reactHarness";

const native = NativeModules.SimulaAdsModule;

function providerElement(
  overrides: Partial<React.ComponentProps<typeof SimulaProvider>> = {},
): React.ReactElement {
  return React.createElement(SimulaProvider, {
    apiKey: "api-key",
    hasPrivacyConsent: true,
    primaryUserID: "user-1",
    privacy: { coppaApplies: false },
    adContext: { category: "feed" },
    children: null,
    ...overrides,
  });
}

beforeEach(() => {
  __reset();
  jest.clearAllMocks();
});

afterEach(() => {
  __reset();
});

describe("SimulaProvider lifecycle", () => {
  it("initializes with one complete snapshot", async () => {
    const tree = await mount(providerElement());
    expect(native.initialize).toHaveBeenCalledTimes(1);
    expect(native.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "api-key",
        primaryUserID: "user-1",
        hasPrivacyConsent: true,
        privacy: expect.objectContaining({ coppaApplies: false }),
        adContext: expect.objectContaining({ category: "feed" }),
      }),
    );
    await tree.unmount();
  });

  it("does not initialize for a blank key or when disabled", async () => {
    const blank = await mount(providerElement({ apiKey: " " }));
    const disabled = await mount(providerElement({ initializeOnMount: false }));
    expect(native.initialize).not.toHaveBeenCalled();
    await blank.unmount();
    await disabled.unmount();
  });

  it("does not replay initial runtime updates in StrictMode", async () => {
    const tree = await mount(
      React.createElement(StrictMode, null, providerElement()),
    );
    expect(native.updateConsent).not.toHaveBeenCalled();
    expect(native.updateContext).not.toHaveBeenCalled();
    expect(native.updatePrimaryUserID).not.toHaveBeenCalled();
    await tree.unmount();
  });

  it("pushes changed consent, context, and PPID once", async () => {
    const tree = await mount(providerElement());
    await tree.update(
      providerElement({
        hasPrivacyConsent: false,
        privacy: { coppaApplies: true },
        adContext: { category: "profile" },
        primaryUserID: "user-2",
      }),
    );
    expect(native.applyConsent).toHaveBeenCalledTimes(1);
    expect(native.updateContext).toHaveBeenCalledTimes(1);
    expect(native.updatePrimaryUserID).toHaveBeenCalledWith("user-2");
    await tree.unmount();
  });

  it("does not apply runtime state from a rejected process key", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const tree = await mount(providerElement());
    native.initialize.mockRejectedValueOnce(
      Object.assign(new Error("different process key"), {
        code: "INITIALIZATION_CONFLICT",
      }),
    );

    await tree.update(
      providerElement({
        apiKey: "second-key",
        hasPrivacyConsent: false,
        privacy: { coppaApplies: true },
        adContext: { category: "other-key" },
        primaryUserID: "other-user",
      }),
    );

    expect(native.applyConsent).not.toHaveBeenCalled();
    expect(native.updateContext).not.toHaveBeenCalled();
    expect(native.updatePrimaryUserID).not.toHaveBeenCalled();
    await tree.unmount();
    error.mockRestore();
  });

  it("gates manual-provider updates by the explicitly accepted key", async () => {
    await SimulaAds.initialize({ apiKey: "manual-key" });
    const tree = await mount(
      providerElement({ apiKey: "other-key", initializeOnMount: false }),
    );

    await tree.update(
      providerElement({
        apiKey: "other-key",
        initializeOnMount: false,
        privacy: { coppaApplies: true },
        adContext: { category: "other-key" },
        primaryUserID: "other-user",
      }),
    );

    expect(native.applyConsent).not.toHaveBeenCalled();
    expect(native.updateContext).not.toHaveBeenCalled();
    expect(native.updatePrimaryUserID).not.toHaveBeenCalled();
    await tree.unmount();
  });

  it("replaces removed privacy fields instead of leaving stale native values", async () => {
    const tree = await mount(
      providerElement({ privacy: { enableAdvertisingId: true, coppaApplies: true } }),
    );
    await tree.update(providerElement({ privacy: {} }));

    expect(native.applyConsent).toHaveBeenCalledWith({ hasPrivacyConsent: true });
    expect(native.updateConsent).not.toHaveBeenCalled();
    await tree.unmount();
  });

  it("throws when context is consumed outside the provider", async () => {
    function Probe(): null {
      useSimulaContext();
      return null;
    }
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(mount(React.createElement(Probe))).rejects.toThrow(
      "useSimulaContext must be used within SimulaProvider",
    );
    error.mockRestore();
  });
});
