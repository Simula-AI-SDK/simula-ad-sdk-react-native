import { SimulaAds, toNativePrivacy } from "../SimulaAds";
import { NativeModules } from "../../test/reactNativeMock";

const native = NativeModules.SimulaAdsModule;

function malformedJsonValues(): unknown[] {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      throw new Error("nope");
    },
  });
  return [
    cycle,
    { value: 1n },
    getter,
    {
      toJSON() {
        throw new Error("nope");
      },
    },
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("nope");
        },
      },
    ),
  ];
}

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
  });

  it.each([undefined, null, "", " ", "\t\n"])(
    "maps blank primaryUserID %p to null",
    async (primaryUserID) => {
      await SimulaAds.initialize({ apiKey: "k", primaryUserID } as never);
      expect(native.initialize.mock.calls[0][0].primaryUserID).toBeNull();
    },
  );

  it.each(["user-123", " user-123 ", "\tuser-123\n"])(
    "preserves nonblank primaryUserID %p verbatim",
    async (primaryUserID) => {
      await SimulaAds.initialize({ apiKey: "k", primaryUserID });
      expect(native.initialize.mock.calls[0][0].primaryUserID).toBe(primaryUserID);
    },
  );

  it("passes privacy through with undefined keys dropped", async () => {
    await SimulaAds.initialize({
      apiKey: "k",
      privacy: { coppaApplies: true, tcString: undefined },
    });
    const arg = native.initialize.mock.calls[0][0];
    expect(arg.privacy).toEqual({ coppaApplies: true });
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

  it("omits every malformed privacy and customContext shape", async () => {
    for (const malformed of malformedJsonValues()) {
      await SimulaAds.initialize({
        apiKey: "k",
        privacy: malformed as never,
        adContext: { category: "sports", customContext: malformed as never },
      });

      expect(native.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({
          privacy: null,
          adContext: { category: "sports" },
        }),
      );
    }
    expect(native.initialize).toHaveBeenCalledTimes(malformedJsonValues().length);
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

  it("rejects an empty apiKey", async () => {
    await expect(SimulaAds.initialize({ apiKey: "" })).rejects.toThrow(/apiKey/);
    expect(native.initialize).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 7, "", "   "])(
    "rejects invalid apiKey %p before native",
    async (apiKey) => {
      await expect(
        SimulaAds.initialize({ apiKey } as never),
      ).rejects.toBeInstanceOf(TypeError);
      expect(native.initialize).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid required IDs before native", async () => {
    for (const invalid of [null, undefined, 7, "", " \t "]) {
      await expect(
        SimulaAds.checkFrequencyCap(invalid as never),
      ).rejects.toBeInstanceOf(TypeError);
      expect(() => SimulaAds.destroyPreloadedAd(invalid as never)).toThrow(
        TypeError,
      );
    }
    expect(native.checkFrequencyCap).not.toHaveBeenCalled();
    expect(native.destroyPreloadedAd).not.toHaveBeenCalled();
  });

  it("keeps optional IDs optional but rejects malformed provided values", async () => {
    await SimulaAds.preloadNativeAd();
    SimulaAds.invalidateNativeAd();
    expect(native.preloadNativeAd).toHaveBeenCalledWith(null, 0, null);
    expect(native.invalidateNativeAd).toHaveBeenCalledWith(null, 0);

    await expect(
      SimulaAds.preloadNativeAd({ adUnitId: " " }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(() =>
      SimulaAds.invalidateNativeAd({ adUnitId: 1 as never }),
    ).toThrow(TypeError);
    expect(native.preloadNativeAd).toHaveBeenCalledTimes(1);
    expect(native.invalidateNativeAd).toHaveBeenCalledTimes(1);
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
});

describe("SimulaAds diagnostics", () => {
  it("userAgent / deviceId resolve the native values", async () => {
    native.getUserAgent.mockResolvedValueOnce("UA/9");
    native.getDeviceId.mockResolvedValueOnce("dev-9");
    await expect(SimulaAds.userAgent()).resolves.toBe("UA/9");
    await expect(SimulaAds.deviceId()).resolves.toBe("dev-9");
  });
});
