import Foundation
import SimulaAdSDK

struct SimulaBridgeAPIEnvironmentRequest {
    let apiKey: String
    let environmentName: String
    let environment: SimulaAPIEnvironment
}

/// Shared React Native process ownership. Checks never mutate; accepted native entries commit.
@MainActor
enum SimulaBridgeAPIEnvironmentState {
    private static var apiKey: String?
    private static var environmentName: String?

    static func requestIfCompatible(
        apiKey requestedApiKey: String,
        rawEnvironment: Any?
    ) -> SimulaBridgeAPIEnvironmentRequest? {
        let requestedName = normalizedName(rawEnvironment)
        if let apiKey, let environmentName {
            guard apiKey == requestedApiKey, environmentName == requestedName else { return nil }
        }
        let environment: SimulaAPIEnvironment = requestedName == "staging" ? .staging : .production
        return SimulaBridgeAPIEnvironmentRequest(
            apiKey: requestedApiKey,
            environmentName: requestedName,
            environment: environment
        )
    }

    static func owns(_ request: SimulaBridgeAPIEnvironmentRequest) -> Bool {
        apiKey == request.apiKey && environmentName == request.environmentName
    }

    static func commit(_ request: SimulaBridgeAPIEnvironmentRequest) -> Bool {
        if apiKey != nil || environmentName != nil {
            return owns(request)
        }
        apiKey = request.apiKey
        environmentName = request.environmentName
        return true
    }

    /// Only exact "staging" opts in; unknown values and arbitrary URLs fail closed.
    static func normalizedName(_ rawEnvironment: Any?) -> String {
        (rawEnvironment as? String) == "staging" ? "staging" : "production"
    }
}
