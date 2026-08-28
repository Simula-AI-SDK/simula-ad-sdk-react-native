import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaMiniGameModule)
class SimulaMiniGameModule: RCTEventEmitter {

    private static let initializationConflictCode = "INITIALIZATION_CONFLICT"

    // Menu/Interstitial are presented as .overFullScreen modals so they join
    // the main window's presentedViewController chain.  The Swift SDK's
    // presentViewController() then walks that chain, finds our hosting VC,
    // and presents SKStoreProductViewController / SFSafariViewController from
    // it — all within the main window (no secondary window to conflict with
    // SKStoreProductViewController's own system-level window).
    //
    // Each hosting controller is specialized to its concrete root-view type
    // (no AnyView): keeping the UIHostingController non-erased lets SwiftUI
    // diff the root view tree instead of re-evaluating it through a type-erased
    // boundary on every state change.
    private var menuHostingController: UIHostingController<MiniGameMenuWrapper>?
    private var interstitialHostingController: UIHostingController<MiniGameInterstitialWrapper>?

    // Invitation/Button use subview approach (needs touch passthrough)
    private var buttonHostingController: UIHostingController<MiniGameButtonWrapper>?
    private var invitationHostingController: UIHostingController<MiniGameInvitationWrapper>?

    // Character selector — a full-screen modal like the menu, but with no game WebView.
    private var characterSelectorHostingController: UIHostingController<CharacterSelectorWrapper>?

    private var hasListeners = false

