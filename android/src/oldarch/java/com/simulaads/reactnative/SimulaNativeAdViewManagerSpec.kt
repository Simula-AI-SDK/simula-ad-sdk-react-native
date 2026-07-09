package com.simulaads.reactnative

import com.facebook.react.uimanager.SimpleViewManager

/**
 * Old Architecture base for [SimulaNativeAdViewManager] (see `src/newarch` for the
 * counterpart; `android/build.gradle` picks one per build).
 *
 * No codegen runs on the old architecture, so this variant is a plain
 * [SimpleViewManager]: props flow through the `@ReactProp` annotations on the concrete
 * manager exactly as they did before the Fabric migration. The setter methods declared
 * abstract here mirror the codegen-generated `SimulaNativeAdViewManagerInterface` so the
 * concrete manager can `override` them identically on both architectures.
 */
abstract class SimulaNativeAdViewManagerSpec : SimpleViewManager<SimulaNativeAdView>() {
    abstract fun setAdUnitId(view: SimulaNativeAdView, value: String?)
    abstract fun setAdPosition(view: SimulaNativeAdView, value: Int)
    abstract fun setTheme(view: SimulaNativeAdView, value: String?)
    abstract fun setPreloadedAdId(view: SimulaNativeAdView, value: String?)
    abstract fun setPreviewHtml(view: SimulaNativeAdView, value: String?)
}
