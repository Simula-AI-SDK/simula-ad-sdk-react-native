/**
 * GameIframe - Game iframe component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator, Dimensions, StatusBar, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Message } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { getMinigame, InitMinigameRequest, fetchAdForMinigame } from '../../api/client';
import { buildOriginWhitelist, computeWebViewSource, isOriginAllowed, DEFAULT_ALLOWED_ORIGINS, ALLOWED_SPECIAL_SCHEMES } from '../../utils/webview-security';
import { CloseButton } from '../shared/CloseButton';

/** Default Instagram comments dark gray color */
const DEFAULT_PLAYABLE_BORDER_COLOR = '#262626';

interface GameIframeProps {
  gameId: string;
  charID: string;
  charName: string;
  charImage: string;
  messages?: Message[];
  delegateChar?: boolean;
  onClose: () => void;
  onAdIdReceived?: (adId: string) => void;
  turnsBtwnMsgs?: number;
  usePubCharApi?: string;
  charDesc?: string;
  exampleCharMsgs?: string;
  /**
   * Controls the height of the Mini Game iframe.
   * - Number: pixel value (e.g., 500 = 500px)
   * - String with %: percentage of screen height (e.g., "80%")
   * - "auto" or undefined: full screen (default behavior)
   * Minimum height is 500px.
   */
  playableHeight?: number | string;
  /**
   * Controls the background color of the curved border area above the playable
   * when playableHeight is not 100% (bottom sheet mode).
   * Default: '#262626' (Instagram comments dark gray)
   */
  playableBorderColor?: string;
}

const MIN_PLAYABLE_HEIGHT = 500;

