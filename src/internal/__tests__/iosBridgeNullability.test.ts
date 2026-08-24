import { readFileSync } from "fs";
import { resolve } from "path";

const repositoryRoot = resolve(__dirname, "../../..");
const bridge = readFileSync(
  resolve(repositoryRoot, "ios/SimulaAdsBridge.m"),
  "utf8",
).replace(/\s+/g, " ");
const moduleSource = readFileSync(
  resolve(repositoryRoot, "ios/SimulaAdsModule.swift"),
  "utf8",
);
const androidModuleSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaAdsModule.kt",
  ),
  "utf8",
);
const androidNativeAdSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaNativeAdView.kt",
  ),
  "utf8",
);
const iosNativeAdSource = readFileSync(
  resolve(repositoryRoot, "ios/SimulaNativeAdView.swift"),
  "utf8",
);

describe("iOS bridge string nullability contract", () => {
  it("accepts nullable host-controlled identifiers at the Objective-C boundary", () => {
    expect(bridge).toContain(
      "checkFrequencyCap:(NSString * _Nullable)adUnitId primaryUserID:(NSString * _Nullable)primaryUserID",
    );
    expect(bridge).toContain(
      "preloadNativeAd:(NSString * _Nullable)adUnitId position:(nonnull NSNumber *)position theme:(NSString * _Nullable)theme",
    );
    expect(bridge).not.toContain("preloadNativeAdWithMetadata");
    expect(moduleSource).not.toContain("preloadNativeAdWithMetadata");
    expect(androidModuleSource).not.toContain("preloadNativeAdWithMetadata");
    expect(bridge).toContain(
      "destroyPreloadedAd:(NSString * _Nullable)preloadedAdId",
    );
    expect(bridge).toContain(
      "createInterstitial:(NSString * _Nonnull)instanceId adUnitId:(NSString * _Nullable)adUnitId",
    );
    expect(bridge).toContain(
      "createRewarded:(NSString * _Nonnull)instanceId adUnitId:(NSString * _Nullable)adUnitId",
    );
  });

  it("keeps generated routing IDs strict while Swift validates host identifiers", () => {
    expect(bridge).toContain(
      "loadAd:(NSString * _Nonnull)instanceId options:(NSDictionary *)options",
    );
    expect(moduleSource).toMatch(
      /func checkFrequencyCap\(_ adUnitId: NSString\?/,
    );
    expect(moduleSource).toMatch(
      /func destroyPreloadedAd\(_ preloadedAdId: NSString\?\)/,
    );
    expect(moduleSource).toMatch(
      /func createInterstitial\(_ instanceId: String, adUnitId: NSString\?\)/,
    );
    expect(moduleSource).toContain(
      'private static let invalidArgumentCode = "INVALID_ARGUMENT"',
    );
  });

  it("accepts nullable metadata values and rejects empty keys at the Android bridge boundary", () => {
    expect(androidModuleSource).toContain(
      "fun setMetadataValue(instanceId: String, key: String?, value: String?)",
    );
    expect(androidModuleSource).toContain(
      "if (key.isNullOrEmpty() || value == null) return",
    );
    expect(androidModuleSource).toContain("if (key.isEmpty()) null");
    expect(androidNativeAdSource).toContain("if (key.isEmpty()) null");
  });

  it("rejects empty metadata keys at both iOS bridge boundaries", () => {
    expect(moduleSource).toContain("!key.isEmpty");
    expect(moduleSource).toContain(
      "guard !key.isEmpty, let value = dictionary[key] as? String else { return nil }",
    );
    expect(iosNativeAdSource).toContain(
      "guard !key.isEmpty, let value = dictionary[key] as? String else { return nil }",
    );
  });

  it("does not evaluate native diagnostic properties before initialization", () => {
    expect(moduleSource).toMatch(
      /func getUserAgent[\s\S]*?runOnMain \{\s*guard SimulaAds\.isInitialized else \{\s*resolve\(NSNull\(\)\)\s*return\s*\}\s*resolve\(SimulaAds\.userAgent\)/,
    );
    expect(moduleSource).toMatch(
      /func getDeviceId[\s\S]*?runOnMain \{\s*guard SimulaAds\.isInitialized else \{\s*resolve\(NSNull\(\)\)\s*return\s*\}\s*resolve\(SimulaAds\.deviceId/,
    );
    expect(androidModuleSource).toContain(
      "promise.resolve(if (SimulaAds.isInitialized) SimulaAds.userAgent else null)",
    );
    expect(androidModuleSource).toContain(
      "promise.resolve(if (SimulaAds.isInitialized) SimulaAds.deviceId else null)",
    );
  });

  it("uses distinct bridge names for the native SDK's overloaded metadata setters", () => {
    expect(bridge).toContain(
      "setMetadataValue:(NSString * _Nonnull)instanceId key:(NSString * _Nullable)key value:(NSString * _Nullable)value",
    );
    expect(bridge).toContain(
      "setMetadata:(NSString * _Nonnull)instanceId metadataJson:(NSString * _Nullable)metadataJson",
    );
    expect(moduleSource).toContain(
      "entry.interstitial?.setMetadata(key, value)",
    );
    expect(moduleSource).toContain("entry.rewarded?.setMetadata(metadata)");
    expect(androidModuleSource).toContain(
      "entry.interstitial?.setMetadata(key, value)",
    );
    expect(androidModuleSource).toContain(
      "entry.rewarded?.setMetadata(metadata)",
    );
  });
});
