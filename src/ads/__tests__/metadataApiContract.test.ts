import type {
  NativeAdProps,
  SimulaMetadata,
  UseInterstitialAd,
  UseRewardedAd,
} from "../../index";
import type { SimulaInterstitialAd } from "../SimulaInterstitialAd";
import { SimulaAds } from "../SimulaAds";

const metadata: SimulaMetadata = { page_name: "Search" };
const nativeAdProps: NativeAdProps = { metadata };

const verifyAdApi = (ad: SimulaInterstitialAd): void => {
  ad.setMetadata("page_name", "Search");
  ad.setMetadata(metadata);
};

const verifyHookApi = (hook: UseInterstitialAd | UseRewardedAd): void => {
  hook.setMetadata("page_name", "Search");
  hook.setMetadata(metadata);
};

describe("publisher metadata API contract", () => {
  it("exports SimulaMetadata and the NativeAd metadata prop", () => {
    expect(nativeAdProps).toEqual({ metadata: { page_name: "Search" } });
    expect(verifyAdApi).toEqual(expect.any(Function));
    expect(verifyHookApi).toEqual(expect.any(Function));
  });

  it("accepts metadata at the native preload entry point", async () => {
    await expect(
      SimulaAds.preloadNativeAd({ metadata: { page_name: "Search" } }),
    ).resolves.toBe("preloaded_metadata_1");
  });
});
