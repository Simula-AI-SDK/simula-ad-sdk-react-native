import React
import SwiftUI
import WebKit
import StoreKit
import SafariServices
import SimulaAdSDK

@objc(SimulaMiniGameModule)
class SimulaMiniGameModule: RCTEventEmitter {

    // Menu/Interstitial are presented as .overFullScreen modals so they join
    // the main window's presentedViewController chain.  The Swift SDK's
    // presentViewController() then walks that chain, finds our hosting VC,
    // and presents SKStoreProductViewController / SFSafariViewController from
    // it — all within the main window (no secondary window to conflict with
    // SKStoreProductViewController's own system-level window).
    private var menuHostingController: UIHostingController<AnyView>?
    private var interstitialHostingController: UIHostingController<AnyView>?

    // Invitation/Button use subview approach (needs touch passthrough)
    private var buttonHostingController: UIHostingController<AnyView>?
    private var invitationHostingController: UIHostingController<AnyView>?

    private var provider: SimulaProvider?
    private var hasListeners = false

    // MARK: - UIApplication.open() interceptor
    //
    // Swizzles UIApplication.open(_:options:completionHandler:) so that App Store
    // URLs are caught before they leave the app. When our overlay is active, we
    // present SKStoreProductViewController ourselves instead of letting the system
    // open the App Store externally. This is both a diagnostic and a fix.

    static weak var activeHostingController: UIHostingController<AnyView>?
    static weak var activeModule: SimulaMiniGameModule?
    static var swizzleInstalled = false

    private static let installInterceptor: Void = {
        let cls: AnyClass = UIApplication.self
        let originalSel = NSSelectorFromString("openURL:options:completionHandler:")
        let swizzledSel = #selector(UIApplication.simula_openURL(_:options:completionHandler:))
        guard let original = class_getInstanceMethod(cls, originalSel) else {
            NSLog("[SimulaInterceptor] FAILED: could not find original openURL:options:completionHandler:")
            return
        }
        guard let swizzled = class_getInstanceMethod(cls, swizzledSel) else {
            NSLog("[SimulaInterceptor] FAILED: could not find swizzled simula_openURL method")
            return
        }
        method_exchangeImplementations(original, swizzled)
        swizzleInstalled = true
        NSLog("[SimulaInterceptor] SUCCESS: UIApplication.open() swizzle installed")
    }()

    static func appStoreID(from url: URL) -> String? {
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""
        if scheme == "itms-apps" || scheme == "itms" {
            if let range = url.absoluteString.range(of: #"id(\d+)"#, options: .regularExpression) {
                return String(url.absoluteString[range].dropFirst(2))
            }
            return nil
        }
        guard host.contains("apps.apple.com") || host.contains("itunes.apple.com") else { return nil }
        if let range = url.path.range(of: #"/id(\d+)"#, options: .regularExpression) {
            return String(url.path[range].dropFirst(3))
        }
        return nil
    }

    override init() {
        super.init()
        _ = SimulaMiniGameModule.installInterceptor
    }

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    override func supportedEvents() -> [String]! {
        return [
            "onMiniGameMenuClose",
            "onMiniGameButtonClick",
            "onMiniGameInvitationClick",
            "onMiniGameInvitationClose",
            "onMiniGameInterstitialClick",
            "onMiniGameInterstitialClose",
            "onMiniGameDiagnostic",
        ]
    }

    // MARK: - Helpers

