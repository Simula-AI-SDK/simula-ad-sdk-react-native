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
    // `view()` is always invoked on the main thread by RN, so the manager itself doesn't
    // need main-queue setup — returning false keeps bridge setup off the main thread at
    // app startup.
    override func view() -> UIView! { SimulaNativeAdHostView() }

    override static func requiresMainQueueSetup() -> Bool { false }
}

/// The native view backing `<NativeAd>`. Hosts `NativeAdSlot` and bridges its
/// self-measured height + viewability/error callbacks to RN events.
class SimulaNativeAdHostView: UIView {

    // MARK: RN props (set individually, then `didSetProps` mounts/refreshes the slot)

    // Identity/render prop changes schedule a remount. Metadata is read only when that
    // slot mounts, so prop-only updates cannot alter an in-flight or cached impression.
    @objc var adUnitId: NSString? { didSet { setNeedsMount() } }
    // `adPosition` on the wire — `position` is a reserved RN layout prop name (crashes
    // Android's shadow-node update; on iOS it collides with RCTShadowView's layout prop).
    @objc var adPosition: NSNumber = 0 { didSet { setNeedsMount() } }
    @objc var theme: NSString? { didSet { setNeedsMount() } }
    @objc var metadataJson: NSString? {
        didSet {
            if hostingController == nil { setNeedsMount() }
        }
    }
    @objc var preloadedAdId: NSString? { didSet { setNeedsMount() } }
    @objc var previewHtml: NSString? { didSet { setNeedsMount() } }

    private func setNeedsMount() {
        needsMount = true
        setNeedsLayout()
    }

    @objc var onAdSizeChange: RCTDirectEventBlock?
    @objc var onAdImpression: RCTDirectEventBlock?
    @objc var onAdClick: RCTDirectEventBlock?
    @objc var onAdPaid: RCTDirectEventBlock?
    @objc var onAdError: RCTDirectEventBlock?

    // MARK: State

    private var hostingController: UIHostingController<SimulaNativeAdRoot>?
    private var heightConstraint: NSLayoutConstraint?
    // Set true whenever a prop changes (RN only calls a setter for a *changed* prop);
    // cleared once mounted. Avoids rebuilding a prop-identity string on every scroll-
    // driven `layoutSubviews`.
    private var needsMount = true
    private var lastReportedHeight: CGFloat = -1
    // Coalesces mount requests onto one pending runloop hop — see `scheduleMountIfNeeded`.
    private var mountScheduled = false
    // One-shot observer for the SDK's readiness notification, installed only while
    // `SimulaAds.shared` is still nil (replaces the old 30×50ms main-queue poll).
    private var initObserver: NSObjectProtocol?
    // Bumped on every (re)mount. Height callbacks capture the generation they were mounted
    // with; a torn-down root reporting a late GeometryReader height is ignored instead of
    // being attributed to the new slot.
    private var mountGeneration = 0
    // The slot identity the current root was mounted with. Size events are stamped with
    // this — NOT the live props — because a prop change lands before `mountIfNeeded`
    // re-mounts (it waits for the next layout pass), and a height reported in that window
    // still describes the old creative. JS compares the stamp and drops mismatches.
    private var mountedSlotIdentity: (adUnitId: String, position: Int, preloadedAdId: String) = ("", 0, "")
    // True once the current `hostingController` has been added to a parent view controller.
    // Deliberately independent of `needsMount`: `mountIfNeeded()` clears `needsMount` even
    // when no parent VC is discoverable at mount time (e.g. the hierarchy is mid-attach),
    // which skips containment — so it must be retried separately on later attach, not
    // gated behind the same flag (see `attachToParentIfNeeded`).
    private var isHostingControllerContained = false

    // MARK: Mounting

