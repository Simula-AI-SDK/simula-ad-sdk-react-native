const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDev = devGlobal.__DEV__;

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  devGlobal.__DEV__ = originalDev;
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
