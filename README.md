# Simula MiniGame SDK for React Native

A React Native SDK for integrating sponsored mini-games into AI chat applications.

## Key Features

- Sponsored mini-games that users can play with AI characters
- Easy integration with existing React Native chat apps
- Privacy-first design with consent management
- App Store and Play Store compliant

## Installation

```bash
npm install @simula/ads-react-native
```

### iOS Setup
```bash
cd ios && pod install
```

### Android Setup
No additional setup required.

## Quick Start

### 1. Provider Setup

Wrap your app with `SimulaProvider`:

```typescript
import { SimulaProvider } from "@simula/ads-react-native";

function App() {
  return (
    <SimulaProvider
      apiKey="YOUR_API_KEY"
      hasPrivacyConsent={true}
    >
      <YourChatApp />
    </SimulaProvider>
  );
}
```

By default the provider eagerly initializes the native SDK on mount
(`initializeOnMount`, default `true`), warming the server session off the first
ad's critical path. Additional optional props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `privacy` | `SimulaPrivacyConfig` | — | Granular consent (TCF/CCPA/GPP/COPPA + IDFA opt-in). Takes precedence over `hasPrivacyConsent`. |
| `telemetryEnabled` | `boolean` | `true` | Opt out of in-house SDK telemetry. |
| `initializeOnMount` | `boolean` | `true` | Warm the native session on mount. Set `false` if you call `SimulaAds.initialize` yourself. |

### 2. MiniGame Menu Integration

Add the `MiniGameMenu` component to your chat interface:

```typescript
import { MiniGameMenu } from "@simula/ads-react-native";

function ChatScreen() {
  const [showGames, setShowGames] = useState(false);

  return (
    <>
      <Button title="Play Games" onPress={() => setShowGames(true)} />

      <MiniGameMenu
        isOpen={showGames}
        onClose={() => setShowGames(false)}
        charName="Luna"
        charID="char_123"
        charImage="https://example.com/avatar.png"
        messages={messages}
      />
    </>
  );
}
```

## Optional Components

The following components are optional UI helpers for triggering the MiniGame Menu. Use any combination that fits your app, or use your own buttons/triggers instead.

### Game Button

A styled trigger button with optional pulsate glow animation and notification badge.

```typescript
import { MiniGameButton } from "@simula/ads-react-native";

function ChatScreen() {
  const [showGames, setShowGames] = useState(false);

  return (
    <>
      <MiniGameButton
        text="Play a Game"
        showPulsate={true}
        showBadge={true}
        theme={{
          backgroundColor: "#3B82F6",
          textColor: "#FFFFFF",
          cornerRadius: 8,
        }}
        onClick={() => setShowGames(true)}
      />

      <MiniGameMenu
        isOpen={showGames}
        onClose={() => setShowGames(false)}
        charName="Luna"
        charID="char_123"
        charImage="https://example.com/avatar.png"
      />
    </>
  );
}
```

### Invitation Banner

A banner that slides in to invite the user to play a game. Supports multiple animation types and auto-close.

```typescript
import { MiniGameInvitation } from "@simula/ads-react-native";

function ChatScreen() {
  const [showInvitation, setShowInvitation] = useState(true);
  const [showGames, setShowGames] = useState(false);

  return (
    <>
      <MiniGameInvitation
        charImage="https://example.com/avatar.png"
        titleText="Want to play a game?"
        subText="Take a break and challenge yourself!"
        ctaText="Play a Game"
        animation="auto"
        isOpen={showInvitation}
        autoCloseDuration={10000}
        theme={{
          backgroundColor: "rgba(0, 0, 0, 0.65)",
          titleTextColor: "#FFFFFF",
          ctaColor: "#3B82F6",
        }}
        onClick={() => setShowGames(true)}
        onClose={() => setShowInvitation(false)}
      />

      <MiniGameMenu
        isOpen={showGames}
        onClose={() => setShowGames(false)}
        charName="Luna"
        charID="char_123"
        charImage="https://example.com/avatar.png"
      />
    </>
  );
}
```

### Full-Screen Interstitial

A full-screen overlay with character image, invitation text, and CTA button.

```typescript
import { MiniGameInterstitial } from "@simula/ads-react-native";

function ChatScreen() {
  const [showInterstitial, setShowInterstitial] = useState(true);
  const [showGames, setShowGames] = useState(false);

  return (
    <>
      <MiniGameInterstitial
        charImage="https://example.com/avatar.png"
        invitationText="Want to play a game?"
        ctaText="Play a Game"
        isOpen={showInterstitial}
        theme={{
          titleTextColor: "#FFFFFF",
          ctaTextColor: "#FFFFFF",
          ctaColor: "#3B82F6",
          titleFontSize: 24,
        }}
        onClick={() => setShowGames(true)}
        onClose={() => setShowInterstitial(false)}
      />

      <MiniGameMenu
        isOpen={showGames}
        onClose={() => setShowGames(false)}
        charName="Luna"
        charID="char_123"
        charImage="https://example.com/avatar.png"
      />
    </>
  );
}
```