    // RN sets view props via KVC, then lays the view out — so `layoutSubviews` is the
    // reliable "props applied" hook on the old architecture. The mount itself is deferred
    // one runloop turn (see below), so the frequent scroll-driven layout passes stay cheap.
    override func layoutSubviews() {
        super.layoutSubviews()
        scheduleMountIfNeeded()
        attachToParentIfNeeded()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            scheduleMountIfNeeded()
            attachToParentIfNeeded()
        }
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        // Leaving the window (unmounted by RN, or clipped out of a virtualized list):
        // undo VC containment. The parent VC otherwise keeps a strong reference to the
        // hosting controller in its `children` array for the life of the screen, leaking
        // one UIHostingController + SwiftUI tree per unmounted ad. Containment only —
        // the controller, its view, and the composed ad stay intact, so a recycled view
        // re-entering the window re-attaches via `attachToParentIfNeeded()` with no
        // recomposition.
        if newWindow == nil { detachFromParentIfNeeded() }
    }

    /// Coalesces a mount onto the next runloop turn. Building the hosting controller (and the
    /// SwiftUI ad tree inside it — potentially a WebView acquire) synchronously inside
    /// `layoutSubviews`/`didMoveToWindow` parked the main thread in the middle of a feed
    /// layout pass; deferring keeps the layout pass itself cheap.
    private func scheduleMountIfNeeded() {
        guard needsMount, !mountScheduled else { return }
        mountScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.mountScheduled = false
            // The view may have left the window during the hop (RN unmounted it, or a
            // virtualized list clipped it out): mounting now would run mountIfNeeded's
            // addChild AFTER willMove(toWindow: nil) already ran, leaving the hosting
            // controller in the parent VC's children for the life of the screen. Skip —
            // needsMount stays true, so didMoveToWindow re-arms the mount on re-entry.
            guard self.window != nil else { return }
            self.mountIfNeeded()
        }
    }

    /// Arms the one-shot SDK-readiness observer (idempotent). Fires `scheduleMountIfNeeded`
    /// when `SimulaAds.initialize` completes — no main-queue polling while uninitialized.
    private func observeDidInitializeOnce() {
        guard initObserver == nil else { return }
        initObserver = NotificationCenter.default.addObserver(
            forName: .simulaAdsDidInitialize,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.removeInitObserver()
            self.scheduleMountIfNeeded()
        }
    }

    private func removeInitObserver() {
        if let initObserver {
            NotificationCenter.default.removeObserver(initObserver)
            self.initObserver = nil
        }
    }

    deinit {
        removeInitObserver()
        // Containment must not outlive the view: if deinit runs without a preceding
        // willMove(toWindow: nil) pass, the parent VC would otherwise keep the hosting
        // controller in its children for the life of the screen.
        detachFromParentIfNeeded()
    }

    private func mountIfNeeded() {
        guard needsMount else { return }

        let provider = MainActor.assumeIsolated { SimulaAds.shared }
        guard let provider else {
            // SimulaAds.initialize hasn't run yet (the provider's init effect races view
            // creation). Wait for the one-shot readiness notification instead of polling
            // `shared` on a main-queue timer; stay collapsed until then (a props change
            // re-arms `needsMount` and re-runs this path). Arm FIRST, then re-check: if
            // initialize completed between the check above and the registration, its
            // notification was already posted and would be missed (both happen on the
            // serial main queue today so the window can't interleave — but that ordering
            // is an SDK implementation detail, not a contract).
            observeDidInitializeOnce()
            if MainActor.assumeIsolated({ SimulaAds.shared != nil }) { scheduleMountIfNeeded() }
            return
        }
        // A previously-armed readiness observer has served its purpose once a live provider
        // exists (shared never becomes nil again) — don't keep the registration until deinit.
        removeInitObserver()
        needsMount = false
        mountGeneration += 1
        let generation = mountGeneration
        mountedSlotIdentity = (
            (adUnitId as String?) ?? "",
            adPosition.intValue,
            (preloadedAdId as String?) ?? ""
        )

        // Clip the hosted content to our bounds so it never briefly overflows the
        // sibling feed rows before JS applies the reported height.
        clipsToBounds = true

        // Tear down any previous hosting (prop change → different ad). Proper VC
        // containment teardown (willMove/removeFromParent) — see mount below for why
        // this matters even though nothing presents from the ad today.
        if let previous = hostingController {
            previous.willMove(toParent: nil)
            previous.view.removeFromSuperview()
            previous.removeFromParent()
        }
        hostingController = nil

        let root = SimulaNativeAdRoot(
            provider: provider,
            adUnitId: adUnitId as String?,
            position: adPosition.intValue,
            theme: theme as String?,
            metadata: parseMetadata(metadataJson as String?),
            preloadedAdId: preloadedAdId as String?,
            previewHTML: previewHtml as String?,
            onHeight: { [weak self] height in self?.reportHeight(height, generation: generation) },
            onImpression: { [weak self] data in self?.emitImpression(data) },
            onClick: { [weak self] in self?.emitClick() },
            onPaid: { [weak self] value in self?.emitPaid(value) },
            onError: { [weak self] error in self?.emitError(error) }
        )

        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        controller.view.translatesAutoresizingMaskIntoConstraints = false

        // A feed cell must render identically wherever it sits on screen. UIHostingController
        // propagates the screen's safe area into the hosted SwiftUI tree, so as the cell slides
        // under the notch/status bar the content re-insets (0 → ~59pt) and visibly slides inside
        // the fixed-height, clipped card — it reads as "the ad scrolls" near the top edge. The
        // keyboard safe-area region does the same on chat screens. Disable propagation at the
        // controller (iOS 16.4+); older iOS is covered by .ignoresSafeArea() on the root view.
        if #available(iOS 16.4, *) {
            controller.safeAreaRegions = []
        }

        // Proper UIViewController containment (matches SimulaMiniGameModule's overlay
        // hosting controllers): without addChild/didMove(toParent:), the hosted SwiftUI
        // tree never receives correct trait-collection/safe-area propagation and its
        // appearance-transition callbacks never fire — dormant today (AdChoices is an
        // in-ZStack overlay, not a VC presentation) but would surface the moment
        // anything here needs to present (e.g. a future sheet). If no parent VC is
        // discoverable yet, `attachToParentIfNeeded()` retries this independently on
        // every later attach — see `isHostingControllerContained`.
        isHostingControllerContained = false
        let parentVC = nearestViewController()
        if let parentVC { parentVC.addChild(controller) }
        addSubview(controller.view)

        // Pin width to the host (RN owns width via style); leave height to the content.
        // Seed from the JS-owned bounds when available so a recycled FlashList cell that
        // already applied the cached height doesn't briefly clip the creative to 0 while
        // GeometryReader remeasures. Force the next report through by resetting the
        // dedupe watermark — a rebound slot can share the previous cell's last height.
        let seededHeight = bounds.height > 1 ? bounds.height.rounded() : 0
        lastReportedHeight = -1
        let height = controller.view.heightAnchor.constraint(equalToConstant: seededHeight)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: topAnchor),
            height,
        ])

        if let parentVC {
            controller.didMove(toParent: parentVC)
            isHostingControllerContained = true
        }

        hostingController = controller
        heightConstraint = height
    }

    private func parseMetadata(_ json: String?) -> [String: String] {
        guard let json,
              let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else { return [:] }

        let pairs = dictionary.keys.sorted().compactMap { key -> (String, String)? in
            guard !key.isEmpty, let value = dictionary[key] as? String else { return nil }
            return (key, value)
        }.prefix(10)
        return Dictionary(uniqueKeysWithValues: pairs)
    }

    /// Retries VC containment on the *existing* hosting controller — no recomposition, no
    /// `needsMount` involvement — for the case where `mountIfNeeded()` created it before a
    /// parent view controller was discoverable. Idempotent no-op once containment succeeds
    /// or if there's no hosting controller yet.
    private func attachToParentIfNeeded() {
        guard !isHostingControllerContained, let controller = hostingController else { return }
        // Only contain while in a window: a view clipped out of a virtualized list can
        // still reach a view controller through the responder chain, and containing then
        // leaks the controller exactly like the deferred-mount race above (willMove
        // already ran with nil and won't run again until the next detach).
        guard window != nil else { return }
        guard let parentVC = nearestViewController() else { return }
        parentVC.addChild(controller)
        controller.didMove(toParent: parentVC)
        isHostingControllerContained = true
    }

    /// Inverse of `attachToParentIfNeeded()`: removes the hosting controller from its
    /// parent VC's `children` (releasing the parent's strong reference) while leaving the
    /// controller and its view in place. Idempotent.
    private func detachFromParentIfNeeded() {
        guard isHostingControllerContained, let controller = hostingController else { return }
        controller.willMove(toParent: nil)
        controller.removeFromParent()
        isHostingControllerContained = false
    }

    /// Walks the responder chain to find the view controller currently managing this
    /// view's hierarchy (RN doesn't hand native views a specific "container VC" — this is
    /// the standard way to find one for a view nested arbitrarily deep in a screen). Only
    /// called in-window (mounts and containment are window-gated), so a `nil` here means
    /// the hierarchy is mid-attach; containment is retried on the next layout/attach pass
    /// (the hosted view still renders — only the VC-lifecycle propagation is deferred).
    private func nearestViewController() -> UIViewController? {
        var responder: UIResponder? = self
        while let current = responder {
            if let viewController = current as? UIViewController { return viewController }
            responder = current.next
        }
        return nil
    }

    // MARK: Height + events

    private func reportHeight(_ height: CGFloat, generation: Int) {
        // A root from a previous mount can still emit GeometryReader callbacks while (or
        // after) a prop change swaps the slot; attributing its height to the current slot
        // would poison the JS height cache. The new mount's own reports still flow.
        guard generation == mountGeneration else { return }
        // Round UP: rounding down leaves the creative a sub-point taller than the JS-applied
        // container, which clips the card's bottom edge and gives the inner web view a sliver of
        // scrollable overflow.
        let rounded = height.rounded(.up)
        // Threshold sub-point churn so a measuring creative can't thrash the feed.
        guard abs(rounded - lastReportedHeight) >= 1 else { return }
        lastReportedHeight = rounded
        heightConstraint?.constant = rounded
        onAdSizeChange?([
            "height": rounded,
            // Slot identity the measured root was mounted with (not the live props), so JS
            // can discard a report that raced a list-recycle rebind.
            "adUnitId": mountedSlotIdentity.adUnitId,
            "adPosition": mountedSlotIdentity.position,
            "preloadedAdId": mountedSlotIdentity.preloadedAdId,
        ])
    }

    private func emitImpression(_ data: NativeAdData) {
        onAdImpression?([
            "impressionId": data.impressionId,
            "adFormat": data.adFormat,
            "adUnitId": data.adUnitId as Any? ?? NSNull(),
        ])
    }

    private func emitClick() {
        onAdClick?([:])
    }

    private func emitPaid(_ value: AdValue) {
        onAdPaid?([
            "valueMicros": value.valueMicros,
            "currencyCode": value.currencyCode,
            "precisionType": value.precisionType.rawValue,
            "expectedCpm": value.expectedCpm,
            "expectedRevenue": value.expectedRevenue,
        ])
    }

    private func emitError(_ error: NativeAdError) {
        onAdError?(["code": Self.code(error), "message": Self.message(error)])
    }

    /// The native enum carries no message (pure enum), so the bridge maps each case to the stable JS
    /// code + a human-readable description (mirrors the native SDKs' SimulaAdError copy).
    private static func code(_ error: NativeAdError) -> String {
        switch error {
        case .notInitialized: return "not_initialized"
        case .noSession: return "no_session"
        case .noFill: return "no_fill"
        case .network: return "network"
        case .adUnitNotFound: return "ad_unit_not_found"
        }
    }

    private static func message(_ error: NativeAdError) -> String {
        switch error {
        case .notInitialized: return "SimulaAds is not initialized — call SimulaAds.initialize() first."
        case .noSession: return "Could not create a session. Check the API key and network connection."
        case .noFill: return "No ad available to show right now (no fill)."
        case .network: return "Network error while loading the ad — check the connection and try again."
        case .adUnitNotFound: return "Ad unit id is not registered for this app — check the ad unit id in your Simula dashboard."
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
    let metadata: [String: String]
    let preloadedAdId: String?
    let previewHTML: String?
    let onHeight: (CGFloat) -> Void
    let onImpression: (NativeAdData) -> Void
    let onClick: () -> Void
    let onPaid: (AdValue) -> Void
    let onError: (NativeAdError) -> Void

    var body: some View {
        NativeAdSlot(
            adUnitId: adUnitId,
            position: position,
            theme: theme,
            metadata: metadata,
            preloadedAdId: preloadedAdId,
            onImpression: onImpression,
            onPaid: onPaid,
            onError: onError,
            onClick: onClick,
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
        // Pre-iOS 16.4 counterpart of `safeAreaRegions = []` (set where this controller is
        // built): without it, a cell sliding under the notch/status bar (or above the
        // keyboard) has its content re-inset by the propagated safe area — the ad visibly
        // slides inside the clipped card and its measured height shifts mid-scroll.
        .ignoresSafeArea(.all, edges: .all)
        .environmentObject(provider)
    }
}
#else
// Native ads are iOS-only in the SDK; expose a no-op manager on other platforms so
// the bridge symbol resolves.
@objc(SimulaNativeAdViewManager)
class SimulaNativeAdViewManager: RCTViewManager {
    override func view() -> UIView! { UIView() }
    override static func requiresMainQueueSetup() -> Bool { false }
}
#endif
