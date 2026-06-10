import { SimulaAds, toNativePrivacy } from "../SimulaAds";
import { NativeModules } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("SimulaAds.initialize", () => {
  it("marshals a flat config with defaults applied", async () => {
    await SimulaAds.initialize({ apiKey: "key_123" });
    expect(native.initialize).toHaveBeenCalledTimes(1);
    expect(native.initialize).toHaveBeenCalledWith({
      apiKey: "key_123",
      devMode: false,
      primaryUserID: null,
      hasPrivacyConsent: true,
      telemetryEnabled: true,
      privacy: null,
    });
  });

  it("passes privacy through with undefined keys dropped", async () => {
    await SimulaAds.initialize({
      apiKey: "k",
      privacy: { coppaApplies: true, tcString: undefined },
    });
    const arg = native.initialize.mock.calls[0][0];
    expect(arg.privacy).toEqual({ coppaApplies: true });
  });

  it("rejects an empty apiKey", async () => {
    await expect(SimulaAds.initialize({ apiKey: "" })).rejects.toThrow(/apiKey/);
    expect(native.initialize).not.toHaveBeenCalled();
  });
});

describe("toNativePrivacy", () => {
  it("omits undefined fields and keeps explicit false", () => {
    expect(
      toNativePrivacy({
        hasPrivacyConsent: false,
        enableAdvertisingId: undefined,
        gdprApplies: true,
      }),
    ).toEqual({ hasPrivacyConsent: false, gdprApplies: true });
  });
});

describe("SimulaAds.isInitialized", () => {
  it("delegates to the native module", async () => {
    native.isInitialized.mockResolvedValueOnce(true);
    await expect(SimulaAds.isInitialized()).resolves.toBe(true);
  });
});
