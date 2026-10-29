package com.simulaads.reactnative

import ad.simula.ad.sdk.ads.SimulaApiEnvironment
import ad.simula.ad.sdk.minigame.CatalogGamePlayer
import ad.simula.ad.sdk.minigame.SimulaGameCatalog
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.bridge.*
import kotlinx.coroutines.*

/** The overlay and its in-flight work are owned by this bridge, never by the ad singleton. */
class SimulaGameCatalogModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), LifecycleEventListener {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val catalogs = linkedMapOf<String, SimulaGameCatalog>()
    private var overlay: ComposeView? = null
    private var playJob: Job? = null
    private var playPromise: Promise? = null

    init { context.addLifecycleEventListener(this) }
    override fun getName() = "SimulaGameCatalogModule"

    private fun catalog(props: ReadableMap): SimulaGameCatalog {
        val key = props.getString("apiKey") ?: throw IllegalArgumentException("Missing API key")
        val environment = when (props.getString("apiEnvironment")) {
            "staging" -> SimulaApiEnvironment.Staging
            "production" -> SimulaApiEnvironment.Production
            else -> throw IllegalArgumentException("Invalid environment")
        }
        val user = if (props.hasKey("primaryUserID")) props.getString("primaryUserID") else null
        val cacheKey = "$environment:$key:$user"
        catalogs[cacheKey]?.let { return it }
        val catalog = SimulaGameCatalog.create(context, key, environment, user)
            ?: throw IllegalStateException("API_ENVIRONMENT_UNAVAILABLE")
        if (catalogs.size >= 2) catalogs.remove(catalogs.keys.first())
        catalogs[cacheKey] = catalog
        return catalog
    }

    @ReactMethod
    fun fetchCatalog(props: ReadableMap, promise: Promise) {
        scope.launch {
            try {
                val result = catalog(props).fetch()
                promise.resolve(Arguments.createMap().apply {
                    putString("menuId", result.menuId)
                    putArray("games", Arguments.createArray().apply {
                        result.games.forEach { game -> pushMap(Arguments.createMap().apply {
                            putString("id", game.id); putString("name", game.name)
                        }) }
                    })
                })
            } catch (error: CancellationException) {
                promise.reject("CANCELLED", "Catalog request cancelled")
                throw error
            } catch (error: Exception) { reject(promise, error) }
        }
    }

    @ReactMethod
    fun showCatalogGame(props: ReadableMap, promise: Promise) {
        scope.launch {
            if (playPromise != null) { promise.reject("BUSY", "A game is already opening"); return@launch }
            val activity = context.currentActivity
            if (activity == null) { promise.reject("NO_ACTIVITY", "No current activity"); return@launch }
            playPromise = promise
            playJob = launch {
                try {
                    val metrics = activity.resources.displayMetrics
                    val url = catalog(props).load(
                        menuId = props.getString("menuId") ?: "", gameId = props.getString("gameId") ?: "",
                        companionEnabled = if (props.hasKey("companionEnabled") && !props.isNull("companionEnabled")) props.getBoolean("companionEnabled") else null,
                        width = (metrics.widthPixels / metrics.density).toInt(),
                        height = (metrics.heightPixels / metrics.density).toInt(),
                        charId = props.getString("charId") ?: "", charName = props.getString("charName") ?: "",
                        charImage = props.getString("charImage") ?: "",
                        charDesc = if (props.hasKey("charDesc")) props.getString("charDesc") else null,
                    )
                    ensureActive()
                    if (context.currentActivity !== activity || activity.isFinishing || activity.isDestroyed) {
                        throw IllegalStateException("Host activity closed")
                    }
                    val view = ComposeView(activity).apply {
                        setContent { CatalogGamePlayer(url) { close() } }
                    }
                    overlay = view
                    activity.findViewById<ViewGroup>(android.R.id.content).addView(view,
                        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                } catch (error: CancellationException) { throw error }
                catch (error: Exception) {
                    playPromise = null
                    reject(promise, error)
                }
            }
        }
    }

    private fun reject(promise: Promise, error: Exception) {
        val status = Regex("status: (\\d+)").find(error.message.orEmpty())?.groupValues?.getOrNull(1)
        promise.reject(status?.let { "HTTP_$it" } ?: "CATALOG_ERROR", error.message ?: "Catalog unavailable")
    }

    private fun close() {
        playJob?.cancel(); playJob = null
        overlay?.let { view -> (view.parent as? ViewGroup)?.removeView(view); view.disposeComposition() }
        overlay = null
        playPromise?.resolve(null); playPromise = null
    }

    @ReactMethod fun hideCatalogGame() { scope.launch { close() } }
    override fun onHostResume() {}
    override fun onHostPause() {}
    override fun onHostDestroy() { close() }
    override fun invalidate() {
        context.removeLifecycleEventListener(this)
        android.os.Handler(android.os.Looper.getMainLooper()).post { close(); scope.cancel(); catalogs.clear() }
        super.invalidate()
    }
}
