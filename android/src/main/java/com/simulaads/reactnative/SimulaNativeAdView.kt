package com.simulaads.reactnative

import android.view.View
import android.widget.FrameLayout
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import ad.simula.ad.sdk.ads.SimulaAds
import ad.simula.ad.sdk.model.AdValue
import ad.simula.ad.sdk.model.NativeAdData
import ad.simula.ad.sdk.nativead.NativeAdError
import ad.simula.ad.sdk.nativead.NativeAdSlot
import kotlinx.coroutines.delay
import org.json.JSONObject

/**
 * Native view backing the React Native `<NativeAd>` component.
 *
 * Hosts the SDK's `NativeAdSlot` composable in a [ComposeView]. The slot reads its
 * session + targeting context from the global state [SimulaAds.initialize] warmed (the
 * SDK's `LocalSimulaContext` falls back to that when no Compose `SimulaProvider` is
 * present), so every `<NativeAd>` in a feed reuses ONE session.
 *
 * Height: the slot self-sizes to its creative. We measure that natural height
 * **unconstrained** (so a zero-height host can't deadlock the measurement) and report
 * it up via `onAdSizeChange`; JS owns the view's height and feeds it back. A no-fill /
 * error collapses to zero. The [requestLayout] override forces a re-measure when the
 * creative grows natively (RN otherwise suppresses native-driven layout).
 */
