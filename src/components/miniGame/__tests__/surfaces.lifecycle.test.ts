import React from "react";
import { MiniGameMenu } from "../MiniGameMenu";
import { MiniGameInvitation } from "../MiniGameInvitation";
import { MiniGameInterstitial } from "../MiniGameInterstitial";
import { CharacterSelector } from "../../CharacterSelector";
import { SimulaProvider } from "../../../context/SimulaProvider";
import {
  NativeModules,
  __emit,
  __listenerCount,
  __reset,
} from "../../../test/reactNativeMock";
import { deferred, mount, runInAct } from "../../../test/reactHarness";

const native = NativeModules.SimulaMiniGameModule;

interface SurfaceCase {
  name: string;
  component: React.ComponentType<any>;
  show: string;
  hide: string;
  closeEvent: string;
  clickEvent?: string;
  props: Record<string, unknown>;
}

const surfaces: SurfaceCase[] = [
  {
    name: "menu",
    component: MiniGameMenu,
    show: "showMiniGameMenu",
    hide: "hideMiniGameMenu",
    closeEvent: "onMiniGameMenuClose",
    props: {
      charName: "Character",
      charID: "character-id",
      charImage: "https://example.com/character.png",
    },
  },
  {
    name: "invitation",
    component: MiniGameInvitation,
    show: "showMiniGameInvitation",
    hide: "hideMiniGameInvitation",
    closeEvent: "onMiniGameInvitationClose",
    clickEvent: "onMiniGameInvitationClick",
    props: { charImage: "https://example.com/character.png" },
  },
  {
    name: "interstitial",
    component: MiniGameInterstitial,
    show: "showMiniGameInterstitial",
    hide: "hideMiniGameInterstitial",
    closeEvent: "onMiniGameInterstitialClose",
    clickEvent: "onMiniGameInterstitialClick",
    props: { charImage: "https://example.com/character.png" },
  },
  {
    name: "character selector",
    component: CharacterSelector,
    show: "showCharacterSelector",
    hide: "hideCharacterSelector",
    closeEvent: "onCharacterSelectorClose",
    props: { onCharacterSelected: jest.fn() },
  },
];

function surfaceElement(
  surface: SurfaceCase,
  isOpen: boolean,
  apiKey: string,
  onClose: jest.Mock,
  onClick: jest.Mock,
  providerOverrides: Partial<React.ComponentProps<typeof SimulaProvider>> = {},
): React.ReactElement {
  const child = React.createElement(surface.component, {
    ...surface.props,
    isOpen,
    onClose,
    onClick,
  });
  return React.createElement(SimulaProvider, {
    apiKey,
    initializeOnMount: false,
    children: child,
    ...providerOverrides,
  });
}

beforeEach(() => {
  __reset();
  jest.clearAllMocks();
});

afterEach(() => {
  __reset();
});

