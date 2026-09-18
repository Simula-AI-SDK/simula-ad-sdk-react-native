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
import { SimulaAds } from "../ads/SimulaAds";
import {
  miniGameEmitter as emitter,
  warnIfDuplicateSurface,
} from "../internal/emitter";
import { isNonBlankString } from "../internal/identifiers";
import { surfaceVisibilityAction } from "../internal/surfaceVisibility";

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
  const { apiKey, hasPrivacyConsent, devMode, primaryUserID, initializationConfig } =
    useSimulaContext();
  const wasOpenRef = useRef(false);
  const shownForOpenCycleRef = useRef(false);
  const showGenerationRef = useRef(0);

  // Show / hide the native selector based on isOpen.
  useEffect(() => {
    if (!SimulaMiniGameModule) return;
    const action = surfaceVisibilityAction(
      isOpen,
      shownForOpenCycleRef.current,
      isNonBlankString(apiKey),
    );

    if (action === "show") {
      const generation = ++showGenerationRef.current;
      const show = async () => {
        await SimulaAds.initialize(initializationConfig);
        if (showGenerationRef.current !== generation) return;
        wasOpenRef.current = true;
        await SimulaMiniGameModule.showCharacterSelector({
          apiKey,
          hasPrivacyConsent,
          devMode,
          primaryUserID: primaryUserID ?? null,
          privacy: initializationConfig.privacy ?? null,
          telemetryEnabled: initializationConfig.telemetryEnabled ?? true,
          adContext: initializationConfig.adContext ?? null,
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
        });
      };
      show().catch((error: unknown) => {
        if (showGenerationRef.current === generation) {
          wasOpenRef.current = false;
          shownForOpenCycleRef.current = false;
        }
        const err = error as { message?: string };
        console.error(
          "[SimulaCharacterSelector] show failed:",
          err?.message || error,
        );
      });
      shownForOpenCycleRef.current = true;
    } else if (action === "hide") {
      showGenerationRef.current += 1;
      SimulaMiniGameModule.hideCharacterSelector();
      wasOpenRef.current = false;
      shownForOpenCycleRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, apiKey]);

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
          if (!wasOpenRef.current) return;
          // Selection closes the selector natively.
          showGenerationRef.current += 1;
          wasOpenRef.current = false;
          onSelectedRef.current(character);
        },
      ),
      emitter.addListener(
        "onCharacterSelectorPreview",
        (character: CharacterData) => {
          if (!wasOpenRef.current) return;
          onPreviewRef.current?.(character);
        },
      ),
      emitter.addListener("onCharacterSelectorClose", () => {
        if (!wasOpenRef.current) return;
        showGenerationRef.current += 1;
        wasOpenRef.current = false;
        onCloseRef.current();
      }),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);

  // If React unmounts while the selector is still open, tear it down.
  useEffect(() => {
    return () => {
      showGenerationRef.current += 1;
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
