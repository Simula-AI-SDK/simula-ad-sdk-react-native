# Simula Ad SDK for React Native

**React Native SDK for AI-Powered Contextual Ads**

Simula delivers **contextually relevant ads** for conversational AI apps and LLM-based interfaces on iOS and Android. It's lightweight, easy to integrate, and compliant with App Store and Play Store policies.

> 🌐 **Based on**: [Simula Ad SDK for React Web](https://github.com/Simula-AI-SDK/simula-ad-sdk)

---

## 🚀 Installation

```bash
npm install @simula/ads-react-native react-native-webview
```

### Optional: Safe Area Context

To suppress deprecation warnings related to `SafeAreaView`, install `react-native-safe-area-context`:

```bash
npm install react-native-safe-area-context
```

Then follow the [setup instructions](https://github.com/th3rdwave/react-native-safe-area-context#getting-started) for your platform.

### Additional Setup

#### iOS
```bash
cd ios && pod install
```

#### Android
No additional setup required. The package is auto-linked.

### Permissions

Add to your `Info.plist` (iOS) or `AndroidManifest.xml` (Android) if required by your app:

**iOS** - No special permissions needed for basic ad display.

**Android** - Internet permission (usually already present):
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

---

## ⚡ Quick Start

Integrate in **two steps**:

1. **Wrap your chat/conversation component** with `SimulaProvider`
2. **Insert** `<InChatAdSlot />` where you want ads

```typescript
import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SimulaProvider, InChatAdSlot } from "@simula/ads-react-native";

function App() {
  return (
    <View>
      <Header />
      <ChatInterface />  {/* SimulaProvider wraps individual conversations */}
    </View>
  );
}

function ChatInterface() {
  const [messages, setMessages] = useState([]);

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <ScrollView>
        {messages.map((msg, i) => (
          <View key={i}>
            <Text>
              <Text style={{ fontWeight: "bold" }}>{msg.role}:</Text> {msg.content}
            </Text>
            {msg.role === "assistant" && (
              <InChatAdSlot
                messages={messages.slice(0, i + 1)}
                theme={{ mode: "light", accent: "blue" }}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </SimulaProvider>
  );
}
```

---

## 🧩 Components

### `SimulaProvider`

Initializes the SDK and manages session state.

| Prop                     | Type                | Required | Default | Description                                                      |
| ------------------------ | ------------------- | -------- | ------- | ---------------------------------------------------------------- |
| apiKey                   | string              | ✅       | —       | Your Simula API key from the [dashboard](https://simula.ad)     |
| children                 | ReactNode           | ✅       | —       | Your app components                                              |
| hasPrivacyConsent        | boolean             | ❌       | false   | Privacy consent for processing conversation data (GDPR/TCF 2.0) |
| onPrivacyConsentRequired | () => void          | ❌       | —       | Callback when privacy consent is needed                          |

> **Note:** `hasAdTrackingConsent` is auto-detected from the OS (iOS ATT / Android GAID) and exposed as a read-only value in the context.

#### Example

```typescript
<SimulaProvider
  apiKey="SIMULA_xxx"
  hasPrivacyConsent={true}
  onPrivacyConsentRequired={() => {
    // Show your consent dialog or CMP
    showConsentDialog();
  }}
>
  <YourApp />
</SimulaProvider>
```

---

### `InChatAdSlot`

Renders a single ad slot within a conversation.

| Prop         | Type                     | Required | Default | Description                                                      |
| ------------ | ------------------------ | -------- | ------- | ---------------------------------------------------------------- |
| messages     | Message[]                | ✅       | —       | Conversation messages for contextual targeting                   |
| theme        | SimulaTheme              | ❌       | auto    | Theme configuration (mode, accent, font, width, cornerRadius)    |
| trigger      | Promise\<any\>           | ❌       | —       | Wait for this promise before fetching (e.g., LLM response)       |
| debounceMs   | number                   | ❌       | 0       | Debounce delay for message updates                               |
| onImpression | (ad: AdData) => void     | ❌       | —       | Callback when ad impression is recorded (50% visible for ≥1s)    |
| onClick      | (ad: AdData) => void     | ❌       | —       | Callback when user clicks the ad                                 |
| onError      | (error: Error) => void   | ❌       | —       | Callback when ad fetch fails                                     |

#### Message Format

```typescript
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  llmPromise?: Promise<any>; // Optional: for trigger timing
}
```

---

### `MiniGameMenu`

Displays a menu of sponsored mini-games that users can play with AI characters.

| Prop                   | Type                | Required | Default | Description                                                      |
| ---------------------- | ------------------- | -------- | ------- | ---------------------------------------------------------------- |
| isOpen                 | boolean             | ✅       | —       | Whether the menu is visible                                      |
| onClose                | () => void          | ✅       | —       | Callback when menu is closed                                     |
| charName               | string              | ✅       | —       | AI character name                                                |
| charID                 | string              | ✅       | —       | AI character ID                                                  |
| charImage              | string              | ✅       | —       | AI character avatar URL                                          |
| messages               | Message[]           | ❌       | []      | Conversation context for game personalization                    |
| charDesc               | string              | ❌       | —       | Character description                                            |
| maxGamesToShow         | 3 \| 6 \| 9         | ❌       | 6       | Maximum games to display                                         |
| theme                  | MiniGameTheme       | ❌       | —       | Theme customization                                              |
| delegateChar           | boolean             | ❌       | true    | Whether Simula displays the AI character in the game             |
| consentRequiredMessage | string              | ❌       | —       | Custom message when privacy consent is not granted               |

> **Note:** Mini games require privacy consent. If `hasPrivacyConsent` is `false`, the menu displays a consent required message instead of games.

#### Example

```typescript
import { MiniGameMenu } from "@simula/ads-react-native";

<MiniGameMenu
  isOpen={showGames}
  onClose={() => setShowGames(false)}
  charName="Luna"
  charID="char_123"
  charImage="https://example.com/luna.png"
  messages={messages}
  consentRequiredMessage="Please accept privacy settings to play games with Luna."
/>
```

---

## 🎨 Theme Configuration

```typescript
interface SimulaTheme {
  mode?: "light" | "dark" | "auto";
  accent?: AccentColor | AccentColor[];     // A/B testing supported
  font?: FontOption | FontOption[];         // A/B testing supported
  width?: number | string;                  // min 320px
  cornerRadius?: number;                    // default: 8
}
```

**Modes:** `light` | `dark` | `auto` (follows system)  
**Accents:** `blue`, `red`, `green`, `yellow`, `purple`, `pink`, `orange`, `neutral`, `gray`, `tan`, `transparent`, `image`  
**Fonts:** `sans-serif`, `serif`, `monospace`

> **Height:** Fixed at **265px**  
> **Width:** Min **320px**, accepts pixels or `"auto"`

> **A/B Testing:** Pass an **array** (e.g., `accent: ['blue', 'green', 'image']`) to automatically test variants. **💡 Strongly recommend including `"image"` for best CPM.**

#### Examples

```typescript
// Default (auto mode)
<InChatAdSlot messages={messages} />

// Light mode with custom accent
<InChatAdSlot 
  messages={messages} 
  theme={{ mode: "light", accent: "blue" }} 
/>

// Dark mode with custom width
<InChatAdSlot
  messages={messages}
  theme={{ 
    mode: "dark", 
    accent: "purple", 
    width: 600, 
    cornerRadius: 12 
  }}
/>

// A/B testing (recommended)
<InChatAdSlot
  messages={messages}
  theme={{
    accent: ["blue", "green", "image"],    // Include "image" for best CPM
    font: ["sans-serif", "serif"],
    width: "100%"
  }}
/>
```

---

## 💬 Integration Example

### Chat App with OpenAI

```typescript
import React, { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from "react-native";
import { SimulaProvider, InChatAdSlot } from "@simula/ads-react-native";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default function App() {
  return (
    <View style={styles.app}>
      <Text style={styles.header}>AI Chat</Text>
      <ChatApp />
    </View>
  );
}

function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const llmPromise = client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: newMessages,
      });

      const res = await llmPromise;
      const reply = res.choices[0].message;

      setMessages((prev) => [...prev, { ...reply, llmPromise }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View style={styles.chat}>
        <ScrollView style={styles.messageList}>
          {messages.map((msg, i) => (
            <View key={i} style={styles.message}>
              <Text>
                <Text style={styles.role}>{msg.role}:</Text> {msg.content}
              </Text>

              {msg.role === "assistant" && (
                <InChatAdSlot
                  key={`adslot-${i}`}              // ✅ Required when in a list
                  trigger={msg.llmPromise}         // Wait for LLM response
                  messages={messages.slice(0, i + 1)}
                  theme={{ mode: "light", accent: ["blue", "image"], width: "100%" }}
                />
              )}
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={sendMessage}
            placeholder="Type a message..."
          />
          <Button title="Send" onPress={sendMessage} disabled={loading} />
        </View>
      </View>
    </SimulaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, padding: 20 },
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  chat: { flex: 1 },
  messageList: { flex: 1 },
  message: { marginBottom: 16 },
  role: { fontWeight: "bold" },
  inputContainer: { flexDirection: "row", gap: 8, marginTop: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 4 },
});
```

> **Tips:**
> 
> - **Wrap `SimulaProvider` around the chat component** – Each conversation is a separate session for better targeting.
> - Use `key` prop when `<InChatAdSlot />` is in a list or dynamic loop.
> - The `trigger` prop waits for LLM responses. If omitted, ads fetch immediately when viewable.

---

## 🔑 Features

- **Contextual Targeting** – AI-powered ad matching to conversation content
- **Dynamic Width Detection** – Automatically detects device/container width and optimizes ad sizing
- **MRC-Compliant Viewability** – 50% visible for ≥1s before impression tracking
- **App Store Compliant** – No device fingerprinting or tracking without consent
- **Responsive** – Adapts to device dimensions, orientation changes, and theme settings
- **Static Fetch** – Each slot fetches once and stays fixed (no re-fetching)
- **Session Management** – Automatic session handling per conversation
- **Robust Error Handling** – Graceful degradation with callbacks
- **TypeScript Support** – Built-in type definitions
- **Built-in A/B Testing** – Test colors/fonts by passing arrays
- **Iframe Support** – Handles iframe-based ad content from API seamlessly

---

## 🔐 Privacy & Consent Management

### Two Types of Consent

The SDK handles two types of consent:

| Consent Type | Source | Purpose |
|--------------|--------|---------|
| **Privacy Consent** | Parent app prop | GDPR/TCF 2.0 - consent to process conversation data |
| **Ad Tracking Consent** | Auto-detected from OS | iOS ATT / Android GAID - device ID access |

### App Store / Play Store Compliance

Simula SDK is designed for **App Store and Play Store compliance**:

- ✅ No device fingerprinting (IDFA/AAID) - SDK doesn't collect device IDs
- ✅ No location tracking
- ✅ No personal information collection
- ✅ Bot detection handled server-side only
- ✅ Privacy consent hooks provided
- ✅ Ad tracking consent auto-detected from OS

### What Data is Collected?

The SDK collects only:
- Conversation context (messages) for ad targeting
- Session IDs (temporary, per-conversation)
- Ad interaction events (impressions, clicks)
- Platform info (iOS/Android)
- Screen dimensions

### Setting Up Privacy Consent

```typescript
import { SimulaProvider, privacyConsentManager, getPrivacyConsentMessage } from "@simula/ads-react-native";

function App() {
  const [hasConsent, setHasConsent] = useState(false);

  const showConsentDialog = () => {
    Alert.alert(
      "Privacy Notice",
      getPrivacyConsentMessage(),
      [
        { text: "Decline", onPress: () => setHasConsent(false) },
        { text: "Accept", onPress: () => {
          setHasConsent(true);
          privacyConsentManager.setConsent(true);
        }},
      ]
    );
  };

  return (
    <SimulaProvider
      apiKey="SIMULA_xxx"
      hasPrivacyConsent={hasConsent}
      onPrivacyConsentRequired={showConsentDialog}
    >
      <YourApp />
    </SimulaProvider>
  );
}
```

### Privacy Policy Requirements

Your app's privacy policy **must** disclose:

1. **Data Collection**: Conversation context used for contextual ads
2. **Third Parties**: Simula Ad Network
3. **User Rights**: How to opt-out or request data deletion
4. **Contact**: Support email for privacy inquiries

Use the exported `PRIVACY_DISCLOSURE` constant for reference:

```typescript
import { PRIVACY_DISCLOSURE } from "@simula/ads-react-native";

console.log(PRIVACY_DISCLOSURE.dataCollected);
// ["Conversation context (messages)", "Session identifiers (temporary)", ...]
```

### App Store Submission (iOS)

For iOS App Store submission, you need:

1. **Privacy Manifest (iOS 17+)** - Copy `ios/PrivacyInfo.xcprivacy` to your Xcode project
2. **SKAdNetwork** - Add identifiers from `ios/SKAdNetworkItems.plist` to your `Info.plist`
3. **App Privacy Labels** - See [docs/IOS_APP_PRIVACY.md](docs/IOS_APP_PRIVACY.md) for complete guide

```bash
# Copy privacy manifest to your iOS project
cp node_modules/@simula/ads-react-native/ios/PrivacyInfo.xcprivacy ios/YourApp/
```

### Play Store Submission (Android)

For Google Play submission, complete the Data Safety form. See [docs/GOOGLE_PLAY_DATA_SAFETY.md](docs/GOOGLE_PLAY_DATA_SAFETY.md) for:

- Which data types to declare
- Sample responses for each question
- Copy-paste text for your listing

---

## 🛡️ Security & AdTech Sandboxing

### WebView Security (App Store / Play Store Compliance)

The SDK implements comprehensive WebView sandboxing to comply with App Store and Google Play policies:

#### Origin Restrictions

- **HTTPS Only**: All ad content must be served over HTTPS
- **Origin Validation**: Only trusted Simula ad server origins are allowed
- **No Mixed Content**: HTTP content within HTTPS context is blocked

#### Security Features

```typescript
// The SDK automatically applies these security settings:
{
  mixedContentMode: "never",              // Block HTTP in HTTPS
  mediaPlaybackRequiresUserAction: true,  // User must initiate media
  javaScriptCanOpenWindowsAutomatically: false,
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
}
```

#### Ad Disclosure

All ads display:
- A visible "Ad" label in the top-left corner
- An info button with details about the advertisement
- Clear identification as sponsored content

### For App Publishers: app-ads.txt

To maximize ad revenue and prevent fraud, implement app-ads.txt:

1. Add your app store URL to your website
2. Create `/app-ads.txt` on your domain
3. Include Simula as an authorized seller

Example `app-ads.txt`:
```
# Simula Ad Network
simula.ad, PUBLISHER_ID, DIRECT
```

Contact support@simula.ad for your publisher ID.

### Security Utilities

For advanced use cases, the SDK exports security utilities:

```typescript
import { 
  validateAdUrl, 
  isOriginAllowed, 
  DEFAULT_ALLOWED_ORIGINS,
  getWebViewSecuritySettings 
} from "@simula/ads-react-native";

// Validate an ad URL before loading
const result = validateAdUrl("https://ads.simula.ad/ad/123");
if (!result.isValid) {
  console.error("Invalid ad URL:", result.error);
}

// Check if an origin is allowed
const allowed = isOriginAllowed("https://ads.simula.ad", DEFAULT_ALLOWED_ORIGINS);
```

---

## 📐 How Width Detection Works

The SDK automatically detects and optimizes ad sizing:

1. **Detects Device Dimensions** – Uses React Native's `Dimensions` API
2. **Respects Theme Width** – Applies your custom width settings (with 320px minimum)
3. **Sends to API** – Passes viewport dimensions so API returns optimally-sized ads
4. **Responsive Updates** – Tracks orientation changes and layout updates
5. **Container-Aware** – Uses actual container width via `onLayout` event

### Example Width Behavior

```typescript
// Full width (adapts to device)
<InChatAdSlot messages={messages} theme={{ width: "100%" }} />

// Fixed width (enforces minimum 320px)
<InChatAdSlot messages={messages} theme={{ width: 600 }} />

// Auto width (uses container dimensions)
<InChatAdSlot messages={messages} theme={{ width: "auto" }} />
```

The SDK sends these dimensions to the API, which returns iframe HTML pre-sized for optimal display on your device.

---

## ⚙️ Advanced Usage

### Event Handlers

```typescript
<InChatAdSlot
  messages={messages}
  onImpression={(ad) => {
    console.log("Impression recorded:", ad.id);
    // Track with your analytics
  }}
  onClick={(ad) => {
    console.log("Ad clicked:", ad.id);
    // Track with your analytics
  }}
  onError={(err) => {
    console.error("Ad error:", err.message);
    // Handle error gracefully
  }}
/>
```

### Debounce Fetching

Prevent excessive API calls during rapid message updates:

```typescript
<InChatAdSlot
  messages={messages}
  debounceMs={500}   // Wait 500ms after last message change
/>
```

### Manual Consent Control

```typescript
import { privacyConsentManager } from "@simula/ads-react-native";

// Set privacy consent programmatically
privacyConsentManager.setConsent(true);

// Get current consent status
const hasConsent = privacyConsentManager.getConsent();

// Subscribe to consent changes
const unsubscribe = privacyConsentManager.subscribe((hasConsent) => {
  console.log("Privacy consent changed:", hasConsent);
});

// Cleanup
unsubscribe();
```

### Accessing Ad Tracking Consent

Ad tracking consent is auto-detected from the OS and available as a read-only value:

```typescript
import { useSimulaContext } from "@simula/ads-react-native";

function MyComponent() {
  const { hasPrivacyConsent, hasAdTrackingConsent } = useSimulaContext();

  console.log("Privacy consent:", hasPrivacyConsent);       // From parent app
  console.log("Ad tracking consent:", hasAdTrackingConsent); // Auto-detected from OS

  return <YourContent />;
}
```

---

## 📦 TypeScript Types

```typescript
import type {
  // Core types
  SimulaTheme,
  Message,
  AdData,
  InChatAdSlotProps,
  SimulaProviderProps,
  SimulaContextValue,
  AccentColor,
  FontOption,
  ThemeMode,
  // MiniGame types
  MiniGameMenuProps,
  MiniGameTheme,
  GameData,
  // Security types
  WebViewSecurityConfig,
  AdUrlValidationResult,
  SecurityEventType,
  SecurityEvent,
  // Ad tracking types
  AdTrackingStatus,
  AdTrackingResult,
} from "@simula/ads-react-native";
```

---

## 🛠️ Troubleshooting

### Invalid Hook Call / Multiple React Versions

If you see errors like "Invalid hook call" or "Cannot read property 'useState' of null", you likely have multiple React instances:

**Solution:**
1. Add to your `package.json`:
```json
{
  "overrides": {
    "react": "^18.2.0",
    "@simula/ads-react-native": {
      "react": "^18.2.0"
    }
  }
}
```

2. Clean install:
```bash
rm -rf node_modules package-lock.json
npm install
npm start -- --clear
```

3. Verify single React instance:
```bash
npm list react
# Should show only ONE react installation
```

**Note:** This SDK uses React as a peer dependency, so it will use your app's React version. The conflict usually comes from other packages installing different React versions.

### Ads Not Showing

1. **Check API Key**: Must start with `SIMULA_`
2. **Check Consent**: User must grant privacy consent via `hasPrivacyConsent` prop
3. **Check Messages**: At least one message required
4. **Check Network**: Ensure internet connectivity
5. **Check Logs**: Look for errors in console

### WebView Issues

**iOS**: Ensure you've run `pod install` after installation.

**Android**: WebView is included by default. No additional setup needed.

### TypeScript Errors

Make sure you have the required peer dependencies:
```bash
npm install --save-dev @types/react @types/react-native
```

---

## 📚 Resources

- [Website](https://simula.ad)
- [Original React SDK](https://github.com/Simula-AI-SDK/simula-ad-sdk)
- [GitHub Issues](https://github.com/Simula-AI-SDK/simula-ad-sdk-react-native/issues)
- **Support**: admin@simula.ad

---

## 📄 License

MIT

---

## 🔗 Related Links

- **Web SDK**: [github.com/Simula-AI-SDK/simula-ad-sdk](https://github.com/Simula-AI-SDK/simula-ad-sdk)
- **Dashboard**: [simula.ad](https://simula.ad)

---

## 📑 Appendix: Ad Formats

Simula automatically selects the best-performing format based on context. All formats are optimized for mobile and comply with App Store policies.

Available formats:
- **tips** - Educational tips relevant to conversation
- **interactive** - Engaging interactive elements
- **suggestions** - Action-oriented suggestions
- **text** - Clean text-based ads
- **highlight** - Highlighted content blocks
- **visual_banner** - Visual banner with imagery

> **Recommendation**: Allow all formats for optimal CPM. Contact us if you need specific formats excluded.

---

Made with ❤️ by [Simula AI](https://simula.ad)

