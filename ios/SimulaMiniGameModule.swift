import React
import SwiftUI
import SimulaAdSDK

@objc(SimulaMiniGameModule)
class SimulaMiniGameModule: RCTEventEmitter {

    private var hostingController: UIHostingController<AnyView>?
    private var provider: SimulaProvider?

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["onMiniGameMenuClose"]
    }

    @objc
    func showMiniGameMenu(_ props: NSDictionary) {
        guard let apiKey = props["apiKey"] as? String,
              let charName = props["charName"] as? String,
              let charID = props["charID"] as? String else {
            return
        }

        let charImage = props["charImage"] as? String ?? ""
        let charDesc = props["charDesc"] as? String
        let delegateChar = props["delegateChar"] as? Bool ?? true
        let hasPrivacyConsent = props["hasPrivacyConsent"] as? Bool ?? true
        let maxGamesToShow = convertMaxGamesToShow(props["maxGamesToShow"])

        let messages = convertMessages(props["messages"])
        let theme = convertTheme(props["theme"])

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            // Dismiss any existing menu
            self.dismissMenu()

            // Create provider and session
            let provider = SimulaProvider(
                apiKey: apiKey,
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
                    self?.dismissMenu()
                    self?.sendEvent(withName: "onMiniGameMenuClose", body: nil)
                }
            )

            let hostingVC = UIHostingController(rootView: AnyView(menuView))
            hostingVC.modalPresentationStyle = .overCurrentContext
            hostingVC.modalTransitionStyle = .crossDissolve
            hostingVC.view.backgroundColor = .clear
            self.hostingController = hostingVC

            // Present modally
            guard let topVC = self.topViewController() else { return }
            topVC.present(hostingVC, animated: true)

            // Create session after presenting
            Task {
                await provider.createSession()
            }
        }
    }

    @objc
    func hideMiniGameMenu() {
        DispatchQueue.main.async { [weak self] in
            self?.dismissMenu()
        }
    }

    private func dismissMenu() {
        hostingController?.dismiss(animated: true)
        hostingController = nil
        provider = nil
    }

    private func topViewController() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = scene.windows.first(where: \.isKeyWindow)?.rootViewController else {
            return nil
        }
        var topVC = rootVC
        while let presented = topVC.presentedViewController {
            topVC = presented
        }
        return topVC
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
        theme.iconCornerRadius = dict["iconCornerRadius"] as? Int
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

    private func convertMaxGamesToShow(_ raw: Any?) -> MaxGamesToShow {
        guard let num = raw as? Int else { return .six }
        switch num {
        case 3: return .three
        case 9: return .nine
        default: return .six
        }
    }
}

// MARK: - SwiftUI Wrapper

/// Wraps MiniGameMenu with SimulaProvider as EnvironmentObject
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
