import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaGameCatalogModule)
final class SimulaGameCatalogModule: NSObject, RCTBridgeModule {
    static func moduleName() -> String! { "SimulaGameCatalogModule" }
    static func requiresMainQueueSetup() -> Bool { false }
    @objc var methodQueue: DispatchQueue { .main }

    private var catalogs: [String: SimulaGameCatalog] = [:]
    private var controller: UIHostingController<CatalogGamePlayer>?
    private var playTask: Task<Void, Never>?
    private var resolvePlay: RCTPromiseResolveBlock?

    @MainActor
    private func catalog(_ props: NSDictionary) throws -> SimulaGameCatalog {
        guard let key = props["apiKey"] as? String,
              let name = props["apiEnvironment"] as? String,
              ["staging", "production"].contains(name) else { throw SimulaAPIError.invalidResponse }
        let user = props["primaryUserID"] as? String
        let cacheKey = "\(name):\(key):\(user ?? "")"
        if let cached = catalogs[cacheKey] { return cached }
        guard let catalog = SimulaGameCatalog(apiKey: key, environment: name == "staging" ? .staging : .production, primaryUserID: user) else {
            throw NSError(domain: "SimulaCatalog", code: 1, userInfo: [NSLocalizedDescriptionKey: "API_ENVIRONMENT_UNAVAILABLE"])
        }
        if catalogs.count >= 2 { catalogs.removeAll() }
        catalogs[cacheKey] = catalog
        return catalog
    }

    @objc(fetchCatalog:resolve:reject:)
    func fetchCatalog(_ props: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            do {
                let result = try await catalog(props).fetch()
                resolve(["menuId": result.menuId, "games": result.games.map { ["id": $0.id, "name": $0.name] }])
            } catch { rejectError(error, reject) }
        }
    }

    @objc(showCatalogGame:resolve:reject:)
    func showCatalogGame(_ props: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            guard resolvePlay == nil else { reject("BUSY", "A game is already opening", nil); return }
            guard SimulaAds.shared != nil,
                  let menu = props["menuId"] as? String, !menu.isEmpty,
                  let game = props["gameId"] as? String, !game.isEmpty else {
                reject("INVALID_CONFIG", "Initialize the SDK before opening a game", nil); return
            }
            let companion = props["companionEnabled"] as? Bool
            resolvePlay = resolve
            playTask = Task { @MainActor in
                do {
                    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
                    guard let window = scene?.windows.first(where: \.isKeyWindow), var top = window.rootViewController else { throw SimulaAPIError.invalidResponse }
                    let url = try await catalog(props).load(
                        menuId: menu, gameId: game, companionEnabled: companion,
                        width: window.bounds.width, height: window.bounds.height,
                        charId: props["charId"] as? String ?? "", charName: props["charName"] as? String ?? "",
                        charImage: props["charImage"] as? String ?? "", charDesc: props["charDesc"] as? String
                    )
                    try Task.checkCancellation()
                    while let presented = top.presentedViewController { top = presented }
                    let player = CatalogGamePlayer(iframeUrl: url) { [weak self] in self?.close() }
                    // A concrete root view preserves SwiftUI's normal diffing and native cleanup.
                    let host = UIHostingController(rootView: player)
                    host.modalPresentationStyle = .overFullScreen
                    host.view.backgroundColor = .clear
                    controller = host
                    top.present(host, animated: false)
                } catch is CancellationError { }
                catch {
                    resolvePlay = nil
                    playTask = nil
                    rejectError(error, reject)
                }
            }
        }
    }

    private func rejectError(_ error: Error, _ reject: RCTPromiseRejectBlock) {
        if case SimulaAPIError.httpError(let status) = error { reject("HTTP_\(status)", error.localizedDescription, error) }
        else { reject("CATALOG_ERROR", error.localizedDescription, error) }
    }

    @MainActor
    private func close() {
        playTask?.cancel(); playTask = nil
        let host = controller
        controller = nil
        let resolve = resolvePlay
        resolvePlay = nil
        if let host {
            host.dismiss(animated: false) { resolve?(nil) }
        } else { resolve?(nil) }
    }

    @objc func hideCatalogGame() { Task { @MainActor in close() } }
    @objc func invalidate() { Task { @MainActor in close(); catalogs.removeAll() } }
}
