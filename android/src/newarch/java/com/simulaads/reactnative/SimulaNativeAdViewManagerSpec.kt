package com.simulaads.reactnative

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.SimulaNativeAdViewManagerDelegate
import com.facebook.react.viewmanagers.SimulaNativeAdViewManagerInterface

/**
 * New Architecture base for [SimulaNativeAdViewManager] (see `src/oldarch` for the
 * counterpart; `android/build.gradle` picks one per build).
 *
 * This variant wires up the Fabric codegen output (`SimulaNativeAdViewManagerInterface` /
 * `...Delegate`, generated from `src/nativeAd/NativeAdNativeComponent.ts` by the host
 * app's own RN version). Keeping the codegen references isolated here — instead of
 * hand-vendoring generated classes — means the generated code always matches the host's
 * RN version; the generated Java shapes are NOT stable across RN releases (e.g. the
 * delegate's generics and the `ViewManagerWithGeneratedInterface` marker changed between
 * RN 0.76 and 0.85).
 */
abstract class SimulaNativeAdViewManagerSpec :
    SimpleViewManager<SimulaNativeAdView>(),
    SimulaNativeAdViewManagerInterface<SimulaNativeAdView> {

    private val delegate: ViewManagerDelegate<SimulaNativeAdView> =
        SimulaNativeAdViewManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<SimulaNativeAdView> = delegate
}
