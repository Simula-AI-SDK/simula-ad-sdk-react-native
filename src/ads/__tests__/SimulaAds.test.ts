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
      adContext: null,
    });
    expect(native.getDeviceId).not.toHaveBeenCalled();
  });

  it("passes privacy through with undefined keys dropped", async () => {
    await SimulaAds.initialize({
      apiKey: "k",
      privacy: { coppaApplies: true, tcString: undefined },
    });
    const arg = native.initialize.mock.calls[0][0];
    expect(arg.privacy).toEqual({ coppaApplies: true });
  });

  it("sends detached JSON clones rather than host-owned objects", async () => {
    const customContext = { nested: { tier: "pro" } };
    const adContext = { customContext };
    await SimulaAds.initialize({ apiKey: "k", adContext });

    const bridged = native.initialize.mock.calls[0][0].adContext;
    expect(bridged).toEqual(adContext);
    expect(bridged).not.toBe(adContext);
    expect(bridged.customContext).not.toBe(customContext);
    expect(bridged.customContext.nested).not.toBe(customContext.nested);
  });

  it("preserves granular revocation and valid siblings beside malformed privacy fields", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const privacy = {
      hasPrivacyConsent: false,
      coppaApplies: true,
      uspString: "1YNN",
      gppSid: 7,
      tcString: circular,
      extra: BigInt(1),
    } as unknown as Parameters<typeof toNativePrivacy>[0];
    await SimulaAds.initialize({
      apiKey: "k",
      hasPrivacyConsent: true,
      privacy,
    });

    expect(native.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "k",
        hasPrivacyConsent: false,
        privacy: {
          hasPrivacyConsent: false,
          coppaApplies: true,
          uspString: "1YNN",
          gppSid: "7",
        },
      }),
    );
  });

  it("marshals adContext with undefined keys dropped", async () => {
    await SimulaAds.initialize({
      apiKey: "k",
      adContext: {
        category: "sports",
        tags: ["nba", "finals"],
        searchTerm: undefined,
        customContext: { tier: "pro", score: 42 },
      },
    });
    const arg = native.initialize.mock.calls[0][0];
    expect(arg.adContext).toEqual({
      category: "sports",
      tags: ["nba", "finals"],
      customContext: { tier: "pro", score: 42 },
    });
  });
});

describe("SimulaAds.updateContext", () => {
  it("marshals a context replacement", () => {
    SimulaAds.updateContext({ category: "news" });
    expect(native.updateContext).toHaveBeenCalledWith({ category: "news" });
  });

  it("sends an empty object to clear", () => {
    SimulaAds.updateContext(null);
    expect(native.updateContext).toHaveBeenCalledWith({});
  });

  it("keeps valid context siblings and entries beside malformed custom context", () => {
    const customContext: Record<string, unknown> = {
      keep: { tier: "pro" },
      bad: BigInt(1),
    };
    customContext.circular = customContext;
    SimulaAds.updateContext({
      category: "news",
      tags: ["valid", 42] as unknown as string[],
      customContext,
    });
    expect(native.updateContext).toHaveBeenCalledWith({
      category: "news",
      tags: ["valid"],
      customContext: { keep: { tier: "pro" } },
    });
  });
});

