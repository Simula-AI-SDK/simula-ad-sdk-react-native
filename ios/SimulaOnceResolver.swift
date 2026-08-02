#if canImport(React)
import React
#elseif canImport(React_Core)
import React_Core
#endif
import Foundation

/// One-shot guard for completion-settled bridge promises (RN-6). The first
/// resolve/reject wins; any later call is dropped. (A *dropped* SDK completion
/// would still strand the JS promise — that half is bounded JS-side by
/// `withTimeout`.)
final class SimulaOnceResolver {
    private let lock = NSLock()
    private var fired = false
    private let resolveBlock: RCTPromiseResolveBlock
    private let rejectBlock: RCTPromiseRejectBlock

    init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        resolveBlock = resolve
        rejectBlock = reject
    }

    func resolve(_ value: Any?) {
        fire { resolveBlock(value) }
    }

    func reject(_ code: String, _ message: String, _ error: Error?) {
        fire { rejectBlock(code, message, error) }
    }

    private func fire(_ body: () -> Void) {
        lock.lock()
        if fired { lock.unlock(); return }
        fired = true
        lock.unlock()
        body()
    }
}
