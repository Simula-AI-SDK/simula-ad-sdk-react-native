import React
import Foundation
import SimulaAdSDK
#if os(iOS)
import SwiftUI
import UIKit

/// React Native view manager for the inline native ad (`<NativeAd>` in JS).
///
/// Exposes the SDK's `NativeAdSlot` as an old-architecture native view. The host view
/// (`SimulaNativeAdHostView`) hosts the SwiftUI slot in a `UIHostingController`,
/// injected with `SimulaAds.shared` so every slot reuses the one warmed session, and
/// reports the creative's content height up to JS (which owns the view's height).
@objc(SimulaNativeAdViewManager)
class SimulaNativeAdViewManager: RCTViewManager {
    override func view() -> UIView! { SimulaNativeAdHostView() }

    // View creation touches UIKit + the @MainActor SDK, so set up on the main queue.
    override static func requiresMainQueueSetup() -> Bool { true }
}

/// The native view backing `<NativeAd>`. Hosts `NativeAdSlot` and bridges its
/// self-measured height + viewability/error callbacks to RN events.
class SimulaNativeAdHostView: UIView {

    // MARK: RN props (set individually, then `didSetProps` mounts/refreshes the slot)

    // A prop change marks the view for re-mount and schedules a layout pass, so the
    // slot re-mounts even when no size prop changed (e.g. a theme-only update).
    @objc var adUnitId: NSString? { didSet { setNeedsMount() } }
    @objc var position: NSNumber = 0 { didSet { setNeedsMount() } }
    @objc var theme: NSString? { didSet { setNeedsMount() } }
    @objc var preloadedAdId: NSString? { didSet { setNeedsMount() } }
    @objc var previewHtml: NSString? { didSet { setNeedsMount() } }

    private func setNeedsMount() {
        needsMount = true
        setNeedsLayout()
    }

    @objc var onAdSizeChange: RCTDirectEventBlock?
    @objc var onAdImpression: RCTDirectEventBlock?
    @objc var onAdError: RCTDirectEventBlock?

    // MARK: State

    private var hostingController: UIHostingController<SimulaNativeAdRoot>?
    private var heightConstraint: NSLayoutConstraint?
    // Set true whenever a prop changes (RN only calls a setter for a *changed* prop);
    // cleared once mounted. Avoids rebuilding a prop-identity string on every scroll-
    // driven `layoutSubviews`.
    private var needsMount = true
    private var lastReportedHeight: CGFloat = -1
    private var mountRetries = 0

    // MARK: Mounting

    // RN sets view props via KVC, then lays the view out — so `layoutSubviews` is the
    // reliable "props applied" hook on the old architecture. `mountIfNeeded` self-guards
    // on `needsMount`, so the frequent scroll-driven calls are free.
    override func layoutSubviews() {
        super.layoutSubviews()
        mountIfNeeded()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { mountIfNeeded() }
    }

    private func mountIfNeeded() {
        guard needsMount else { return }

        let provider = MainActor.assumeIsolated { SimulaAds.shared }
        guard let provider else {
            // SimulaAds.initialize hasn't run yet (the provider's init effect races view
            // creation). Retry with a short backoff (up to ~1.5s) since a relayout may not
            // follow; then stay collapsed until props change.
            if mountRetries < 30 {
                mountRetries += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                    self?.mountIfNeeded()
                }
            }
            return
        }
        needsMount = false
        mountRetries = 0

        // Clip the hosted content to our bounds so it never briefly overflows the
        // sibling feed rows before JS applies the reported height.
        clipsToBounds = true

        // Tear down any previous hosting (prop change → different ad).
        hostingController?.view.removeFromSuperview()
        hostingController = nil