## Imperative Ads (Interstitial & Rewarded)

In addition to the declarative mini-game surfaces, the SDK exposes an imperative,
preloadable full-screen ad API modeled on AdMob. The native SDKs own all of the
logic — dedup, 1-hour staleness, the load/show state machine, auto-preload on
close, and durable server-side reward verification. The wrapper is a thin
pass-through: outcomes are delivered as events.

Initialization happens automatically when a `SimulaProvider` is mounted. To use
the imperative API outside a provider tree, initialize once at startup:

```typescript
import { SimulaAds } from "@simula/ads-react-native";

await SimulaAds.initialize({ apiKey: "YOUR_API_KEY" });
```

### Interstitial

```typescript
import { SimulaInterstitialAd, SimulaAdEventType } from "@simula/ads-react-native";

const ad = SimulaInterstitialAd.create("home_interstitial");

const off = ad.addAdEventListener(SimulaAdEventType.LOADED, () => ad.show());
ad.addAdEventListener(SimulaAdEventType.LOAD_FAILED, ({ error }) =>
  console.warn(error?.code, error?.message),
);

ad.load({ charId, charName });

// when done (e.g. component unmount):
ad.destroy();
```

Or use the hook (creates on mount, destroys on unmount):

```typescript
import { useInterstitialAd } from "@simula/ads-react-native";

function Screen() {
  const { isLoaded, load, show, error } = useInterstitialAd("home_interstitial");
  useEffect(() => { load(); }, [load]);
  return <Button title="Show" disabled={!isLoaded} onPress={show} />;
}
```

### Rewarded

```typescript
import { useRewardedAd } from "@simula/ads-react-native";

function Screen() {
  const { isLoaded, load, show, rewardToken } = useRewardedAd("reward_slot");
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (rewardToken !== undefined) grantReward(rewardToken); // null = idempotent re-verify
  }, [rewardToken]);
  return <Button title="Earn reward" disabled={!isLoaded} onPress={show} />;
}
```

Reward verification is durable and server-side: `REWARD_VERIFIED` may arrive long
after close — even after an app relaunch (the native queue drains on init). The
hook only reflects events while mounted; persist the token yourself if you need it
across launches.

### Events

All events share the canonical cross-platform names. Errors carry a stable `code`
(`SimulaAdError.code`):

| Event | When |
|---|---|
| `LOADED` / `LOAD_FAILED` | `load()` resolved / failed |
| `DISPLAYED` / `DISPLAY_FAILED` | `show()` presented / failed |
| `CLICKED` | CTA tapped |
| `CLOSED` | Ad dismissed (next ad auto-preloads) |
| `EARNED_REWARD` | (Rewarded) played past the threshold |
| `REWARD_VERIFIED` | (Rewarded) server verified; `rewardToken` provided |
| `REWARD_VERIFICATION_FAILED` | (Rewarded) verification failed (may retry in background) |

Error codes: `not_initialized`, `no_session`, `no_fill`, `not_ready`, `stale`,
`duplicate_request` (carries `retryInSeconds`), `already_showing`,
`no_presentation_context`, `network`, `unsupported_platform` (iOS), and
`verification_failed`.

## Privacy & Consent

Pass a `privacy` config to `SimulaProvider`/`SimulaAds.initialize`, or update it at
runtime. The native SDKs auto-read IAB CMP keys, merge explicit overrides, and
re-sync the session — the wrapper only forwards values.

```typescript
import { SimulaPrivacy } from "@simula/ads-react-native";

SimulaPrivacy.update({ tcString, gdprApplies: true });
SimulaPrivacy.clearConsent({ tcString: true });

// iOS App Tracking Transparency (requires NSUserTrackingUsageDescription in
// Info.plist). On Android this resolves "unavailable".
const status = await SimulaPrivacy.requestTrackingAuthorization();
```

## Performance Tips

- **Memoize `theme` objects.** An inline `theme={{...}}` is a new object every
  render; wrap it in `useMemo` so re-renders don't re-issue native show calls.
- **Keep one instance per surface.** Each declarative component (`MiniGameMenu`,
  etc.) is a singleton natively — mount only one at a time (a `__DEV__` warning
  fires otherwise).
- **`useMiniGamePreload` is deprecated** in favor of `initializeOnMount` (default)
  or `SimulaAds.initialize`; it now delegates to the same native init path.

## Theming Reference

### MiniGameTheme (Menu)

