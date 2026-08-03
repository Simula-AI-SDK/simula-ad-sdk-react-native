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

describe("iOS bridge string nullability contract", () => {
  it("accepts nullable host-controlled identifiers at the Objective-C boundary", () => {
    expect(bridge).toContain(
      "checkFrequencyCap:(NSString * _Nullable)adUnitId primaryUserID:(NSString * _Nullable)primaryUserID",
    );
    expect(bridge).toContain(
      "preloadNativeAd:(NSString * _Nullable)adUnitId position:(nonnull NSNumber *)position theme:(NSString * _Nullable)theme",
    );
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
      "fun setExtraParameter(instanceId: String, key: String?, value: String?)",
    );
    expect(androidModuleSource).toContain(
      "if (key.isNullOrEmpty() || value == null) return",
    );
  });
});
