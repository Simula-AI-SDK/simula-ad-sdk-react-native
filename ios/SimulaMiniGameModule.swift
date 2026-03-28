import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaMiniGameModule)
class SimulaMiniGameModule: RCTEventEmitter {

    // Menu/Interstitial use UIWindow (so SDK's presentViewController finds our root VC for links)
    private var menuWindow: UIWindow?
    private var interstitialWindow: UIWindow?

    // Invitation/Button use subview approach (needs touch passthrough)
    private var buttonHostingController: UIHostingController<AnyView>?
    private var invitationHostingController: UIHostingController<AnyView>?

    private var provider: SimulaProvider?

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return [
            "onMiniGameMenuClose",
            "onMiniGameButtonClick",
            "onMiniGameInvitationClick",
            "onMiniGameInvitationClose",
            "onMiniGameInterstitialClick",
            "onMiniGameInterstitialClose",
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

    private func currentWindowScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
    }

    // MARK: - UIWindow overlay (menu, interstitial)

    private func showWindowOverlay(hostingVC: UIViewController) -> UIWindow? {
        guard let windowScene = currentWindowScene() else { return nil }
        let window = UIWindow(windowScene: windowScene)
        window.windowLevel = .alert
        window.rootViewController = hostingVC
        window.backgroundColor = .clear
        window.isHidden = false
        window.makeKeyAndVisible()
        return window
    }

    /// Convenience: accept UIHostingController directly
    private func showWindowOverlay(navVC: UINavigationController) -> UIWindow? {
        return showWindowOverlay(hostingVC: navVC)
    }

    private func dismissWindowOverlay(_ window: inout UIWindow?) {
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
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

    // MARK: - MiniGameMenu (UIWindow — links need our window to be key)

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

            self.dismissWindowOverlay(&self.menuWindow)
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
                    self?.dismissWindowOverlay(&self!.menuWindow)
                    self?.provider = nil
                    self?.sendEvent(withName: "onMiniGameMenuClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(menuView))
            hostingVC.view.backgroundColor = .clear

            // Wrap in UINavigationController for reliable modal presentation
            // (SDK's presentViewController presents SKStoreProductVC/SFSafariVC from the root VC)
            let navVC = UINavigationController(rootViewController: hostingVC)
            navVC.setNavigationBarHidden(true, animated: false)
            navVC.view.backgroundColor = .clear

            guard let window = self.showWindowOverlay(navVC: navVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.menuWindow = window

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
            self.dismissWindowOverlay(&self.menuWindow)
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

    // MARK: - MiniGameInterstitial (UIWindow + status bar hidden)

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

            self.dismissWindowOverlay(&self.interstitialWindow)

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
                    self?.dismissWindowOverlay(&self!.interstitialWindow)
                    UIApplication.shared.isStatusBarHidden = false
                    self?.sendEvent(withName: "onMiniGameInterstitialClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(interstitialView))
            hostingVC.view.backgroundColor = .clear

            guard let window = self.showWindowOverlay(hostingVC: hostingVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.interstitialWindow = window

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
            self.dismissWindowOverlay(&self.interstitialWindow)
            UIApplication.shared.isStatusBarHidden = false
        }
    }

    // MARK: - Type Conversion

    private func convertMessages(_ raw: Any?) -> [Message] {
        guard let array = raw as? [[String: Any]] else { return [] }
        return array.compactMap { dict in
            guard let role = dict["role"] as? String,
                  let content = dict["content"] as? String else { return nil }
            return Message(role: role, content: content)
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
    let messages: [Message]
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