describe("SimulaAds native-ad imperatives", () => {
  it("preloadNativeAd resolves the native id with defaults applied", async () => {
    native.preloadNativeAd.mockResolvedValueOnce("ad_xyz");
    await expect(SimulaAds.preloadNativeAd({ adUnitId: "feed_1" })).resolves.toBe(
      "ad_xyz",
    );
    expect(native.preloadNativeAd).toHaveBeenCalledWith("feed_1", 0, null);
  });

  it("preloadNativeAd passes null adUnitId / theme when omitted", async () => {
    await SimulaAds.preloadNativeAd({ position: 3, theme: "dark" });
    expect(native.preloadNativeAd).toHaveBeenCalledWith(null, 3, "dark");
  });

  it("destroys a nonempty preload id that arrives after the JS timeout", async () => {
    jest.useFakeTimers();
    let resolveNative: (value: string | null) => void = () => {};
    native.preloadNativeAd.mockImplementationOnce(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const outcome = SimulaAds.preloadNativeAd();
    jest.advanceTimersByTime(10_000);
    await expect(outcome).resolves.toBeNull();
    resolveNative("late_ad");
    await Promise.resolve();

    expect(native.destroyPreloadedAd).toHaveBeenCalledTimes(1);
    expect(native.destroyPreloadedAd).toHaveBeenCalledWith("late_ad");
    jest.useRealTimers();
  });

  it("does not destroy an empty late preload result", async () => {
    jest.useFakeTimers();
    let resolveNative: (value: string | null) => void = () => {};
    native.preloadNativeAd.mockImplementationOnce(
      () => new Promise((resolve) => { resolveNative = resolve; }),
    );

    const outcome = SimulaAds.preloadNativeAd();
    jest.advanceTimersByTime(10_000);
    await outcome;
    resolveNative(null);
    await Promise.resolve();

    expect(native.destroyPreloadedAd).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("invalidateNativeAd defaults position to 0", () => {
    SimulaAds.invalidateNativeAd({ adUnitId: "feed_1" });
    expect(native.invalidateNativeAd).toHaveBeenCalledWith("feed_1", 0);
  });

  it("invalidateNativeAds + destroyPreloadedAd delegate to native", () => {
    SimulaAds.invalidateNativeAds();
    SimulaAds.destroyPreloadedAd("ad_xyz");
    expect(native.invalidateNativeAds).toHaveBeenCalledTimes(1);
    expect(native.destroyPreloadedAd).toHaveBeenCalledWith("ad_xyz");
  });

  it("destroyPreloadedAd throws a TypeError for an invalid id before any native call", () => {
    expect(() =>
      SimulaAds.destroyPreloadedAd(null as unknown as string),
    ).toThrow(TypeError);
    expect(() => SimulaAds.destroyPreloadedAd("")).toThrow(TypeError);
    expect(native.destroyPreloadedAd).not.toHaveBeenCalled();
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

  it("normalizes each field independently and accepts numeric gppSid", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(
      toNativePrivacy({
        hasPrivacyConsent: false,
        coppaApplies: true,
        gppSid: 2,
        tcString: circular,
        extra: BigInt(1),
      } as unknown as Parameters<typeof toNativePrivacy>[0]),
    ).toEqual({
      hasPrivacyConsent: false,
      coppaApplies: true,
      gppSid: "2",
    });
  });
});

describe("SimulaAds.isInitialized", () => {
  it("delegates to the native module", async () => {
    native.isInitialized.mockResolvedValueOnce(true);
    await expect(SimulaAds.isInitialized()).resolves.toBe(true);
  });
});

describe("SimulaAds.updatePrimaryUserID", () => {
  it("passes the id through to native", () => {
    SimulaAds.updatePrimaryUserID("user-123");
    expect(native.updatePrimaryUserID).toHaveBeenCalledWith("user-123");
  });

  it("maps undefined / empty to null (clear)", () => {
    SimulaAds.updatePrimaryUserID();
    SimulaAds.updatePrimaryUserID(null);
    expect(native.updatePrimaryUserID).toHaveBeenNthCalledWith(1, null);
    expect(native.updatePrimaryUserID).toHaveBeenNthCalledWith(2, null);
  });
});

describe("SimulaAds.checkFrequencyCap", () => {
  it("resolves the native value", async () => {
    native.checkFrequencyCap.mockResolvedValueOnce(true);
    await expect(SimulaAds.checkFrequencyCap("unit_1")).resolves.toBe(true);
  });

  it("passes null when primaryUserID is omitted", async () => {
    await SimulaAds.checkFrequencyCap("unit_1");
    expect(native.checkFrequencyCap).toHaveBeenCalledWith("unit_1", null);
  });

  it("passes an explicit primaryUserID through", async () => {
    await SimulaAds.checkFrequencyCap("unit_1", "user-123");
    expect(native.checkFrequencyCap).toHaveBeenCalledWith("unit_1", "user-123");
  });

  it("fails open (false) when the native call rejects", async () => {
    native.checkFrequencyCap.mockRejectedValueOnce(new Error("bridge down"));
    await expect(SimulaAds.checkFrequencyCap("unit_1")).resolves.toBe(false);
  });

  it("throws a TypeError for an invalid adUnitId before any native call", async () => {
    await expect(
      SimulaAds.checkFrequencyCap(undefined as unknown as string),
    ).rejects.toThrow(TypeError);
    await expect(SimulaAds.checkFrequencyCap("")).rejects.toThrow(TypeError);
    expect(native.checkFrequencyCap).not.toHaveBeenCalled();
  });
});

describe("SimulaAds diagnostics", () => {
  it("userAgent / deviceId resolve the native values", async () => {
    native.getUserAgent.mockResolvedValueOnce("UA/9");
    native.getDeviceId.mockResolvedValueOnce("dev-9");
    await expect(SimulaAds.userAgent()).resolves.toBe("UA/9");
    await expect(SimulaAds.deviceId()).resolves.toBe("dev-9");
  });
});
