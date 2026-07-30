import React
import Foundation
import SimulaAdSDK
#if os(iOS)
import SwiftUI
import UIKit

/// React Native view manager for the inline `<MiniGameButton>`.
///
/// Hosts the SDK's SwiftUI `MiniGameButton` in a `UIHostingController` as a real inline
/// view (no overlay), reports its measured content height up to JS, and forwards taps
/// via `onButtonPress`. The button is pure UI — it needs no provider / session.
@objc(SimulaMiniGameButtonViewManager)
class SimulaMiniGameButtonViewManager: RCTViewManager {
    // `view()` is always invoked on the main thread by RN, so the manager itself doesn't
    // need main-queue setup — returning false keeps bridge setup off the main thread at
    // app startup.
    override func view() -> UIView! { SimulaMiniGameButtonHostView() }
    override static func requiresMainQueueSetup() -> Bool { false }
}

class SimulaMiniGameButtonHostView: UIView {

    // A prop change marks the view for re-mount and schedules a layout pass.
    @objc var text: NSString? { didSet { setNeedsMount() } }
    @objc var showPulsate: Bool = false { didSet { setNeedsMount() } }
    @objc var showBadge: Bool = false { didSet { setNeedsMount() } }
    @objc var theme: NSDictionary? { didSet { setNeedsMount() } }

    @objc var onButtonPress: RCTDirectEventBlock?
    @objc var onButtonSizeChange: RCTDirectEventBlock?

    private var hostingController: UIHostingController<SimulaMiniGameButtonRoot>?
    private var heightConstraint: NSLayoutConstraint?
    private var needsMount = true
    private var lastReportedHeight: CGFloat = -1
    // Coalesces mount requests onto one pending runloop hop — see `scheduleMountIfNeeded`.
    private var mountScheduled = false
    // Bumped on every (re)mount. Height callbacks capture the generation they were mounted
    // with; a torn-down root reporting a late GeometryReader height is ignored instead of
    // being attributed to the new button (same guard as SimulaNativeAdHostView).
    private var mountGeneration = 0

    override func layoutSubviews() {
        super.layoutSubviews()
        scheduleMountIfNeeded()
    }

    /// Defers the hosting-controller build out of the layout pass (same rationale as the
    /// native-ad host view: keep `layoutSubviews` cheap on a scrolling feed).
    private func scheduleMountIfNeeded() {
        guard needsMount, !mountScheduled else { return }
        mountScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.mountScheduled = false
            if self.needsMount { self.mountIfNeeded() }
        }
    }

    private func setNeedsMount() {
        needsMount = true
        setNeedsLayout()
    }

    private func mountIfNeeded() {
        needsMount = false
        mountGeneration += 1
        let generation = mountGeneration

        hostingController?.view.removeFromSuperview()
        hostingController = nil

        let root = SimulaMiniGameButtonRoot(
            text: text as String?,
            showPulsate: showPulsate,
            showBadge: showBadge,
            theme: SimulaMiniGameButtonHostView.convertTheme(theme),
            onClick: { [weak self] in self?.onButtonPress?(nil) },
            onHeight: { [weak self] height in self?.reportHeight(height, generation: generation) }
        )

        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(controller.view)

        // Pin width to the host; the reported content height drives the height
        // constraint (seeded at the provisional 48pt to avoid a first-frame collapse).
        // Reset the dedupe watermark so the next report always goes through: a remounted
        // button can measure the same height as the torn-down one, and the dedupe would
        // otherwise swallow the report and leave the provisional seed in place.
        lastReportedHeight = -1
        let height = controller.view.heightAnchor.constraint(equalToConstant: 48)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: topAnchor),
            height,
        ])

        hostingController = controller
        heightConstraint = height
    }

    private func reportHeight(_ height: CGFloat, generation: Int) {
        // A root from a previous mount can still emit GeometryReader callbacks while (or
        // after) a prop change swaps the button; attributing its height to the new button
        // would fight the new root's own measurement.
        guard generation == mountGeneration else { return }
        let rounded = height.rounded()
        guard rounded > 0, abs(rounded - lastReportedHeight) >= 1 else { return }
        lastReportedHeight = rounded
        heightConstraint?.constant = rounded
        onButtonSizeChange?(["height": rounded])
    }

    private static func convertTheme(_ raw: Any?) -> MiniGameButtonTheme {
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
}

/// Concrete SwiftUI root for the hosting controller (avoids `AnyView`). Measures the
/// button's natural height and reports it up.
private struct SimulaMiniGameButtonRoot: View {
    let text: String?
    let showPulsate: Bool
    let showBadge: Bool
    let theme: MiniGameButtonTheme
    let onClick: () -> Void
    let onHeight: (CGFloat) -> Void

    var body: some View {
        MiniGameButton(
            text: text,
            showPulsate: showPulsate,
            showBadge: showBadge,
            theme: theme,
            onClick: onClick
        )
        .frame(maxWidth: .infinity)
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { onHeight(geo.size.height) }
                    .onChange(of: geo.size.height) { onHeight($0) }
            }
        )
    }
}
#else
@objc(SimulaMiniGameButtonViewManager)
class SimulaMiniGameButtonViewManager: RCTViewManager {
    override func view() -> UIView! { UIView() }
    override static func requiresMainQueueSetup() -> Bool { false }
}
#endif
