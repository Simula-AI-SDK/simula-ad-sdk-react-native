package com.simulaads.reactnative

import ad.simula.ad.sdk.model.SimulaAdContext
import ad.simula.ad.sdk.privacy.SimulaPrivacyConfig
import com.facebook.react.bridge.ReadableMap

internal fun ReadableMap?.toSimulaPrivacyConfig(): SimulaPrivacyConfig? {
    val map = this ?: return null
    fun boolean(key: String): Boolean? =
        if (map.hasKey(key) && !map.isNull(key)) map.getBoolean(key) else null
    fun string(key: String): String? =
        if (map.hasKey(key) && !map.isNull(key)) map.getString(key) else null
    return SimulaPrivacyConfig(
        hasPrivacyConsent = boolean("hasPrivacyConsent") ?: true,
        tcString = string("tcString"),
        uspString = string("uspString"),
        gppString = string("gppString"),
        gppSid = string("gppSid"),
        gdprApplies = boolean("gdprApplies"),
        tcfPurpose1Consent = boolean("tcfPurpose1Consent"),
        coppaApplies = boolean("coppaApplies") ?: false,
        enableAdvertisingId = boolean("enableAdvertisingId") ?: false,
    )
}

internal fun ReadableMap?.toSimulaAdContext(): SimulaAdContext? {
    val map = this ?: return null
    if (!map.keySetIterator().hasNextKey()) return null
    fun boolean(key: String): Boolean? =
        if (map.hasKey(key) && !map.isNull(key)) map.getBoolean(key) else null
    fun string(key: String): String? =
        if (map.hasKey(key) && !map.isNull(key)) map.getString(key) else null
    val tags = map.getArray("tags")?.toArrayList()?.filterIsInstance<String>()
    @Suppress("UNCHECKED_CAST")
    val customContext = if (map.hasKey("customContext") && !map.isNull("customContext")) {
        map.getMap("customContext")?.toHashMap() as? Map<String, Any>
    } else {
        null
    }
    return SimulaAdContext(
        searchTerm = string("searchTerm"),
        tags = tags,
        category = string("category"),
        title = string("title"),
        description = string("description"),
        userProfile = string("userProfile"),
        userEmail = string("userEmail"),
        customContext = customContext,
        nsfw = boolean("nsfw") ?: false,
    )
}
