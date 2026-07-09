package com.simulaads.reactnative

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.SimulaMiniGameButtonViewManagerDelegate
import com.facebook.react.viewmanagers.SimulaMiniGameButtonViewManagerInterface

/**
 * New Architecture base for [SimulaMiniGameButtonViewManager]. See
 * SimulaNativeAdViewManagerSpec.kt (sibling file) for the newarch/oldarch split rationale.
 */
abstract class SimulaMiniGameButtonViewManagerSpec :
    SimpleViewManager<SimulaMiniGameButtonView>(),
    SimulaMiniGameButtonViewManagerInterface<SimulaMiniGameButtonView> {

    private val delegate: ViewManagerDelegate<SimulaMiniGameButtonView> =
        SimulaMiniGameButtonViewManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<SimulaMiniGameButtonView> = delegate
}