class SimulaNativeAdView(private val reactContext: ThemedReactContext) :
    FrameLayout(reactContext) {

    private val composeView = ComposeView(reactContext).apply {
        // Dispose when this view leaves the window (unmount, or clipped out by
        // removeClippedSubviews). Disposal does NOT lose the UI across a detach/reattach
        // cycle: ComposeView retains the content lambda set by commitProps() and
        // recreates the composition automatically on reattach (both onAttachedToWindow
        // and onMeasure call ensureCompositionCreated), so commitProps() skipping
        // setContent for an unchanged propKey is safe.
        setViewCompositionStrategy(
            ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool,
        )
    }

    // Props (set by the view manager, then committed once per transaction).
    var adUnitId: String? = null
    var position: Int = 0
    var theme: String? = null
    var extraParametersJson: String? = null
    var preloadedAdId: String? = null
    var previewHtml: String? = null

    private var committedKey: String? = null
    private var committedExtraParameters by mutableStateOf<Map<String, String>>(emptyMap())
    private var contentHeightPx: Int = 0
    private var lastReportedHeightDp: Int = Int.MIN_VALUE

    init {
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        // Fabric can measure this view before it's attached to a window (no WindowRecomposer
        // exists yet for the ComposeView); re-measure once attach makes that possible.
        composeView.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                requestLayout()
            }

            override fun onViewDetachedFromWindow(v: View) = Unit
        })
    }

    private val propKey: String
        get() = "${adUnitId.orEmpty()}|$position|${preloadedAdId.orEmpty()}|${theme.orEmpty()}|${previewHtml != null}"

    /** Called by the view manager after a batch of prop updates. Re-composes only on a real change. */
    fun commitProps() {
        committedExtraParameters = parseExtraParameters(extraParametersJson)
        if (committedKey == propKey) return
        committedKey = propKey
        // FlashList / RecyclerView rebinds this view to a new slot without recreating it.
        // Drop the previous slot's measure watermark so the new creative's height is always
        // reported (a coincidental same-dp height would otherwise be deduped away while JS
        // still held the old row height).
        contentHeightPx = 0
        lastReportedHeightDp = Int.MIN_VALUE
        composeView.setContent {
            // The slot's global-session fallback requires SimulaAds.initialize to have run.
            // The provider normally initializes on mount before this view composes; gate
            // here so a race just defers the slot rather than throwing.
            val ready by produceState(initialValue = SimulaAds.isInitialized) {
                while (!SimulaAds.isInitialized) delay(32)
                value = true
            }
            if (ready) {
                Box(Modifier.fillMaxWidth()) {
                    NativeAdSlot(
                        adUnitId = adUnitId,
                        position = position,
                        theme = theme,
                        preloadedAdId = preloadedAdId,
                        extraParameters = committedExtraParameters,
                        previewHtml = previewHtml,
                        onImpression = { emitImpression(it) },
                        onPaid = { emitPaid(it) },
                        onError = { emitError(it) },
                        onClick = { emitClick() },
                    )
                }
            }
        }
    }

    private fun parseExtraParameters(json: String?): Map<String, String> {
        if (json.isNullOrBlank()) return emptyMap()
        return try {
            val objectValue = JSONObject(json)
            objectValue.keys().asSequence()
                .sorted()
                .mapNotNull { key -> objectValue.opt(key)?.let { value -> (value as? String)?.let { key to it } } }
                .take(10)
                .toMap()
        } catch (_: Exception) {
            emptyMap()
        }
    }

    // ── Auto-height ───────────────────────────────────────────────────────────

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val hostHeight = MeasureSpec.getSize(heightMeasureSpec)

        // Fabric can run a layout pass before this view is attached to a window; a
        // ComposeView.measure() call in that state throws ("Cannot locate windowRecomposer").
        // Defer creative measurement until attach — the attach listener above triggers a
        // re-measure once a window exists.
        if (!composeView.isAttachedToWindow) {
            val fallbackHeight = if (contentHeightPx > 0) contentHeightPx else 0
            setMeasuredDimension(width, maxOf(hostHeight, fallbackHeight))
            return
        }

        // Measure the creative at the host width but UNCONSTRAINED height to read its
        // natural height (independent of the host's JS-driven height → no deadlock).
        composeView.measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
        )
        val measured = composeView.measuredHeight
        if (measured != contentHeightPx) {
            contentHeightPx = measured
            // Report out of the measure pass to avoid dispatching events mid-layout.
            // A recycled view can be rebound to a new slot between this measure and the
            // posted run — drop the report then, so the previous creative's height is
            // never attributed to the new slot (commitProps resets the watermark, so the
            // new slot's own measure still reports).
            val slotAtMeasure = committedKey
            post { if (committedKey == slotAtMeasure) reportHeight(contentHeightPx) }
        }
        // Take the size RN computed for us (our height tracks the value we feed back).
        setMeasuredDimension(width, MeasureSpec.getSize(heightMeasureSpec))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        composeView.layout(0, 0, composeView.measuredWidth, composeView.measuredHeight)
    }

    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
        )
        layout(left, top, right, bottom)
    }

    override fun requestLayout() {
        super.requestLayout()
        // RN does not re-run layout for native-driven size changes (the creative
        // growing as its WebView reports height); force a measure/layout pass so the
        // new content height is read and reported.
        post(measureAndLayout)
    }

    private fun reportHeight(heightPx: Int) {
        val density = resources.displayMetrics.density
        // Ceil, not round: rounding down leaves the creative a sub-dp taller than the JS-applied
        // container, which clips the card's bottom edge and gives the inner WebView a sliver of
        // scrollable overflow (mirrors the iOS bridge's rounded(.up)).
        val heightDp = kotlin.math.ceil(heightPx / density).toInt()
        // Threshold sub-dp churn so a measuring creative can't thrash the feed.
        if (Math.abs(heightDp - lastReportedHeightDp) < 1) return
        lastReportedHeightDp = heightDp
        val payload = Arguments.createMap().apply {
            putDouble("height", heightDp.toDouble())
            // Slot identity, so JS can discard a report that raced a list-recycle rebind
            // (the event dispatch is async; by delivery this view may describe a new slot).
            putString("adUnitId", adUnitId.orEmpty())
            putInt("adPosition", position)
            putString("preloadedAdId", preloadedAdId.orEmpty())
        }
        emit("onAdSizeChange", payload)
    }

    // ── Events ────────────────────────────────────────────────────────────────

    private fun emitImpression(data: NativeAdData) {
        val payload = Arguments.createMap().apply {
            putString("impressionId", data.impressionId)
            putString("adFormat", data.adFormat)
            if (data.adUnitId != null) putString("adUnitId", data.adUnitId) else putNull("adUnitId")
        }
        emit("onAdImpression", payload)
    }

    private fun emitClick() {
        emit("onAdClick", Arguments.createMap())
    }

    private fun emitPaid(value: AdValue) {
        val payload = Arguments.createMap().apply {
            putDouble("valueMicros", value.valueMicros.toDouble())
            putString("currencyCode", value.currencyCode)
            putString("precisionType", value.precisionType.name)
            putDouble("expectedCpm", value.expectedCpm)
            putDouble("expectedRevenue", value.expectedRevenue)
        }
        emit("onAdPaid", payload)
    }

    private fun emitError(error: NativeAdError) {
        val payload = Arguments.createMap().apply {
            putString("code", errorCode(error))
            putString("message", errorMessage(error))
        }
        emit("onAdError", payload)
    }

    private fun emit(name: String, payload: WritableMap?) {
        if (!reactContext.hasActiveReactInstance()) return
        // Dispatch via the Fabric event dispatcher (works on both architectures — surfaceId
        // is -1 on the old architecture) instead of the legacy RCTEventEmitter, which throws
        // once bridge/interop is disabled.
        // getEventDispatcherForReactTag is deprecated on newer RN (it delegates to a single-arg
        // getEventDispatcher(context)), but that replacement does not exist on RN 0.77 — our
        // declared minimum — and this library compiles against the host app's RN version.
        @Suppress("DEPRECATION")
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
        val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
        dispatcher.dispatchEvent(SimulaDirectEvent(surfaceId, id, name, payload))
    }

    // The native enum carries no message (pure enum), so the bridge maps each case to the stable
    // JS code + a human-readable description (mirrors the native SDKs' SimulaAdError copy).
    private fun errorCode(error: NativeAdError): String = when (error) {
        NativeAdError.NotInitialized -> "not_initialized"
        NativeAdError.NoSession -> "no_session"
        NativeAdError.NoFill -> "no_fill"
        NativeAdError.Network -> "network"
        NativeAdError.AdUnitNotFound -> "ad_unit_not_found"
    }

    private fun errorMessage(error: NativeAdError): String = when (error) {
        NativeAdError.NotInitialized -> "SimulaAds is not initialized — call SimulaAds.initialize() first."
        NativeAdError.NoSession -> "Could not create a session. Check the API key and network connection."
        NativeAdError.NoFill -> "No ad available to show right now (no fill)."
        NativeAdError.Network -> "Network error while loading the ad — check the connection and try again."
        NativeAdError.AdUnitNotFound -> "Ad unit id is not registered for this app — check the ad unit id in your Simula dashboard."
    }
}
