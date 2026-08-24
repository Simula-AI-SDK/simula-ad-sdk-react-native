import React from "react";
import { useMiniGamePreload } from "../useMiniGamePreload";
import { SimulaProvider } from "../../context/SimulaProvider";
import { NativeModules, __reset } from "../../test/reactNativeMock";
import { mount, runInAct } from "../../test/reactHarness";

const native = NativeModules.SimulaAdsModule;
const miniGameNative = NativeModules.SimulaMiniGameModule;

function preloadProbe(
  apiKey: string,
  onPreload: (preload: () => Promise<void>) => void,
  primaryUserID?: string,
  overrides: Partial<React.ComponentProps<typeof SimulaProvider>> = {},
): React.ReactElement {
  function Probe(): null {
    onPreload(useMiniGamePreload());
    return null;
  }
  return React.createElement(SimulaProvider, {
    apiKey,
    primaryUserID,
    initializeOnMount: false,
    children: React.createElement(Probe),
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

describe("useMiniGamePreload lifecycle", () => {
  it("forwards current provider values and updates after rerender", async () => {
    let preload: (() => Promise<void>) | undefined;
    const capture = (next: () => Promise<void>) => {
      preload = next;
    };
    const tree = await mount(
      preloadProbe("first-key", capture, "user-1", {
        privacy: { enableAdvertisingId: true, coppaApplies: false },
        telemetryEnabled: false,
        adContext: { category: "games" },
      }),
    );
    await runInAct(async () => {
      await preload?.();
    });
    expect(native.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "first-key",
        primaryUserID: "user-1",
        privacy: expect.objectContaining({ enableAdvertisingId: true }),
        telemetryEnabled: false,
        adContext: expect.objectContaining({ category: "games" }),
      }),
    );
    expect(miniGameNative.preload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "first-key",
        privacy: expect.objectContaining({ enableAdvertisingId: true }),
        telemetryEnabled: false,
        adContext: expect.objectContaining({ category: "games" }),
      }),
    );

    await tree.update(preloadProbe("second-key", capture));
    await runInAct(async () => {
      await preload?.();
    });
    expect(native.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "second-key", primaryUserID: null }),
    );
    await tree.unmount();
  });

  it("skips a blank key and absorbs native rejection", async () => {
    let preload: (() => Promise<void>) | undefined;
    const blank = await mount(
      preloadProbe(" ", (next) => {
        preload = next;
      }),
    );
    await runInAct(async () => {
      await expect(preload?.()).resolves.toBeUndefined();
    });
    expect(native.initialize).not.toHaveBeenCalled();
    await blank.unmount();

    native.initialize.mockRejectedValueOnce(new Error("offline"));
    const valid = await mount(
      preloadProbe("api-key", (next) => {
        preload = next;
      }),
    );
    await runInAct(async () => {
      await expect(preload?.()).resolves.toBeUndefined();
    });
    await valid.unmount();
  });
});
