/**
 * CharacterSelector — native wrapper for the SDK's full-screen character picker.
 *
 * Delegates to the native Kotlin/Swift SDKs, which render a 2-column grid (host
 * roster + backend backfill + bundled fallbacks), handle selection/preview, and
 * fetch using the provider's warm session. Selecting a card previews it; tapping the
 * CTA confirms (`onCharacterSelected`) and closes the selector.
 */
import { useEffect, useRef } from "react";
import { NativeModules } from "react-native";
import { CharacterSelectorProps, CharacterData } from "../types";
import { useSimulaContext } from "../context/SimulaProvider";
import {
  miniGameEmitter as emitter,
  warnIfDuplicateSurface,
} from "../internal/emitter";

const { SimulaMiniGameModule } = NativeModules;

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  isOpen,
  onClose,
  onCharacterSelected,
  onCharacterPreview,
  title,
  ctaText,
  characters,
  theme = {},
}) => {
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID } =
    useSimulaContext();
  const wasOpenRef = useRef(false);

  // Show / hide the native selector based on isOpen.
  useEffect(() => {
    if (!SimulaMiniGameModule) return;

    if (isOpen && !wasOpenRef.current) {
      SimulaMiniGameModule.showCharacterSelector({
        apiKey,
        hasPrivacyConsent,
        devMode,
        primaryUserID: primaryUserID ?? null,
        title: title ?? null,
        ctaText: ctaText ?? null,
        characters:
          characters?.map((c) => ({
            id: c.id,
            name: c.name,
            imageUrl: c.imageUrl,
            description: c.description,
          })) ?? null,
        theme,
      }).catch((error: unknown) => {
        const err = error as { message?: string };
        console.error(
          "[SimulaCharacterSelector] show failed:",
          err?.message || error,
        );
      });
    } else if (!isOpen && wasOpenRef.current) {
      SimulaMiniGameModule.hideCharacterSelector();
    }

    wasOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep the latest callbacks in refs so the native listeners subscribe once.
  const onCloseRef = useRef(onClose);
  const onSelectedRef = useRef(onCharacterSelected);
  const onPreviewRef = useRef(onCharacterPreview);
  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectedRef.current = onCharacterSelected;
    onPreviewRef.current = onCharacterPreview;
  });

  // Listen for native select / preview / close (subscribe once).
  useEffect(() => {
    if (!emitter) return;
    const subscriptions = [
      emitter.addListener(
        "onCharacterSelectorSelect",
        (character: CharacterData) => {
          // Selection closes the selector natively.
          wasOpenRef.current = false;
          onSelectedRef.current(character);
        },
      ),
      emitter.addListener(
        "onCharacterSelectorPreview",
        (character: CharacterData) => {
          onPreviewRef.current?.(character);
        },
      ),
      emitter.addListener("onCharacterSelectorClose", () => {
        wasOpenRef.current = false;
        onCloseRef.current();
      }),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);

  // If React unmounts while the selector is still open, tear it down.
  useEffect(() => {
    return () => {
      if (wasOpenRef.current) {
        SimulaMiniGameModule?.hideCharacterSelector();
        wasOpenRef.current = false;
      }
    };
  }, []);

  // Dev-only guard: this surface is a singleton natively.
  useEffect(() => warnIfDuplicateSurface("CharacterSelector"), []);

  return null;
};
