package com.simulaads.reactnative

import android.view.View
import android.widget.FrameLayout
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import ad.simula.ad.sdk.minigame.MiniGameButton
import ad.simula.ad.sdk.model.MiniGameButtonTheme

/**
 * Native view backing the inline React Native `<MiniGameButton>`.
 *
 * Hosts the SDK's `MiniGameButton` composable in a [ComposeView] as a real inline view
 * (no overlay). The button is pure UI — it needs no SimulaProvider / session, so it's
 * composed directly. Height is measured unconstrained and reported up via
 * `onButtonSizeChange`; taps fire `onButtonPress`.
 */
class SimulaMiniGameButtonView(private val reactContext: ThemedReactContext) :
    FrameLayout(reactContext) {

    private val composeView = ComposeView(reactContext).apply {
        // Disposal on detach does NOT lose the UI: ComposeView retains the content
        // lambda from commitProps() and recreates the composition on reattach
        // (onAttachedToWindow / onMeasure call ensureCompositionCreated).
        setViewCompositionStrategy(
            ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool,
        )
    }

    var text: String? = null
    var showPulsate: Boolean = false
    var showBadge: Boolean = false
    var theme: MiniGameButtonTheme = MiniGameButtonTheme()

    private var contentHeightPx = 0
    private var lastReportedHeightDp = Int.MIN_VALUE

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

    /** Called by the view manager after a batch of prop updates. */
    fun commitProps() {
        composeView.setContent {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                MiniGameButton(
                    text = text,
                    showPulsate = showPulsate,
                    showBadge = showBadge,
                    theme = theme,
                    onClick = { emit("onButtonPress", null) },
                )
            }
        }
    }

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

        composeView.measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED),
        )
        val measured = composeView.measuredHeight
        if (measured != contentHeightPx) {
            contentHeightPx = measured
            post { reportHeight(contentHeightPx) }
        }
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
        post(measureAndLayout)
    }

    private fun reportHeight(heightPx: Int) {
        val density = resources.displayMetrics.density
        val heightDp = Math.round(heightPx / density)
        if (Math.abs(heightDp - lastReportedHeightDp) < 1) return
        lastReportedHeightDp = heightDp
        val payload = Arguments.createMap().apply { putDouble("height", heightDp.toDouble()) }
        emit("onButtonSizeChange", payload)
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
        dispatcher.dispatchEvent(SimulaDirectEvent(surfaceId, id, name, payload ?: Arguments.createMap()))
    }
}
