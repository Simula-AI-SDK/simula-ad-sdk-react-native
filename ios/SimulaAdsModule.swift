import React
import Foundation
import SimulaAdSDK
#if os(iOS)
import AppTrackingTransparency
#endif

/// Bridges the imperative ad + privacy surface of the native Swift SDK to React
/// Native.
///
/// Design:
/// - ONE event name (`SimulaAds_onAdEvent`); every callback is routed to the right
///   JS ad instance by the JS-generated `instanceId` carried in the payload.
/// - `create*` / `loadAd` / `showAd` / `destroyAd` are fire-and-forget (`void`);
///   all outcomes arrive as events. Only `initialize`, `isInitialized`, and the ATT
///   queries return promises.
/// - All SDK-touching work runs on the main thread (`methodQueue = .main`), so the
///   `@MainActor`-isolated SDK types are reached via `MainActor.assumeIsolated`.
///   Because `methodQueue` is the serial main queue, back-to-back JS calls
///   (`create → load → show`) execute in order.
///
/// This module is kept separate from `SimulaMiniGameModule` (declarative surfaces)
/// — different threading profile, different event channel, and codegen-shaped for a
/// future TurboModule migration.
@objc(SimulaAdsModule)
class SimulaAdsModule: RCTEventEmitter {

    private static let eventName = "SimulaAds_onAdEvent"

    private var hasListeners = false

    // Retains each ad and its delegate proxy (the SDK `delegate` is weak). Keyed by
    // the JS-generated instanceId. Touched only on the main thread.
    private var entries: [String: AdEntry] = [:]

    private final class AdEntry {
        let adType: String
        let interstitial: SimulaInterstitialAd?
        let rewarded: SimulaRewardedAd?
        // Strong ref keeps the delegate proxy alive while the ad exists.
        let proxy: AnyObject

        init(interstitial: SimulaInterstitialAd, proxy: AnyObject) {
            self.adType = "interstitial"
            self.interstitial = interstitial
            self.rewarded = nil
            self.proxy = proxy
        }

        init(rewarded: SimulaRewardedAd, proxy: AnyObject) {
            self.adType = "rewarded"
            self.interstitial = nil
            self.rewarded = rewarded
            self.proxy = proxy
        }
    }

    // MARK: - RCTEventEmitter

    override var methodQueue: DispatchQueue { DispatchQueue.main }

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { [SimulaAdsModule.eventName] }

    override func startObserving() { hasListeners = true }

    override func stopObserving() { hasListeners = false }

    override func invalidate() {
        // Main-thread (methodQueue) — drop every ad + proxy so a reload/teardown
        // never leaks a presenter or fires events into a dead bridge.
        MainActor.assumeIsolated {
            for entry in entries.values {
                entry.interstitial?.delegate = nil
                entry.rewarded?.delegate = nil
            }
            entries.removeAll()
        }
        super.invalidate()
    }

    // MARK: - Lifecycle

    @objc
    func initialize(_ config: NSDictionary,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = config["apiKey"] as? String, !apiKey.isEmpty else {
            reject("INVALID_CONFIG", "Missing required config: apiKey", nil)
            return
        }
        let devMode = config["devMode"] as? Bool ?? false
        let primaryUserID = config["primaryUserID"] as? String
        let hasPrivacyConsent = config["hasPrivacyConsent"] as? Bool ?? true
        let telemetryEnabled = config["telemetryEnabled"] as? Bool ?? true
        let privacy = convertPrivacyConfig(config["privacy"])
        let adContext = convertAdContext(config["adContext"])

        MainActor.assumeIsolated {
            SimulaAds.initialize(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent,
                privacy: privacy,
                telemetryEnabled: telemetryEnabled,
                adContext: adContext
            )
            resolve(nil)
        }
    }

    /// Replace the native-ad targeting context at runtime. An empty dictionary
    /// (the JS "clear" signal) maps to `nil` — a full replacement, not a merge.
    @objc
    func updateContext(_ context: NSDictionary) {
        let adContext = convertAdContext(context)
        MainActor.assumeIsolated {
            SimulaAds.updateContext(adContext)
        }
    }