describe.each(surfaces)("$name surface lifecycle", (surface) => {
  it("initializes canonically with the complete provider snapshot before showing", async () => {
    const show = native[surface.show] as jest.Mock;
    const ads = NativeModules.SimulaAdsModule;
    const tree = await mount(
      surfaceElement(surface, true, "api-key", jest.fn(), jest.fn(), {
        privacy: { enableAdvertisingId: true, coppaApplies: false },
        telemetryEnabled: false,
        adContext: { category: "games" },
      }),
    );

    expect(ads.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "api-key",
        privacy: expect.objectContaining({ enableAdvertisingId: true }),
        telemetryEnabled: false,
        adContext: expect.objectContaining({ category: "games" }),
      }),
    );
    expect(ads.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      show.mock.invocationCallOrder[0],
    );
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        privacy: expect.objectContaining({ enableAdvertisingId: true }),
        telemetryEnabled: false,
        adContext: expect.objectContaining({ category: "games" }),
      }),
    );
    await tree.unmount();
  });

  it("ignores stale native events while canonical initialization is pending", async () => {
    const ads = NativeModules.SimulaAdsModule;
    const initialization = deferred<null>();
    ads.initialize.mockReturnValueOnce(initialization.promise);
    const onClose = jest.fn();
    const onClick = jest.fn();
    const tree = await mount(
      surfaceElement(surface, true, "api-key", onClose, onClick),
    );

    await runInAct(() => {
      __emit(surface.closeEvent, {});
      if (surface.clickEvent) __emit(surface.clickEvent, {});
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    await runInAct(() => initialization.resolve(null));
    expect(native[surface.show]).toHaveBeenCalledTimes(1);
    await tree.unmount();
  });

  it("does not present after canonical initialization rejects", async () => {
    const ads = NativeModules.SimulaAdsModule;
    const show = native[surface.show] as jest.Mock;
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    ads.initialize.mockRejectedValueOnce(
      Object.assign(new Error("different process key"), {
        code: "INITIALIZATION_CONFLICT",
      }),
    );

    const tree = await mount(
      surfaceElement(surface, true, "second-key", jest.fn(), jest.fn()),
    );

    expect(show).not.toHaveBeenCalled();
    await tree.unmount();
    error.mockRestore();
  });

  it("permits a new open attempt after native show rejects", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const show = native[surface.show] as jest.Mock;
    show.mockRejectedValueOnce(new Error("presentation failed"));
    const onClose = jest.fn();
    const onClick = jest.fn();

    const tree = await mount(
      surfaceElement(surface, true, "api-key", onClose, onClick),
    );
    expect(show).toHaveBeenCalledTimes(1);
    await tree.update(
      surfaceElement(surface, false, "api-key", onClose, onClick),
    );
    await tree.update(
      surfaceElement(surface, true, "api-key", onClose, onClick),
    );
    expect(show).toHaveBeenCalledTimes(2);

    await tree.unmount();
    error.mockRestore();
  });

  it("handles 50 rapid open-close cycles without duplicate transitions", async () => {
    const show = native[surface.show] as jest.Mock;
    const hide = native[surface.hide] as jest.Mock;
    const onClose = jest.fn();
    const onClick = jest.fn();
    const tree = await mount(
      surfaceElement(surface, false, "api-key", onClose, onClick),
    );

    for (let cycle = 0; cycle < 50; cycle += 1) {
      await tree.update(
        surfaceElement(surface, true, "api-key", onClose, onClick),
      );
      await tree.update(
        surfaceElement(surface, true, "api-key", onClose, onClick),
      );
      await tree.update(
        surfaceElement(surface, false, "api-key", onClose, onClick),
      );
      await tree.update(
        surfaceElement(surface, false, "api-key", onClose, onClick),
      );
    }

    expect(show).toHaveBeenCalledTimes(50);
    expect(hide).toHaveBeenCalledTimes(50);
    await tree.unmount();
    expect(__listenerCount(surface.closeEvent)).toBe(0);
  });

  it("deduplicates close and ignores events after the surface closes", async () => {
    const onClose = jest.fn();
    const onClick = jest.fn();
    const tree = await mount(
      surfaceElement(surface, true, "api-key", onClose, onClick),
    );

    await runInAct(() => {
      __emit(surface.closeEvent, {});
      __emit(surface.closeEvent, {});
      if (surface.clickEvent) __emit(surface.clickEvent, {});
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();

    await tree.unmount();
    __emit(surface.closeEvent, {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("surface show generation", () => {
  it("does not let an old rejection clear a newer open cycle", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const firstShow = deferred<null>();
    native.showMiniGameMenu
      .mockReturnValueOnce(firstShow.promise)
      .mockResolvedValueOnce(null);
    const onClose = jest.fn();
    const tree = await mount(
      surfaceElement(surfaces[0], true, "api-key", onClose, jest.fn()),
    );

    await tree.update(
      surfaceElement(surfaces[0], false, "api-key", onClose, jest.fn()),
    );
    await tree.update(
      surfaceElement(surfaces[0], true, "api-key", onClose, jest.fn()),
    );
    await runInAct(() => {
      firstShow.reject(new Error("old cycle failed"));
    });
    await tree.unmount();

    expect(native.showMiniGameMenu).toHaveBeenCalledTimes(2);
    expect(native.hideMiniGameMenu).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
