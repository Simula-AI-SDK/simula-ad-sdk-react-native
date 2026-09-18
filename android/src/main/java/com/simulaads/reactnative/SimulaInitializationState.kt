package com.simulaads.reactnative

import ad.simula.ad.sdk.ads.SimulaAds
import ad.simula.ad.sdk.ads.SimulaApiEnvironment

internal enum class SimulaInitializationOutcome {
    Accepted,
    Conflict,
    EnvironmentUnavailable,
    Failed,
}

/** Tracks React Native's process configuration because the SDK exposes no effective-key getter. */
internal object SimulaInitializationState {
    private val lock = Any()
    private var apiKey: String? = null
    private var apiEnvironment: SimulaApiEnvironment? = null

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
        requestedApiEnvironment: SimulaApiEnvironment,
        initializeNative: () -> Boolean,
    ): SimulaInitializationOutcome =
        synchronized(lock) {
            val currentApiKey = apiKey
            val currentApiEnvironment = apiEnvironment
            if ((currentApiKey != null || currentApiEnvironment != null) &&
                (currentApiKey != requestedApiKey || currentApiEnvironment != requestedApiEnvironment)
            ) {
                return@synchronized SimulaInitializationOutcome.Conflict
            }
            if (currentApiKey == requestedApiKey && currentApiEnvironment == requestedApiEnvironment && SimulaAds.isInitialized) {
                return@synchronized SimulaInitializationOutcome.Accepted
            }

            // An imperative owner created outside this package cannot be verified because the
            // native SDK keeps its effective key internal. Reject rather than silently serving ads
            // through an unknown key.
            if (SimulaAds.isInitialized) return@synchronized SimulaInitializationOutcome.Conflict

            runCatching { initializeNative() }.fold(
                onSuccess = {
                    if (it && SimulaAds.isInitialized && SimulaAds.apiEnvironment == requestedApiEnvironment) {
                        apiKey = requestedApiKey
                        apiEnvironment = requestedApiEnvironment
                        SimulaInitializationOutcome.Accepted
                    } else {
                        SimulaInitializationOutcome.EnvironmentUnavailable
                    }
                },
                onFailure = { SimulaInitializationOutcome.Failed },
            )
        }
}