    @objc
    func updatePrimaryUserID(_ id: NSString?) {
        let userID = id as String?
        MainActor.assumeIsolated {
            // Empty/nil clears the PPID natively (logout).
            SimulaAds.updatePrimaryUserID(userID?.isEmpty == true ? nil : userID)
        }
    }

    // MARK: - Native ad (imperative)

    @objc
    func preloadNativeAd(_ adUnitId: NSString?,
                         position: NSNumber,
                         theme: NSString?,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            let id = await SimulaAds.preloadNativeAd(
                adUnitId: adUnitId as String?,
                position: position.intValue,
                theme: theme as String?
            )
            resolve(id)
        }
    }

    @objc
    func destroyPreloadedAd(_ preloadedAdId: NSString) {
        MainActor.assumeIsolated {
            SimulaAds.destroyPreloadedAd(preloadedAdId as String)
        }
    }

    @objc
    func invalidateNativeAd(_ adUnitId: NSString?, position: NSNumber) {
        MainActor.assumeIsolated {
            SimulaAds.invalidateNativeAd(adUnitId: adUnitId as String?, position: position.intValue)
        }
    }

    @objc
    func invalidateNativeAds() {
        MainActor.assumeIsolated {
            SimulaAds.invalidateNativeAds()
        }
    }

    @objc
    func isInitialized(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        MainActor.assumeIsolated {
            resolve(SimulaAds.isInitialized)
        }
    }

    @objc
    func getUserAgent(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
        MainActor.assumeIsolated {
            resolve(SimulaAds.userAgent)
        }
    }

    @objc
    func getDeviceId(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        MainActor.assumeIsolated {
            resolve(SimulaAds.deviceId as Any? ?? NSNull())
        }
    }

    // MARK: - Create / destroy

    @objc
    func createInterstitial(_ instanceId: String, adUnitId: String) {
        MainActor.assumeIsolated {
            let ad = SimulaInterstitialAd(adUnitId: adUnitId)
            let proxy = InterstitialDelegateProxy(module: self, instanceId: instanceId)
            ad.delegate = proxy
            entries[instanceId] = AdEntry(interstitial: ad, proxy: proxy)
        }
    }

    @objc
    func createRewarded(_ instanceId: String, adUnitId: String) {
        MainActor.assumeIsolated {
            let ad = SimulaRewardedAd(adUnitId: adUnitId)
            let proxy = RewardedDelegateProxy(module: self, instanceId: instanceId)
            ad.delegate = proxy
            entries[instanceId] = AdEntry(rewarded: ad, proxy: proxy)
        }
    }

    @objc
    func destroyAd(_ instanceId: String) {
        MainActor.assumeIsolated {
            if let entry = entries.removeValue(forKey: instanceId) {
                entry.interstitial?.delegate = nil
                entry.rewarded?.delegate = nil
            }
        }
    }

    // MARK: - Load / show

    @objc
    func loadAd(_ instanceId: String, options: NSDictionary) {
        let charId = options["charId"] as? String
        let charName = options["charName"] as? String
        let charImage = options["charImage"] as? String
        let charDesc = options["charDesc"] as? String
        MainActor.assumeIsolated {
            guard let entry = entries[instanceId] else { return }
            entry.interstitial?.load(charId: charId, charName: charName, charImage: charImage, charDesc: charDesc)
            entry.rewarded?.load(charId: charId, charName: charName, charImage: charImage, charDesc: charDesc)
        }
    }

    @objc
    func showAd(_ instanceId: String) {
        MainActor.assumeIsolated {
            guard let entry = entries[instanceId] else { return }
            entry.interstitial?.show()
            entry.rewarded?.show()
        }
    }

    @objc
    func showAdPreview(_ instanceId: String, options: NSDictionary) {
        MainActor.assumeIsolated {
            guard let entry = entries[instanceId] else { return }
            if let ad = entry.interstitial {
                ad.showPreview(
                    closeTreatment: options["closeTreatment"] as? String ?? "hidden",
                    closePosition: options["closePosition"] as? String ?? "top_right",
                    delaySeconds: (options["delaySeconds"] as? NSNumber)?.intValue ?? 5,
                    progressBarColor: options["progressBarColor"] as? String ?? "#FFFFFF",
                    adUnitType: options["adUnitType"] as? String ?? "interstitial",
                    storePrompt: options["storePrompt"] as? Bool ?? false,
                    skOverlay: options["installBanner"] as? Bool ?? false
                )
            } else if let ad = entry.rewarded {
                // StorePromptPlatform.from(_:) is internal to the SDK; map via the
                // public cases instead.
                let platform: StorePromptPlatform =
                    (options["storePromptPlatform"] as? String) == "android" ? .android : .ios
                ad.showPreview(
                    durationSeconds: (options["durationSeconds"] as? NSNumber)?.intValue ?? 8,
                    storePrompt: options["storePrompt"] as? Bool ?? true,
                    storePromptPlatform: platform
                )
            }
        }
    }

    // MARK: - Privacy

    @objc
    func applyConsent(_ config: NSDictionary) {
        let resolved = convertPrivacyConfig(config) ?? SimulaPrivacyConfig()
        SimulaPrivacy.shared.apply(resolved)
    }

    @objc
    func updateConsent(_ partial: NSDictionary) {
        SimulaPrivacy.shared.update(
            hasPrivacyConsent: partial["hasPrivacyConsent"] as? Bool,
            tcString: partial["tcString"] as? String,
            uspString: partial["uspString"] as? String,
            gppString: partial["gppString"] as? String,
            gppSid: partial["gppSid"] as? String,
            gdprApplies: partial["gdprApplies"] as? Bool,
            tcfPurpose1Consent: partial["tcfPurpose1Consent"] as? Bool,
            coppaApplies: partial["coppaApplies"] as? Bool,
            enableAdvertisingId: partial["enableAdvertisingId"] as? Bool
        )
    }

    @objc
    func clearConsent(_ flags: NSDictionary) {
        SimulaPrivacy.shared.clearConsent(
            tcString: flags["tcString"] as? Bool ?? false,
            uspString: flags["uspString"] as? Bool ?? false,
            gppString: flags["gppString"] as? Bool ?? false,
            gppSid: flags["gppSid"] as? Bool ?? false,
            gdprApplies: flags["gdprApplies"] as? Bool ?? false,
            tcfPurpose1Consent: flags["tcfPurpose1Consent"] as? Bool ?? false
        )
    }

    @objc
    func requestTrackingAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                                      reject: @escaping RCTPromiseRejectBlock) {
        #if os(iOS)
        Task { @MainActor in
            let status = await SimulaPrivacy.shared.requestTrackingAuthorization()
            resolve(Self.attStatusString(status))
        }
        #else
        resolve("unavailable")
        #endif
    }

    @objc
    func getTrackingAuthorizationStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                                        reject: @escaping RCTPromiseRejectBlock) {
        #if os(iOS)
        resolve(Self.attStatusString(SimulaPrivacy.shared.trackingAuthorizationStatus))
        #else
        resolve("unavailable")
        #endif
    }

    // MARK: - Event emission (called on main thread from delegate proxies)

    fileprivate func emitSimple(_ instanceId: String, _ adType: String, _ type: String) {
        guard hasListeners else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": adType, "type": type,
        ])
    }

    fileprivate func emitError(_ instanceId: String, _ adType: String, _ type: String, _ error: SimulaAdError) {
        guard hasListeners else { return }
        let mapped = SimulaAdsModule.describe(error)
        var body: [String: Any] = [
            "instanceId": instanceId, "adType": adType, "type": type,
            "code": mapped.code, "message": mapped.message,
        ]
        if let retry = mapped.retry { body["retryInSeconds"] = retry }
        sendEvent(withName: SimulaAdsModule.eventName, body: body)
    }

    fileprivate func emitVerificationFailed(_ instanceId: String, _ error: Error) {
        guard hasListeners else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": "rewarded",
            "type": "REWARD_VERIFICATION_FAILED",
            "code": "verification_failed",
            "message": error.localizedDescription,
        ])
    }

    fileprivate func emitRewardVerified(_ instanceId: String, _ token: String?) {
        guard hasListeners else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": "rewarded",
            "type": "REWARD_VERIFIED",
            "token": token as Any? ?? NSNull(),
        ])
    }

    /// PAID event — flattens the `AdValue` estimate onto the wire (see `eventRouter`).
    fileprivate func emitPaid(_ instanceId: String, _ adType: String, _ value: AdValue) {
        guard hasListeners else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": adType, "type": "PAID",
            "valueMicros": value.valueMicros,
            "currencyCode": value.currencyCode,
            "precisionType": value.precisionType.rawValue,
            "expectedCpm": value.expectedCpm,
            "expectedRevenue": value.expectedRevenue,
        ])
    }

    // MARK: - Helpers

    /// Maps `SimulaAdError` to a stable JS code, message, and (for duplicate_request)
    /// retry seconds. Replicated locally because the SDK's `telemetryCode` is internal.
    private static func describe(_ error: SimulaAdError) -> (code: String, message: String, retry: Int?) {
        let message = error.errorDescription ?? ""
        switch error {
        case .notInitialized: return ("not_initialized", message, nil)
        case .noSession: return ("no_session", message, nil)
        case .noFill: return ("no_fill", message, nil)
        case .notReady: return ("not_ready", message, nil)
        case .stale: return ("stale", message, nil)
        case .duplicateRequest(let retryInSeconds): return ("duplicate_request", message, retryInSeconds)
        case .alreadyShowing: return ("already_showing", message, nil)
        case .noPresentationContext: return ("no_presentation_context", message, nil)
        case .unsupportedPlatform: return ("unsupported_platform", message, nil)
        case .network: return ("network", message, nil)
        }
    }

    #if os(iOS)
    private static func attStatusString(_ status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not_determined"
        @unknown default: return "not_determined"
        }
    }
    #endif

    private func convertPrivacyConfig(_ raw: Any?) -> SimulaPrivacyConfig? {
        guard let dict = raw as? [String: Any] else { return nil }
        return SimulaPrivacyConfig(
            hasPrivacyConsent: dict["hasPrivacyConsent"] as? Bool ?? true,
            tcString: dict["tcString"] as? String,
            uspString: dict["uspString"] as? String,
            gppString: dict["gppString"] as? String,
            gppSid: dict["gppSid"] as? String,
            gdprApplies: dict["gdprApplies"] as? Bool,
            tcfPurpose1Consent: dict["tcfPurpose1Consent"] as? Bool,
            coppaApplies: dict["coppaApplies"] as? Bool ?? false,
            enableAdvertisingId: dict["enableAdvertisingId"] as? Bool ?? false
        )
    }

    /// Builds a `SimulaAdContext` from a JS dict. An empty/absent dict → `nil`
    /// (no targeting / clear).
    private func convertAdContext(_ raw: Any?) -> SimulaAdContext? {
        guard let dict = raw as? [String: Any], !dict.isEmpty else { return nil }
        return SimulaAdContext(
            searchTerm: dict["searchTerm"] as? String,
            tags: dict["tags"] as? [String],
            category: dict["category"] as? String,
            title: dict["title"] as? String,
            description: dict["description"] as? String,
            userProfile: dict["userProfile"] as? String,
            userEmail: dict["userEmail"] as? String,
            customContext: convertCustomContext(dict["customContext"]),
            nsfw: dict["nsfw"] as? Bool ?? false
        )
    }

    private func convertCustomContext(_ raw: Any?) -> [String: JSONValue]? {
        guard let dict = raw as? [String: Any], !dict.isEmpty else { return nil }
        var out: [String: JSONValue] = [:]
        for (key, value) in dict { out[key] = SimulaAdsModule.jsonValue(value) }
        return out
    }

    /// Converts a bridged JSON value (NSString / NSNumber / NSArray / NSDictionary /
    /// NSNull) into the SDK's `JSONValue`. `NSNumber` is disambiguated so a JS boolean
    /// maps to `.bool` (not `.int`) and integral numbers map to `.int`.
    private static func jsonValue(_ value: Any) -> JSONValue {
        if let string = value as? String { return .string(string) }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return .bool(number.boolValue) }
            let asDouble = number.doubleValue
            if asDouble == asDouble.rounded() && abs(asDouble) < 1e15 {
                return .int(number.intValue)
            }
            return .double(asDouble)
        }
        if let array = value as? [Any] { return .array(array.map { jsonValue($0) }) }
        if let object = value as? [String: Any] {
            var out: [String: JSONValue] = [:]
            for (key, nested) in object { out[key] = jsonValue(nested) }
            return .object(out)
        }
        return .null
    }
}