    /// A UIView that passes through touches on itself but delivers to subviews.
    private class PassthroughView: UIView {
        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            let view = super.hitTest(point, with: event)
            return view === self ? nil : view
        }
    }

    private func currentKeyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first(where: \.isKeyWindow)
    }

    private func currentWindowScene() -> UIWindowScene? {
        currentKeyWindow()?.windowScene
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }

    private func currentRootViewController() -> UIViewController? {
        currentKeyWindow()?.rootViewController
    }

    private func currentTopPresentedViewController() -> UIViewController? {
        guard let rootVC = currentRootViewController() else { return nil }
        var topVC = rootVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }
        return topVC
    }

    private func className(of object: AnyObject?) -> String {
        guard let object = object else { return "nil" }
        return String(describing: type(of: object))
    }

    private func emitDiagnostic(_ event: String, source: String) {
        guard hasListeners else { return }
        let rootVC = currentRootViewController()
        let topVC = currentTopPresentedViewController()
        sendEvent(withName: "onMiniGameDiagnostic", body: [
            "event": event,
            "source": source,
            "keyWindowClass": className(of: currentKeyWindow()),
            "rootViewControllerClass": className(of: rootVC),
            "topPresentedViewControllerClass": className(of: topVC),
        ])
    }

    func emitInterceptDiagnostic(url: URL, appID: String) {
        guard hasListeners else { return }
        sendEvent(withName: "onMiniGameDiagnostic", body: [
            "event": "url_intercepted",
            "source": "UIApplication.open",
            "url": url.absoluteString,
            "appID": appID,
            "topPresentedViewControllerClass": className(of: currentTopPresentedViewController()),
        ])
    }

    func emitStoreProductDiagnostic(appID: String) {
        guard hasListeners else { return }
        sendEvent(withName: "onMiniGameDiagnostic", body: [
            "event": "presenting_SKStoreProductVC",
            "source": "presentStoreProduct",
            "appID": appID,
            "iTunesItemIdentifier": Int(appID) ?? 0,
        ])
    }

    func emitNavigationDiagnostic(url: URL?, navigationType: WKNavigationType, isMainFrame: Bool, extra: String = "decidePolicyFor") {
        guard hasListeners else { return }
        let typeStr: String
        switch navigationType {
        case .linkActivated: typeStr = "linkActivated"
        case .formSubmitted: typeStr = "formSubmitted"
        case .backForward: typeStr = "backForward"
        case .reload: typeStr = "reload"
        case .formResubmitted: typeStr = "formResubmitted"
        case .other: typeStr = "other"
        @unknown default: typeStr = "unknown"
        }
        sendEvent(withName: "onMiniGameDiagnostic", body: [
            "event": "navigation",
            "source": extra,
            "url": url?.absoluteString ?? "nil",
            "navigationType": typeStr,
            "isMainFrame": isMainFrame,
        ])
    }

    // MARK: - Modal hosting (menu, interstitial)
    //
    // Presents the hosting VC as a .overFullScreen modal so it joins the main
    // window's presentedViewController chain.  The Swift SDK's
    // presentViewController() then finds it and presents SKStoreProductVC /
    // SFSafariVC from it — everything stays in the main window, so
    // SKStoreProductViewController's system-level window renders correctly.

    private func addFullscreenOverlay(hostingVC: UIHostingController<AnyView>) -> Bool {
        guard let topVC = currentTopPresentedViewController() else { return false }

        hostingVC.view.backgroundColor = .clear
        hostingVC.modalPresentationStyle = .overFullScreen
        hostingVC.modalTransitionStyle = .crossDissolve

        topVC.present(hostingVC, animated: false)

        // Enable UIApplication.open() interceptor while overlay is active
        SimulaMiniGameModule.activeHostingController = hostingVC
        SimulaMiniGameModule.activeModule = self

        // Start scanning for WKWebViews to install delegate proxy
        startWebViewScanning(in: hostingVC)

        return true
    }

    private func removeFullscreenOverlay(_ hostingVC: inout UIHostingController<AnyView>?) {
        guard let vc = hostingVC else { return }
        // Stop scanning and clean up proxies
        stopWebViewScanning()
        // Disable interceptor if this is the active overlay
        if SimulaMiniGameModule.activeHostingController === vc {
            SimulaMiniGameModule.activeHostingController = nil
        }
        // Dismiss from the presenting VC so the hosting VC itself is removed
        // (not just its presented children like SKStoreProductViewController).
        vc.presentingViewController?.dismiss(animated: false)
        hostingVC = nil
    }

    // MARK: - WKWebView delegate proxy
    //
    // In a pure SwiftUI app the SDK's WKNavigationDelegate works fine.
    // In React Native the coordinator can lose its delegate connection.
    // We scan the hosting VC's view hierarchy for WKWebViews and install
    // a proxy that ensures App Store / external links are handled in-app.

    private var webViewScanTimer: Timer?
    private var installedProxies: [WKNavigationDelegateProxy] = []

    private func startWebViewScanning(in hostingVC: UIHostingController<AnyView>) {
        stopWebViewScanning()
        // Scan periodically — SwiftUI creates WKWebViews lazily as views appear
        webViewScanTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self, weak hostingVC] _ in
            guard let self = self, let hvc = hostingVC else { return }
            self.scanAndProxyWebViews(in: hvc.view)
        }
    }

    private func stopWebViewScanning() {
        webViewScanTimer?.invalidate()
        webViewScanTimer = nil
        installedProxies.removeAll()
    }

    private func scanAndProxyWebViews(in view: UIView) {
        if let webView = view as? WKWebView {
            let alreadyProxied = installedProxies.contains { $0 === webView.navigationDelegate }
            if !alreadyProxied {
                let originalDelegate = webView.navigationDelegate
                let proxy = WKNavigationDelegateProxy(
                    original: originalDelegate,
                    module: self
                )
                webView.navigationDelegate = proxy
                webView.uiDelegate = proxy
                installedProxies.append(proxy)

                // Verify the proxy actually stuck
                let actualDelegate = webView.navigationDelegate
                let proxyStuck = actualDelegate === proxy

                if hasListeners {
                    sendEvent(withName: "onMiniGameDiagnostic", body: [
                        "event": "webview_proxy_installed",
                        "source": "delegate_scan",
                        "originalDelegate": originalDelegate == nil ? "nil" : String(describing: type(of: originalDelegate!)),
                        "proxyIsDelegate": proxyStuck ? "YES" : "NO",
                        "webViewURL": webView.url?.absoluteString ?? "nil",
                    ])
                }
            }
            return
        }
        for subview in view.subviews {
            scanAndProxyWebViews(in: subview)
        }
    }

    // MARK: - Subview overlay (invitation, button)

    private func addSubviewOverlay(hostingVC: UIHostingController<AnyView>) -> Bool {
        guard let scene = currentWindowScene(),
              let rootVC = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return false }

        hostingVC.view.backgroundColor = .clear
        rootVC.addChild(hostingVC)

        let container = PassthroughView(frame: rootVC.view.bounds)
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        if #available(iOS 16.0, *) {
            hostingVC.sizingOptions = [.intrinsicContentSize]
        }
        hostingVC.view.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(hostingVC.view)
        NSLayoutConstraint.activate([
            hostingVC.view.topAnchor.constraint(equalTo: container.topAnchor),
            hostingVC.view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            hostingVC.view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        rootVC.view.addSubview(container)
        hostingVC.didMove(toParent: rootVC)
        return true
    }

    private func removeSubviewOverlay(_ hostingVC: inout UIHostingController<AnyView>?) {
        guard let vc = hostingVC else { return }
        vc.willMove(toParent: nil)
        if let container = vc.view.superview, container is PassthroughView {
            container.removeFromSuperview()
        } else {
            vc.view.removeFromSuperview()
        }
        vc.removeFromParent()
        hostingVC = nil
    }

    // MARK: - MiniGameMenu (single-window child host)

    @objc
    func showMiniGameMenu(_ props: NSDictionary,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        // Ensure UIApplication.open() interceptor is installed (static let, runs once)
        _ = SimulaMiniGameModule.installInterceptor
        // Emit swizzle status through RN diagnostics so it's visible in Metro logs
        if hasListeners {
            sendEvent(withName: "onMiniGameDiagnostic", body: [
                "event": "interceptor_status",
                "source": "swizzle",
                "installed": SimulaMiniGameModule.swizzleInstalled ? "YES" : "NO",
            ])
        }

        guard let apiKey = props["apiKey"] as? String,
              let charName = props["charName"] as? String,
              let charID = props["charID"] as? String else {
            reject("INVALID_PROPS", "Missing required props: apiKey, charName, or charID", nil)
            return
        }

        let charImage = props["charImage"] as? String ?? ""
        let charDesc = props["charDesc"] as? String
        let delegateChar = props["delegateChar"] as? Bool ?? true
        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let devMode = props["devMode"] as? Bool ?? false
        let primaryUserID = props["primaryUserID"] as? String
        let maxGamesToShow = convertMaxGamesToShow(props["maxGamesToShow"])

        let messages = convertMessages(props["messages"])
        let theme = convertTheme(props["theme"])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("INTERNAL_ERROR", "Module deallocated", nil)
                return
            }

            self.removeFullscreenOverlay(&self.menuHostingController)
            self.provider = nil

            let provider = SimulaProvider(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent
            )
            self.provider = provider

            let menuView = MiniGameMenuWrapper(
                provider: provider,
                charName: charName,
                charID: charID,
                charImage: charImage,
                messages: messages,
                charDesc: charDesc,
                maxGamesToShow: maxGamesToShow,
                theme: theme,
                delegateChar: delegateChar,
                onClose: { [weak self] in
                    // Don't destroy — game/ad may still render in the ZStack
                    self?.sendEvent(withName: "onMiniGameMenuClose", body: nil)
                },
                onFullyDone: { [weak self] in
                    // Tap catcher fired — ZStack is empty, safe to destroy
                    guard let self = self else { return }
                    self.removeFullscreenOverlay(&self.menuHostingController)
                    self.provider = nil
                    self.sendEvent(withName: "onMiniGameMenuClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(menuView))
            hostingVC.view.backgroundColor = .clear

            guard self.addFullscreenOverlay(hostingVC: hostingVC) else {
                reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
                return
            }
            self.menuHostingController = hostingVC
            self.emitDiagnostic("menu_attached", source: "menu")

            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameMenu() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.removeFullscreenOverlay(&self.menuHostingController)
            self.provider = nil
        }
    }

    // MARK: - MiniGameButton (subview — needs touch passthrough)

    @objc
    func showMiniGameButton(_ props: NSDictionary,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String else {
            reject("INVALID_PROPS", "Missing required prop: apiKey", nil)
            return
        }

        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let devMode = props["devMode"] as? Bool ?? false
        let primaryUserID = props["primaryUserID"] as? String
        let text = props["text"] as? String
        let showPulsate = props["showPulsate"] as? Bool ?? false
        let showBadge = props["showBadge"] as? Bool ?? false
        let theme = convertButtonTheme(props["theme"])
        let width = convertDimension(props["width"])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("INTERNAL_ERROR", "Module deallocated", nil)
                return
            }

            self.removeSubviewOverlay(&self.buttonHostingController)

            let provider = SimulaProvider(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent
            )

            let buttonView = MiniGameButtonWrapper(
                provider: provider,
                text: text,
                showPulsate: showPulsate,
                showBadge: showBadge,
                theme: theme,
                width: width,
                onClick: { [weak self] in
                    self?.sendEvent(withName: "onMiniGameButtonClick", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(buttonView))

            guard self.addSubviewOverlay(hostingVC: hostingVC) else {
                reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
                return
            }
            self.buttonHostingController = hostingVC
            resolve(nil)
        }
    }

    @objc
    func hideMiniGameButton() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.removeSubviewOverlay(&self.buttonHostingController)
        }
    }

    // MARK: - MiniGameInvitation (subview — needs touch passthrough)

    @objc
    func showMiniGameInvitation(_ props: NSDictionary,
                                resolve: @escaping RCTPromiseResolveBlock,
                                reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String,
              let charImage = props["charImage"] as? String else {
            reject("INVALID_PROPS", "Missing required props: apiKey or charImage", nil)
            return
        }

        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let devMode = props["devMode"] as? Bool ?? false
        let primaryUserID = props["primaryUserID"] as? String
        let titleText = props["titleText"] as? String ?? "Want to play a game?"
        let subText = props["subText"] as? String ?? "Take a break and challenge yourself!"
        let ctaText = props["ctaText"] as? String ?? "Play a Game"
        let animation = convertInvitationAnimation(props["animation"] as? String)
        let theme = convertInvitationTheme(props["theme"])
        let autoCloseDuration = props["autoCloseDuration"] as? TimeInterval
        let width = props["width"]
        let top = props["top"]

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("INTERNAL_ERROR", "Module deallocated", nil)
                return
            }

            self.removeSubviewOverlay(&self.invitationHostingController)

            let provider = SimulaProvider(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent
            )

            let invitationView = MiniGameInvitationWrapper(
                provider: provider,
                titleText: titleText,
                subText: subText,
                ctaText: ctaText,
                charImage: charImage,
                animation: animation,
                theme: theme,
                autoCloseDuration: autoCloseDuration,
                width: convertDimension(width),
                top: convertDimension(top),
                onClick: { [weak self] in
                    self?.sendEvent(withName: "onMiniGameInvitationClick", body: nil)
                },
                onClose: { [weak self] in
                    self?.removeSubviewOverlay(&self!.invitationHostingController)
                    self?.sendEvent(withName: "onMiniGameInvitationClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(invitationView))

            guard self.addSubviewOverlay(hostingVC: hostingVC) else {
                reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
                return
            }
            self.invitationHostingController = hostingVC

            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameInvitation() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.removeSubviewOverlay(&self.invitationHostingController)
        }
    }

    // MARK: - MiniGameInterstitial (single-window child host)

    @objc
    func showMiniGameInterstitial(_ props: NSDictionary,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String,
              let charImage = props["charImage"] as? String else {
            reject("INVALID_PROPS", "Missing required props: apiKey or charImage", nil)
            return
        }

        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let devMode = props["devMode"] as? Bool ?? false
        let primaryUserID = props["primaryUserID"] as? String
        let invitationText = props["invitationText"] as? String ?? "Want to play a game?"
        let ctaText = props["ctaText"] as? String ?? "Play a Game"
        let backgroundImage = props["backgroundImage"] as? String
        let theme = convertInterstitialTheme(props["theme"])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("INTERNAL_ERROR", "Module deallocated", nil)
                return
            }

            self.removeFullscreenOverlay(&self.interstitialHostingController)

            let provider = SimulaProvider(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent
            )

            let interstitialView = MiniGameInterstitialWrapper(
                provider: provider,
                charImage: charImage,
                invitationText: invitationText,
                ctaText: ctaText,
                backgroundImage: backgroundImage,
                theme: theme,
                onClick: { [weak self] in
                    self?.sendEvent(withName: "onMiniGameInterstitialClick", body: nil)
                },
                onClose: { [weak self] in
                    guard let self = self else { return }
                    self.removeFullscreenOverlay(&self.interstitialHostingController)
                    UIApplication.shared.isStatusBarHidden = false
                    self.sendEvent(withName: "onMiniGameInterstitialClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(interstitialView))
            hostingVC.view.backgroundColor = .clear

            guard self.addFullscreenOverlay(hostingVC: hostingVC) else {
                reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
                return
            }
            self.interstitialHostingController = hostingVC
            self.emitDiagnostic("interstitial_attached", source: "interstitial")

            // Hide status bar (UIViewControllerBasedStatusBarAppearance=false, so use UIApplication)
            UIApplication.shared.isStatusBarHidden = true

            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameInterstitial() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.removeFullscreenOverlay(&self.interstitialHostingController)
            UIApplication.shared.isStatusBarHidden = false
        }
    }

    // MARK: - Type Conversion

    private func convertMessages(_ raw: Any?) -> [SimulaAdSDK.Message] {
        guard let array = raw as? [[String: Any]] else { return [] }
        return array.compactMap { dict in
            guard let role = dict["role"] as? String,
                  let content = dict["content"] as? String else { return nil }
            return SimulaAdSDK.Message(role: role, content: content)
        }
    }

    private func convertTheme(_ raw: Any?) -> MiniGameTheme {
        guard let dict = raw as? [String: Any] else { return MiniGameTheme() }
        var theme = MiniGameTheme()
        theme.backgroundColor = dict["backgroundColor"] as? String
        theme.headerColor = dict["headerColor"] as? String
        theme.borderColor = dict["borderColor"] as? String
        theme.titleFont = dict["titleFont"] as? String
        theme.secondaryFont = dict["secondaryFont"] as? String
        theme.titleFontColor = dict["titleFontColor"] as? String
        theme.secondaryFontColor = dict["secondaryFontColor"] as? String
        theme.iconCornerRadius = dict["iconCornerRadius"] as? CGFloat
        theme.accentColor = dict["accentColor"] as? String
        theme.playableBorderColor = dict["playableBorderColor"] as? String

        if let height = dict["playableHeight"] {
            if let numHeight = height as? Double {
                theme.playableHeight = .pixels(CGFloat(numHeight))
            } else if let strHeight = height as? String, strHeight.hasSuffix("%"),
                      let pct = Double(strHeight.dropLast()) {
                theme.playableHeight = .percent(pct / 100.0)
            }
        }

        return theme
    }

    private func convertButtonTheme(_ raw: Any?) -> MiniGameButtonTheme {
        guard let dict = raw as? [String: Any] else { return MiniGameButtonTheme() }
        var theme = MiniGameButtonTheme()
        theme.cornerRadius = dict["cornerRadius"] as? CGFloat
        theme.backgroundColor = dict["backgroundColor"] as? String
        theme.textColor = dict["textColor"] as? String
        theme.fontSize = dict["fontSize"] as? CGFloat
        theme.fontFamily = dict["fontFamily"] as? String
        theme.borderWidth = dict["borderWidth"] as? CGFloat
        theme.borderColor = dict["borderColor"] as? String
        if let padding = dict["padding"] as? CGFloat {
            theme.paddingHorizontal = padding
            theme.paddingVertical = padding
        }
        theme.pulsateColor = dict["pulsateColor"] as? String
        theme.badgeColor = dict["badgeColor"] as? String
        return theme
    }

    private func convertInvitationTheme(_ raw: Any?) -> MiniGameInvitationTheme {
        guard let dict = raw as? [String: Any] else { return MiniGameInvitationTheme() }
        var theme = MiniGameInvitationTheme()
        theme.cornerRadius = dict["cornerRadius"] as? CGFloat
        theme.backgroundColor = dict["backgroundColor"] as? String
        theme.textColor = dict["textColor"] as? String
        theme.titleTextColor = dict["titleTextColor"] as? String
        theme.subTextColor = dict["subTextColor"] as? String
        theme.ctaTextColor = dict["ctaTextColor"] as? String
        theme.ctaColor = dict["ctaColor"] as? String
        theme.charImageCornerRadius = dict["charImageCornerRadius"] as? CGFloat
        if let anchor = dict["charImageAnchor"] as? String {
            switch anchor {
            case "left": theme.charImageAnchor = .left
            case "right": theme.charImageAnchor = .right
            default: break
            }
        }
        theme.borderWidth = dict["borderWidth"] as? CGFloat
        theme.borderColor = dict["borderColor"] as? String
        theme.fontFamily = dict["fontFamily"] as? String
        return theme
    }

    private func convertInvitationAnimation(_ raw: String?) -> MiniGameInvitationAnimation {
        guard let str = raw else { return .auto }
        switch str {
        case "slideDown": return .slideDown
        case "slideUp": return .slideUp
        case "fadeIn": return .fadeIn
        case "none": return .none
        default: return .auto
        }
    }

    private func convertInterstitialTheme(_ raw: Any?) -> MiniGameInterstitialTheme {
        guard let dict = raw as? [String: Any] else { return MiniGameInterstitialTheme() }
        var theme = MiniGameInterstitialTheme()
        theme.ctaCornerRadius = dict["ctaCornerRadius"] as? CGFloat
        theme.characterSize = dict["characterSize"] as? CGFloat
        theme.titleTextColor = dict["titleTextColor"] as? String
        theme.titleFontSize = dict["titleFontSize"] as? CGFloat
        theme.ctaTextColor = dict["ctaTextColor"] as? String
        theme.ctaFontSize = dict["ctaFontSize"] as? CGFloat
        theme.ctaColor = dict["ctaColor"] as? String
        theme.fontFamily = dict["fontFamily"] as? String
        return theme
    }

    private func convertDimension(_ raw: Any?) -> CGFloat? {
        if let num = raw as? Double {
            return CGFloat(num)
        } else if let num = raw as? Int {
            return CGFloat(num)
        }
        return nil
    }

    private func convertMaxGamesToShow(_ raw: Any?) -> MaxGamesToShow {
        guard let num = raw as? Int else { return .six }
        switch num {
        case 3: return .three
        case 9: return .nine
        default: return .six
        }
    }
}

// MARK: - SwiftUI Wrappers

private struct MiniGameMenuWrapper: View {
    @StateObject var provider: SimulaProvider
    let charName: String
    let charID: String
    let charImage: String
    let messages: [SimulaAdSDK.Message]
    let charDesc: String?
    let maxGamesToShow: MaxGamesToShow
    let theme: MiniGameTheme
    let delegateChar: Bool
    let onClose: () -> Void
    let onFullyDone: () -> Void

    @State private var isOpen = true

    var body: some View {
        ZStack {
            if !isOpen {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onFullyDone()
                    }
            }

            MiniGameMenu(
                isOpen: $isOpen,
                onClose: {
                    isOpen = false
                    onClose()
                },
                charName: charName,
                charID: charID,
                charImage: charImage,
                messages: messages,
                charDesc: charDesc,
                maxGamesToShow: maxGamesToShow,
                theme: theme,
                delegateChar: delegateChar
            )
            .environmentObject(provider)
        }
    }
}

