package com.simulaads.reactnative

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/**
 * A generic direct (view) event for Fabric's [com.facebook.react.uimanager.events.EventDispatcher].
 *
 * [Event] is F-bounded (`Event<T : Event<T>>`), so a single concrete leaf class — rather than an
 * anonymous `object : Event<...>` — is the simplest way to satisfy the bound for every named event
 * our views emit (`onAdSizeChange`, `onAdImpression`, ...). Works on both architectures: on the old
 * architecture `surfaceId` is `-1` and the dispatcher falls back to the legacy `RCTEventEmitter`.
 */
internal class SimulaDirectEvent(
    surfaceId: Int,
    viewTag: Int,
    private val name: String,
    private val payload: WritableMap?,
) : Event<SimulaDirectEvent>(surfaceId, viewTag) {

    override fun getEventName(): String = name

    override fun getEventData(): WritableMap? = payload

    // The legacy RCTEventEmitter.receiveEvent path these events migrated from never coalesced.
    // The Event default (true) lets the dispatcher merge same-name events for a view within one
    // batch, which could swallow a discrete event (e.g. a rapid second onAdClick/onButtonPress).
    // All of these events are low-frequency — size changes are already thresholded natively —
    // so coalescing buys nothing; keep exact legacy semantics.
    override fun canCoalesce(): Boolean = false
}
