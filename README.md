# Simula MiniGame SDK for React Native

A React Native SDK for integrating sponsored mini-games into AI chat applications.

## Key Features

- Sponsored mini-games that users can play with AI characters
- Easy integration with existing React Native chat apps
- Privacy-first design with consent management
- App Store and Play Store compliant

## Installation

```bash
npm install @simula/ads-react-native react-native-webview
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

## Documentation

For complete documentation including all props, theming options, and advanced usage, visit:

[Full Documentation](https://simula-ad.notion.site/Simula-x-Saylo-Minigame-SDK-2f4af70f6f0d804e805dcb2726f29079)

## Support

- Email: admin@simula.ad
- Website: [simula.ad](https://simula.ad)

## License

MIT
