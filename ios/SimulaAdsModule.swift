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
/// - Exported methods are received on a dedicated serial background queue
///   (`methodQueue`) so bridge traffic never queues behind main-thread work at app
///   startup. Each method hops to the main thread (`runOnMain`) only for the
///   `@MainActor` SDK touch. The serial queue preserves JS call order and the main
///   hops enqueue FIFO, so back-to-back JS calls (`create → load → show`) still
///   execute in order.
///
/// This module is kept separate from `SimulaMiniGameModule` (declarative surfaces)
/// — different threading profile, different event channel, and codegen-shaped for a
/// future TurboModule migration.
@objc(SimulaAdsModule)
class SimulaAdsModule: RCTEventEmitter {

    private static let eventName = "SimulaAds_onAdEvent"
    private static let invalidArgumentCode = "INVALID_ARGUMENT"

    private var hasListeners = false

    // Main-thread only. Set synchronously inside invalidate's main hop; checked by the
    // create* blocks so a call whose async main hop lands AFTER teardown (its moduleQueue
    // work was preempted before runOnMain could enqueue, letting invalidate's sync hop
    // overtake it) can't recreate ad objects/delegates on a dead bridge. load/show/destroy
    // then no-op on the already-empty entries map.
    private var didInvalidate = false

    // Retains each ad and its delegate proxy (the SDK `delegate` is weak). Keyed by
    // the JS-generated instanceId. Touched only on the main thread.
    private var entries: [String: AdEntry] = [:]

    private final class AdEntry {
        let adType: String
        let interstitial: SimulaInterstitialAd?
        let rewarded: SimulaRewardedAd?
        // Strong ref keeps the delegate proxy alive while the ad exists.
        let proxy: AnyObject

        /// True from DISPLAYED to CLOSED — the unit (including its post-close fallback
        /// screens; CLOSED fires only after the last one) is on screen.
        var isShowing = false

        /// Set when JS destroyed the instance while its unit was still showing. Events stop
        /// reaching the bridge immediately (the JS instance is gone), but the native object is
        /// released only on CLOSED, so its close flow — fallback screens, reward earn +
        /// verification enqueue, teardown — completes on a live object instead of being
        /// dropped mid-unit.
        var destroyPending = false

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

    // A dedicated serial queue — NOT the main thread. Exported methods are received here
    // (arg parsing, validation) and hop to main only for the @MainActor SDK touch, so a
    // congested main thread at app startup can't delay bridge traffic. Serial ⇒ JS call
    // order is preserved into the FIFO main hops.
    private let moduleQueue = DispatchQueue(label: "com.simula.ads.module")

    override var methodQueue: DispatchQueue { moduleQueue }

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { [SimulaAdsModule.eventName] }

    /// Runs `work` on the main thread SYNCHRONOUSLY (caller's semantics preserved). Only
    /// safe because `moduleQueue` is never the main queue and nothing on main ever blocks
    /// on it — the isMainThread fast path additionally guards a future main-thread call
    /// site against a main.sync self-deadlock. `work` is @MainActor-isolated (so SDK calls
    /// type-check) and non-async.
    private func syncOnMain(_ work: @MainActor () -> Void) {
        if Thread.isMainThread {
            MainActor.assumeIsolated { work() }
        } else {
            DispatchQueue.main.sync {
                MainActor.assumeIsolated { work() }
            }
        }
    }

    override func startObserving() {
        // `hasListeners` is read on the main thread (canEmit). A SYNC set so the flag is
        // updated before this method returns — an async hop could drop an event emitted
        // right after JS subscribes.
        syncOnMain { self.hasListeners = true }
    }

    override func stopObserving() {
        syncOnMain { self.hasListeners = false }
    }

