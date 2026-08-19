import React from "react";
import { mount, runInAct } from "../../test/reactHarness";

jest.mock(
  "react-native/Libraries/Utilities/codegenNativeComponent",
  () => ({
    __esModule: true,
    default: (name: string) => name,
  }),
);

import { NativeAd } from "../NativeAd";

function nativeView(tree: Awaited<ReturnType<typeof mount>>) {
  return tree.renderer.root.findByType(
    "SimulaNativeAdView" as unknown as React.ElementType,
  );
}

describe("NativeAd recycled-cell lifecycle", () => {
  it("grows from zero after a matching native size event", async () => {
    const tree = await mount(
      React.createElement(NativeAd, { adUnitId: "feed", position: 1 }),
    );
    expect(nativeView(tree).props.style.height).toBe(0);

    await runInAct(() => {
      nativeView(tree).props.onAdSizeChange({
        nativeEvent: {
          height: 120,
          adUnitId: "feed",
          adPosition: 1,
        },
      });
    });
    expect(nativeView(tree).props.style.height).toBe(120);
    await tree.unmount();
  });

  it("drops late size events from a previously recycled slot", async () => {
    const tree = await mount(
      React.createElement(NativeAd, { adUnitId: "feed", position: 10 }),
    );
    await tree.update(
      React.createElement(NativeAd, { adUnitId: "feed", position: 11 }),
    );
    expect(nativeView(tree).props.style.height).toBe(0);

    await runInAct(() => {
      nativeView(tree).props.onAdSizeChange({
        nativeEvent: {
          height: 300,
          adUnitId: "feed",
          adPosition: 10,
        },
      });
    });
    expect(nativeView(tree).props.style.height).toBe(0);
    await tree.unmount();
  });

  it("reseeds a recycled cell from the new slot height cache", async () => {
    const first = await mount(
      React.createElement(NativeAd, { adUnitId: "feed", position: 20 }),
    );
    await runInAct(() => {
      nativeView(first).props.onAdSizeChange({
        nativeEvent: { height: 80, adUnitId: "feed", adPosition: 20 },
      });
    });
    await first.unmount();

    const tree = await mount(
      React.createElement(NativeAd, { adUnitId: "feed", position: 21 }),
    );
    await runInAct(() => {
      nativeView(tree).props.onAdSizeChange({
        nativeEvent: { height: 140, adUnitId: "feed", adPosition: 21 },
      });
    });
    await tree.update(
      React.createElement(NativeAd, { adUnitId: "feed", position: 20 }),
    );
    expect(nativeView(tree).props.style.height).toBe(80);
    await tree.unmount();
  });

  it("holds metadata stable until the native load identity changes", async () => {
    const tree = await mount(
      React.createElement(NativeAd, {
        adUnitId: "feed",
        position: 1,
        metadata: { experiment: "a" },
      }),
    );
    expect(nativeView(tree).props.metadataJson).toBe('{"experiment":"a"}');

    await tree.update(
      React.createElement(NativeAd, {
        adUnitId: "feed",
        position: 1,
        metadata: { experiment: "b" },
      }),
    );
    expect(nativeView(tree).props.metadataJson).toBe('{"experiment":"a"}');

    await tree.update(
      React.createElement(NativeAd, {
        adUnitId: "feed",
        position: 2,
        metadata: { experiment: "b" },
      }),
    );
    expect(nativeView(tree).props.metadataJson).toBe('{"experiment":"b"}');
    await tree.unmount();
  });

  it("uses current callbacks after rerender", async () => {
    const firstClick = jest.fn();
    const secondClick = jest.fn();
    const tree = await mount(
      React.createElement(NativeAd, { adUnitId: "feed", onClick: firstClick }),
    );
    await tree.update(
      React.createElement(NativeAd, { adUnitId: "feed", onClick: secondClick }),
    );
    nativeView(tree).props.onAdClick({ nativeEvent: {} });
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).toHaveBeenCalledTimes(1);
    await tree.unmount();
  });

  it("renders nothing for a blank adUnitId", async () => {
    const tree = await mount(
      React.createElement(NativeAd, { adUnitId: " " }),
    );
    expect(tree.renderer.toJSON()).toBeNull();
    await tree.unmount();
  });
});