private struct MiniGameButtonWrapper: View {
    @StateObject var provider: SimulaProvider
    let text: String?
    let showPulsate: Bool
    let showBadge: Bool
    let theme: MiniGameButtonTheme
    let width: CGFloat?
    let onClick: () -> Void

    var body: some View {
        MiniGameButton(
            text: text,
            showPulsate: showPulsate,
            showBadge: showBadge,
            theme: theme,
            width: width,
            onClick: onClick
        )
        .environmentObject(provider)
    }
}

private struct MiniGameInvitationWrapper: View {
    @StateObject var provider: SimulaProvider
    let titleText: String
    let subText: String
    let ctaText: String
    let charImage: String
    let animation: MiniGameInvitationAnimation
    let theme: MiniGameInvitationTheme
    let autoCloseDuration: TimeInterval?
    let width: CGFloat?
    let top: CGFloat?
    let onClick: () -> Void
    let onClose: () -> Void

    @State private var isOpen = true

    var body: some View {
        MiniGameInvitation(
            titleText: titleText,
            subText: subText,
            ctaText: ctaText,
            charImage: charImage,
            animation: animation,
            theme: theme,
            isOpen: isOpen,
            autoCloseDuration: autoCloseDuration,
            width: width,
            topOffset: top,
            onClick: onClick,
            onClose: {
                isOpen = false
                onClose()
            }
        )
        .environmentObject(provider)
    }
}

