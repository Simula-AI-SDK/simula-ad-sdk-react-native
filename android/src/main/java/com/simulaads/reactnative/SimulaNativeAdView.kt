package com.simulaads.reactnative

import android.widget.FrameLayout
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import ad.simula.ad.sdk.ads.SimulaAdError
import ad.simula.ad.sdk.ads.SimulaAds
import ad.simula.ad.sdk.model.NativeAdData
import ad.simula.ad.sdk.nativead.NativeAdSlot
import kotlinx.coroutines.delay

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
        // Dispose when this view leaves the RN tree (unmount); no view pooling in RN.
        setViewCompositionStrategy(
            ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool,
        )
    }

    // Props (set by the view manager, then committed once per transaction).
    var adUnitId: String? = null
    var position: Int = 0
    var theme: String? = null
    var preloadedAdId: String? = null
    var previewHtml: String? = null

    private var committedKey: String? = null
    private var contentHeightPx: Int = 0
    private var lastReportedHeightDp: Int = Int.MIN_VALUE

    init {
        addView(composeView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    private val propKey: String
        get() = "${adUnitId.orEmpty()}|$position|${preloadedAdId.orEmpty()}|${theme.orEmpty()}|${previewHtml != null}"

    /** Called by the view manager after a batch of prop updates. Re-composes only on a real change. */
    fun commitProps() {
        if (committedKey == propKey) return
        committedKey = propKey
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
                        previewHtml = previewHtml,
                        onImpression = { emitImpression(it) },
                        onError = { emitError(it) },
                    )
                }
            }
        }
    }

    // ── Auto-height ───────────────────────────────────────────────────────────

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
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
            post { reportHeight(contentHeightPx) }
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
        val heightDp = Math.round(heightPx / density)
        // Threshold sub-dp churn so a measuring creative can't thrash the feed.
        if (Math.abs(heightDp - lastReportedHeightDp) < 1) return
        lastReportedHeightDp = heightDp
        val payload = Arguments.createMap().apply { putDouble("height", heightDp.toDouble()) }
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

    private fun emitError(error: SimulaAdError) {
        val (code, retry) = mapError(error)
        val payload = Arguments.createMap().apply {
            putString("code", code)
            putString("message", error.message ?: "")
            if (retry != null) putInt("retryInSeconds", retry)
        }
        emit("onAdError", payload)
    }

    private fun emit(name: String, payload: WritableMap?) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, name, payload)
    }

    private val retryRegex = Regex("""in (\d+) seconds""")

    private fun mapError(error: SimulaAdError): Pair<String, Int?> = when (error) {
        is SimulaAdError.NotInitialized -> "not_initialized" to null
        is SimulaAdError.NoSession -> "no_session" to null
        is SimulaAdError.NoFill -> "no_fill" to null
        is SimulaAdError.NotReady -> "not_ready" to null
        is SimulaAdError.Stale -> "stale" to null
        is SimulaAdError.DuplicateRequest ->
            "duplicate_request" to retryRegex.find(error.message ?: "")?.groupValues?.get(1)?.toIntOrNull()
        is SimulaAdError.AlreadyShowing -> "already_showing" to null
        is SimulaAdError.NoPresentationContext -> "no_presentation_context" to null
        is SimulaAdError.Network -> "network" to null
    }
}
