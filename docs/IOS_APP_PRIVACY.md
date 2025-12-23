# iOS App Privacy Guide for Simula Ad SDK

This document helps you complete the **App Privacy** section in App Store Connect and configure your iOS app for Simula Ad SDK compliance.

---

## Quick Setup Checklist

- [ ] Add `PrivacyInfo.xcprivacy` to your Xcode project
- [ ] Add SKAdNetwork identifiers to `Info.plist`
- [ ] Complete App Privacy nutrition labels in App Store Connect
- [ ] Update your Privacy Policy

---

## 1. Privacy Manifest (iOS 17+ Required)

### Installation

1. Copy `ios/PrivacyInfo.xcprivacy` from this SDK to your Xcode project
2. Add the file to your app target (File → Add Files to "YourApp")
3. Ensure it's included in "Copy Bundle Resources" build phase

### What's Declared

| API Category | Reason Code | Why We Use It |
|--------------|-------------|---------------|
| User Defaults | CA92.1 | Store consent state locally |
| System Boot Time | 35F9.1 | Measure viewability timing |

### Verification

After building, check your app's privacy report:
1. Product → Archive
2. Distribute App → App Store Connect
3. Review "Privacy Report" in the distribution wizard

---

## 2. SKAdNetwork Configuration

### Installation

Add these entries to your app's `Info.plist`:

```xml
<key>SKAdNetworkItems</key>
<array>
    <!-- Simula Ad Network -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>simula123456.skadnetwork</string>
    </dict>
    
    <!-- Google Ads -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>cstr6suwn9.skadnetwork</string>
    </dict>
    
    <!-- Meta/Facebook -->
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>v9wttpbfk9.skadnetwork</string>
    </dict>
    <dict>
        <key>SKAdNetworkIdentifier</key>
        <string>n38lu8286q.skadnetwork</string>
    </dict>
    
    <!-- See ios/SKAdNetworkItems.plist for full list -->
</array>
```

Or copy all entries from `ios/SKAdNetworkItems.plist`.

### Why SKAdNetwork?

- Enables privacy-preserving ad attribution on iOS 14+
- Advertisers can measure campaign performance without tracking users
- Higher CPMs because advertisers can prove ROI

---

## 3. App Store Connect Privacy Labels

When submitting your app, complete the App Privacy section with these responses:

### Data Linked to You: **No**

Simula SDK does NOT link collected data to user identity.

### Data Used to Track You: **No**

Simula SDK does NOT track users across apps or websites.

### Data Types Collected

#### ✅ Usage Data → Product Interaction

| Question | Answer |
|----------|--------|
| Collected? | Yes |
| Linked to identity? | No |
| Used for tracking? | No |
| Purpose | Third-Party Advertising |

> **Reason:** Ad impressions and clicks are recorded.

#### ✅ Usage Data → Advertising Data

| Question | Answer |
|----------|--------|
| Collected? | Yes |
| Linked to identity? | No |
| Used for tracking? | No |
| Purpose | Third-Party Advertising |

> **Reason:** Contextual ad targeting based on conversation content.

#### ✅ Identifiers → Device ID

| Question | Answer |
|----------|--------|
| Collected? | Yes |
| Linked to identity? | No |
| Used for tracking? | No |
| Purpose | Third-Party Advertising |

> **Reason:** Temporary session IDs (NOT IDFA).

### Data Types NOT Collected

Select "No" for all of these:

- ❌ Contact Info (name, email, phone, address)
- ❌ Health & Fitness
- ❌ Financial Info
- ❌ Location
- ❌ Sensitive Info
- ❌ Contacts
- ❌ User Content (photos, videos, audio)
- ❌ Browsing History
- ❌ Search History
- ❌ Identifiers → User ID
- ❌ Purchases
- ❌ Diagnostics

---

## 4. ATT (App Tracking Transparency)

### Do You Need ATT Permission?

**Likely NO** for Simula SDK because:

- ✅ We don't access IDFA
- ✅ We don't track users across apps
- ✅ We use contextual targeting (content-based, not user-based)

### When ATT IS Required

You need ATT permission if your app (not just Simula SDK) does ANY of:

- Accesses IDFA via `ASIdentifierManager`
- Uses other SDKs that track users
- Shares user data with data brokers
- Links user data across apps you don't own

### If You Need ATT

Add to `Info.plist`:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>This allows us to show you relevant ads based on your interests.</string>
```

And request permission in code:

```swift
import AppTrackingTransparency

ATTrackingManager.requestTrackingAuthorization { status in
    // Handle status
}
```

---

## 5. Privacy Policy Requirements

Your app's privacy policy must disclose:

### Data Collection

```
Our app uses the Simula Ad SDK to display contextual advertisements.

The SDK collects:
- Conversation context (message content) for contextual ad targeting
- Ad interaction events (when ads are viewed or clicked)
- Temporary session identifiers

The SDK does NOT collect:
- Apple Advertising Identifier (IDFA)
- Location data
- Personal information (name, email, phone)
- Device fingerprints
```

### Third-Party Sharing

```
We share data with the following third parties for advertising purposes:
- Simula Ad Network (https://simula.ad)

Data shared includes conversation context and ad interaction metrics.
No data is sold or used for cross-app tracking.
```

### User Rights

```
You may opt out of personalized ads by:
- Declining consent when prompted in the app
- Contacting us at [your-email]

To request data deletion, contact support@simula.ad.
```

---

## 6. Common App Review Issues

### Issue: "Your app uses the AppTrackingTransparency framework"

**Cause:** Another SDK in your app uses IDFA.
**Solution:** Simula SDK doesn't require ATT. Check other SDKs.

### Issue: "Privacy nutrition labels incomplete"

**Cause:** Missing data type declarations.
**Solution:** Declare Usage Data and Identifiers per this guide.

### Issue: "Privacy manifest missing"

**Cause:** `PrivacyInfo.xcprivacy` not included.
**Solution:** Add the file from `ios/PrivacyInfo.xcprivacy`.

---

## Summary Table

| Requirement | Status | File/Action |
|-------------|--------|-------------|
| Privacy Manifest | Required (iOS 17+) | `ios/PrivacyInfo.xcprivacy` |
| SKAdNetwork | Recommended | `ios/SKAdNetworkItems.plist` |
| App Privacy Labels | Required | App Store Connect |
| ATT Permission | Not required | — |
| Privacy Policy | Required | Your website |

---

## Questions?

Contact support@simula.ad for App Store submission assistance.

