        let root = SimulaNativeAdRoot(
            provider: provider,
            adUnitId: adUnitId as String?,
            position: position.intValue,
            theme: theme as String?,
            preloadedAdId: preloadedAdId as String?,
            previewHTML: previewHtml as String?,
            onHeight: { [weak self] height in self?.reportHeight(height) },
            onImpression: { [weak self] data in self?.emitImpression(data) },
            onError: { [weak self] error in self?.emitError(error) }
        )

        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(controller.view)

        // Pin width to the host (RN owns width via style); leave height to the content.
        // The reported height drives both this constraint and the host's RN height, so
        // they agree once measured. The slot's own height is independent of this
        // constraint, so the GeometryReader still measures the true content height.
        let height = controller.view.heightAnchor.constraint(equalToConstant: 0)
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

    // MARK: Height + events

    private func reportHeight(_ height: CGFloat) {
        let rounded = height.rounded()
        // Threshold sub-point churn so a measuring creative can't thrash the feed.
        guard abs(rounded - lastReportedHeight) >= 1 else { return }
        lastReportedHeight = rounded
        heightConstraint?.constant = rounded
        onAdSizeChange?(["height": rounded])
    }

    private func emitImpression(_ data: NativeAdData) {
        onAdImpression?([
            "impressionId": data.impressionId,
            "adFormat": data.adFormat,
            "adUnitId": data.adUnitId as Any? ?? NSNull(),
        ])
    }

    private func emitError(_ error: SimulaAdError) {
        let (code, message, retry) = SimulaNativeAdHostView.describe(error)
        var body: [String: Any] = ["code": code, "message": message]
        if let retry { body["retryInSeconds"] = retry }
        onAdError?(body)
    }

    /// Maps `SimulaAdError` to the same stable JS shape the imperative module emits.
    private static func describe(_ error: SimulaAdError) -> (code: String, message: String, retry: Int?) {
        let message = error.errorDescription ?? ""
        switch error {
        case .notInitialized: return ("not_initialized", message, nil)
        case .noSession: return ("no_session", message, nil)
        case .noFill: return ("no_fill", message, nil)
        case .notReady: return ("not_ready", message, nil)
        case .stale: return ("stale", message, nil)
        case .duplicateRequest(let retryInSeconds): return ("duplicate_request", message, retryInSeconds)
        case .alreadyShowing: return ("already_showing", message, nil)
        case .noPresentationContext: return ("no_presentation_context", message, nil)
        case .unsupportedPlatform: return ("unsupported_platform", message, nil)
        case .network: return ("network", message, nil)
        }
    }
}

/// Concrete SwiftUI root for the hosting controller (avoids `AnyView`). Injects the
/// shared provider and measures the slot's natural content height.
private struct SimulaNativeAdRoot: View {
    let provider: SimulaProvider
    let adUnitId: String?
    let position: Int
    let theme: String?
    let preloadedAdId: String?
    let previewHTML: String?
    let onHeight: (CGFloat) -> Void
    let onImpression: (NativeAdData) -> Void
    let onError: (SimulaAdError) -> Void

    var body: some View {
        NativeAdSlot(
            adUnitId: adUnitId,
            position: position,
            theme: theme,
            preloadedAdId: preloadedAdId,
            onImpression: onImpression,
            onError: onError,
            previewHTML: previewHTML
        )
        // Fill the host width; height stays content-driven.
        .frame(maxWidth: .infinity, alignment: .top)
        // Measure the slot's natural height (independent of the host frame, so there's
        // no chicken-and-egg with the JS-managed height) and report it up.
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { onHeight(geo.size.height) }
                    .onChange(of: geo.size.height) { onHeight($0) }
            }
        )
        .environmentObject(provider)
    }
}
#else
// Native ads are iOS-only in the SDK; expose a no-op manager on other platforms so
// the bridge symbol resolves.
@objc(SimulaNativeAdViewManager)
class SimulaNativeAdViewManager: RCTViewManager {
    override func view() -> UIView! { UIView() }
    override static func requiresMainQueueSetup() -> Bool { true }
}
#endif
