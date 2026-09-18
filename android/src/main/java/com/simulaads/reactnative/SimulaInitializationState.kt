package com.simulaads.reactnative

import ad.simula.ad.sdk.ads.SimulaAds

internal enum class SimulaInitializationOutcome {
    Accepted,
    Conflict,
    Failed,
}

/** Tracks React Native's process configuration because the SDK exposes no effective-key getter. */
internal object SimulaInitializationState {
    private val lock = Any()
    private var apiKey: String? = null

    fun claim(requestedApiKey: String): SimulaInitializationOutcome = synchronized(lock) {
        val currentApiKey = apiKey
        if (currentApiKey != null) {
            return@synchronized if (currentApiKey == requestedApiKey) {
                SimulaInitializationOutcome.Accepted
            } else {
                SimulaInitializationOutcome.Conflict
            }
        }
        if (SimulaAds.isInitialized) return@synchronized SimulaInitializationOutcome.Conflict
        apiKey = requestedApiKey
        SimulaInitializationOutcome.Accepted
    }

    fun initialize(
        requestedApiKey: String,
        initializeNative: () -> Unit,
    ): SimulaInitializationOutcome =
        synchronized(lock) {
            val currentApiKey = apiKey
            if (currentApiKey != null && currentApiKey != requestedApiKey) {
                return@synchronized SimulaInitializationOutcome.Conflict
            }
            if (currentApiKey == requestedApiKey && SimulaAds.isInitialized) {
                return@synchronized SimulaInitializationOutcome.Accepted
            }

            // An imperative owner created outside this package cannot be verified because the
            // native SDK keeps its effective key internal. Reject rather than silently serving ads
            // through an unknown key.
            if (SimulaAds.isInitialized) return@synchronized SimulaInitializationOutcome.Conflict

            runCatching { initializeNative() }.fold(
                onSuccess = {
                    if (SimulaAds.isInitialized) {
                        apiKey = requestedApiKey
                        SimulaInitializationOutcome.Accepted
                    } else {
                        SimulaInitializationOutcome.Conflict
                    }
                },
                onFailure = { SimulaInitializationOutcome.Failed },
            )
        }
}