private struct MiniGameInterstitialWrapper: View {
    @StateObject var provider: SimulaProvider
    let charImage: String
    let invitationText: String
    let ctaText: String
    let backgroundImage: String?
    let theme: MiniGameInterstitialTheme
    let onClick: () -> Void
    let onClose: () -> Void

    @State private var isOpen = true

    var body: some View {
        MiniGameInterstitial(
            charImage: charImage,
            invitationText: invitationText,
            ctaText: ctaText,
            backgroundImage: backgroundImage,
            theme: theme,
            isOpen: isOpen,
            onClick: onClick,
            onClose: {
                isOpen = false
                onClose()
            }
        )
        .environmentObject(provider)
    }
}

// MARK: - WKNavigationDelegateProxy
//
// Wraps the Swift SDK's coordinator as the WKWebView's navigation/UI delegate.
// Intercepts App Store URLs and external links, presenting them in-app.
// Falls through to the original delegate for everything else.

class WKNavigationDelegateProxy: NSObject, WKNavigationDelegate, WKUIDelegate {
    weak var original: WKNavigationDelegate?
    weak var originalUI: WKUIDelegate?
    weak var module: SimulaMiniGameModule?

    private let internalSchemes: Set<String> = ["about", "data", "blob"]

    init(original: WKNavigationDelegate?, module: SimulaMiniGameModule) {
        self.original = original
        self.originalUI = original as? WKUIDelegate
        self.module = module
    }

