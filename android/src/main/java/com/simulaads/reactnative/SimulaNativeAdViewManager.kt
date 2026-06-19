package com.simulaads.reactnative

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * View manager for the React Native `<NativeAd>` component (`SimulaNativeAdView`).
 *
 * Stores props as they arrive and commits them once per transaction in
 * [onAfterUpdateTransaction], so the hosted `NativeAdSlot` re-composes only on a real
 * change. Height + viewability/error flow back to JS as direct events.
 */
class SimulaNativeAdViewManager : SimpleViewManager<SimulaNativeAdView>() {

    override fun getName(): String = "SimulaNativeAdView"

    override fun createViewInstance(reactContext: ThemedReactContext): SimulaNativeAdView =
        SimulaNativeAdView(reactContext)

    @ReactProp(name = "adUnitId")
    fun setAdUnitId(view: SimulaNativeAdView, value: String?) {
        view.adUnitId = value
    }

    @ReactProp(name = "position", defaultInt = 0)
    fun setPosition(view: SimulaNativeAdView, value: Int) {
        view.position = value
    }

    @ReactProp(name = "theme")
    fun setTheme(view: SimulaNativeAdView, value: String?) {
        view.theme = value
    }

    @ReactProp(name = "preloadedAdId")
    fun setPreloadedAdId(view: SimulaNativeAdView, value: String?) {
        view.preloadedAdId = value
    }

    @ReactProp(name = "previewHtml")
    fun setPreviewHtml(view: SimulaNativeAdView, value: String?) {
        view.previewHtml = value
    }

    override fun onAfterUpdateTransaction(view: SimulaNativeAdView) {
        super.onAfterUpdateTransaction(view)
        view.commitProps()
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
        mutableMapOf(
            "onAdSizeChange" to mapOf("registrationName" to "onAdSizeChange"),
            "onAdImpression" to mapOf("registrationName" to "onAdImpression"),
            "onAdClick" to mapOf("registrationName" to "onAdClick"),
            "onAdPaid" to mapOf("registrationName" to "onAdPaid"),
            "onAdError" to mapOf("registrationName" to "onAdError"),
        )
}
