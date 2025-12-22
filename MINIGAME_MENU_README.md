# MiniGameMenu Component

**Game Pigeon-style modal for displaying sponsored mini-games in React Native**

The `MiniGameMenu` component provides a beautiful, customizable modal interface for displaying and launching sponsored mini-games in React Native apps. Publishers can implement their own button to open this menu, giving users access to a curated selection of games.

> 🌐 **Based on**: [Simula Ad SDK for React Web](https://github.com/Simula-AI-SDK/simula-ad-sdk)

---

## 🚀 Quick Start

```tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { SimulaProvider, MiniGameMenu } from '@simula/ads-react-native';

function ChatApp() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View>
        <TouchableOpacity onPress={() => setMenuOpen(true)}>
          <Text>🎮 Play Games</Text>
        </TouchableOpacity>

        <MiniGameMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          charName="Luna"
          charID="luna-123"
          charImage="https://example.com/avatars/luna.png"
          delegateChar={true}
        />
      </View>
    </SimulaProvider>
  );
}
```

---

## 📋 Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isOpen` | `boolean` | ✅ | — | Controls modal visibility |
| `onClose` | `() => void` | ✅ | — | Callback when modal closes |
| `charName` | `string` | ✅ | — | Character name displayed in header |
| `charID` | `string` | ✅ | — | Character identifier (included in game iframe URL) |
| `charImage` | `string` | ✅ | — | Character avatar/image URL |
| `messages` | `Message[]` | ❌ | `[]` | Recent conversation history for contextual targeting |
| `charDesc` | `string` | ❌ | `undefined` | Character description |
| `maxGamesToShow` | `3 \| 6 \| 9` | ❌ | `6` | Number of games displayed per page |
| `theme` | `MiniGameTheme` | ❌ | See below | Visual styling configuration |
| `delegateChar` | `boolean` | ❌ | `true` | Whether Simula should display the AI character within the game iframe |

### `Message` Interface

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  llmPromise?: Promise<any>; // Optional: for trigger timing
}
```

### `MiniGameTheme` Interface

```typescript
interface MiniGameTheme {
  backgroundColor?: string;         // Optional - used for modal background, icon backgrounds, and character avatar
  headerColor?: string;             // Optional - used for header background color
  borderColor?: string;             // Optional - used for separator line and game card borders. Default: 'rgba(0, 0, 0, 0.08)'
  titleFont?: string;               // Default: 'Inter, system-ui, sans-serif'
  secondaryFont?: string;           // Default: 'Inter, system-ui, sans-serif'
  titleFontColor?: string;          // Default: '#1F2937' (gray-800)
  secondaryFontColor?: string;      // Default: '#6B7280' (gray-500)
  iconCornerRadius?: number;       // Default: 8 (border radius in pixels, 0 for square)
}
```

---

## 🎨 Theme Customization

### Default Theme

```typescript
const defaultTheme = {
  backgroundColor: undefined,       // Optional - defaults to white for modal, transparent for icons
  headerColor: undefined,          // Optional - no default color
  borderColor: 'rgba(0, 0, 0, 0.08)', // Subtle border color for separator and cards
  titleFont: 'Inter, system-ui, sans-serif',
  secondaryFont: 'Inter, system-ui, sans-serif',
  titleFontColor: '#1F2937',          // Gray-800
  secondaryFontColor: '#6B7280',     // Gray-500
  iconCornerRadius: 8,              // 8px border radius
};
// Note: Backdrop overlay is always 'rgba(0, 0, 0, 0.5)' and cannot be customized
```

### Custom Theme Example

```tsx
import { MiniGameMenu } from '@simula/ads-react-native';

<MiniGameMenu
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
  charName="Luna"
  charID="luna-123"
  charImage="https://example.com/avatars/luna.png"
  theme={{
    backgroundColor: '#F3F4F6',      // Light gray for modal background
    headerColor: '#E5E7EB',          // Lighter gray for header
    borderColor: 'rgba(0, 0, 0, 0.1)',
    titleFont: 'System',             // Use system font on mobile
    secondaryFont: 'System',
    titleFontColor: '#111827',
    secondaryFontColor: '#4B5563',
    iconCornerRadius: 12,            // More rounded icons
  }}
