package com.simulaads.reactnative

import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import ad.simula.ad.sdk.model.MiniGameButtonTheme

/**
 * View manager for the inline React Native `<MiniGameButton>`
 * (`SimulaMiniGameButtonView`). Stores props as they arrive and commits them once per
 * transaction so the hosted composable re-composes only on a real change.
 *
 * Extends the architecture-specific [SimulaMiniGameButtonViewManagerSpec] — see
 * SimulaNativeAdViewManagerSpec.kt for the newarch/oldarch split rationale. `theme` is an
 * `UnsafeMixed` prop in the JS spec (a heterogeneous config object), which codegen types
 * as [Dynamic] rather than `ReadableMap`; [setTheme] narrows it to a map itself.
 */
class SimulaMiniGameButtonViewManager : SimulaMiniGameButtonViewManagerSpec() {

    override fun getName(): String = "SimulaMiniGameButtonView"

    override fun createViewInstance(reactContext: ThemedReactContext): SimulaMiniGameButtonView =
        SimulaMiniGameButtonView(reactContext)

    @ReactProp(name = "text")
    override fun setText(view: SimulaMiniGameButtonView, value: String?) {
        view.text = value
    }

    @ReactProp(name = "showPulsate", defaultBoolean = false)
    override fun setShowPulsate(view: SimulaMiniGameButtonView, value: Boolean) {
        view.showPulsate = value
    }

    @ReactProp(name = "showBadge", defaultBoolean = false)
    override fun setShowBadge(view: SimulaMiniGameButtonView, value: Boolean) {
        view.showBadge = value
    }

    @ReactProp(name = "theme")
    override fun setTheme(view: SimulaMiniGameButtonView, value: Dynamic) {
        val map = if (value.type == ReadableType.Map) value.asMap() else null
        view.theme = convertButtonTheme(map)
    }

    override fun onAfterUpdateTransaction(view: SimulaMiniGameButtonView) {
        super.onAfterUpdateTransaction(view)
        view.commitProps()
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
        mutableMapOf(
            "onButtonPress" to mapOf("registrationName" to "onButtonPress"),
            "onButtonSizeChange" to mapOf("registrationName" to "onButtonSizeChange"),
        )

    private fun convertButtonTheme(map: ReadableMap?): MiniGameButtonTheme {
        if (map == null) return MiniGameButtonTheme()
        return MiniGameButtonTheme(
            cornerRadius = map.getIntOrNull("cornerRadius"),
            backgroundColor = map.getStringOrNull("backgroundColor"),
            textColor = map.getStringOrNull("textColor"),
            fontSize = map.getIntOrNull("fontSize"),
            fontFamily = map.getStringOrNull("fontFamily"),
            padding = map.getDimensionOrNull("padding"),
            borderWidth = map.getIntOrNull("borderWidth"),
            borderColor = map.getStringOrNull("borderColor"),
            pulsateColor = map.getStringOrNull("pulsateColor"),
            badgeColor = map.getStringOrNull("badgeColor"),
        )
    }

    private fun ReadableMap.getIntOrNull(key: String): Int? =
        if (hasKey(key) && !isNull(key)) getInt(key) else null

    private fun ReadableMap.getStringOrNull(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    private fun ReadableMap.getDimensionOrNull(key: String): Any? {
        if (!hasKey(key) || isNull(key)) return null
        return when (getType(key)) {
            ReadableType.Number -> getDouble(key)
            ReadableType.String -> getString(key)
            else -> null
        }
    }
}
