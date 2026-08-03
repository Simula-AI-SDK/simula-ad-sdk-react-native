const devGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalDev = devGlobal.__DEV__;

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  if (originalDev === undefined) {
    delete devGlobal.__DEV__;
  } else {
    devGlobal.__DEV__ = originalDev;
  }
  jest.restoreAllMocks();
});

describe("warnAdsUnavailable", () => {
  it("is silent outside development", () => {
    devGlobal.__DEV__ = false;
    const { warnAdsUnavailable } = require("../nativeModules") as typeof import("../nativeModules");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    warnAdsUnavailable("initialize");

    expect(warn).not.toHaveBeenCalled();
  });

  it("is safe when the development global is absent", () => {
    delete devGlobal.__DEV__;
    const { warnAdsUnavailable } = require("../nativeModules") as typeof import("../nativeModules");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => warnAdsUnavailable("initialize")).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns only once in development", () => {
    devGlobal.__DEV__ = true;
    const { warnAdsUnavailable } = require("../nativeModules") as typeof import("../nativeModules");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    warnAdsUnavailable("initialize");
    warnAdsUnavailable("load");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Native module unavailable; initialize is a no-op"),
    );
  });
});

describe("unavailable native module behavior", () => {
  it("makes initialize a no-op before validating config", async () => {
    const reactNative = require("../../test/reactNativeMock") as typeof import("../../test/reactNativeMock");
    const adsModule = reactNative.NativeModules.SimulaAdsModule;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    delete reactNative.NativeModules.SimulaAdsModule;

    try {
      const { SimulaAds } = require("../../ads/SimulaAds") as typeof import("../../ads/SimulaAds");
      await expect(SimulaAds.initialize({ apiKey: "" })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      reactNative.NativeModules.SimulaAdsModule = adsModule;
    }
  });
});
