# How to Use Simula Ad SDK in Your React Native App

## Step 1: Build the SDK

First, build the SDK to generate the JavaScript files:

```bash
npm run build
```

This will create a `dist/` folder with compiled JavaScript and TypeScript definitions.

## Step 2: Install in Your React Native App

You have **three options** to use this SDK in your app:

### Option A: Local Development (Recommended for Testing)

Link the SDK directly from your local path:

```bash
# In your React Native app directory
npm install ../simula-ad-sdk-react-native --legacy-peer-deps
```

Or use `yarn`:
```bash
yarn add ../simula-ad-sdk-react-native
```

### Option B: npm Link (For Development)

```bash
# In the SDK directory
npm link

# In your React Native app directory
npm link @simula/ads-react-native
```

### Option C: Publish to npm (For Production)

```bash
# Build first
npm run build

# Publish to npm
npm publish --access public
```

Then install in your app:
```bash
npm install @simula/ads-react-native react-native-webview
```

## Step 3: Install Required Dependencies in Your App

Your React Native app needs these peer dependencies:

```bash
npm install react-native-webview
# or
yarn add react-native-webview
```

### iOS Setup

```bash
cd ios && pod install && cd ..
```

## Step 4: Use in Your React Native App

### Basic Example

```typescript
import React, { useState } from 'react';
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { SimulaProvider, InChatAdSlot } from '@simula/ads-react-native';

function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Chat App</Text>
      <ChatInterface />
    </View>
  );
}

function ChatInterface() {
  const [messages, setMessages] = useState([
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there! How can I help?' },
  ]);

  return (
    <SimulaProvider 
      apiKey="SIMULA_xxx"  // Get from https://simula.ad
      hasUserConsent={true}  // Set based on your consent flow
    >
      <ScrollView style={styles.chat}>
        {messages.map((msg, i) => (
          <View key={i} style={styles.message}>
            <Text style={styles.role}>{msg.role}:</Text>
            <Text>{msg.content}</Text>
            
            {/* Show ad after assistant messages */}
            {msg.role === 'assistant' && (
              <InChatAdSlot
                key={`ad-${i}`}
                messages={messages.slice(0, i + 1)}
                theme={{ 
                  mode: 'light', 
                  accent: ['blue', 'image'],  // A/B testing
                  width: '100%' 
                }}
                onImpression={(ad) => {
                  console.log('Ad impression:', ad.id);
                }}
                onClick={(ad) => {
                  console.log('Ad clicked:', ad.id);
                }}
                onError={(error) => {
                  console.error('Ad error:', error);
                }}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </SimulaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  chat: { flex: 1 },
  message: { marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5' },
  role: { fontWeight: 'bold', marginBottom: 4 },
});
```

### With OpenAI Integration

```typescript
import React, { useState } from 'react';
import { View, TextInput, Button, ScrollView, StyleSheet } from 'react-native';
import { SimulaProvider, InChatAdSlot } from '@simula/ads-react-native';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const llmPromise = client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: newMessages,
      });

      const res = await llmPromise;
      const reply = res.choices[0].message;

      // Store the promise with the message for trigger prop
      setMessages((prev) => [...prev, { ...reply, llmPromise }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SimulaProvider apiKey="SIMULA_xxx" hasUserConsent={true}>
      <View style={styles.container}>
        <ScrollView style={styles.messages}>
          {messages.map((msg, i) => (
            <View key={i} style={styles.message}>
              <Text style={styles.role}>{msg.role}:</Text>
              <Text>{msg.content}</Text>

              {msg.role === 'assistant' && (
                <InChatAdSlot
                  key={`ad-${i}`}
                  trigger={msg.llmPromise}  // Wait for LLM response
                  messages={messages.slice(0, i + 1)}
                  theme={{ 
                    mode: 'auto',
                    accent: ['blue', 'green', 'image'],
                    width: '100%'
                  }}
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
            placeholder="Type a message..."
          />
          <Button title="Send" onPress={sendMessage} disabled={loading} />
        </View>
      </View>
    </SimulaProvider>
  );
}
```

### With Consent Management

```typescript
import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { SimulaProvider, InChatAdSlot, getConsentMessage } from '@simula/ads-react-native';

function AppWithConsent() {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // Show consent dialog on mount
    Alert.alert(
      'Privacy Notice',
      getConsentMessage(),
      [
        {
          text: 'Decline',
          onPress: () => setHasConsent(false),
          style: 'cancel',
        },
        {
          text: 'Accept',
          onPress: () => setHasConsent(true),
        },
      ]
    );
  }, []);

  return (
    <SimulaProvider
      apiKey="SIMULA_xxx"
      hasUserConsent={hasConsent}
      onConsentRequired={() => {
        // Re-show consent if needed
        Alert.alert('Consent Required', getConsentMessage());
      }}
    >
      <YourChatComponent />
    </SimulaProvider>
  );
}
```

## Step 5: Get Your API Key

1. Visit https://simula.ad
2. Sign up or log in
3. Get your API key from the dashboard
4. Replace `"SIMULA_xxx"` with your actual key

## Step 6: Configure for iOS/Android

### iOS (Info.plist)

No special permissions needed for basic ad display.

### Android (AndroidManifest.xml)

Internet permission is usually already present:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## API Reference

### SimulaProvider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiKey` | `string` | ✅ | Your Simula API key |
| `children` | `ReactNode` | ✅ | Your app components |
| `devMode` | `boolean` | ❌ | Development mode flag |
| `primaryUserID` | `string` | ❌ | Primary user ID for tracking |
| `hasUserConsent` | `boolean` | ❌ | Initial consent state |
| `onConsentRequired` | `() => void` | ❌ | Callback when consent needed |

### InChatAdSlot Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `messages` | `Message[]` | ✅ | Conversation messages |
| `theme` | `SimulaTheme` | ❌ | Theme configuration |
| `trigger` | `Promise<any>` | ❌ | Wait for this promise before fetching |
| `debounceMs` | `number` | ❌ | Debounce delay (default: 0) |
| `charDesc` | `string` | ❌ | Character description |
| `onImpression` | `(ad: AdData) => void` | ❌ | Impression callback |
| `onClick` | `(ad: AdData) => void` | ❌ | Click callback |
| `onError` | `(error: Error) => void` | ❌ | Error callback |

## Troubleshooting

### Build Errors

If you get TypeScript errors:
```bash
npm install --legacy-peer-deps
npm run build
```

### Module Not Found

Make sure you've installed `react-native-webview`:
```bash
npm install react-native-webview
cd ios && pod install
```

### Ads Not Showing

1. Check API key is valid
2. Verify `hasUserConsent={true}`
3. Ensure messages array has content
4. Check network connectivity
5. Look for errors in console

### WebView Issues

**iOS:** Run `pod install` after installing dependencies.

**Android:** WebView is included by default.

## Next Steps

- Test with your API key
- Customize themes
- Implement consent flow
- Track impressions/clicks
- Deploy to App Store/Play Store

For more details, see the [README.md](./README.md).

