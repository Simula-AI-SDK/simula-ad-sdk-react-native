package com.simulaads.reactnative

import com.facebook.react.bridge.Dynamic
import com.facebook.react.uimanager.SimpleViewManager

/**
 * Old Architecture base for [SimulaMiniGameButtonViewManager]. See
 * SimulaNativeAdViewManagerSpec.kt (sibling file) for the newarch/oldarch split rationale.
 */
abstract class SimulaMiniGameButtonViewManagerSpec : SimpleViewManager<SimulaMiniGameButtonView>() {
    abstract fun setText(view: SimulaMiniGameButtonView, value: String?)
    abstract fun setShowPulsate(view: SimulaMiniGameButtonView, value: Boolean)
    abstract fun setShowBadge(view: SimulaMiniGameButtonView, value: Boolean)
    abstract fun setTheme(view: SimulaMiniGameButtonView, value: Dynamic)
}
