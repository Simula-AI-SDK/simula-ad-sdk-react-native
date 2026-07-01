jest.mock("../../internal/ipv4Beacon", () => ({
  beaconOnInit: jest.fn(),
  beaconOnPpidUpdate: jest.fn(),
}));

import { SimulaAds, toNativePrivacy } from "../SimulaAds";
import { NativeModules } from "../../test/reactNativeMock";
import { beaconOnInit } from "../../internal/ipv4Beacon";

const native = NativeModules.SimulaAdsModule;
const beaconOnInitMock = beaconOnInit as jest.Mock;

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

  it("fires the beacon exactly once per initialize() call, using that call's own primaryUserID", async () => {
    await SimulaAds.initialize({ apiKey: "k", primaryUserID: "user-1" });
    expect(beaconOnInitMock).toHaveBeenCalledTimes(1);
    expect(beaconOnInitMock).toHaveBeenLastCalledWith({
      apiKey: "k",
      primaryUserID: "user-1",
    });
  });

  it("suppresses a stale initialize()'s beacon when a newer call has since started (out-of-order resolution)", async () => {
    let resolveStale!: () => void;
    native.initialize.mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveStale = resolve)),
    );
    // Older call: e.g. an anonymous init kicked off before login (no primaryUserID).
    const stale = SimulaAds.initialize({ apiKey: "k" });

    // Newer call starts (and fully resolves) BEFORE the older one — e.g.
    // SimulaProvider re-running init once the real primaryUserID is known.
    await SimulaAds.initialize({ apiKey: "k", primaryUserID: "user-2" });
    expect(beaconOnInitMock).toHaveBeenCalledTimes(1);
    expect(beaconOnInitMock).toHaveBeenLastCalledWith({
      apiKey: "k",
      primaryUserID: "user-2",
    });

    // The stale call's own native init now resolves late. Its beacon must be
    // suppressed — firing it would incorrectly bump the beacon's generation
    // and clear "user-2"'s freshly-claimed dedup state.
    resolveStale();
    await stale;
    expect(beaconOnInitMock).toHaveBeenCalledTimes(1); // still just the "user-2" call above
  });

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

describe("SimulaAds diagnostics", () => {
  it("userAgent / deviceId resolve the native values", async () => {
    native.getUserAgent.mockResolvedValueOnce("UA/9");
    native.getDeviceId.mockResolvedValueOnce("dev-9");
    await expect(SimulaAds.userAgent()).resolves.toBe("UA/9");
    await expect(SimulaAds.deviceId()).resolves.toBe("dev-9");
  });
});