    /// Hop to the main thread for an @MainActor SDK touch. This file is compiled by the
    /// host app's Xcode, so it must NOT create Swift Concurrency tasks (affected toolchains
    /// miscompile optimized task code into teardown aborts) — a GCD hop + assumeIsolated is
    /// the safe shape. `work` is @MainActor-isolated (so SDK calls type-check) and non-async.
    private func runOnMain(_ work: @escaping @MainActor () -> Void) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated { work() }
        }
    }

    override func invalidate() {
        // Drop every ad + proxy BEFORE super.invalidate(), synchronously on the main thread —
        // so no delegate proxy can fire an event into a tearing-down bridge (the guarantee
        // the pre-moduleQueue code had when invalidate ran on main). The flag is set FIRST:
        // a create* hop that loses the race to this block (enqueued behind it) bails on the
        // flag instead of recreating entries behind the teardown.
        syncOnMain {
            self.didInvalidate = true
            for entry in self.entries.values {
                entry.interstitial?.delegate = nil
                entry.rewarded?.delegate = nil
            }
            self.entries.removeAll()
        }
        super.invalidate()
    }

    // MARK: - Lifecycle

    @objc
    func initialize(_ config: NSDictionary,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = Self.nonBlankString(config["apiKey"] as? String) else {
            reject("INVALID_CONFIG", "Missing required config: apiKey", nil)
            return
        }
        let devMode = config["devMode"] as? Bool ?? false
        let primaryUserID = Self.nonBlankString(config["primaryUserID"] as? String)
        let hasPrivacyConsent = config["hasPrivacyConsent"] as? Bool ?? true
        let telemetryEnabled = config["telemetryEnabled"] as? Bool ?? true
        let privacy = convertPrivacyConfig(config["privacy"])
        let adContext = convertAdContext(config["adContext"])

        runOnMain {
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
        runOnMain {
            SimulaAds.updateContext(adContext)
        }
    }

    @objc
    func updatePrimaryUserID(_ id: NSString?) {
        let userID = Self.nonBlankString(id as String?)
        runOnMain {
            // Blank/nil clears the PPID natively (logout).
            SimulaAds.updatePrimaryUserID(userID)
        }
    }

    /// Read-only frequency-cap check. Resolves `true` when the cap is reached;
    /// `false` when eligible, pre-init, or on any failure (the SDK fails open).
    @objc
    func checkFrequencyCap(_ adUnitId: NSString?,
                           primaryUserID: NSString?,
                           resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        guard let unitId = Self.nonBlankString(adUnitId as String?) else {
            reject(Self.invalidArgumentCode, "adUnitId must be a non-empty string", nil)
            return
        }
        // Match Android (`isNotBlank`): a blank PPID is treated as omitted so the SDK
        // falls back to its current PPID — same JS call, same result on both platforms.
        let ppid = Self.nonBlankString(primaryUserID as String?)
        // Completion-based SDK call — the bridge must create NO Swift Concurrency tasks:
        // this file is compiled by the host app's Xcode, and affected toolchains miscompile
        // optimized task code into teardown aborts. The task lives inside the SDK binary,
        // which is prebuilt with a pinned pre-regression toolchain (SDK >= 1.1.4).
        runOnMain {
            SimulaAds.checkFrequencyCap(adUnitId: unitId, primaryUserID: ppid) { capped in
                resolve(capped)
            }
        }
    }

    // MARK: - Native ad (imperative)

    @objc
    func preloadNativeAd(_ adUnitId: NSString?,
                         position: NSNumber,
                         theme: NSString?,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
        let unitId = adUnitId as String?
        let pos = position.intValue
        let themeName = theme as String?
        if unitId != nil && Self.nonBlankString(unitId) == nil {
            reject(Self.invalidArgumentCode, "adUnitId must be a non-empty string when provided", nil)
            return
        }
        // Completion-based SDK call — no bridge-created task (see checkFrequencyCap above).
        runOnMain {
            SimulaAds.preloadNativeAd(adUnitId: unitId, position: pos, theme: themeName) { preloadedAdId in
                resolve(preloadedAdId)
            }
        }
    }

    @objc
    func destroyPreloadedAd(_ preloadedAdId: NSString?) {
        guard let id = Self.nonBlankString(preloadedAdId as String?) else { return }
        runOnMain {
            SimulaAds.destroyPreloadedAd(id)
        }
    }

    @objc
    func invalidateNativeAd(_ adUnitId: NSString?, position: NSNumber) {
        let unitId = adUnitId as String?
        guard unitId == nil || Self.nonBlankString(unitId) != nil else { return }
        runOnMain {
            SimulaAds.invalidateNativeAd(adUnitId: unitId, position: position.intValue)
        }
    }

    @objc
    func invalidateNativeAds() {
        runOnMain {
            SimulaAds.invalidateNativeAds()
        }
    }

    @objc
    func isInitialized(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        runOnMain {
            resolve(SimulaAds.isInitialized)
        }
    }

    @objc
    func getUserAgent(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
        runOnMain {
            resolve(SimulaAds.userAgent)
        }
    }

    @objc
    func getDeviceId(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        runOnMain {
            resolve(SimulaAds.deviceId as Any? ?? NSNull())
        }
    }

    // MARK: - Create / destroy

    @objc
    func createInterstitial(_ instanceId: String, adUnitId: NSString?) {
        guard let unitId = Self.nonBlankString(adUnitId as String?) else { return }
        runOnMain {
            // This hop may have been enqueued behind invalidate's sync teardown (see
            // didInvalidate) — never recreate ads on a dead bridge.
            guard !self.didInvalidate else { return }
            let ad = SimulaInterstitialAd(adUnitId: unitId)
            let proxy = InterstitialDelegateProxy(module: self, instanceId: instanceId)
            ad.delegate = proxy
            self.entries[instanceId] = AdEntry(interstitial: ad, proxy: proxy)
        }
    }

    @objc
    func createRewarded(_ instanceId: String, adUnitId: NSString?) {
        guard let unitId = Self.nonBlankString(adUnitId as String?) else { return }
        runOnMain {
            // See createInterstitial / didInvalidate.
            guard !self.didInvalidate else { return }
            let ad = SimulaRewardedAd(adUnitId: unitId)
            let proxy = RewardedDelegateProxy(module: self, instanceId: instanceId)
            ad.delegate = proxy
            self.entries[instanceId] = AdEntry(rewarded: ad, proxy: proxy)
        }
    }

    @objc
    func setMetadataValue(_ instanceId: String, key: NSString?, value: NSString?) {
        guard let key = key as String?, !key.isEmpty, let value = value as String? else { return }
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
            entry.interstitial?.setMetadata(key, value)
            entry.rewarded?.setMetadata(key, value)
        }
    }

    @objc
    func setMetadata(_ instanceId: String, metadataJson: NSString?) {
        guard let metadataJson = metadataJson as String? else { return }
        guard let metadata = Self.parseMetadata(metadataJson) else { return }
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
            entry.interstitial?.setMetadata(metadata)
            entry.rewarded?.setMetadata(metadata)
        }
    }

    private static func parseMetadata(_ json: String) -> [String: String]? {
        guard let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else { return nil }

        let pairs = dictionary.keys.sorted().compactMap { key -> (String, String)? in
            guard !key.isEmpty, let value = dictionary[key] as? String else { return nil }
            return (key, value)
        }.prefix(10)
        return Dictionary(uniqueKeysWithValues: pairs)
    }

    @objc
    func destroyAd(_ instanceId: String) {
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
            // Deferred destroy while the unit is on screen: this module holds the only strong
            // reference to the ad object, and dropping it mid-unit would strand the close flow
            // (reward verification, fallback screens) — and, on SDKs without presenter
            // self-retention, tear the ad window off screen. Suppress JS events now; the
            // object is released on CLOSED (see noteLifecycle).
            if entry.isShowing {
                entry.destroyPending = true
                return
            }
            self.entries.removeValue(forKey: instanceId)
            entry.interstitial?.delegate = nil
            entry.rewarded?.delegate = nil
        }
    }

    // MARK: - Load / show

    @objc
    func loadAd(_ instanceId: String, options: NSDictionary) {
        let charId = options["charId"] as? String
        let charName = options["charName"] as? String
        let charImage = options["charImage"] as? String
        let charDesc = options["charDesc"] as? String
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
            entry.interstitial?.load(charId: charId, charName: charName, charImage: charImage, charDesc: charDesc)
            entry.rewarded?.load(charId: charId, charName: charName, charImage: charImage, charDesc: charDesc)
        }
    }

    @objc
    func showAd(_ instanceId: String) {
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
            entry.interstitial?.show()
            entry.rewarded?.show()
        }
    }

    @objc
    func showAdPreview(_ instanceId: String, options: NSDictionary) {
        runOnMain {
            guard let entry = self.entries[instanceId] else { return }
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

    // SimulaPrivacy itself is lock-guarded (callable from any queue); these hop anyway
    // so JS call ORDER is preserved against the main-hopped SDK calls (e.g. an
    // `initialize({privacy})` followed by `applyConsent` must apply in that order —
    // running consent writes straight on moduleQueue would let a later initialize's
    // seed clobber them out of order).
    @objc
    func applyConsent(_ config: NSDictionary) {
        let resolved = convertPrivacyConfig(config) ?? SimulaPrivacyConfig()
        runOnMain {
            SimulaPrivacy.shared.apply(resolved)
        }
    }

    @objc
    func updateConsent(_ partial: NSDictionary) {
        runOnMain {
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
    }

    @objc
    func clearConsent(_ flags: NSDictionary) {
        runOnMain {
            SimulaPrivacy.shared.clearConsent(
                tcString: flags["tcString"] as? Bool ?? false,
                uspString: flags["uspString"] as? Bool ?? false,
                gppString: flags["gppString"] as? Bool ?? false,
                gppSid: flags["gppSid"] as? Bool ?? false,
                gdprApplies: flags["gdprApplies"] as? Bool ?? false,
                tcfPurpose1Consent: flags["tcfPurpose1Consent"] as? Bool ?? false
            )
        }
    }

    @objc
    func requestTrackingAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                                      reject: @escaping RCTPromiseRejectBlock) {
        #if os(iOS)
        // Completion-based SDK call — no bridge-created task (see checkFrequencyCap above).
        runOnMain {
            SimulaPrivacy.shared.requestTrackingAuthorization { status in
                resolve(Self.attStatusString(status))
            }
        }
        #else
        resolve("unavailable")
        #endif
    }

    @objc
    func getTrackingAuthorizationStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                                        reject: @escaping RCTPromiseRejectBlock) {
        #if os(iOS)
        runOnMain {
            resolve(Self.attStatusString(SimulaPrivacy.shared.trackingAuthorizationStatus))
        }
        #else
        resolve("unavailable")
        #endif
    }

    // MARK: - Event emission (called on main thread from delegate proxies)

    /// Tracks each unit's on-screen window (DISPLAYED → CLOSED) and finalizes a deferred
    /// destroy once the unit fully closes. Independent of the listener guard, so the state
    /// stays correct even while JS has no listeners attached.
    private func noteLifecycle(_ instanceId: String, _ type: String) {
        // Delegate proxies invoke us on the main thread (the SDK delivers delegate callbacks
        // there); assumeIsolated is required to mutate @MainActor-isolated SDK `delegate`
        // properties.
        MainActor.assumeIsolated {
            guard let entry = entries[instanceId] else { return }
            switch type {
            case "DISPLAYED":
                entry.isShowing = true
            case "CLOSED":
                entry.isShowing = false
                if entry.destroyPending {
                    entries.removeValue(forKey: instanceId)
                    entry.interstitial?.delegate = nil
                    entry.rewarded?.delegate = nil
                }
            default:
                break
            }
        }
    }

    /// False once a deferred destroy is pending: the JS instance is gone, so no further
    /// events may reach the bridge (the native object stays alive only to finish its
    /// close flow).
    private func canEmit(_ instanceId: String) -> Bool {
        hasListeners && entries[instanceId]?.destroyPending != true
    }

    fileprivate func emitSimple(_ instanceId: String, _ adType: String, _ type: String) {
        // Evaluate the guard BEFORE noteLifecycle: the CLOSED that finalizes a deferred
        // destroy removes the entry, which must not un-suppress its own emission.
        let emit = canEmit(instanceId)
        noteLifecycle(instanceId, type)
        guard emit else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": adType, "type": type,
        ])
    }

    fileprivate func emitError(_ instanceId: String, _ adType: String, _ type: String, _ error: SimulaAdError) {
        guard canEmit(instanceId) else { return }
        let mapped = SimulaAdsModule.describe(error)
        var body: [String: Any] = [
            "instanceId": instanceId, "adType": adType, "type": type,
            "code": mapped.code, "message": mapped.message,
        ]
        if let retry = mapped.retry { body["retryInSeconds"] = retry }
        sendEvent(withName: SimulaAdsModule.eventName, body: body)
    }

    fileprivate func emitVerificationFailed(_ instanceId: String, _ error: Error) {
        guard canEmit(instanceId) else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": "rewarded",
            "type": "REWARD_VERIFICATION_FAILED",
            "code": "verification_failed",
            "message": error.localizedDescription,
        ])
    }

    fileprivate func emitRewardVerified(_ instanceId: String, _ token: String?) {
        guard canEmit(instanceId) else { return }
        sendEvent(withName: SimulaAdsModule.eventName, body: [
            "instanceId": instanceId, "adType": "rewarded",
            "type": "REWARD_VERIFIED",
            "token": token as Any? ?? NSNull(),
        ])
    }

    /// PAID event — flattens the `AdValue` estimate onto the wire (see `eventRouter`).
    fileprivate func emitPaid(_ instanceId: String, _ adType: String, _ value: AdValue) {
        guard canEmit(instanceId) else { return }
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

    private static func nonBlankString(_ value: String?) -> String? {
        guard let value,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }

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
        case .adUnitNotFound: return ("ad_unit_not_found", message, nil)
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
