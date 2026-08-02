#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWIFT_SDK_PATH="${SWIFT_SDK_PATH:-$ROOT/../simula-ad-sdk-swift}"

if [[ ! -f "$SWIFT_SDK_PATH/SimulaAdSDK.podspec" ]]; then
  echo "SimulaAdSDK.podspec not found at $SWIFT_SDK_PATH" >&2
  echo "Set SWIFT_SDK_PATH to a SimulaAdSDK 1.1.7 source checkout." >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/simula-rn-ios.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Keep React Native's scripts on a short, local path. Some RN pod build phases prepend
# PODS_ROOT to REACT_NATIVE_PATH, so a deeply-relative external path is not reliable.
ln -s "$ROOT/node_modules" "$TMP/node_modules"

cat > "$TMP/package.json" <<JSON
{
  "name": "simula-rn-ios-compile-check",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react-native": "file:$ROOT/node_modules/react-native"
  }
}
JSON

cat > "$TMP/main.m" <<'OBJC'
#import <UIKit/UIKit.h>
int main(int argc, char * argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, nil); }
}
OBJC

# CocoaPods depends on xcodeproj, but Homebrew keeps its gems in an isolated GEM_HOME.
# CI gem installs expose it directly; local Homebrew installs use the fallback below.
if ! ruby -e 'require "xcodeproj"' >/dev/null 2>&1; then
  POD_BIN="$(command -v pod)"
  COCOAPODS_GEM_HOME="$(awk -F'"' '/GEM_HOME=/{print $2; exit}' "$POD_BIN")"
  if [[ -z "$COCOAPODS_GEM_HOME" ]]; then
    echo "Ruby cannot load xcodeproj and CocoaPods GEM_HOME could not be detected." >&2
    exit 1
  fi
  export GEM_HOME="$COCOAPODS_GEM_HOME"
fi

(
  cd "$TMP"
  ruby -e 'require "xcodeproj"; p=Xcodeproj::Project.new("SimulaLint.xcodeproj"); t=p.new_target(:application,"SimulaLint",:ios,"15.1"); f=p.main_group.new_file("main.m"); t.source_build_phase.add_file_reference(f); t.build_configurations.each{|c| c.build_settings["PRODUCT_BUNDLE_IDENTIFIER"]="ad.simula.lint"}; p.save'
)

cat > "$TMP/Podfile" <<RUBY
platform :ios, '15.1'
require_relative './node_modules/react-native/scripts/react_native_pods'

install! 'cocoapods', :integrate_targets => false
prepare_react_native_project!
project 'SimulaLint.xcodeproj'

target 'SimulaLint' do
  use_react_native!(
    :path => './node_modules/react-native',
    :app_path => '$TMP',
    :hermes_enabled => false,
    :fabric_enabled => false
  )
  pod 'SimulaAdSDK', :path => '$SWIFT_SDK_PATH'
  pod 'simula-ads-react-native', :path => '$ROOT'
end

post_install do |installer|
  react_native_post_install(
    installer,
    '$ROOT/node_modules/react-native',
    :mac_catalyst_enabled => false
  )
end
RUBY

(
  cd "$TMP"
  SIMULA_LOCAL_DEV=1 pod install
  SIMULA_LOCAL_DEV=1 xcodebuild \
    -project "Pods/Pods.xcodeproj" \
    -scheme "simula-ads-react-native" \
    -configuration Debug \
    -sdk iphonesimulator \
    CODE_SIGNING_ALLOWED=NO \
    REACT_NATIVE_PATH="$ROOT/node_modules/react-native" \
    build
)