/>
```

---

## 📖 Usage Examples

### Minimal Implementation

```tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SimulaProvider, MiniGameMenu } from '@simula/ads-react-native';

function GameButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => setIsOpen(true)}
        >
          <Text>🎮 Play Games with Luna</Text>
        </TouchableOpacity>

        <MiniGameMenu
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          charName="Luna"
          charID="luna-123"
          charImage="https://example.com/avatars/luna.png"
        />
      </View>
    </SimulaProvider>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
});
```

### Full Implementation with All Props

```tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { SimulaProvider, MiniGameMenu, Message } from '@simula/ads-react-native';

function ChatInterface() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there! Want to play a game?' },
  ]);

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View>
        <TouchableOpacity onPress={() => setMenuOpen(true)}>
          <Text>🎮 Games</Text>
        </TouchableOpacity>

        <MiniGameMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          charName="Luna"
          charID="luna-123"
          charImage="https://example.com/avatars/luna.png"
          messages={messages}
          charDesc="A playful AI companion who loves games"
          maxGamesToShow={9}
          delegateChar={true}
          theme={{
            backgroundColor: '#FFFFFF',
            headerColor: '#F9FAFB',
            borderColor: 'rgba(0, 0, 0, 0.1)',
            titleFont: 'System',
            secondaryFont: 'System',
            titleFontColor: '#1F2937',
            secondaryFontColor: '#6B7280',
            iconCornerRadius: 12,
          }}
        />
      </View>
    </SimulaProvider>
  );
}
```

### Integration with Chat Interface

```tsx
import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SimulaProvider, MiniGameMenu, Message } from '@simula/ads-react-native';

function ChatApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSendMessage = (content: string) => {
    setMessages([...messages, { role: 'user', content }]);
    // ... handle AI response
  };

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View style={styles.container}>
        <ScrollView style={styles.messages}>
          {messages.map((msg, i) => (
            <View key={i} style={styles.message}>
              <Text>{msg.content}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.gameButton}
            onPress={() => setMenuOpen(true)}
          >
            <Text>🎮 Play Games</Text>
          </TouchableOpacity>
          {/* Other action buttons */}
        </View>

        <MiniGameMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          charName="Luna"
          charID="luna-123"
          charImage="https://example.com/avatars/luna.png"
          messages={messages}
          charDesc="Your AI gaming companion"
          delegateChar={true}
        />
      </View>
    </SimulaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messages: { flex: 1 },
  message: { padding: 12, marginBottom: 8 },
  actions: { flexDirection: 'row', padding: 12 },
  gameButton: { padding: 12, backgroundColor: '#3B82F6', borderRadius: 8 },
});
```

---

## 🎮 Game Selection & Launch

When a user taps on a game card:

1. The modal closes automatically
2. A full-screen modal with WebView opens displaying the selected game
3. The game is initialized with:
   - Game type/ID
   - Session ID (from `SimulaProvider`)
   - Character information (ID, name, image, description)
   - Recent conversation messages (if provided)
   - Character delegation setting (`delegateChar`)
   - Screen dimensions (automatically detected)

### Console Logging

The component logs game launches for debugging:

```javascript
console.log('Game launched:', { gameId: 'blackjack', charID: 'luna-123' });
console.log('Menu closed');
```

### Ad Display After Game

When a user closes a game:
- If an ad is available, it will automatically display in a full-screen modal
- The ad is fetched using the game's ad ID
- Users can close the ad to return to the main interface

---

## 🎯 Features

### Modal Behavior

- **Controlled Component**: Modal visibility controlled by `isOpen` prop
- **Backdrop Press**: Tapping the backdrop closes the modal (React Native Modal behavior)
- **Android Back Button**: Automatically handled by React Native Modal's `onRequestClose`
- **Smooth Animations**: Fade-in animation on open
- **Accessibility**: Full ARIA support and screen reader compatibility

### Game Grid

- **Layout**: 
  - Always displays 3 columns (responsive on mobile and tablet)
  - Cards automatically size to fit screen width
- **Pagination**: 
  - Shows 3, 6, or 9 games per page (configurable via `maxGamesToShow`)
  - Navigation arrows when more games available
  - Page indicator (e.g., "1 / 2")
- **Game Cards**:
  - Game icons with customizable corner radius
  - Game name below icon
  - Press animation (scale effect)
  - Automatic image loading with fallback emoji
  - Responsive sizing for mobile devices

### Character Display

- **Avatar Image**: 
  - Circular avatar in header (40x40px)
  - Automatic fallback to initials if image fails to load
- **Header Text**: 
  - "Play a Game with {charName}"
  - Customizable via theme
- **Character Delegation**: 
  - Set `delegateChar={true}` to have Simula display the AI character within the game iframe
  - Set `delegateChar={false}` if you want to handle character display yourself
  - When enabled, character info (name, image, description, messages) is passed to the game iframe

### Full-Screen Game WebView

- **Full Viewport Coverage**: Uses React Native Modal for full-screen display
- **Dark Overlay**: Semi-transparent backdrop (rgba(0, 0, 0, 0.8))
- **Close Button**: X button in top-right corner
- **Loading States**: Shows loading indicator while game initializes
- **Error Handling**: Displays error message if game fails to load
- **Session Tracking**: Includes `charID` and session ID in API request

---

## 🎨 Styling Details

### Modal Dimensions

- **Min Width**: 320px
- **Min Height**: 400px
- **Max Width**: 600px (centered on screen)
- **Max Height**: 90% of screen height
- **Responsive**: Automatically adjusts for mobile and tablet viewports

### Theme Colors Applied To

- **Background Color**: Modal background, game icon backgrounds, pagination buttons, character avatar background (optional - defaults to white for modal, transparent for icons)
- **Header Color**: Header background color (optional - no default, inherits from modal background)
- **Border Color**: Separator line and game card borders (optional - defaults to 'rgba(0, 0, 0, 0.08)')
- **Backdrop Overlay**: Always 'rgba(0, 0, 0, 0.5)' - cannot be customized
- **Title Font Color**: Character name, game names
- **Secondary Font Color**: Loading text, pagination text, error messages

### Icon Corner Radius

- **Number value**: Border radius in pixels (e.g., `8` for 8px, `12` for 12px)
- **Default**: `8` (8px border radius)
- **Set to `0`**: Square icons with no rounding
- **Large values**: For circular icons, use a value equal to half the icon size (e.g., `40` for 80px icons)

---

## ♿ Accessibility

- **Touch Targets**: All interactive elements meet minimum 44x44px touch target size
- **ARIA Labels**: 
  - Modal has `accessibilityViewIsModal={true}`
  - Buttons have descriptive `accessibilityLabel` attributes
  - Game cards have `accessibilityRole="button"` and `accessibilityLabel`
- **Screen Reader Support**: 
  - Full VoiceOver (iOS) and TalkBack (Android) support
  - Descriptive labels for all interactive elements

---

## 🔧 Advanced Usage

### Dynamic Character Switching

```tsx
function MultiCharacterApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentChar, setCurrentChar] = useState({
    name: "Luna",
    id: "luna-123",
    image: "https://example.com/avatars/luna.png",
  });

  return (
    <SimulaProvider apiKey="SIMULA_xxx">
      <View>
        <TouchableOpacity onPress={() => setMenuOpen(true)}>
          <Text>Play Games</Text>
        </TouchableOpacity>

        <MiniGameMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          charName={currentChar.name}
          charID={currentChar.id}
          charImage={currentChar.image}
        />
      </View>
    </SimulaProvider>
  );
}
```

### Disabling Character Delegation

If you want to handle character display yourself within the game, you can disable character delegation:

```tsx
<MiniGameMenu
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
  charName="Luna"
  charID="luna-123"
  charImage="https://example.com/avatars/luna.png"
  delegateChar={false}
/>
```

**Note**: When `delegateChar={false}`, the character information is still sent to the game iframe, but Simula will not display the character within the game UI. This allows you to create custom character interactions.

### With Conversation Context

Pass recent messages for better game targeting:

```tsx
<MiniGameMenu
  isOpen={menuOpen}
  onClose={() => setMenuOpen(false)}
  charName="Luna"
  charID="luna-123"
  charImage="https://example.com/avatars/luna.png"
  messages={[
    { role: 'user', content: 'I love card games!' },
    { role: 'assistant', content: 'Great! Want to play blackjack?' },
  ]}
  charDesc="A playful AI companion who loves games"