    // All exported methods run on the main thread, so their bodies present
    // view controllers, mutate the status bar, and add/remove overlays
    // directly — no nested DispatchQueue.main.async hop is needed.
    // requiresMainQueueSetup stays false so the module still initializes
    // lazily off the main thread and adds nothing to app-startup time.
    override var methodQueue: DispatchQueue {
        return DispatchQueue.main
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

    // Bridge teardown (dev reload / app shutdown) can land while an overlay is
    // still up. Without this, the presented overlay VCs leak and a hidden status
    // bar stays hidden.
    // Mirrors `SimulaAdsModule.invalidate()`: tear everything down on the main
    // thread because view removal must run on main.
    override func invalidate() {
        super.invalidate()
        if Thread.isMainThread {
            teardownAllOverlays()
        } else {
            DispatchQueue.main.async { [self] in teardownAllOverlays() }
        }
    }

    override func supportedEvents() -> [String]! {
        return [
            "onMiniGameMenuClose",
            "onMiniGameButtonClick",
            "onMiniGameInvitationClick",
            "onMiniGameInvitationClose",
            "onMiniGameInterstitialClick",
            "onMiniGameInterstitialClose",
            "onCharacterSelectorSelect",
            "onCharacterSelectorPreview",
            "onCharacterSelectorClose",
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

    // MARK: - Modal hosting (menu, interstitial)
    //
    // Presents the hosting VC as a .overFullScreen modal so it joins the main
    // window's presentedViewController chain.  The Swift SDK's
    // presentViewController() then finds it and presents SKStoreProductVC /
    // SFSafariVC from it — everything stays in the main window, so
    // SKStoreProductViewController's system-level window renders correctly.

    private func addFullscreenOverlay<Content: View>(hostingVC: UIHostingController<Content>) -> Bool {
        guard let topVC = currentTopPresentedViewController() else { return false }

        hostingVC.view.backgroundColor = .clear
        hostingVC.modalPresentationStyle = .overFullScreen
        hostingVC.modalTransitionStyle = .crossDissolve

        topVC.present(hostingVC, animated: false)

        return true
    }

    private func removeFullscreenOverlay<Content: View>(_ hostingVC: inout UIHostingController<Content>?) {
        guard let vc = hostingVC else { return }
        // Dismiss from the presenting VC so the hosting VC itself is removed
        // (not just its presented children like SKStoreProductViewController).
        vc.presentingViewController?.dismiss(animated: false)
        hostingVC = nil
    }

    // MARK: - Subview overlay (invitation, button)

    private func addSubviewOverlay<Content: View>(hostingVC: UIHostingController<Content>) -> Bool {
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

    private func removeSubviewOverlay<Content: View>(_ hostingVC: inout UIHostingController<Content>?) {
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

    /// Tears down every overlay and restores shared status-bar state. Main thread
    /// only (called from `invalidate()` and any future host-teardown hook).
    private func teardownAllOverlays() {
        removeFullscreenOverlay(&menuHostingController)
        removeFullscreenOverlay(&interstitialHostingController)
        removeSubviewOverlay(&buttonHostingController)
        removeSubviewOverlay(&invitationHostingController)
        removeCharacterSelectorOverlay()
        UIApplication.shared.isStatusBarHidden = false
    }

    // MARK: - Provider reuse

    /// React Native surfaces share the provider accepted by the imperative initialization path.
    private func reusableProvider(apiKey: String) -> SimulaProvider? {
        guard let shared = MainActor.assumeIsolated({ SimulaAds.shared }),
              shared.apiKey == apiKey else { return nil }
        return shared
    }

    // MARK: - MiniGameMenu

    @objc
    func showMiniGameMenu(_ props: NSDictionary,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String,
              let charName = props["charName"] as? String,
              let charID = props["charID"] as? String else {
            reject("INVALID_PROPS", "Missing required props: apiKey, charName, or charID", nil)
            return
        }

        let charImage = props["charImage"] as? String ?? ""
        let charDesc = props["charDesc"] as? String
        let delegateChar = props["delegateChar"] as? Bool ?? true
        let maxGamesToShow = convertMaxGamesToShow(props["maxGamesToShow"])

        let messages = convertMessages(props["messages"])
        let theme = convertTheme(props["theme"])

        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        self.removeFullscreenOverlay(&self.menuHostingController)

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
                self.sendEvent(withName: "onMiniGameMenuClose", body: nil)
            }
        )

        let hostingVC = UIHostingController(rootView: menuView)
        hostingVC.view.backgroundColor = .clear

        guard self.addFullscreenOverlay(hostingVC: hostingVC) else {
            reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
            return
        }
        self.menuHostingController = hostingVC

        // Completion-based session warm-up — the bridge must create NO Swift Concurrency
        // tasks: this file is compiled by the host app's Xcode, and affected toolchains
        // miscompile optimized task code into teardown aborts. The task lives inside the
        // SDK binary, prebuilt with a pinned pre-regression toolchain (SDK >= 1.1.4).
        MainActor.assumeIsolated { // methodQueue = .main
            provider.createSession {}
        }

        resolve(nil)
    }

    @objc
    func hideMiniGameMenu() {
        self.removeFullscreenOverlay(&self.menuHostingController)
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

        let text = props["text"] as? String
        let showPulsate = props["showPulsate"] as? Bool ?? false
        let showBadge = props["showBadge"] as? Bool ?? false
        let theme = convertButtonTheme(props["theme"])
        let width = convertDimension(props["width"])

        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        self.removeSubviewOverlay(&self.buttonHostingController)

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

        let hostingVC = UIHostingController(rootView: buttonView)

        guard self.addSubviewOverlay(hostingVC: hostingVC) else {
            reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
            return
        }
        self.buttonHostingController = hostingVC
        resolve(nil)
    }

    @objc
    func hideMiniGameButton() {
        self.removeSubviewOverlay(&self.buttonHostingController)
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

        let titleText = props["titleText"] as? String ?? "Want to play a game?"
        let subText = props["subText"] as? String ?? "Take a break and challenge yourself!"
        let ctaText = props["ctaText"] as? String ?? "Play a Game"
        let animation = convertInvitationAnimation(props["animation"] as? String)
        let theme = convertInvitationTheme(props["theme"])
        let autoCloseDuration = props["autoCloseDuration"] as? TimeInterval
        let width = props["width"]
        let top = props["top"]

        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        self.removeSubviewOverlay(&self.invitationHostingController)

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
                guard let self = self else { return }
                self.removeSubviewOverlay(&self.invitationHostingController)
                self.sendEvent(withName: "onMiniGameInvitationClose", body: nil)
            }
        )

        let hostingVC = UIHostingController(rootView: invitationView)

        guard self.addSubviewOverlay(hostingVC: hostingVC) else {
            reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
            return
        }
        self.invitationHostingController = hostingVC

        // Completion-based session warm-up — the bridge must create NO Swift Concurrency
        // tasks: this file is compiled by the host app's Xcode, and affected toolchains
        // miscompile optimized task code into teardown aborts. The task lives inside the
        // SDK binary, prebuilt with a pinned pre-regression toolchain (SDK >= 1.1.4).
        MainActor.assumeIsolated { // methodQueue = .main
            provider.createSession {}
        }

        resolve(nil)
    }

    @objc
    func hideMiniGameInvitation() {
        self.removeSubviewOverlay(&self.invitationHostingController)
    }

    // MARK: - MiniGameInterstitial

    @objc
    func showMiniGameInterstitial(_ props: NSDictionary,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String,
              let charImage = props["charImage"] as? String else {
            reject("INVALID_PROPS", "Missing required props: apiKey or charImage", nil)
            return
        }

        let invitationText = props["invitationText"] as? String ?? "Want to play a game?"
        let ctaText = props["ctaText"] as? String ?? "Play a Game"
        let backgroundImage = props["backgroundImage"] as? String
        let theme = convertInterstitialTheme(props["theme"])

        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        self.removeFullscreenOverlay(&self.interstitialHostingController)

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

        let hostingVC = UIHostingController(rootView: interstitialView)
        hostingVC.view.backgroundColor = .clear

        guard self.addFullscreenOverlay(hostingVC: hostingVC) else {
            reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
            return
        }
        self.interstitialHostingController = hostingVC

        // Hide status bar (UIViewControllerBasedStatusBarAppearance=false, so use UIApplication)
        UIApplication.shared.isStatusBarHidden = true

        // Completion-based session warm-up — the bridge must create NO Swift Concurrency
        // tasks: this file is compiled by the host app's Xcode, and affected toolchains
        // miscompile optimized task code into teardown aborts. The task lives inside the
        // SDK binary, prebuilt with a pinned pre-regression toolchain (SDK >= 1.1.4).
        MainActor.assumeIsolated { // methodQueue = .main
            provider.createSession {}
        }

        resolve(nil)
    }

    @objc
    func hideMiniGameInterstitial() {
        self.removeFullscreenOverlay(&self.interstitialHostingController)
        UIApplication.shared.isStatusBarHidden = false
    }

    // MARK: - Preload

    @objc
    func preload(_ props: NSDictionary,
                 resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String else {
            reject("INVALID_PROPS", "Missing required prop: apiKey", nil)
            return
        }
        let devMode = props["devMode"] as? Bool ?? false
        let primaryUserID = props["primaryUserID"] as? String
        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let privacy = convertPrivacyConfig(props["privacy"])
        let telemetryEnabled = props["telemetryEnabled"] as? Bool ?? true
        let adContext = convertAdContext(props["adContext"])

        // Initialize the imperative SDK (idempotent) so its shared session warms and
        // is reused by every declarative surface via reusableProvider — unifying the
        // imperative + declarative session. SimulaAds is @MainActor; methodQueue is
        // .main, so this is safe.
        let accepted = MainActor.assumeIsolated {
            let didInitialize = SimulaAds.initialize(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent,
                privacy: privacy,
                telemetryEnabled: telemetryEnabled,
                adContext: adContext
            )
            return didInitialize || SimulaAds.shared?.apiKey == apiKey
        }
        guard accepted else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }

        // Warm (and cache) the provider so the first real show reuses a live
        // session instead of paying the createSession() round-trip on the ad path.
        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        // Completion-based session warm-up — no bridge-created task (the bridge is compiled
        // by the host's Xcode; the task lives inside the prebuilt SDK binary, SDK >= 1.1.4).
        MainActor.assumeIsolated { // methodQueue = .main
            provider.createSession {
                resolve(nil)
            }
        }
    }

