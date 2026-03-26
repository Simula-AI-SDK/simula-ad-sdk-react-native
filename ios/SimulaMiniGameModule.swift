import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaMiniGameModule)
class SimulaMiniGameModule: RCTEventEmitter {

    private var menuWindow: UIWindow?
    private var buttonWindow: UIWindow?
    private var invitationWindow: UIWindow?
    private var interstitialWindow: UIWindow?

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

    // MARK: - Overlay Window Helper

    private func currentWindowScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
    }

    private func showOverlay(hostingVC: UIHostingController<AnyView>) -> UIWindow? {
        guard let windowScene = currentWindowScene() else { return nil }
        let window = UIWindow(windowScene: windowScene)
        window.windowLevel = .alert
        window.rootViewController = hostingVC
        window.backgroundColor = .clear
        window.isHidden = false
        window.makeKeyAndVisible()
        return window
    }

    private func dismissOverlay(_ window: inout UIWindow?) {
        window?.isHidden = true
        window?.rootViewController = nil
        window = nil
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

            // Dismiss any existing menu
            self.dismissOverlay(&self.menuWindow)
            self.provider = nil

            // Create provider and session
            let provider = SimulaProvider(
                apiKey: apiKey,
                devMode: devMode,
                primaryUserID: primaryUserID,
                hasPrivacyConsent: hasPrivacyConsent
            )
            self.provider = provider

            // Create the menu view
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
                    self?.dismissOverlay(&self!.menuWindow)
                    self?.provider = nil
                    self?.sendEvent(withName: "onMiniGameMenuClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(menuView))
            hostingVC.view.backgroundColor = .clear

            guard let window = self.showOverlay(hostingVC: hostingVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.menuWindow = window

            // Create session after showing
            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameMenu() {
        DispatchQueue.main.async { [weak self] in
            self?.dismissOverlay(&self!.menuWindow)
            self?.provider = nil
        }
    }

    // MARK: - MiniGameButton

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

            self.dismissOverlay(&self.buttonWindow)

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
            hostingVC.view.backgroundColor = .clear

            guard let window = self.showOverlay(hostingVC: hostingVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.buttonWindow = window
            resolve(nil)
        }
    }

    @objc
    func hideMiniGameButton() {
        DispatchQueue.main.async { [weak self] in
            self?.dismissOverlay(&self!.buttonWindow)
        }
    }

    // MARK: - MiniGameInvitation

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

            self.dismissOverlay(&self.invitationWindow)

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
                    self?.dismissOverlay(&self!.invitationWindow)
                    self?.sendEvent(withName: "onMiniGameInvitationClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(invitationView))
            hostingVC.view.backgroundColor = .clear

            guard let window = self.showOverlay(hostingVC: hostingVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.invitationWindow = window

            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameInvitation() {
        DispatchQueue.main.async { [weak self] in
            self?.dismissOverlay(&self!.invitationWindow)
        }
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

            self.dismissOverlay(&self.interstitialWindow)

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
                    self?.dismissOverlay(&self!.interstitialWindow)
                    self?.sendEvent(withName: "onMiniGameInterstitialClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(interstitialView))
            hostingVC.view.backgroundColor = .clear

            guard let window = self.showOverlay(hostingVC: hostingVC) else {
                reject("NO_WINDOW_SCENE", "Could not find active window scene", nil)
                return
            }
            self.interstitialWindow = window

            Task {
                await provider.createSession()
            }

            resolve(nil)
        }
    }

    @objc
    func hideMiniGameInterstitial() {
        DispatchQueue.main.async { [weak self] in
            self?.dismissOverlay(&self!.interstitialWindow)
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

    @State private var isOpen = true

    var body: some View {
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