    private func presentViewController(_ vc: UIViewController) {
        guard let hostingVC = SimulaMiniGameModule.activeHostingController else { return }
        var topVC: UIViewController = hostingVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }
        topVC.present(vc, animated: true)
    }

    private func presentStoreProduct(appID: String) {
        module?.emitStoreProductDiagnostic(appID: appID)
        let storeVC = SKStoreProductViewController()
        storeVC.loadProduct(withParameters: [
            SKStoreProductParameterITunesItemIdentifier: NSNumber(value: Int(appID) ?? 0)
        ])
        presentViewController(storeVC)
    }

    private func presentSafari(url: URL) {
        let safariVC = SFSafariViewController(url: url)
        presentViewController(safariVC)
    }

    // Follow redirect chain in the background via URLSession (no webview flash).
    // Both the resolver AND the session must be retained or the request dies.
    private var activeResolver: RedirectResolver?
    private var activeSession: URLSession?

    private func resolveAndRoute(url: URL) {
        guard activeResolver == nil else { return }

        if let appID = SimulaMiniGameModule.appStoreID(from: url) {
            module?.emitInterceptDiagnostic(url: url, appID: appID)
            presentStoreProduct(appID: appID)
            return
        }

        let resolver = RedirectResolver { [weak self] finalURL in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.activeResolver = nil
                self.activeSession = nil
                if let appID = SimulaMiniGameModule.appStoreID(from: finalURL) {
                    self.module?.emitInterceptDiagnostic(url: finalURL, appID: appID)
                    self.presentStoreProduct(appID: appID)
                } else {
                    self.presentSafari(url: finalURL)
                }
            }
        }
        self.activeResolver = resolver
        let session = URLSession(configuration: .default, delegate: resolver, delegateQueue: nil)
        self.activeSession = session
        session.dataTask(with: URLRequest(url: url)).resume()
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        original?.webView?(webView, didFinish: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let scheme = url.scheme?.lowercased() ?? ""

        // Log EVERY navigation through the proxy
        module?.emitNavigationDiagnostic(
            url: url,
            navigationType: navigationAction.navigationType,
            isMainFrame: navigationAction.targetFrame?.isMainFrame ?? false
        )

        if internalSchemes.contains(scheme) {
            decisionHandler(.allow)
            return
        }

        if scheme == "javascript" {
            decisionHandler(.cancel)
            return
        }

        // Intercept App Store URLs
        if let appID = SimulaMiniGameModule.appStoreID(from: url) {
            module?.emitInterceptDiagnostic(url: url, appID: appID)
            presentStoreProduct(appID: appID)
            decisionHandler(.cancel)
            return
        }

        // Intercept itms-apps / itms schemes
        if scheme == "itms-apps" || scheme == "itms" {
            module?.emitInterceptDiagnostic(url: url, appID: "unknown")
            decisionHandler(.cancel)
            return
        }

        // Everything else (same-origin, cross-domain, iframes) — allow.
        // If a server redirect lands on apps.apple.com, this method is called
        // again and the App Store check above catches it.
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate (target="_blank" / window.open)

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // Log window.open / target="_blank"
        module?.emitNavigationDiagnostic(
            url: navigationAction.request.url,
            navigationType: navigationAction.navigationType,
            isMainFrame: true,
            extra: "createWebViewWith"
        )

        if let url = navigationAction.request.url {
            let scheme = url.scheme?.lowercased() ?? ""
            if let appID = SimulaMiniGameModule.appStoreID(from: url) {
                module?.emitInterceptDiagnostic(url: url, appID: appID)
                presentStoreProduct(appID: appID)
            } else if scheme == "http" || scheme == "https" {
                let currentHost = webView.url?.host?.lowercased() ?? ""
                let targetHost = url.host?.lowercased() ?? ""
                if !targetHost.isEmpty && currentHost != targetHost {
                    // Follow redirects in background via URLSession — no webview flash.
                    resolveAndRoute(url: url)
                } else {
                    webView.load(URLRequest(url: url))
                }
            }
        }
        return nil
    }
}