    // MARK: - CharacterSelector

    @objc
    func showCharacterSelector(_ props: NSDictionary,
                               resolve: @escaping RCTPromiseResolveBlock,
                               reject: @escaping RCTPromiseRejectBlock) {
        guard let apiKey = props["apiKey"] as? String else {
            reject("INVALID_PROPS", "Missing required prop: apiKey", nil)
            return
        }

        let title = props["title"] as? String ?? "Select Your Game Partner"
        let ctaText = props["ctaText"] as? String ?? "🚀 Launch Game"
        let characters = convertCharacters(props["characters"])
        let theme = convertCharacterSelectorTheme(props["theme"])

        guard let provider = self.reusableProvider(apiKey: apiKey) else {
            reject(
                Self.initializationConflictCode,
                "The process is already owned by a different Simula SDK configuration",
                nil
            )
            return
        }
        self.removeCharacterSelectorOverlay()

        let view = CharacterSelectorWrapper(
            provider: provider,
            title: title,
            ctaText: ctaText,
            characters: characters,
            theme: theme,
            onSelected: { [weak self] character in
                guard let self = self else { return }
                self.removeCharacterSelectorOverlay()
                self.sendEvent(withName: "onCharacterSelectorSelect",
                               body: SimulaMiniGameModule.characterBody(character))
            },
            onPreview: { [weak self] character in
                self?.sendEvent(withName: "onCharacterSelectorPreview",
                                body: SimulaMiniGameModule.characterBody(character))
            },
            onClose: { [weak self] in
                guard let self = self else { return }
                self.removeCharacterSelectorOverlay()
                self.sendEvent(withName: "onCharacterSelectorClose", body: nil)
            }
        )

        let hostingVC = UIHostingController(rootView: view)
        // Opaque selector background (not .clear) so the host app never shows through during
        // the SwiftUI opacity fade-in: this is an .overFullScreen modal, so the host stays
        // mounted behind it, and a clear hosting view leaves a transparent gap until the fade
        // completes. Matches the Swift SDK's RewardedPresenter (opaque-window) rationale.
        hostingVC.view.backgroundColor = UIColor(Color(hex: theme.resolvedBackgroundColor))
        hostingVC.modalPresentationStyle = .overFullScreen
        hostingVC.modalTransitionStyle = .crossDissolve

        guard let topVC = currentTopPresentedViewController() else {
            reject("NO_VIEW_CONTROLLER", "Could not find root view controller", nil)
            return
        }
        topVC.present(hostingVC, animated: false)
        self.characterSelectorHostingController = hostingVC

        // Completion-based session warm-up — the bridge must create NO Swift Concurrency
        // tasks: this file is compiled by the host app's Xcode, and affected toolchains
        // miscompile optimized task code into teardown aborts. The task lives inside the
        // SDK binary, prebuilt with a pinned pre-regression toolchain (SDK >= 1.1.4).
        MainActor.assumeIsolated { // methodQueue = .main
            provider.createSession {}
        }

        resolve(nil)
    }

