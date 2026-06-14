# Native Ads, Character Selector & Ad Targeting

Added in `@simula/ads-react-native` 1.3.0 (matches native SDK 1.1.0). These wrap the
native SDKs' newest surfaces; everything renders natively (Swift / Kotlin Compose).

## Ad targeting context

Native ads are contextually targeted. Provide a `SimulaAdContext` on the provider (or
`SimulaAds.initialize`) and update it at runtime as the feed changes.

```tsx
<SimulaProvider
  apiKey="pub_..."
  adContext={{
    searchTerm: 'running shoes',
    category: 'sports',
    tags: ['nba', 'finals'],     // backend keeps ≤10
    customContext: { tier: 'pro' }, // arbitrary JSON, ≤10 entries
    nsfw: false,
  }}
>
  {/* ... */}
</SimulaProvider>;

// Runtime replacement (full replace, not a merge):
import { SimulaAds } from '@simula/ads-react-native';
SimulaAds.updateContext({ category: 'news' });
SimulaAds.updateContext(null); // clear
```

`SimulaAdContext` fields: `searchTerm`, `tags`, `category`, `title`, `description`,
`userProfile`, `userEmail`, `customContext`, `nsfw`.

## `<NativeAd>` — inline feed card

An inline, auto-height ad card. It grows to its creative and **collapses to zero height
on a no-fill or error** — so don't set a fixed height; only width/margins. Designed to
live in a `FlatList`/`ScrollView` feed.

```tsx
import { NativeAd } from '@simula/ads-react-native';

<NativeAd
  adUnitId="feed_native"
  position={index}            // stable per slot → cached & reused on recycle
  theme="system"              // "dark" | "light" | "system"
  style={{ marginVertical: 12 }}
  onImpression={(d) => console.log('impression', d.impressionId)}
  onError={(e) => console.log('native ad error', e.code)}
/>;
```

- **Must be used under a `<SimulaProvider>`** (or after `SimulaAds.initialize`) — it
  shares the warmed session, so a feed of N cards uses **one** session, not N.
- Impression fires once at the viewability threshold (≥50% visible ≥1s), handled
  natively. A no-fill does **not** call `onError`.
- Width defaults to fill the parent (min 300pt); height is managed for you.

### Preloading

Warm an ad before its slot scrolls in, then hand the id to a slot:

```tsx
const id = await SimulaAds.preloadNativeAd({ adUnitId: 'feed_native', position: 8, theme: 'system' });
// later, in the row:
<NativeAd adUnitId="feed_native" position={8} preloadedAdId={id ?? undefined} />;

SimulaAds.invalidateNativeAd({ adUnitId: 'feed_native', position: 8 }); // force refresh
SimulaAds.invalidateNativeAds();                                        // clear all
SimulaAds.destroyPreloadedAd(id);                                       // release unused
```

### Performance notes

- Pass a **stable `adUnitId` + `position`** per slot so the native per-slot cache reuses
  the same serve when a row recycles (no duplicate request/impression).
- On the legacy RN architecture the card's height round-trips native→JS→native once per
  size change. The native side smooths this (provisional height + thresholding); keep
  `FlatList` `windowSize`/`removeClippedSubviews` reasonable for long feeds.

## `<CharacterSelector>` — "pick your partner" modal

A full-screen modal that lets the user pick a companion character (host roster +
backend backfill + bundled fallbacks). Selecting a card previews it; the CTA confirms
and closes the selector.

```tsx
import { CharacterSelector } from '@simula/ads-react-native';

<CharacterSelector
  isOpen={open}
  onClose={() => setOpen(false)}
  onCharacterPreview={(c) => console.log('preview', c.name)}
  onCharacterSelected={(c) => {
    setOpen(false);          // selection closes the selector
    launchGameWith(c);       // c: { id, name, imageUrl, description }
  }}
  // characters={[...]}       // optional host roster; omit for bundled fallbacks
  theme={{ accentColor: '#3D9A66' }}
/>;
```

`onClose` / `onCharacterSelected` should set `isOpen` to false (controlled component,
same contract as `MiniGameMenu`).
