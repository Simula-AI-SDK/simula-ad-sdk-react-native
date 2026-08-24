package com.simulaads.reactnative

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import ad.simula.ad.sdk.ads.SimulaAds
import ad.simula.ad.sdk.character.CharacterSelector
import ad.simula.ad.sdk.minigame.MiniGameMenu
import ad.simula.ad.sdk.minigame.MiniGameButton
import ad.simula.ad.sdk.minigame.MiniGameInvitation
import ad.simula.ad.sdk.minigame.MiniGameInterstitial
import ad.simula.ad.sdk.model.CharacterData
import ad.simula.ad.sdk.model.CharacterSelectorTheme
import ad.simula.ad.sdk.model.Message
import ad.simula.ad.sdk.model.MiniGameTheme
import ad.simula.ad.sdk.model.MiniGameButtonTheme
import ad.simula.ad.sdk.model.MiniGameInvitationTheme
import ad.simula.ad.sdk.model.MiniGameInvitationAnimation
import ad.simula.ad.sdk.model.MiniGameInterstitialTheme
import ad.simula.ad.sdk.provider.SimulaProvider

class SimulaMiniGameModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    init {
        // The module is a singleton that can outlive the host Activity
        // (rotation, recreation). Listen for host destroy so we can detach
        // every overlay and release its Activity context.
        reactContext.addLifecycleEventListener(this)
    }

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

    private var characterSelectorComposeView: ComposeView? = null
    private var isCharacterSelectorOpen by mutableStateOf(false)

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
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()
        // Coerce to one of the supported values (parity with iOS convertMaxGamesToShow).
        val maxGamesToShow = when (
            if (props.hasKey("maxGamesToShow") && !props.isNull("maxGamesToShow"))
                props.getInt("maxGamesToShow") else 6
        ) {
            3 -> 3
            9 -> 9
            else -> 6
        }

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
                        privacy = privacy,
                        adContext = adContext,
                        telemetryEnabled = telemetryEnabled,
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
        reactApplicationContext.currentActivity?.runOnUiThread {
            isMenuOpen = false
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
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()

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
                        privacy = privacy,
                        adContext = adContext,
                        telemetryEnabled = telemetryEnabled,
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
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()

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
                        privacy = privacy,
                        adContext = adContext,
                        telemetryEnabled = telemetryEnabled,
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
        reactApplicationContext.currentActivity?.runOnUiThread {
            isInvitationOpen = false
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
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()

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
                        privacy = privacy,
                        adContext = adContext,
                        telemetryEnabled = telemetryEnabled,
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
        reactApplicationContext.currentActivity?.runOnUiThread {
            isInterstitialOpen = false
            removeComposeView(interstitialComposeView)
            interstitialComposeView = null
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Preload
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Warms ad delivery ahead of the first show by initializing the imperative SDK
     * (idempotent — the first valid call wins). This warms the shared server session
     * off the critical path, attaches IAB consent auto-read, installs telemetry, and
     * drains any pending reward verifications. Safe to call repeatedly.
     */
    @ReactMethod
    fun preload(props: ReadableMap, promise: Promise) {
        val apiKey = props.getString("apiKey")
        if (apiKey.isNullOrBlank()) {
            promise.reject("INVALID_PROPS", "Missing required prop: apiKey")
            return
        }
        val devMode = if (props.hasKey("devMode")) props.getBoolean("devMode") else false
        val primaryUserID = props.getStringOrNull("primaryUserID")
        val hasPrivacyConsent = if (props.hasKey("hasPrivacyConsent"))
            props.getBoolean("hasPrivacyConsent") else true
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()

        when (SimulaInitializationState.initialize(apiKey) {
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
        }) {
            SimulaInitializationOutcome.Accepted -> promise.resolve(null)
            SimulaInitializationOutcome.Conflict -> promise.reject(
                "INITIALIZATION_CONFLICT",
                "The process is already owned by a different Simula SDK configuration",
            )
            SimulaInitializationOutcome.Failed -> promise.reject(
                "INITIALIZATION_FAILED",
                "Simula SDK initialization failed",
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Shared helpers
    // ═══════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════
    // CharacterSelector
    // ═══════════════════════════════════════════════════════════════════

    @ReactMethod
    fun showCharacterSelector(props: ReadableMap, promise: Promise) {
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
        val privacy = props.getMapOrNull("privacy").toSimulaPrivacyConfig()
        val telemetryEnabled = if (props.hasKey("telemetryEnabled"))
            props.getBoolean("telemetryEnabled") else true
        val adContext = props.getMapOrNull("adContext").toSimulaAdContext()
        val title = props.getStringOrNull("title") ?: "Select Your Game Partner"
        val ctaText = props.getStringOrNull("ctaText") ?: "🚀 Launch Game"
        val characters = convertCharacters(
            if (props.hasKey("characters") && !props.isNull("characters"))
                props.getArray("characters") else null,
        )
        val theme = if (props.hasKey("theme") && !props.isNull("theme"))
            convertCharacterSelectorTheme(props.getMap("theme")) else CharacterSelectorTheme()

        activity.runOnUiThread {
            removeComposeView(characterSelectorComposeView)
            isCharacterSelectorOpen = true

            val view = ComposeView(activity).apply {
                setContent {
                    SimulaProvider(
                        apiKey = apiKey,
                        hasPrivacyConsent = hasPrivacyConsent,
                        devMode = devMode,
                        primaryUserID = primaryUserID,
                        privacy = privacy,
                        adContext = adContext,
                        telemetryEnabled = telemetryEnabled,
                    ) {
                        CharacterSelector(
                            isOpen = isCharacterSelectorOpen,
                            onClose = {
                                isCharacterSelectorOpen = false
                                activity.runOnUiThread {
                                    removeComposeView(characterSelectorComposeView)
                                    characterSelectorComposeView = null
                                }
                                sendEvent("onCharacterSelectorClose", null)
                            },
                            onCharacterSelected = { character ->
                                // Selection closes the selector.
                                isCharacterSelectorOpen = false
                                activity.runOnUiThread {
                                    removeComposeView(characterSelectorComposeView)
                                    characterSelectorComposeView = null
                                }
                                sendEvent("onCharacterSelectorSelect", characterToMap(character))
                            },
                            onCharacterPreview = { character ->
                                sendEvent("onCharacterSelectorPreview", characterToMap(character))
                            },
                            title = title,
                            ctaText = ctaText,
                            characters = characters,
                            theme = theme,
                        )
                    }
                }
            }

            characterSelectorComposeView = view
            addOverlay(activity, view)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hideCharacterSelector() {
        reactApplicationContext.currentActivity?.runOnUiThread {
            isCharacterSelectorOpen = false
            removeComposeView(characterSelectorComposeView)
            characterSelectorComposeView = null
        }
    }

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
            // Detach via the view's own parent (works even when currentActivity
            // is already gone) and dispose the composition to release it.
            (v.parent as? ViewGroup)?.removeView(v)
            v.disposeComposition()
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        // Bridge may be tearing down (reload / host destroy) — emitDeviceEvent would
        // throw if there's no active instance. emitDeviceEvent routes through the
        // legacy RCTDeviceEventEmitter under the old architecture and the Bridgeless
        // event emitter under the new one, so this works on both.
        if (!reactApplicationContext.hasActiveReactInstance()) return
        reactApplicationContext.emitDeviceEvent(eventName, params)
    }

    // ── Message conversion ──────────────────────────────────────────────

    private fun convertCharacters(array: ReadableArray?): List<CharacterData>? {
        if (array == null) return null
        val characters = mutableListOf<CharacterData>()
        for (i in 0 until array.size()) {
            val map = array.getMap(i) ?: continue
            val id = map.getString("id") ?: continue
            val name = map.getString("name") ?: continue
            val imageUrl = map.getString("imageUrl") ?: continue
            val description = map.getString("description") ?: continue
            characters.add(
                CharacterData(id = id, name = name, imageUrl = imageUrl, description = description),
            )
        }
        return characters.ifEmpty { null }
    }

    private fun convertCharacterSelectorTheme(map: ReadableMap?): CharacterSelectorTheme {
        if (map == null) return CharacterSelectorTheme()
        return CharacterSelectorTheme(
            backgroundColor = map.getStringOrNull("backgroundColor"),
            titleFontColor = map.getStringOrNull("titleFontColor"),
            secondaryFontColor = map.getStringOrNull("secondaryFontColor"),
            accentColor = map.getStringOrNull("accentColor"),
            ctaFontColor = map.getStringOrNull("ctaFontColor"),
            cardBackgroundColor = map.getStringOrNull("cardBackgroundColor"),
            cardBorderColor = map.getStringOrNull("cardBorderColor"),
            cardCornerRadius = if (map.hasKey("cardCornerRadius") && !map.isNull("cardCornerRadius"))
                map.getInt("cardCornerRadius") else null,
            fontFamily = map.getStringOrNull("fontFamily"),
        )
    }

    private fun characterToMap(character: CharacterData) =
        Arguments.createMap().apply {
            putString("id", character.id)
            putString("name", character.name)
            putString("imageUrl", character.imageUrl)
            putString("description", character.description)
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

    private fun ReadableMap.getMapOrNull(key: String): ReadableMap? {
        return if (hasKey(key) && !isNull(key)) getMap(key) else null
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

    // ── LifecycleEventListener ──────────────────────────────────────────

    override fun onHostResume() {}

    override fun onHostPause() {}

    override fun onHostDestroy() {
        // Delivered on the main thread. Detach and dispose every overlay so we
        // never leak the destroyed Activity's context through a retained
        // ComposeView.
        detachAllOverlays()
    }

    /**
     * Detaches and disposes every overlay and clears its open-state. Main thread
     * only (snapshot-state writes + view removal). `removeComposeView` detaches via
     * each view's own parent, so this works even when `currentActivity` is null.
     * Idempotent — safe to run from both onHostDestroy and invalidate.
     */
    private fun detachAllOverlays() {
        isMenuOpen = false
        isInvitationOpen = false
        isInterstitialOpen = false
        isCharacterSelectorOpen = false
        removeComposeView(menuComposeView)
        removeComposeView(buttonComposeView)
        removeComposeView(invitationComposeView)
        removeComposeView(interstitialComposeView)
        removeComposeView(characterSelectorComposeView)
        menuComposeView = null
        buttonComposeView = null
        invitationComposeView = null
        interstitialComposeView = null
        characterSelectorComposeView = null
    }

    override fun invalidate() {
        // A JS-only reload destroys the React instance WITHOUT destroying the
        // Activity, so onHostDestroy never fires — the old ComposeViews would stay
        // attached to android.R.id.content with their compositions undisposed,
        // leaking across every reload. Detach on the main thread, and stop leaking
        // this module through the reactContext's lifecycle-listener list.
        reactApplicationContext.removeLifecycleEventListener(this)
        android.os.Handler(android.os.Looper.getMainLooper()).post { detachAllOverlays() }
        super.invalidate()
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
