import React from "react";
import { mount, runInAct } from "../../../test/reactHarness";

jest.mock(
  "react-native/Libraries/Utilities/codegenNativeComponent",
  () => ({
    __esModule: true,
    default: (name: string) => name,
  }),
);

import { MiniGameButton } from "../MiniGameButton";

function nativeButton(tree: Awaited<ReturnType<typeof mount>>) {
  return tree.renderer.root.findByType(
    "SimulaMiniGameButtonView" as unknown as React.ElementType,
  );
}

describe("MiniGameButton lifecycle", () => {
  it("forwards props and updates its measured height", async () => {
    const tree = await mount(
      React.createElement(MiniGameButton, {
        text: "Play",
        showPulsate: true,
        showBadge: true,
        width: 240,
        onClick: jest.fn(),
      }),
    );
    expect(nativeButton(tree).props).toEqual(
      expect.objectContaining({
        text: "Play",
        showPulsate: true,
        showBadge: true,
      }),
    );
    expect(nativeButton(tree).props.style).toEqual([
      { width: 240 },
      { height: 48 },
    ]);

    await runInAct(() => {
      nativeButton(tree).props.onButtonSizeChange({ nativeEvent: { height: 64 } });
    });
    expect(nativeButton(tree).props.style).toEqual([
      { width: 240 },
      { height: 64 },
    ]);
    await tree.unmount();
  });

  it("uses the latest click callback without remounting", async () => {
    const first = jest.fn();
    const second = jest.fn();
    const tree = await mount(
      React.createElement(MiniGameButton, { onClick: first }),
    );
    await tree.update(
      React.createElement(MiniGameButton, { onClick: second }),
    );
    nativeButton(tree).props.onButtonPress({ nativeEvent: {} });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await tree.unmount();
  });
});