export const GameIframe: React.FC<GameIframeProps> = ({
  gameId,
  charID,
  charName,
  charImage,
  messages = [],
  delegateChar = true,
  onClose,
  onAdIdReceived,
  charDesc,
  playableHeight,
  playableBorderColor = DEFAULT_PLAYABLE_BORDER_COLOR,
  // Optional props for API compatibility (not currently used in implementation)
  // turnsBtwnMsgs, usePubCharApi, exampleCharMsgs are defined in interface but not used
}) => {
  const { sessionId } = useSimulaContext();
  
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  // Track dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  /**
   * Calculate container height based on playableHeight prop
   * - Number: pixel value (min 500px)
   * - String with %: percentage of screen height (min 500px)
   * - "auto" or undefined: full screen
   */
  const { containerHeight, isBottomSheet } = useMemo(() => {
    // If no playableHeight or "auto", use full screen
    if (!playableHeight || playableHeight === 'auto') {
      return { containerHeight: dimensions.height, isBottomSheet: false };
    }

    let calculatedHeight: number;

    if (typeof playableHeight === 'number') {
      // Pixel value
      calculatedHeight = Math.max(playableHeight, MIN_PLAYABLE_HEIGHT);
    } else if (typeof playableHeight === 'string' && playableHeight.includes('%')) {
      // Percentage value
      const percentage = parseFloat(playableHeight) / 100;
      calculatedHeight = Math.max(dimensions.height * percentage, MIN_PLAYABLE_HEIGHT);
    } else {
      // Invalid value, use full screen
      return { containerHeight: dimensions.height, isBottomSheet: false };
    }

    // Ensure we don't exceed screen height
    calculatedHeight = Math.min(calculatedHeight, dimensions.height);

    return { containerHeight: calculatedHeight, isBottomSheet: true };
  }, [playableHeight, dimensions.height]);

  /**
   * Compute WebView source using shared utility
   */
  const webViewSource = useMemo(() => computeWebViewSource(iframeUrl), [iframeUrl]);

  // Fetch the minigame iframe URL
  useEffect(() => {
    // Block if sessionId is missing or invalid
    if (!sessionId) {
      setError('Session invalid, cannot initialize minigame');
      setLoading(false);
      return;
    }

    const initMinigame = async () => {
      try {
        setLoading(true);
        const params: InitMinigameRequest = {
          gameType: gameId,
          sessionId: sessionId,
          currencyMode: false,
          w: dimensions.width,
          h: dimensions.height,
          char_id: charID,
          char_name: charName,
          char_image: charImage,
          char_desc: charDesc,
          messages: messages,
          delegate_char: delegateChar,
        };
        
        const response = await getMinigame(params);
        
        if (response.adResponse?.iframe_url) {
          setIframeUrl(response.adResponse.iframe_url);
        } else {
          setError('No game URL received from server.');
        }
        
        // Callback with the ad_id for tracking
        if (onAdIdReceived && response.adResponse?.ad_id) {
          onAdIdReceived(response.adResponse.ad_id);
        }
      } catch (err) {
        setError('Failed to load game. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    initMinigame();
  }, [gameId, charID, charName, charImage, charDesc, messages, delegateChar, sessionId, dimensions.width, dimensions.height]);


  /**
   * Check if URL is a special/internal URL that should be allowed in WebView
   */
  const isSpecialUrl = useCallback((url: string): boolean => {
    if (!url) return true;
    for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
      if (url.startsWith(scheme)) {
        return true;
      }
    }
    return false;
  }, []);

  /**
   * Handle navigation - open external URLs in system browser
   */
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      const url = request.url;

      // Allow initial load of iframe URL
      if (iframeUrl && url === iframeUrl) {
        return true;
      }

      // Allow special/internal URLs (about:blank, about:srcdoc, data:, blob:)
      if (isSpecialUrl(url)) {
        return true;
      }

      // Block javascript: URLs for security
      if (url.startsWith("javascript:")) {
        return false;
      }

      // Check if origin is allowed - still open externally for better UX
      if (isOriginAllowed(url, DEFAULT_ALLOWED_ORIGINS)) {
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      // For any other navigation, open externally
      if (url && url !== iframeUrl) {
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      return true;
    },
    [iframeUrl, isSpecialUrl]
  );

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType={isBottomSheet ? 'slide' : 'fade'}
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <StatusBar hidden={!isBottomSheet} />
      <View
        style={[styles.overlay, isBottomSheet && styles.bottomSheetOverlay]}
      >
        <View
          style={[
            styles.container,
            isBottomSheet && {
              ...styles.bottomSheetContainer,
              height: containerHeight,
              backgroundColor: playableBorderColor,
            },
          ]}
        >
          {/* Drag handle indicator - only shown for bottom sheet */}
          {isBottomSheet && (
            <View style={[styles.dragHandleContainer, { backgroundColor: playableBorderColor }]}>
              <View style={styles.dragHandle} />
            </View>
          )}

          {/* Content area - captures touches to prevent backdrop from closing */}
          <View
            style={[
              styles.contentContainer,
              isBottomSheet && styles.bottomSheetContentContainer,
            ]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => false}
            onResponderTerminationRequest={() => true}
          >
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={isBottomSheet ? '#333333' : '#FFFFFF'} />
                <Text style={[styles.loadingText, isBottomSheet && styles.bottomSheetLoadingText]}>
                  Loading game...
                </Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={[styles.errorText, isBottomSheet && styles.bottomSheetErrorText]}>
                  {error}
                </Text>
              </View>
            )}

            {!loading && !error && iframeUrl && webViewSource && (
              <WebView
                source={webViewSource}
                originWhitelist={buildOriginWhitelist()}
                style={[
                  styles.webview,
                  {
                    width: dimensions.width,
                    height: isBottomSheet ? containerHeight - 24 : dimensions.height, // Account for drag handle
                  },
                ]}
                scrollEnabled={false}
                bounces={false}
                allowsFullscreen={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={true}
                mixedContentMode="never"
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  setError(`Failed to load game content: ${nativeEvent.description || 'Unknown error'}`);
                }}
                onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
              />
            )}

            {!loading && !error && !iframeUrl && (
              <View style={styles.errorContainer}>
                <Text style={[styles.errorText, isBottomSheet && styles.bottomSheetErrorText]}>
                  No URL available.
                </Text>
              </View>
            )}
          </View>

          {/* Touch blocker area - prevents WebView from capturing touches in close button area */}
          <View
            style={[styles.touchBlocker, isBottomSheet && styles.bottomSheetTouchBlocker]}
            pointerEvents="auto"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          />

          <CloseButton
            onPress={onClose}
            accessibilityLabel="Close game"
            accessibilityHint="Double tap to close the game and return to chat"
            style={isBottomSheet ? styles.bottomSheetCloseButton : undefined}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSheetOverlay: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  bottomSheetContainer: {
    flex: 0,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  dragHandleContainer: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  contentContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  bottomSheetContentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  touchBlocker: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 80,
    height: 80,
    zIndex: 9999,
    elevation: 9,
  },
  bottomSheetTouchBlocker: {
    top: 32, // Account for drag handle
  },
  bottomSheetCloseButton: {
    top: 32, // Account for drag handle
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 12,
  },
  bottomSheetLoadingText: {
    color: '#333333',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomSheetErrorText: {
    color: '#333333',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