// MARK: - Delegate proxies
//
// The SDK delivers delegate callbacks on the main thread. Each proxy is retained
// by its AdEntry (the ad's `delegate` is weak) and translates callbacks into
// `SimulaAds_onAdEvent` payloads. A weak module ref avoids a retain cycle.

private final class InterstitialDelegateProxy: NSObject, SimulaInterstitialAdDelegate {
    weak var module: SimulaAdsModule?
    let instanceId: String

    init(module: SimulaAdsModule, instanceId: String) {
        self.module = module
        self.instanceId = instanceId
    }

    func interstitialDidLoad(_ ad: SimulaInterstitialAd) {
        module?.emitSimple(instanceId, "interstitial", "LOADED")
    }
    func interstitialDidFailToLoad(_ ad: SimulaInterstitialAd, error: SimulaAdError) {
        module?.emitError(instanceId, "interstitial", "LOAD_FAILED", error)
    }
    func interstitialDidDisplay(_ ad: SimulaInterstitialAd) {
        module?.emitSimple(instanceId, "interstitial", "DISPLAYED")
    }
    func interstitialDidRecordImpression(_ ad: SimulaInterstitialAd) {
        module?.emitSimple(instanceId, "interstitial", "IMPRESSION")
    }
    func interstitialDidPay(_ ad: SimulaInterstitialAd, value: AdValue) {
        module?.emitPaid(instanceId, "interstitial", value)
    }
    func interstitialDidFailToDisplay(_ ad: SimulaInterstitialAd, error: SimulaAdError) {
        module?.emitError(instanceId, "interstitial", "DISPLAY_FAILED", error)
    }
    func interstitialDidClick(_ ad: SimulaInterstitialAd) {
        module?.emitSimple(instanceId, "interstitial", "CLICKED")
    }
    func interstitialDidClose(_ ad: SimulaInterstitialAd) {
        module?.emitSimple(instanceId, "interstitial", "CLOSED")
    }
}

