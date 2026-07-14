Pod::Spec.new do |s|
  s.name         = "simula-ads-react-native"
  s.version      = "1.3.7-dev.1"
  s.summary      = "Simula Ad SDK for React Native"
  s.description  = "React Native bridge for Simula's native iOS Ad SDK with mini-game support."
  s.homepage     = "https://github.com/Simula-AI-SDK/simula-ad-sdk-react-native"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.author       = { "Simula AI" => "dev@simula.ad" }
  s.source       = { :git => "https://github.com/Simula-AI-SDK/simula-ad-sdk-react-native.git", :tag => s.version.to_s }

  s.platform     = :ios, "15.0"
  s.swift_version = "5.9"

  s.source_files = "ios/**/*.{h,m,swift}"

  s.dependency "React-Core"
  # 1.1.4+ ships as a prebuilt XCFramework: host Xcodes no longer compile SDK source,
  # which is the mitigation for the Swift 6.1–6.3 optimizer task-teardown crash
  # ("freed pointer was not the last allocation") in host apps. Do not resolve to
  # anything older — 1.1.3 and below are source pods that re-expose the bug.
  # 1.1.5+ carries the native-ad retained-WebView store + feed scroll/height fixes
  # this bridge's sizing contract relies on.
  # Dev pin: exact, because CocoaPods `~>` never resolves to prerelease versions.
  s.dependency "SimulaAdSDK", "1.1.5-dev.1"

  s.frameworks = "StoreKit", "SafariServices"
end
