package com.simulaads.reactnative

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * View manager for the React Native `<NativeAd>` component (`SimulaNativeAdView`).
 *
 * Stores props as they arrive and commits them once per transaction in
 * [onAfterUpdateTransaction], so the hosted `NativeAdSlot` re-composes only on a real
 * change. Height + viewability/error flow back to JS as direct events.
 *
 * Extends the architecture-specific [SimulaNativeAdViewManagerSpec] (`src/newarch` wires
 * the Fabric codegen delegate; `src/oldarch` is a plain SimpleViewManager — see
 * `android/build.gradle`). The `@ReactProp` annotations drive prop updates on the old
 * architecture and are harmless redundancy on the new one.
 */
class SimulaNativeAdViewManager : SimulaNativeAdViewManagerSpec() {

    override fun getName(): String = "SimulaNativeAdView"

    override fun createViewInstance(reactContext: ThemedReactContext): SimulaNativeAdView =
        SimulaNativeAdView(reactContext)

    @ReactProp(name = "adUnitId")
    override fun setAdUnitId(view: SimulaNativeAdView, value: String?) {
        view.adUnitId = value
    }

    // Wire name is `adPosition`: `position` is a reserved RN layout prop (LayoutShadowNode
    // expects a Yoga position-type String and throws on our Int during shadow-node update).
    @ReactProp(name = "adPosition", defaultInt = 0)
    override fun setAdPosition(view: SimulaNativeAdView, value: Int) {
        view.position = value
    }

    @ReactProp(name = "theme")
    override fun setTheme(view: SimulaNativeAdView, value: String?) {
        view.theme = value
    }

    @ReactProp(name = "extraParametersJson")
    override fun setExtraParametersJson(view: SimulaNativeAdView, value: String?) {
        view.extraParametersJson = value
    }

    @ReactProp(name = "preloadedAdId")
    override fun setPreloadedAdId(view: SimulaNativeAdView, value: String?) {
        view.preloadedAdId = value
    }

    @ReactProp(name = "previewHtml")
    override fun setPreviewHtml(view: SimulaNativeAdView, value: String?) {
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