private final class RewardedDelegateProxy: NSObject, SimulaRewardedAdDelegate {
    weak var module: SimulaAdsModule?
    let instanceId: String

    init(module: SimulaAdsModule, instanceId: String) {
        self.module = module
        self.instanceId = instanceId
    }

    func rewardedDidLoad(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "LOADED")
    }
    func rewardedDidFailToLoad(_ ad: SimulaRewardedAd, error: SimulaAdError) {
        module?.emitError(instanceId, "rewarded", "LOAD_FAILED", error)
    }
    func rewardedDidDisplay(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "DISPLAYED")
    }
    func rewardedDidRecordImpression(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "IMPRESSION")
    }
    func rewardedDidPay(_ ad: SimulaRewardedAd, value: AdValue) {
        module?.emitPaid(instanceId, "rewarded", value)
    }
    func rewardedDidFailToDisplay(_ ad: SimulaRewardedAd, error: SimulaAdError) {
        module?.emitError(instanceId, "rewarded", "DISPLAY_FAILED", error)
    }
    func rewardedDidClick(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "CLICKED")
    }
    func rewardedDidEarnReward(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "EARNED_REWARD")
    }
    func rewardedDidVerifyReward(_ ad: SimulaRewardedAd, token: String?) {
        module?.emitRewardVerified(instanceId, token)
    }
    func rewardedRewardVerificationDidFail(_ ad: SimulaRewardedAd, error: Error) {
        module?.emitVerificationFailed(instanceId, error)
    }
    func rewardedDidClose(_ ad: SimulaRewardedAd) {
        module?.emitSimple(instanceId, "rewarded", "CLOSED")
    }
}
