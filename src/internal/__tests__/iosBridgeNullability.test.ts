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
const iosMiniGameSource = readFileSync(
  resolve(repositoryRoot, "ios/SimulaMiniGameModule.swift"),
  "utf8",
);
const androidMiniGameSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaMiniGameModule.kt",
  ),
  "utf8",
);
const androidInitializationSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaInitializationState.kt",
  ),
  "utf8",
);
const androidBridgeConfigSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaBridgeConfig.kt",
  ),
  "utf8",
);
const iosEnvironmentSource = readFileSync(
  resolve(repositoryRoot, "ios/SimulaBridgeAPIEnvironment.swift"),
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

  it("rejects incompatible process initialization instead of reporting success", () => {
    expect(moduleSource).toContain("let didInitialize = SimulaAds.initialize(");
    expect(moduleSource).toContain("SimulaAds.shared?.apiKey == apiKey");
    expect(moduleSource).toContain('"INITIALIZATION_CONFLICT"');
    expect(androidModuleSource).toContain('INITIALIZATION_CONFLICT = "INITIALIZATION_CONFLICT"');
    expect(androidModuleSource).toContain(
      "SimulaInitializationState.initialize(apiKey, apiEnvironment)",
    );
    expect(androidInitializationSource).toContain("private var apiKey: String? = null");
    expect(androidInitializationSource).toContain(
      "private var apiEnvironment: SimulaApiEnvironment? = null",
    );
    expect(androidInitializationSource).toContain(
      "if (SimulaAds.isInitialized) return@synchronized SimulaInitializationOutcome.Conflict",
    );
    expect(iosMiniGameSource).toContain("shared.apiKey == apiKey else { return nil }");
  });

  it("maps API environments through exact native allowlists before SDK entry", () => {
    expect(androidBridgeConfigSource).toContain(
      'map.getString("apiEnvironment") == "staging"',
    );
    expect(androidBridgeConfigSource).toContain(
      ".getOrDefault(SimulaApiEnvironment.Production)",
    );
    expect(androidModuleSource.indexOf("SimulaAds.configureApiEnvironment(")).toBeLessThan(
      androidModuleSource.indexOf("SimulaAds.initialize("),
    );
    expect(androidMiniGameSource.match(/prepareProviderConfiguration\(/g)).toHaveLength(6);
    expect(androidMiniGameSource).toContain(
      "SimulaAds.configureApiEnvironment(reactApplicationContext, apiEnvironment)",
    );

    expect(iosEnvironmentSource).toContain(
      '(rawEnvironment as? String) == "staging" ? "staging" : "production"',
    );
    expect(moduleSource).toContain(
      "SimulaAds.configureAPIEnvironment(environmentRequest.environment)",
    );
    expect(moduleSource.indexOf("SimulaBridgeAPIEnvironmentState.requestIfCompatible(")).toBeLessThan(
      moduleSource.indexOf("let didInitialize = SimulaAds.initialize("),
    );
    expect(iosMiniGameSource.match(/rawEnvironment: props\["apiEnvironment"\]/g)).toHaveLength(7);
  });

  it("commits iOS bridge ownership only after native initialization or provider acceptance", () => {
    const compatibilityCheck = iosEnvironmentSource.slice(
      iosEnvironmentSource.indexOf("static func requestIfCompatible("),
      iosEnvironmentSource.indexOf("static func owns("),
    );
    expect(compatibilityCheck).not.toContain("apiKey = requestedApiKey");
    expect(compatibilityCheck).not.toContain("environmentName = requestedName");
    expect(iosEnvironmentSource).toMatch(
      /static func commit[\s\S]*?apiKey = request\.apiKey[\s\S]*?environmentName = request\.environmentName/,
    );

    const initializePath = moduleSource.slice(
      moduleSource.indexOf("func initialize(_ config:"),
      moduleSource.indexOf("/// Replace the native-ad targeting context"),
    );
    const initializeCheck = initializePath.indexOf("requestIfCompatible(");
    const initializeConfigure = initializePath.indexOf("SimulaAds.configureAPIEnvironment(");
    const initializeNative = initializePath.indexOf("let didInitialize = SimulaAds.initialize(");
    const initializeAccepted = initializePath.indexOf(
      "if didInitialize || (sharedOwnerMatches && (alreadyOwned || environmentAccepted))",
    );
    const initializeCommit = initializePath.indexOf(
      "SimulaBridgeAPIEnvironmentState.commit(environmentRequest)",
    );
    expect(initializeCheck).toBeGreaterThan(-1);
    expect(initializeConfigure).toBeGreaterThan(initializeCheck);
    expect(initializeNative).toBeGreaterThan(initializeConfigure);
    expect(initializeAccepted).toBeGreaterThan(initializeNative);
    expect(initializeCommit).toBeGreaterThan(initializeAccepted);

    const reusableProvider = iosMiniGameSource.slice(
      iosMiniGameSource.indexOf("private func reusableProvider("),
      iosMiniGameSource.indexOf("// MARK: - MiniGameMenu"),
    );
    expect(reusableProvider.indexOf("requestIfCompatible(")).toBeLessThan(
      reusableProvider.indexOf("SimulaAds.configureAPIEnvironment("),
    );
    expect(reusableProvider.indexOf("shared.apiKey == apiKey")).toBeLessThan(
      reusableProvider.indexOf("SimulaBridgeAPIEnvironmentState.commit("),
    );

    const preloadPath = iosMiniGameSource.slice(
      iosMiniGameSource.indexOf("func preload(_ props:"),
      iosMiniGameSource.indexOf("// MARK: - CharacterSelector"),
    );
    expect(preloadPath.indexOf("let didInitialize = SimulaAds.initialize(")).toBeLessThan(
      preloadPath.indexOf("SimulaBridgeAPIEnvironmentState.commit("),
    );
    expect(preloadPath.indexOf("let sharedOwnerMatches =")).toBeLessThan(
      preloadPath.indexOf("SimulaBridgeAPIEnvironmentState.commit("),
    );
  });

  it("leaves iOS navigation and StoreKit routing with the native SDK", () => {
    expect(iosMiniGameSource).not.toContain("method_exchangeImplementations");
    expect(iosMiniGameSource).not.toContain("WKNavigationDelegateProxy");
    expect(iosMiniGameSource).not.toContain("webView.navigationDelegate =");
    expect(iosMiniGameSource).not.toContain("simula_openURL");
    expect(iosMiniGameSource).not.toContain("SKStoreProductViewController()");
  });

  it("passes telemetryEnabled to every Android mini-game provider", () => {
    const providerBlocks = androidMiniGameSource.match(/SimulaProvider\([\s\S]*?\) \{/g) ?? [];
    expect(providerBlocks).toHaveLength(5);
    for (const block of providerBlocks) {
      expect(block).toContain("telemetryEnabled = telemetryEnabled");
    }
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
