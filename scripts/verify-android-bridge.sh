#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KOTLIN_SDK_PATH="${KOTLIN_SDK_PATH:-$ROOT/../simula-ad-sdk-kotlin}"

if [[ ! -x "$KOTLIN_SDK_PATH/gradlew" ]]; then
  echo "Gradle wrapper not found at $KOTLIN_SDK_PATH/gradlew" >&2
  echo "Set KOTLIN_SDK_PATH to the native Kotlin SDK checkout." >&2
  exit 1
fi

AGP_VERSION="$(sed -n 's/^agp = "\([^"]*\)"/\1/p' "$KOTLIN_SDK_PATH/gradle/libs.versions.toml")"
if [[ -z "$AGP_VERSION" ]]; then
  echo "Could not read AGP version from $KOTLIN_SDK_PATH/gradle/libs.versions.toml" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/simula-rn-android.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/settings.gradle" <<GRADLE
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories { google(); mavenCentral() }
}
rootProject.name = 'simula-rn-android-compile-check'
include ':simula-ads-react-native'
project(':simula-ads-react-native').projectDir = file('$ROOT/android')
includeBuild('$KOTLIN_SDK_PATH') {
    dependencySubstitution {
        substitute module('ad.simula:ad-sdk') using project(':simula-ad-sdk')
    }
}
GRADLE

cat > "$TMP/build.gradle" <<GRADLE
buildscript {
    ext {
        kotlinVersion = '2.1.20'
        jvmTarget = '17'
    }
    repositories { google(); mavenCentral() }
    dependencies { classpath 'com.android.tools.build:gradle:$AGP_VERSION' }
}
GRADLE

cat > "$TMP/gradle.properties" <<'PROPERTIES'
android.useAndroidX=true
newArchEnabled=false
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
PROPERTIES

"$KOTLIN_SDK_PATH/gradlew" \
  -p "$TMP" \
  :simula-ads-react-native:compileDebugKotlin \
  :simula-ads-react-native:testDebugUnitTest \
  --console=plain