/>
```

---

## 🐛 Troubleshooting

### Image Not Loading

If the character image fails to load, the component automatically falls back to displaying the character's initials in a colored circle.

### Modal Not Closing

Ensure you're using the controlled component pattern correctly:
- `isOpen` prop controls visibility
- `onClose` callback updates the state that controls `isOpen`

```tsx
// ✅ Correct
const [isOpen, setIsOpen] = useState(false);
<MiniGameMenu isOpen={isOpen} onClose={() => setIsOpen(false)} />

// ❌ Incorrect - don't manage state inside the component
<MiniGameMenu isOpen={true} onClose={() => {}} />
```

### Games Not Displaying

1. **Check API Key**: Ensure `SimulaProvider` has a valid API key
2. **Check Network**: Verify internet connectivity
3. **Check Logs**: Look for errors in console
4. **Check Session**: Ensure `SimulaProvider` has successfully created a session

### WebView Not Loading

**iOS**: Ensure you've run `pod install` after installing dependencies.

**Android**: WebView is included by default. No additional setup needed.

### Session Invalid Error

If you see "Session invalid, cannot initialize minigame":
- Ensure `MiniGameMenu` is used within a `SimulaProvider`
- Check that the provider has successfully created a session
- Verify your API key is valid

---

## 📝 TypeScript Support

Full TypeScript support is included. Import types as needed:

```typescript
import { 
  MiniGameMenu, 
  MiniGameMenuProps, 
  MiniGameTheme,
  Message 
} from '@simula/ads-react-native';

// Use in your component
const props: MiniGameMenuProps = {
  isOpen: true,
  onClose: () => {},
  charName: "Luna",
  charID: "luna-123",
  charImage: "https://example.com/avatars/luna.png",
  messages: [],
  charDesc: "A playful AI companion",
  maxGamesToShow: 6,
  delegateChar: true,
  theme: {
    backgroundColor: '#FFFFFF',
    titleFontColor: '#1F2937',
  }
};
```

---

## 🔗 Related Components

- **`SimulaProvider`**: Required wrapper for session management (must wrap `MiniGameMenu`)
- **`InChatAdSlot`**: Display contextual ads in chat conversations

---

## 🔐 Privacy & Security

### Data Collection

The `MiniGameMenu` component collects:
- Character information (ID, name, image, description)
- Conversation messages (if provided)
- Session ID (from `SimulaProvider`)
- Screen dimensions (for game sizing)

### WebView Security

Game iframes are loaded in secure WebViews with:
- HTTPS-only content
- Origin validation
- No file access
- User-initiated media playback only

### App Store Compliance

The component is designed for App Store and Google Play compliance:
- No device fingerprinting
- No location tracking
- No personal information collection
- Consent management via `SimulaProvider`

---

## 📚 Additional Resources

- [Main SDK Documentation](./README.md)
- [Usage Guide](./USAGE_GUIDE.md)
- [Simula Dashboard](https://simula.ad)
- [Support](mailto:support@simula.ad)

---

## 💡 Best Practices

1. **Controlled State**: Always use controlled component pattern with `isOpen` and `onClose`
2. **Character Images**: Provide high-quality avatar images (recommended: 80x80px or larger, square aspect ratio)
3. **Theme Consistency**: Match your app's color scheme using the `theme` prop
4. **User Experience**: Place the game button in an easily accessible location
5. **Accessibility**: Ensure your trigger button has proper accessibility labels
6. **Session Management**: Always wrap `MiniGameMenu` in `SimulaProvider` for proper session handling
7. **Error Handling**: Monitor console logs for errors and handle them gracefully

---

## 🎮 Game Catalog

The game catalog is automatically fetched from Simula's API when the menu opens. Games include:
- Game ID and name
- Icon image URL
- Description
- Fallback emoji (if icon fails to load)

The catalog updates automatically, so new games will appear without app updates.

---

**Need help?** Contact [support@simula.ad](mailto:support@simula.ad) or visit [simula.ad](https://simula.ad)