    @objc
    func hideCharacterSelector() {
        self.removeCharacterSelectorOverlay()
    }

    private func removeCharacterSelectorOverlay() {
        guard let vc = characterSelectorHostingController else { return }
        vc.presentingViewController?.dismiss(animated: false)
        characterSelectorHostingController = nil
    }

    private static func characterBody(_ character: CharacterData) -> [String: Any] {
        [
            "id": character.id,
            "name": character.name,
            "imageUrl": character.imageUrl,
            "description": character.description,
        ]
    }

    private func convertCharacters(_ raw: Any?) -> [CharacterData]? {
        guard let array = raw as? [[String: Any]] else { return nil }
        let characters = array.compactMap { dict -> CharacterData? in
            guard let id = dict["id"] as? String,
                  let name = dict["name"] as? String,
                  let imageUrl = dict["imageUrl"] as? String,
                  let description = dict["description"] as? String else { return nil }
            return CharacterData(id: id, name: name, imageUrl: imageUrl, description: description)
        }
        return characters.isEmpty ? nil : characters
    }

    private func convertPrivacyConfig(_ raw: Any?) -> SimulaPrivacyConfig? {
        guard let dict = raw as? [String: Any] else { return nil }
        return SimulaPrivacyConfig(
            hasPrivacyConsent: dict["hasPrivacyConsent"] as? Bool ?? true,
            tcString: dict["tcString"] as? String,
            uspString: dict["uspString"] as? String,
            gppString: dict["gppString"] as? String,
            gppSid: dict["gppSid"] as? String,
            gdprApplies: dict["gdprApplies"] as? Bool,
            tcfPurpose1Consent: dict["tcfPurpose1Consent"] as? Bool,
            coppaApplies: dict["coppaApplies"] as? Bool ?? false,
            enableAdvertisingId: dict["enableAdvertisingId"] as? Bool ?? false
        )
    }

