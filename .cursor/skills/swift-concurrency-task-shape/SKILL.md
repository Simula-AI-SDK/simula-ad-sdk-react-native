---
name: swift-concurrency-task-shape
description: >-
  Required shape for Swift Concurrency Task closures in this wrapper's ios/
  sources to avoid a known Swift 6.1–6.3 optimizer miscompilation that aborts
  host apps at task teardown ("freed pointer was not the last allocation").
  Apply when writing or reviewing Swift code using Task {}, try? await, or
  Task.sleep, or when investigating SIGABRT crashes in swift_task_dealloc /
  completeTaskWithClosure.
---

# Swift Concurrency Task Shape (RN wrapper)

The Swift in `ios/` is compiled **from source by every host app's own Xcode**
(`s.source_files` in the podspec) — this cannot be changed by shipping
SimulaAdSDK as a binary; React Native libraries always build from source.
Swift 6.1–6.3 optimizers (Xcode 16.3 through at least 26.x) miscompile certain
async-closure shapes into out-of-LIFO-order task-stack deallocations, aborting
the host app with:

```
libswift_Concurrency  fatalError "freed pointer was not the last allocation"
libswift_Concurrency  swift_task_dealloc
<host app binary>     <deduplicated_symbol>   (async thunk)
libswift_Concurrency  completeTaskWithClosure
```

This crashed a production host at startup (July 2026). Our source is valid
Swift; the bug is the host's toolchain — so we defensively avoid the
implicated shapes.

## Rules

1. **`Task {}` closure bodies must be a single call into a named method.**

```swift
// Good
Task { @MainActor in await Self.runPreloadNativeAd(unitId, pos, themeName, resolve) }

// Bad — multi-statement closure body
Task { @MainActor in
    let id = await SimulaAds.preloadNativeAd(adUnitId: unitId, position: pos, theme: themeName)
    resolve(id)
}
```

2. **Never `try?` around an `await`** inside a task closure or its body —
   use explicit `do/catch`.
3. **No `async let`** — the most-reported trigger shape upstream.
4. **Minimal captures** — capture the few values you need, not big objects.

The full history, triage guide, and upstream references live in the native
SDK repo: `simula-ad-sdk-swift/.cursor/skills/swift-concurrency-task-shape/`
(swiftlang/swift#81771, #75501).
