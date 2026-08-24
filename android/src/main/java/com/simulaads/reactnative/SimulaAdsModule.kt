package com.simulaads.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import ad.simula.ad.sdk.ads.SimulaAds
import ad.simula.ad.sdk.ads.SimulaAdError
import ad.simula.ad.sdk.ads.SimulaInterstitialAd
import ad.simula.ad.sdk.ads.SimulaInterstitialAdListener
import ad.simula.ad.sdk.ads.SimulaRewardedAd
import ad.simula.ad.sdk.ads.SimulaRewardedAdListener
import ad.simula.ad.sdk.model.AdValue
import ad.simula.ad.sdk.privacy.SimulaPrivacy
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Bridges the imperative ad + privacy surface of the native Kotlin SDK to React
 * Native.
 *
 * Design:
 * - ONE event name (`SimulaAds_onAdEvent`); every callback is routed to the right
 *   JS ad instance by the JS-generated `instanceId` carried in the payload.
 * - `create*` / `loadAd` / `showAd` / `destroyAd` are fire-and-forget; all outcomes
 *   arrive as events. Only `initialize`, `isInitialized`, and the ATT queries
 *   resolve promises.
 * - Methods run on the NativeModules thread and call the SDK directly: the Kotlin
 *   ad classes self-confine to the main thread internally (`confineToMain`), and
 *   constructing them off-main is safe. Listener callbacks fire on the main thread.
 *
 * Kept separate from [SimulaMiniGameModule] (declarative surfaces).
 */
class SimulaAdsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SimulaAdsModule"

    private data class AdEntry(
        val adType: String,
        val interstitial: SimulaInterstitialAd? = null,
        val rewarded: SimulaRewardedAd? = null,
    )

    private val entries = ConcurrentHashMap<String, AdEntry>()

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        val apiKey = config.getStringOrNull("apiKey")
        if (apiKey.isNullOrBlank()) {
            promise.reject("INVALID_CONFIG", "Missing required config: apiKey")
            return
        }
        val devMode = config.getBooleanOrNull("devMode") ?: false
        val primaryUserID = config.getStringOrNull("primaryUserID")?.takeIf { it.isNotBlank() }
        val hasPrivacyConsent = config.getBooleanOrNull("hasPrivacyConsent") ?: true
        val telemetryEnabled = config.getBooleanOrNull("telemetryEnabled") ?: true
        val privacy = if (config.hasKey("privacy") && !config.isNull("privacy"))
            config.getMap("privacy").toSimulaPrivacyConfig() else null
        val adContext = if (config.hasKey("adContext") && !config.isNull("adContext"))
            config.getMap("adContext").toSimulaAdContext() else null

        // Idempotent natively (first valid call wins); any-context is fine (the SDK
        // retains the application context).
        SimulaAds.initialize(
            context = reactApplicationContext,
            apiKey = apiKey,
            devMode = devMode,
            primaryUserID = primaryUserID,
            hasPrivacyConsent = hasPrivacyConsent,
            privacy = privacy,
            telemetryEnabled = telemetryEnabled,
            adContext = adContext,
        )
        promise.resolve(null)
    }

    @ReactMethod
    fun isInitialized(promise: Promise) {
        promise.resolve(SimulaAds.isInitialized)
    }

    /**
     * Replace the native-ad targeting context at runtime. An empty map (the JS
     * "clear" signal) maps to null — a full replacement, not a merge.
     */
    @ReactMethod
    fun updateContext(context: ReadableMap) {
        SimulaAds.updateContext(context.toSimulaAdContext())
    }

    /**
     * Update the primary user identifier at runtime (login/logout). A null/blank id
     * clears it natively. No-op before initialize.
     */
    @ReactMethod
    fun updatePrimaryUserID(id: String?) {
        SimulaAds.updatePrimaryUserID(id?.takeIf { it.isNotBlank() })
    }

    /**
     * Read-only frequency-cap check. Resolves true when the cap is reached; false
     * when eligible, pre-init, or on any failure (the SDK fails open). Uses the
     * SDK's callback overload, which delivers the result on the main thread.
     */
    @ReactMethod
    fun checkFrequencyCap(adUnitId: String, primaryUserID: String?, promise: Promise) {
        SimulaAds.checkFrequencyCap(adUnitId, primaryUserID?.takeIf { it.isNotBlank() }) { capped ->
            promise.resolve(capped)
        }
    }

    @ReactMethod
    fun getUserAgent(promise: Promise) {
        promise.resolve(if (SimulaAds.isInitialized) SimulaAds.userAgent else null)
    }

    @ReactMethod
    fun getDeviceId(promise: Promise) {
        promise.resolve(if (SimulaAds.isInitialized) SimulaAds.deviceId else null)
    }

    // ── Native ad (imperative) ────────────────────────────────────────────────

    @ReactMethod
    fun preloadNativeAd(adUnitId: String?, position: Int, theme: String?, promise: Promise) {
        promise.resolve(SimulaAds.preloadNativeAd(adUnitId, position, theme))
    }

    @ReactMethod
    fun destroyPreloadedAd(preloadedAdId: String) {
        SimulaAds.destroyPreloadedAd(preloadedAdId)
    }

    @ReactMethod
    fun invalidateNativeAd(adUnitId: String?, position: Int) {
        SimulaAds.invalidateNativeAd(adUnitId, position)
    }

    @ReactMethod
    fun invalidateNativeAds() {
        SimulaAds.invalidateNativeAds()
    }

    // ── Create / destroy ──────────────────────────────────────────────────────

    @ReactMethod
    fun createInterstitial(instanceId: String, adUnitId: String) {
        val ad = SimulaInterstitialAd(adUnitId)
        ad.listener = interstitialListener(instanceId)
        entries[instanceId] = AdEntry(adType = "interstitial", interstitial = ad)
    }

    @ReactMethod
    fun createRewarded(instanceId: String, adUnitId: String) {
        val ad = SimulaRewardedAd(adUnitId)
        ad.listener = rewardedListener(instanceId)
        entries[instanceId] = AdEntry(adType = "rewarded", rewarded = ad)
    }

    @ReactMethod
    fun setMetadataValue(instanceId: String, key: String?, value: String?) {
        if (key.isNullOrEmpty() || value == null) return
        val entry = entries[instanceId] ?: return
        entry.interstitial?.setMetadata(key, value)
        entry.rewarded?.setMetadata(key, value)
    }

    @ReactMethod
    fun setMetadata(instanceId: String, metadataJson: String) {
        val metadata = parseMetadata(metadataJson) ?: return
        val entry = entries[instanceId] ?: return
        entry.interstitial?.setMetadata(metadata)
        entry.rewarded?.setMetadata(metadata)
    }

    private fun parseMetadata(json: String): Map<String, String>? = try {
        val objectValue = JSONObject(json)
        objectValue.keys().asSequence()
            .sorted()
            .mapNotNull { key ->
                if (key.isEmpty()) null
                else objectValue.opt(key)?.let { value -> (value as? String)?.let { key to it } }
            }
            .take(10)
            .toMap()
    } catch (_: Exception) {
        null
    }

    @ReactMethod
    fun destroyAd(instanceId: String) {
        entries.remove(instanceId)?.let { entry ->
            entry.interstitial?.listener = null
            entry.rewarded?.listener = null
        }
    }

    // ── Load / show ───────────────────────────────────────────────────────────

    @ReactMethod
    fun loadAd(instanceId: String, options: ReadableMap) {
        val entry = entries[instanceId] ?: return
        val charId = options.getStringOrNull("charId")
        val charName = options.getStringOrNull("charName")
        val charImage = options.getStringOrNull("charImage")
        val charDesc = options.getStringOrNull("charDesc")
        entry.interstitial?.load(charId, charName, charImage, charDesc)
        entry.rewarded?.load(charId, charName, charImage, charDesc)
    }

    @ReactMethod
    fun showAd(instanceId: String) {
        val entry = entries[instanceId] ?: return
        val activity = reactApplicationContext.currentActivity
        if (activity != null) {
            entry.interstitial?.show(activity)
            entry.rewarded?.show(activity)
        } else {
            entry.interstitial?.show()
            entry.rewarded?.show()
        }
    }

    @ReactMethod
    fun showAdPreview(instanceId: String, options: ReadableMap) {
        val entry = entries[instanceId] ?: return
        val activity = reactApplicationContext.currentActivity ?: return
        entry.interstitial?.showPreview(
            activity = activity,
            closeTreatment = options.getStringOrNull("closeTreatment") ?: "hidden",
            closePosition = options.getStringOrNull("closePosition") ?: "top_right",
            delaySeconds = options.getIntOrNull("delaySeconds") ?: 5,
            progressBarColor = options.getStringOrNull("progressBarColor") ?: "#FFFFFF",
            adUnitType = options.getStringOrNull("adUnitType") ?: "interstitial",
            storePrompt = options.getBooleanOrNull("storePrompt") ?: false,
            installBanner = options.getBooleanOrNull("installBanner") ?: false,
        )
        entry.rewarded?.showPreview(
            activity = activity,
            durationSeconds = options.getIntOrNull("durationSeconds") ?: 8,
            storePrompt = options.getBooleanOrNull("storePrompt") ?: true,
            storePromptPlatform = options.getStringOrNull("storePromptPlatform") ?: "android",
        )
    }

    // ── Privacy ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun applyConsent(config: ReadableMap) {
        config.toSimulaPrivacyConfig()?.let(SimulaPrivacy::apply)
    }

    @ReactMethod
    fun updateConsent(partial: ReadableMap) {
        SimulaPrivacy.update(
            hasPrivacyConsent = partial.getBooleanOrNull("hasPrivacyConsent"),
            tcString = partial.getStringOrNull("tcString"),
            uspString = partial.getStringOrNull("uspString"),
            gppString = partial.getStringOrNull("gppString"),
            gppSid = partial.getStringOrNull("gppSid"),
            gdprApplies = partial.getBooleanOrNull("gdprApplies"),
            tcfPurpose1Consent = partial.getBooleanOrNull("tcfPurpose1Consent"),
            coppaApplies = partial.getBooleanOrNull("coppaApplies"),
            enableAdvertisingId = partial.getBooleanOrNull("enableAdvertisingId"),
        )
    }

    @ReactMethod
    fun clearConsent(flags: ReadableMap) {
        SimulaPrivacy.clearConsent(
            tcString = flags.getBooleanOrNull("tcString") ?: false,
            uspString = flags.getBooleanOrNull("uspString") ?: false,
            gppString = flags.getBooleanOrNull("gppString") ?: false,
            gppSid = flags.getBooleanOrNull("gppSid") ?: false,
            gdprApplies = flags.getBooleanOrNull("gdprApplies") ?: false,
            tcfPurpose1Consent = flags.getBooleanOrNull("tcfPurpose1Consent") ?: false,
        )
    }

    /** Android has no App Tracking Transparency — always resolves "unavailable". */
    @ReactMethod
    fun requestTrackingAuthorization(promise: Promise) {
        promise.resolve("unavailable")
    }

    @ReactMethod
    fun getTrackingAuthorizationStatus(promise: Promise) {
        promise.resolve("unavailable")
    }

    // ── Listeners → events ──────────────────────────────────────────────────────

    private fun interstitialListener(instanceId: String) =
        object : SimulaInterstitialAdListener {
            override fun onAdLoaded(ad: SimulaInterstitialAd) =
                emitSimple(instanceId, "interstitial", "LOADED")
            override fun onAdFailedToLoad(ad: SimulaInterstitialAd, error: SimulaAdError) =
                emitError(instanceId, "interstitial", "LOAD_FAILED", error)
            override fun onAdDisplayed(ad: SimulaInterstitialAd) =
                emitSimple(instanceId, "interstitial", "DISPLAYED")
            override fun onAdImpression(ad: SimulaInterstitialAd) =
                emitSimple(instanceId, "interstitial", "IMPRESSION")
            override fun onAdPaid(ad: SimulaInterstitialAd, adValue: AdValue) =
                emitPaid(instanceId, "interstitial", adValue)
            override fun onAdFailedToDisplay(ad: SimulaInterstitialAd, error: SimulaAdError) =
                emitError(instanceId, "interstitial", "DISPLAY_FAILED", error)
            override fun onAdClicked(ad: SimulaInterstitialAd) =
                emitSimple(instanceId, "interstitial", "CLICKED")
            override fun onAdClosed(ad: SimulaInterstitialAd) =
                emitSimple(instanceId, "interstitial", "CLOSED")
        }

    private fun rewardedListener(instanceId: String) =
        object : SimulaRewardedAdListener {
            override fun onAdLoaded(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "LOADED")
            override fun onAdFailedToLoad(ad: SimulaRewardedAd, error: SimulaAdError) =
                emitError(instanceId, "rewarded", "LOAD_FAILED", error)
            override fun onAdDisplayed(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "DISPLAYED")
            override fun onAdImpression(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "IMPRESSION")
            override fun onAdPaid(ad: SimulaRewardedAd, adValue: AdValue) =
                emitPaid(instanceId, "rewarded", adValue)
            override fun onAdFailedToDisplay(ad: SimulaRewardedAd, error: SimulaAdError) =
                emitError(instanceId, "rewarded", "DISPLAY_FAILED", error)
            override fun onAdClicked(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "CLICKED")
            override fun onAdEarnedReward(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "EARNED_REWARD")
            override fun onAdRewardVerified(ad: SimulaRewardedAd, token: String?) =
                emitRewardVerified(instanceId, token)
            override fun onAdRewardVerificationFailed(ad: SimulaRewardedAd, error: Throwable) =
                emitVerificationFailed(instanceId, error)
            override fun onAdClosed(ad: SimulaRewardedAd) =
                emitSimple(instanceId, "rewarded", "CLOSED")
        }

    // ── Event emission ──────────────────────────────────────────────────────────

    private fun baseEvent(instanceId: String, adType: String, type: String): WritableMap =
        Arguments.createMap().apply {
            putString("instanceId", instanceId)
            putString("adType", adType)
            putString("type", type)
        }

    private fun emitSimple(instanceId: String, adType: String, type: String) {
        sendEvent(baseEvent(instanceId, adType, type))
    }

    private fun emitError(instanceId: String, adType: String, type: String, error: SimulaAdError) {
        val (code, retry) = mapError(error)
        val map = baseEvent(instanceId, adType, type)
        map.putString("code", code)
        map.putString("message", error.message ?: "")
        if (retry != null) map.putInt("retryInSeconds", retry)
        sendEvent(map)
    }

    private fun emitVerificationFailed(instanceId: String, error: Throwable) {
        val map = baseEvent(instanceId, "rewarded", "REWARD_VERIFICATION_FAILED")
        map.putString("code", "verification_failed")
        map.putString("message", error.message ?: "")
        sendEvent(map)
    }

    private fun emitRewardVerified(instanceId: String, token: String?) {
        val map = baseEvent(instanceId, "rewarded", "REWARD_VERIFIED")
        if (token != null) map.putString("token", token) else map.putNull("token")
        sendEvent(map)
    }

    /** PAID event — flattens the [AdValue] estimate onto the wire (see `eventRouter`). */
    private fun emitPaid(instanceId: String, adType: String, value: AdValue) {
        val map = baseEvent(instanceId, adType, "PAID")
        map.putDouble("valueMicros", value.valueMicros.toDouble())
        map.putString("currencyCode", value.currencyCode)
        map.putString("precisionType", value.precisionType.name)
        map.putDouble("expectedCpm", value.expectedCpm)
        map.putDouble("expectedRevenue", value.expectedRevenue)
        sendEvent(map)
    }

    private fun sendEvent(params: WritableMap) {
        // Bridge may be tearing down (reload / host destroy). emitDeviceEvent routes
        // through the legacy RCTDeviceEventEmitter under the old architecture and the
        // Bridgeless event emitter under the new one, so this works on both.
        if (!reactApplicationContext.hasActiveReactInstance()) return
        reactApplicationContext.emitDeviceEvent("SimulaAds_onAdEvent", params)
    }

    // ── Error mapping ─────────────────────────────────────────────────────────
    //
    // Replicated locally because the SDK's telemetryCode() is internal. Returns the
    // stable JS code and, for duplicate_request, the retry seconds parsed from the
    // contractual message ("...load() again in N seconds.").

    private val retryRegex = Regex("""in (\d+) seconds""")

    private fun mapError(error: SimulaAdError): Pair<String, Int?> = when (error) {
        is SimulaAdError.NotInitialized -> "not_initialized" to null
        is SimulaAdError.NoSession -> "no_session" to null
        is SimulaAdError.NoFill -> "no_fill" to null
        is SimulaAdError.NotReady -> "not_ready" to null
        is SimulaAdError.Stale -> "stale" to null
        is SimulaAdError.DuplicateRequest ->
            "duplicate_request" to retryRegex.find(error.message ?: "")?.groupValues?.get(1)?.toIntOrNull()
        is SimulaAdError.AlreadyShowing -> "already_showing" to null
        is SimulaAdError.NoPresentationContext -> "no_presentation_context" to null
        is SimulaAdError.Network -> "network" to null
        SimulaAdError.AdUnitNotFound -> "ad_unit_not_found" to null
    }

    // ── ReadableMap extensions ────────────────────────────────────────────────

    private fun ReadableMap.getStringOrNull(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    private fun ReadableMap.getBooleanOrNull(key: String): Boolean? =
        if (hasKey(key) && !isNull(key)) getBoolean(key) else null

    private fun ReadableMap.getIntOrNull(key: String): Int? =
        if (hasKey(key) && !isNull(key)) getInt(key) else null

    // ── NativeEventEmitter required methods ─────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    override fun invalidate() {
        for (entry in entries.values) {
            entry.interstitial?.listener = null
            entry.rewarded?.listener = null
        }
        entries.clear()
        super.invalidate()
    }
}
