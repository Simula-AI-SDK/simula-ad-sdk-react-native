Pod::Spec.new do |s|
  s.name         = "simula-ads-react-native"
  s.version      = "1.4.0"
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
  s.dependency "SimulaAdSDK", "~> 1.1.0"

  s.frameworks = "StoreKit", "SafariServices"
end