// MARK: - RedirectResolver

private class RedirectResolver: NSObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    let completion: (URL) -> Void
    private var completed = false

    init(completion: @escaping (URL) -> Void) {
        self.completion = completion
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        guard let redirectURL = request.url else {
            finish(with: task.currentRequest?.url ?? request.url!)
            completionHandler(nil)
            return
        }

        let scheme = redirectURL.scheme?.lowercased() ?? ""
        let host = redirectURL.host?.lowercased() ?? ""

        if host.contains("apps.apple.com") || host.contains("itunes.apple.com")
            || scheme == "itms-apps" || scheme == "itms" {
            finish(with: redirectURL)
            completionHandler(nil)
            return
        }

        completionHandler(request)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let finalURL = task.currentRequest?.url {
            finish(with: finalURL)
        }
    }

    private func finish(with url: URL) {
        guard !completed else { return }
        completed = true
        completion(url)
    }
}

// MARK: - UIApplication.open() interceptor
//
// Catches App Store URLs that would otherwise leave the app and presents
// SKStoreProductViewController in-app instead.

extension UIApplication {
    @objc func simula_openURL(_ url: URL, options: [String: Any], completionHandler: ((Bool) -> Void)?) {
        // Log ALL UIApplication.open() calls so we can see if anything flows through here
        let isOverlayActive = SimulaMiniGameModule.activeHostingController != nil
        NSLog("[SimulaInterceptor] UIApplication.open() called — url: %@, overlayActive: %@", url.absoluteString, isOverlayActive ? "YES" : "NO")

        if let hostingVC = SimulaMiniGameModule.activeHostingController,
           let appID = SimulaMiniGameModule.appStoreID(from: url) {
            // Emit diagnostic so the React Native side can see what was intercepted
            SimulaMiniGameModule.activeModule?.emitInterceptDiagnostic(url: url, appID: appID)

            // Present SKStoreProductViewController in-app instead of opening externally
            DispatchQueue.main.async {
                let storeVC = SKStoreProductViewController()
                storeVC.loadProduct(withParameters: [
                    SKStoreProductParameterITunesItemIdentifier: NSNumber(value: Int(appID) ?? 0)
                ])
                var topVC: UIViewController = hostingVC
                while let presented = topVC.presentedViewController {
                    topVC = presented
                }
                topVC.present(storeVC, animated: true)
            }
            completionHandler?(true)
            return
        }

        // Not intercepted — call original (implementations are swapped, so this
        // calls the real UIApplication.open)
        simula_openURL(url, options: options, completionHandler: completionHandler)
    }
}
