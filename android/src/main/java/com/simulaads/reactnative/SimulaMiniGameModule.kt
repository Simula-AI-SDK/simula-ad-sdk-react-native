package com.simulaads.reactnative

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import ad.simula.ad.sdk.minigame.MiniGameMenu
import ad.simula.ad.sdk.model.Message
import ad.simula.ad.sdk.model.MiniGameTheme
import ad.simula.ad.sdk.provider.SimulaProvider

class SimulaMiniGameModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SimulaMiniGameModule"

    private var composeView: ComposeView? = null
    private var isMenuOpen by mutableStateOf(false)

    @ReactMethod
    fun showMiniGameMenu(props: ReadableMap) {
        val activity = reactApplicationContext.currentActivity ?: return

        val apiKey = props.getString("apiKey") ?: return
        val charName = props.getString("charName") ?: return
        val charID = props.getString("charID") ?: return
        val charImage = props.getString("charImage") ?: ""
        val charDesc = if (props.hasKey("charDesc") && !props.isNull("charDesc"))
            props.getString("charDesc") else null
        val delegateChar = if (props.hasKey("delegateChar")) props.getBoolean("delegateChar") else true
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val maxGamesToShow = if (props.hasKey("maxGamesToShow"))
            props.getInt("maxGamesToShow") else 6

        val messages = if (props.hasKey("messages") && !props.isNull("messages"))
            convertMessages(props.getArray("messages")) else emptyList()
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertTheme(props.getMap("theme")) else MiniGameTheme()

        activity.runOnUiThread {
            // Remove any existing ComposeView
            removeComposeView()

            isMenuOpen = true

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                    ) {
                        MiniGameMenu(
                            isOpen = isMenuOpen,
                            onClose = {
                                isMenuOpen = false
                                activity.runOnUiThread { removeComposeView() }
                                sendEvent("onMiniGameMenuClose", null)
                            },
                            charName = charName,
                            charID = charID,
                            charImage = charImage,
                            messages = messages,
                            charDesc = charDesc,
                            maxGamesToShow = maxGamesToShow,
                            theme = theme,
                            delegateChar = delegateChar,
                        )
                    }
                }
            }

            composeView = view

            // Add as overlay to the Activity's root content view
            val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
            rootView.addView(
                view,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                )
            )
        }
    }

    @ReactMethod
    fun hideMiniGameMenu() {
        isMenuOpen = false
        reactApplicationContext.currentActivity?.runOnUiThread { removeComposeView() }
    }

    private fun removeComposeView() {
        composeView?.let { view ->
            (view.parent as? ViewGroup)?.removeView(view)
        }
        composeView = null
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun convertMessages(array: ReadableArray?): List<Message> {
        if (array == null) return emptyList()
        val messages = mutableListOf<Message>()
        for (i in 0 until array.size()) {
            val map = array.getMap(i) ?: continue
            val role = map.getString("role") ?: continue
            val content = map.getString("content") ?: continue
            messages.add(Message(role = role, content = content))
        }
        return messages
    }

    private fun convertTheme(map: ReadableMap?): MiniGameTheme {
        if (map == null) return MiniGameTheme()
        return MiniGameTheme(
            backgroundColor = map.getStringOrNull("backgroundColor"),
            headerColor = map.getStringOrNull("headerColor"),
            borderColor = map.getStringOrNull("borderColor"),
            titleFont = map.getStringOrNull("titleFont"),
            secondaryFont = map.getStringOrNull("secondaryFont"),
            titleFontColor = map.getStringOrNull("titleFontColor"),
            secondaryFontColor = map.getStringOrNull("secondaryFontColor"),
            iconCornerRadius = map.getIntOrNull("iconCornerRadius"),
            accentColor = map.getStringOrNull("accentColor"),
            playableHeight = map.getPlayableHeight(),
            playableBorderColor = map.getStringOrNull("playableBorderColor"),
        )
    }

    private fun ReadableMap.getStringOrNull(key: String): String? {
        return if (hasKey(key) && !isNull(key)) getString(key) else null
    }

    private fun ReadableMap.getIntOrNull(key: String): Int? {
        return if (hasKey(key) && !isNull(key)) getInt(key) else null
    }

    private fun ReadableMap.getPlayableHeight(): Any? {
        if (!hasKey("playableHeight") || isNull("playableHeight")) return null
        return try {
            getDouble("playableHeight")
        } catch (_: Exception) {
            try { getString("playableHeight") } catch (_: Exception) { null }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
