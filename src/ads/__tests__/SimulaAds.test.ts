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
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
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
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("drops malformed top-level adContext fields without clearing valid fields", async () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    await SimulaAds.initialize({
      apiKey: "k",
      adContext: {
        category: "sports",
        title: cycle as never,
        customContext: { tier: "pro" },
      },
    });

    expect(native.initialize.mock.calls[0][0].adContext).toEqual({
      category: "sports",
      customContext: { tier: "pro" },
    });
  });

  it("propagates native initialization conflicts", async () => {
    const conflict = Object.assign(new Error("different process key"), {
      code: "INITIALIZATION_CONFLICT",
    });
    native.initialize.mockRejectedValueOnce(conflict);

    await expect(SimulaAds.initialize({ apiKey: "second-key" })).rejects.toMatchObject({
      code: "INITIALIZATION_CONFLICT",
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
});

describe("SimulaAds native-ad imperatives", () => {
  it("preloadNativeAd resolves the native id with defaults applied", async () => {
    native.preloadNativeAd.mockResolvedValueOnce("ad_xyz");
    await expect(SimulaAds.preloadNativeAd({ adUnitId: "feed_1" })).resolves.toBe(
      "ad_xyz",
    );
    expect(native.preloadNativeAd).toHaveBeenCalledWith("feed_1", 0, null);
  });

  it("ignores a legacy runtime metadata field and keeps preload metadata-free", async () => {
    await SimulaAds.preloadNativeAd({
      adUnitId: "feed_1",
      metadata: { screen: "search" },
    } as never);

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

  it("fails open or no-ops for invalid IDs before native", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const invalid of [null, undefined, 7, "", " \t "]) {
      await expect(
        SimulaAds.checkFrequencyCap(invalid as never),
      ).resolves.toBe(false);
      expect(() =>
        SimulaAds.destroyPreloadedAd(invalid as never),
      ).not.toThrow();
    }
    expect(native.checkFrequencyCap).not.toHaveBeenCalled();
    expect(native.destroyPreloadedAd).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(10);
    warn.mockRestore();
  });

  it("keeps optional IDs optional and makes invalid cleanup IDs no-ops", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await SimulaAds.preloadNativeAd();
    SimulaAds.invalidateNativeAd();
    expect(native.preloadNativeAd).toHaveBeenCalledWith(null, 0, null);
    expect(native.invalidateNativeAd).toHaveBeenCalledWith(null, 0);

    await expect(SimulaAds.preloadNativeAd({ adUnitId: " " })).resolves.toBeNull();
    expect(() =>
      SimulaAds.invalidateNativeAd({ adUnitId: 1 as never }),
    ).not.toThrow();
    expect(native.preloadNativeAd).toHaveBeenCalledTimes(1);
    expect(native.invalidateNativeAd).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
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

  it.each([undefined, null, "", " ", "\t\n"])(
    "maps blank value %p to null (clear)",
    (id) => {
      SimulaAds.updatePrimaryUserID(id);
      expect(native.updatePrimaryUserID).toHaveBeenCalledWith(null);
    },
  );
});

describe("SimulaAds preload concurrency", () => {
  it("keeps reverse-resolving preloads associated with their callers", async () => {
    const resolvers: Array<(value: string) => void> = [];
    native.preloadNativeAd.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const first = SimulaAds.preloadNativeAd({ adUnitId: "first", position: 1 });
    const second = SimulaAds.preloadNativeAd({ adUnitId: "second", position: 2 });
    const third = SimulaAds.preloadNativeAd({ adUnitId: "third", position: 3 });
    resolvers[2]("third-id");
    resolvers[1]("second-id");
    resolvers[0]("first-id");

    await expect(Promise.all([first, second, third])).resolves.toEqual([
      "first-id",
      "second-id",
      "third-id",
    ]);
    expect(native.preloadNativeAd.mock.calls).toEqual([
      ["first", 1, null],
      ["second", 2, null],
      ["third", 3, null],
    ]);
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

  it("propagates native nulls before initialization", async () => {
    native.isInitialized.mockResolvedValueOnce(false);
    native.getUserAgent.mockResolvedValueOnce(null);
    native.getDeviceId.mockResolvedValueOnce(null);

    await expect(SimulaAds.isInitialized()).resolves.toBe(false);
    await expect(SimulaAds.userAgent()).resolves.toBeNull();
    await expect(SimulaAds.deviceId()).resolves.toBeNull();
  });
});
