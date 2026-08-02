package com.simulaads.reactnative

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReadableMapAccessorsTest {
    @Test
    fun malformedFieldsAreSkippedIndependently() {
        val map = JavaOnlyMap.of(
            "tags", "not-an-array",
            "customContext", 42,
            "category", "sports",
        )

        assertNull(map.getStringListOrNull("tags"))
        assertNull(map.getStringAnyMapOrNull("customContext"))
        assertEquals("sports", map.getString("category"))
    }

    @Test
    fun tagsKeepOnlyStrings() {
        val map = JavaOnlyMap.of(
            "tags", JavaOnlyArray.of("one", 2, true, null, "two"),
        )

        assertEquals(listOf("one", "two"), map.getStringListOrNull("tags"))
    }

    @Test
    fun customContextConvertsAValidMap() {
        val map = JavaOnlyMap.of(
            "customContext", JavaOnlyMap.of("tier", "pro", "score", 42),
        )

        assertEquals(
            mapOf("tier" to "pro", "score" to 42.0),
            map.getStringAnyMapOrNull("customContext"),
        )
    }
}
