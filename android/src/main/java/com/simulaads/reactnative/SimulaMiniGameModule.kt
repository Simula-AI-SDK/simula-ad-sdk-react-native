package com.simulaads.reactnative

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import ad.simula.ad.sdk.minigame.MiniGameMenu
import ad.simula.ad.sdk.minigame.MiniGameButton
import ad.simula.ad.sdk.minigame.MiniGameInvitation
import ad.simula.ad.sdk.minigame.MiniGameInterstitial
import ad.simula.ad.sdk.model.Message
import ad.simula.ad.sdk.model.MiniGameTheme
import ad.simula.ad.sdk.model.MiniGameButtonTheme
import ad.simula.ad.sdk.model.MiniGameInvitationTheme
import ad.simula.ad.sdk.model.MiniGameInvitationAnimation
import ad.simula.ad.sdk.model.MiniGameInterstitialTheme
import ad.simula.ad.sdk.provider.SimulaProvider

class SimulaMiniGameModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SimulaMiniGameModule"

    // ── Menu state ──────────────────────────────────────────────────────
    private var menuComposeView: ComposeView? = null
    private var isMenuOpen by mutableStateOf(false)

    // ── Button state ────────────────────────────────────────────────────
    private var buttonComposeView: ComposeView? = null

    // ── Invitation state ────────────────────────────────────────────────
    private var invitationComposeView: ComposeView? = null
    private var isInvitationOpen by mutableStateOf(false)

    // ── Interstitial state ──────────────────────────────────────────────
    private var interstitialComposeView: ComposeView? = null
    private var isInterstitialOpen by mutableStateOf(false)

    // ═══════════════════════════════════════════════════════════════════
    // MiniGameMenu
    // ═══════════════════════════════════════════════════════════════════

    @ReactMethod
    fun showMiniGameMenu(props: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val apiKey = props.getString("apiKey")
        val charName = props.getString("charName")
        val charID = props.getString("charID")
        if (apiKey == null || charName == null || charID == null) {
            promise.reject("INVALID_PROPS", "Missing required props: apiKey, charName, or charID")
            return
        }
        val charImage = props.getString("charImage") ?: ""
        val charDesc = props.getStringOrNull("charDesc")
        val delegateChar = if (props.hasKey("delegateChar")) props.getBoolean("delegateChar") else true
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val devMode = if (props.hasKey("devMode")) props.getBoolean("devMode") else false
        val primaryUserID = props.getStringOrNull("primaryUserID")
        val maxGamesToShow = if (props.hasKey("maxGamesToShow") && !props.isNull("maxGamesToShow"))
            props.getInt("maxGamesToShow") else 6

        val messages = if (props.hasKey("messages") && !props.isNull("messages"))
            convertMessages(props.getArray("messages")) else emptyList()
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertTheme(props.getMap("theme")) else MiniGameTheme()

        activity.runOnUiThread {
            removeComposeView(menuComposeView)

            isMenuOpen = true

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                        devMode = devMode,
                        primaryUserID = primaryUserID,
                    ) {
                        MiniGameMenu(
                            isOpen = isMenuOpen,
                            onClose = {
                                isMenuOpen = false
                                activity.runOnUiThread { removeComposeView(menuComposeView); menuComposeView = null }
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

            menuComposeView = view
            addOverlay(activity, view)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hideMiniGameMenu() {
        isMenuOpen = false
        reactApplicationContext.currentActivity?.runOnUiThread {
            removeComposeView(menuComposeView)
            menuComposeView = null
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MiniGameButton
    // ═══════════════════════════════════════════════════════════════════

    @ReactMethod
    fun showMiniGameButton(props: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val apiKey = props.getString("apiKey")
        if (apiKey == null) {
            promise.reject("INVALID_PROPS", "Missing required prop: apiKey")
            return
        }
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val devMode = if (props.hasKey("devMode")) props.getBoolean("devMode") else false
        val primaryUserID = props.getStringOrNull("primaryUserID")

        val text = props.getStringOrNull("text")
        val showPulsate = if (props.hasKey("showPulsate")) props.getBoolean("showPulsate") else false
        val showBadge = if (props.hasKey("showBadge")) props.getBoolean("showBadge") else false
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertButtonTheme(props.getMap("theme")) else MiniGameButtonTheme()
        val width = props.getDimensionOrNull("width")

        activity.runOnUiThread {
            removeComposeView(buttonComposeView)

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                        devMode = devMode,
                        primaryUserID = primaryUserID,
                    ) {
                        MiniGameButton(
                            text = text,
                            showPulsate = showPulsate,
                            showBadge = showBadge,
                            theme = theme,
                            width = width,
                            onClick = {
                                sendEvent("onMiniGameButtonClick", null)
                            },
                        )
                    }
                }
            }

            buttonComposeView = view
            addOverlay(activity, view)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hideMiniGameButton() {
        reactApplicationContext.currentActivity?.runOnUiThread {
            removeComposeView(buttonComposeView)
            buttonComposeView = null
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MiniGameInvitation
    // ═══════════════════════════════════════════════════════════════════

    @ReactMethod
    fun showMiniGameInvitation(props: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val apiKey = props.getString("apiKey")
        if (apiKey == null) {
            promise.reject("INVALID_PROPS", "Missing required prop: apiKey")
            return
        }
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val devMode = if (props.hasKey("devMode")) props.getBoolean("devMode") else false
        val primaryUserID = props.getStringOrNull("primaryUserID")

        val titleText = props.getStringOrNull("titleText") ?: "Want to play a game?"
        val subText = props.getStringOrNull("subText") ?: "Take a break and challenge yourself!"
        val ctaText = props.getStringOrNull("ctaText") ?: "Play a Game"
        val charImage = props.getString("charImage")
        if (charImage == null) {
            promise.reject("INVALID_PROPS", "Missing required prop: charImage")
            return
        }
        val animation = if (props.hasKey("animation") && !props.isNull("animation"))
            MiniGameInvitationAnimation.fromString(props.getString("animation") ?: "auto")
            else MiniGameInvitationAnimation.AUTO
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertInvitationTheme(props.getMap("theme")) else MiniGameInvitationTheme()
        val autoCloseDuration = if (props.hasKey("autoCloseDuration") && !props.isNull("autoCloseDuration"))
            props.getDouble("autoCloseDuration").toLong() else null
        val width = props.getDimensionOrNull("width")
        val top = props.getDimensionOrNull("top")

        activity.runOnUiThread {
            removeComposeView(invitationComposeView)

            isInvitationOpen = true

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                        devMode = devMode,
                        primaryUserID = primaryUserID,
                    ) {
                        MiniGameInvitation(
                            titleText = titleText,
                            subText = subText,
                            ctaText = ctaText,
                            charImage = charImage,
                            animation = animation,
                            theme = theme,
                            isOpen = isInvitationOpen,
                            autoCloseDuration = autoCloseDuration,
                            width = width,
                            top = top,
                            onClick = {
                                sendEvent("onMiniGameInvitationClick", null)
                            },
                            onClose = {
                                isInvitationOpen = false
                                activity.runOnUiThread {
                                    removeComposeView(invitationComposeView)
                                    invitationComposeView = null
                                }
                                sendEvent("onMiniGameInvitationClose", null)
                            },
                        )
                    }
                }
            }

            invitationComposeView = view
            addOverlay(activity, view)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hideMiniGameInvitation() {
        isInvitationOpen = false
        reactApplicationContext.currentActivity?.runOnUiThread {
            removeComposeView(invitationComposeView)
            invitationComposeView = null
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MiniGameInterstitial
    // ═══════════════════════════════════════════════════════════════════

    @ReactMethod
    fun showMiniGameInterstitial(props: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val apiKey = props.getString("apiKey")
        if (apiKey == null) {
            promise.reject("INVALID_PROPS", "Missing required prop: apiKey")
            return
        }
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val devMode = if (props.hasKey("devMode")) props.getBoolean("devMode") else false
        val primaryUserID = props.getStringOrNull("primaryUserID")

        val charImage = props.getString("charImage")
        if (charImage == null) {
            promise.reject("INVALID_PROPS", "Missing required prop: charImage")
            return
        }
        val invitationText = props.getStringOrNull("invitationText") ?: "Want to play a game?"
        val ctaText = props.getStringOrNull("ctaText") ?: "Play a Game"
        val backgroundImage = props.getStringOrNull("backgroundImage")
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertInterstitialTheme(props.getMap("theme")) else MiniGameInterstitialTheme()

        activity.runOnUiThread {
            removeComposeView(interstitialComposeView)

            isInterstitialOpen = true

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                        devMode = devMode,
                        primaryUserID = primaryUserID,
                    ) {
                        MiniGameInterstitial(
                            charImage = charImage,
                            invitationText = invitationText,
                            ctaText = ctaText,
                            backgroundImage = backgroundImage,
                            theme = theme,
                            isOpen = isInterstitialOpen,
                            onClick = {
                                sendEvent("onMiniGameInterstitialClick", null)
                            },
                            onClose = {
                                isInterstitialOpen = false
                                activity.runOnUiThread {
                                    removeComposeView(interstitialComposeView)
                                    interstitialComposeView = null
                                }
                                sendEvent("onMiniGameInterstitialClose", null)
                            },
                        )
                    }
                }
            }

            interstitialComposeView = view
            addOverlay(activity, view)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hideMiniGameInterstitial() {
        isInterstitialOpen = false
        reactApplicationContext.currentActivity?.runOnUiThread {
            removeComposeView(interstitialComposeView)
            interstitialComposeView = null
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Shared helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun addOverlay(activity: android.app.Activity, view: ComposeView) {
        val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
        rootView.addView(
            view,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        )
    }

    private fun removeComposeView(view: ComposeView?) {
        view?.let { v ->
            (v.parent as? ViewGroup)?.removeView(v)
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ── Message conversion ──────────────────────────────────────────────

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

    // ── Theme conversions ───────────────────────────────────────────────

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

    private fun convertInvitationTheme(map: ReadableMap?): MiniGameInvitationTheme {
        if (map == null) return MiniGameInvitationTheme()
        return MiniGameInvitationTheme(
            cornerRadius = map.getIntOrNull("cornerRadius"),
            backgroundColor = map.getStringOrNull("backgroundColor"),
            textColor = map.getStringOrNull("textColor"),
            titleTextColor = map.getStringOrNull("titleTextColor"),
            subTextColor = map.getStringOrNull("subTextColor"),
            ctaTextColor = map.getStringOrNull("ctaTextColor"),
            ctaColor = map.getStringOrNull("ctaColor"),
            charImageCornerRadius = map.getIntOrNull("charImageCornerRadius"),
            charImageAnchor = map.getStringOrNull("charImageAnchor"),
            borderWidth = map.getIntOrNull("borderWidth"),
            borderColor = map.getStringOrNull("borderColor"),
            fontFamily = map.getStringOrNull("fontFamily"),
            fontSize = map.getIntOrNull("fontSize"),
        )
    }

    private fun convertInterstitialTheme(map: ReadableMap?): MiniGameInterstitialTheme {
        if (map == null) return MiniGameInterstitialTheme()
        return MiniGameInterstitialTheme(
            ctaCornerRadius = map.getIntOrNull("ctaCornerRadius"),
            characterSize = map.getIntOrNull("characterSize"),
            titleTextColor = map.getStringOrNull("titleTextColor"),
            titleFontSize = map.getIntOrNull("titleFontSize"),
            ctaTextColor = map.getStringOrNull("ctaTextColor"),
            ctaFontSize = map.getIntOrNull("ctaFontSize"),
            ctaColor = map.getStringOrNull("ctaColor"),
            fontFamily = map.getStringOrNull("fontFamily"),
        )
    }

    // ── ReadableMap extensions ───────────────────────────────────────────

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

    private fun ReadableMap.getDimensionOrNull(key: String): Any? {
        if (!hasKey(key) || isNull(key)) return null
        return try {
            getDouble(key)
        } catch (_: Exception) {
            try { getString(key) } catch (_: Exception) { null }
        }
    }

    // ── NativeEventEmitter required methods ─────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