| Property | Type | Default | Description |
|---|---|---|---|
| `backgroundColor` | `string` | `#0B0B0F` | Menu background color |
| `headerColor` | `string` | — | Header section background |
| `borderColor` | `string` | `rgba(255, 255, 255, 0.06)` | Border/divider color |
| `titleFont` | `string` | `Inter, system-ui, sans-serif` | Title font family |
| `secondaryFont` | `string` | `Inter, system-ui, sans-serif` | Secondary text font family |
| `titleFontColor` | `string` | `#ffffff` | Title text color |
| `secondaryFontColor` | `string` | `rgba(255, 255, 255, 0.75)` | Secondary text color |
| `iconCornerRadius` | `number` | `18` | Game icon border radius (dp) |
| `accentColor` | `string` | `#3B82F6` | Accent color for interactive elements |
| `playableHeight` | `number \| string` | fullscreen | Game iframe height (number for px, string with % for percentage) |
| `playableBorderColor` | `string` | `#262626` | Bottom sheet border color |

### MiniGameButtonTheme

| Property | Type | Default | Description |
|---|---|---|---|
| `cornerRadius` | `number` | `8` | Button border radius (dp) |
| `backgroundColor` | `string` | `#3B82F6` | Button background color |
| `textColor` | `string` | `#FFFFFF` | Text color |
| `fontSize` | `number` | `14` | Font size (sp) |
| `fontFamily` | `string` | `Inter, system-ui, sans-serif` | Font family |
| `padding` | `number \| string` | `10dp x 20dp` | Padding (string or number) |
| `borderWidth` | `number` | `0` | Border width (dp) |
| `borderColor` | `string` | `transparent` | Border color |
| `pulsateColor` | `string` | _(uses backgroundColor)_ | Pulsate glow color |
| `badgeColor` | `string` | `#EF4444` | Notification badge color |

### MiniGameInvitationTheme

| Property | Type | Default | Description |
|---|---|---|---|
| `cornerRadius` | `number` | `16` | Container border radius (dp) |
| `backgroundColor` | `string` | `rgba(0, 0, 0, 0.65)` | Banner background color |
| `textColor` | `string` | `#FFFFFF` | Fallback text color for all text |
| `titleTextColor` | `string` | `#FFFFFF` | Title text color (overrides textColor) |
| `subTextColor` | `string` | `#FFFFFF` | Subtitle text color (overrides textColor) |
| `ctaTextColor` | `string` | `#FFFFFF` | CTA button text color (overrides textColor) |
| `ctaColor` | `string` | `#3B82F6` | CTA button background color |
| `charImageCornerRadius` | `number` | `12` | Character image corner radius (dp) |
| `charImageAnchor` | `"left" \| "right"` | `left` | Character image side |
| `borderWidth` | `number` | `1` | Border width (dp) |
| `borderColor` | `string` | `rgba(255, 255, 255, 0.1)` | Border color |
| `fontFamily` | `string` | `Inter, system-ui, sans-serif` | Font family |
| `fontSize` | `number` | `16` | Title font size (sp) |

### MiniGameInterstitialTheme

| Property | Type | Default | Description |
|---|---|---|---|
| `ctaCornerRadius` | `number` | `16` | CTA button border radius (dp) |
| `characterSize` | `number` | `120` | Character image size (dp, displayed as circle) |
| `titleTextColor` | `string` | `#FFFFFF` | Invitation text color |
| `titleFontSize` | `number` | `24` | Invitation text font size (sp) |
| `ctaTextColor` | `string` | `#FFFFFF` | CTA button text color |
| `ctaFontSize` | `number` | `16` | CTA button font size (sp) |
| `ctaColor` | `string` | `#3B82F6` | CTA button background color |
| `fontFamily` | `string` | `Inter, system-ui, sans-serif` | Font family |

### Animation Types (Invitation)

| Value | Description |
|---|---|
| `"auto"` | Automatically selects best animation (defaults to slideDown) |
| `"slideDown"` | Slides in from top |
| `"slideUp"` | Slides in from bottom |
| `"fadeIn"` | Fades in |
| `"none"` | No animation |

### Color Format Support

All color properties accept these formats:

- Hex: `#RGB`, `#RRGGBB`, `#RRGGBBAA`
- CSS: `rgb(255, 0, 0)`, `rgba(255, 0, 0, 0.5)`
- Named: `transparent`

## Documentation

For complete documentation including all props, theming options, and advanced usage, visit:

[Full Documentation](https://simula-ad.notion.site/Simula-x-Saylo-Minigame-SDK-2f4af70f6f0d804e805dcb2726f29079)

## Support

- Email: admin@simula.ad
- Website: [simula.ad](https://simula.ad)

## License

MIT
