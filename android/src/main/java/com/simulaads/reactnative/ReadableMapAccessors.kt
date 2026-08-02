package com.simulaads.reactnative

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

/** Field-local tolerant readers: malformed optional context fields never abort siblings. */
internal fun ReadableMap.getStringListOrNull(key: String): List<String>? = runCatching<List<String>?> {
    if (!hasKey(key) || isNull(key) || getType(key) != ReadableType.Array) return@runCatching null
    val array = getArray(key) ?: return@runCatching null
    val strings = mutableListOf<String>()
    for (index in 0 until array.size()) {
        if (!array.isNull(index) && array.getType(index) == ReadableType.String) {
            array.getString(index)?.let { strings.add(it) }
        }
    }
    strings
}.getOrNull()

internal fun ReadableMap.getStringAnyMapOrNull(key: String): Map<String, Any>? = runCatching<Map<String, Any>?> {
    if (!hasKey(key) || isNull(key) || getType(key) != ReadableType.Map) return@runCatching null
    @Suppress("UNCHECKED_CAST")
    (getMap(key)?.toHashMap() as? Map<String, Any>)?.takeIf { it.isNotEmpty() }
}.getOrNull()
