import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaGameCatalogModule)
final class SimulaGameCatalogModule: NSObject, RCTBridgeModule, RCTInvalidating {
    static func moduleName() -> String! { "SimulaGameCatalogModule" }
    static func requiresMainQueueSetup() -> Bool { false }
    @objc var methodQueue: DispatchQueue { .main }

    private var catalogs: [String: SimulaGameCatalog] = [:]
    private var fetches: [UUID: (request: SimulaCatalogRequest, reject: RCTPromiseRejectBlock)] = [:]
    private var controller: UIHostingController<CatalogGamePlayer>?
    private var playRequest: SimulaCatalogRequest?
    private var playGeneration = 0
    private var resolvePlay: RCTPromiseResolveBlock?
    private var closing = false
    private var invalidated = false

    private func onMain(_ work: @escaping @MainActor () -> Void) {
        if Thread.isMainThread {
            MainActor.assumeIsolated { work() }
        } else {
            DispatchQueue.main.async { work() }
        }
    }

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
        onMain { self.fetch(props, resolve: resolve, reject: reject) }
    }

    @MainActor
    private func fetch(_ props: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard !invalidated else { reject("CANCELLED", "Catalog bridge closed", nil); return }
        let id = UUID()
        do {
            let request = try catalog(props).fetch { [weak self] result in
                guard let self, self.fetches.removeValue(forKey: id) != nil else { return }
                switch result {
                case .success(let catalog):
                    resolve(["menuId": catalog.menuId, "games": catalog.games.map { ["id": $0.id, "name": $0.name] }])
                case .failure(let error): self.rejectError(error, reject)
                }
            }
            fetches[id] = (request, reject)
        } catch { rejectError(error, reject) }
    }

    @objc(showCatalogGame:resolve:reject:)
    func showCatalogGame(_ props: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        onMain { self.show(props, resolve: resolve, reject: reject) }
    }

    @MainActor
    private func show(_ props: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard !invalidated else { reject("CANCELLED", "Catalog bridge closed", nil); return }
        guard resolvePlay == nil else { reject("BUSY", "A game is already opening", nil); return }
        guard SimulaAds.shared != nil,
              let menu = props["menuId"] as? String, !menu.isEmpty,
              let game = props["gameId"] as? String, !game.isEmpty else {
            reject("INVALID_CONFIG", "Initialize the SDK before opening a game", nil); return
        }
        playGeneration += 1
        let generation = playGeneration
        resolvePlay = resolve
        do {
            guard let window = currentWindow() else { throw SimulaAPIError.invalidResponse }
            playRequest = try catalog(props).load(
                menuId: menu, gameId: game, companionEnabled: props["companionEnabled"] as? Bool,
                width: window.bounds.width, height: window.bounds.height,
                charId: props["charId"] as? String ?? "", charName: props["charName"] as? String ?? "",
                charImage: props["charImage"] as? String ?? "", charDesc: props["charDesc"] as? String
            ) { [weak self] result in
                guard let self, !self.invalidated, generation == self.playGeneration else { return }
                self.playRequest = nil
                switch result {
                case .success(let url):
                    guard let currentWindow = self.currentWindow(), currentWindow === window,
                          var top = currentWindow.rootViewController else {
                        self.resolvePlay = nil
                        self.rejectError(SimulaAPIError.invalidResponse, reject)
                        return
                    }
                    while let presented = top.presentedViewController { top = presented }
                    let player = CatalogGamePlayer(iframeUrl: url) { [weak self] in self?.close() }
                    let host = UIHostingController(rootView: player)
                    host.modalPresentationStyle = .overFullScreen
                    host.view.backgroundColor = .clear
                    self.controller = host
                    top.present(host, animated: false)
                case .failure(let error):
                    self.resolvePlay = nil
                    self.rejectError(error, reject)
                }
            }
        } catch {
            resolvePlay = nil
            rejectError(error, reject)
        }
    }

    @MainActor
    private func currentWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?.windows.first(where: \.isKeyWindow)
    }

    private func rejectError(_ error: Error, _ reject: RCTPromiseRejectBlock) {
        if case SimulaAPIError.httpError(let status) = error { reject("HTTP_\(status)", error.localizedDescription, error) }
        else { reject("CATALOG_ERROR", error.localizedDescription, error) }
    }

    @MainActor
    private func close() {
        guard !closing else { return }
        playGeneration += 1
        playRequest?.cancel()
        playRequest = nil
        closing = true
        // Keep the player busy until the entire modal chain is gone, including any store sheet.
        if let presenter = controller?.presentingViewController {
            presenter.dismiss(animated: false) { self.didClose() }
        } else { didClose() }
    }

    @MainActor
    private func didClose() {
        controller = nil
        let resolve = resolvePlay
        resolvePlay = nil
        closing = false
        resolve?(nil)
    }

    @objc func hideCatalogGame() { onMain { self.close() } }

    @objc func invalidate() {
        if Thread.isMainThread {
            MainActor.assumeIsolated { teardown() }
        } else {
            DispatchQueue.main.sync { self.teardown() }
        }
    }

    @MainActor
    private func teardown() {
        invalidated = true
        let pending = fetches
        fetches.removeAll()
        for item in pending.values {
            item.request.cancel()
            item.reject("CANCELLED", "Catalog bridge closed", nil)
        }
        close()
        catalogs.removeAll()
    }
}