    private func convertAdContext(_ raw: Any?) -> SimulaAdContext? {
        guard let dict = raw as? [String: Any], !dict.isEmpty else { return nil }
        return SimulaAdContext(
            searchTerm: dict["searchTerm"] as? String,
            tags: dict["tags"] as? [String],
            category: dict["category"] as? String,
            title: dict["title"] as? String,
            description: dict["description"] as? String,
            userProfile: dict["userProfile"] as? String,
            userEmail: dict["userEmail"] as? String,
            customContext: convertCustomContext(dict["customContext"]),
            nsfw: dict["nsfw"] as? Bool ?? false
        )
    }

    private func convertCustomContext(_ raw: Any?) -> [String: JSONValue]? {
        guard let dict = raw as? [String: Any], !dict.isEmpty else { return nil }
        var out: [String: JSONValue] = [:]
        for (key, value) in dict { out[key] = Self.jsonValue(value) }
        return out
    }

    private static func jsonValue(_ value: Any) -> JSONValue {
        if let string = value as? String { return .string(string) }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return .bool(number.boolValue) }
            let asDouble = number.doubleValue
            if asDouble == asDouble.rounded() && abs(asDouble) < 1e15 {
                return .int(number.intValue)
            }
            return .double(asDouble)
        }
        if let array = value as? [Any] { return .array(array.map { jsonValue($0) }) }
        if let object = value as? [String: Any] {
            var out: [String: JSONValue] = [:]
            for (key, nested) in object { out[key] = jsonValue(nested) }
            return .object(out)
        }
        return .null
    }

    private func convertCharacterSelectorTheme(_ raw: Any?) -> CharacterSelectorTheme {
        guard let dict = raw as? [String: Any] else { return CharacterSelectorTheme() }
        var theme = CharacterSelectorTheme()
        theme.backgroundColor = dict["backgroundColor"] as? String
        theme.titleFontColor = dict["titleFontColor"] as? String
        theme.secondaryFontColor = dict["secondaryFontColor"] as? String
        theme.accentColor = dict["accentColor"] as? String
        theme.ctaFontColor = dict["ctaFontColor"] as? String
        theme.cardBackgroundColor = dict["cardBackgroundColor"] as? String
        theme.cardBorderColor = dict["cardBorderColor"] as? String
        theme.cardCornerRadius = dict["cardCornerRadius"] as? CGFloat
        theme.fontFamily = dict["fontFamily"] as? String
        return theme
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

private struct CharacterSelectorWrapper: View {
    @StateObject var provider: SimulaProvider
    let title: String
    let ctaText: String
    let characters: [CharacterData]?
    let theme: CharacterSelectorTheme
    let onSelected: (CharacterData) -> Void
    let onPreview: (CharacterData) -> Void
    let onClose: () -> Void

    @State private var isOpen = true

    var body: some View {
        CharacterSelector(
            isOpen: isOpen,
            onClose: {
                isOpen = false
                onClose()
            },
            onCharacterSelected: { character in
                isOpen = false
                onSelected(character)
            },
            onCharacterPreview: { character in
                onPreview(character)
            },
            title: title,
            ctaText: ctaText,
            characters: characters,
            theme: theme
        )
        .environmentObject(provider)
    }
}
