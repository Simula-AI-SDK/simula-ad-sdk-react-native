/**
 * GameIframe - Game iframe component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator, Dimensions, StatusBar, Linking, Platform, PanResponder, Animated, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { WebView } from 'react-native-webview';
import { Message } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { getMinigame, InitMinigameRequest } from '../../api/client';
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
   * Menu ID from catalog response for tracking
   */
  menuId?: string;
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
  /**
   * Callback when the game frame closes, provides final dimensions.
   * Used to pass height to the ad frame.
   */
  onDimensionsOnClose?: (height: number, isBottomSheet: boolean) => void;
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
  menuId,
  playableHeight,
  playableBorderColor = DEFAULT_PLAYABLE_BORDER_COLOR,
  onDimensionsOnClose,
  // Optional props for API compatibility (not currently used in implementation)
  // turnsBtwnMsgs, usePubCharApi, exampleCharMsgs are defined in interface but not used
}) => {
  const { sessionId } = useSimulaContext();
  
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));

  // State for drag-to-resize functionality
  const [resizedHeight, setResizedHeight] = useState<number | null>(null);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const currentHeightRef = useRef<number>(0);

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
   * - String with %: percentage of screen height (min 500px), >= 95% treated as full screen
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
      
      // Treat >= 95% as full screen (no bottom sheet UI)
      if (percentage >= 0.95) {
        return { containerHeight: dimensions.height, isBottomSheet: false };
      }
      
      calculatedHeight = Math.max(dimensions.height * percentage, MIN_PLAYABLE_HEIGHT);
    } else {
      // Invalid value, use full screen
      return { containerHeight: dimensions.height, isBottomSheet: false };
    }

    // Ensure we don't exceed screen height
    calculatedHeight = Math.min(calculatedHeight, dimensions.height);

    // Also check if pixel value >= 95% of screen height
    if (calculatedHeight >= dimensions.height * 0.95) {
      return { containerHeight: dimensions.height, isBottomSheet: false };
    }

    return { containerHeight: calculatedHeight, isBottomSheet: true };
  }, [playableHeight, dimensions.height]);

  // Effective height (user-resized or calculated)
  const effectiveHeight = resizedHeight ?? containerHeight;

  // Determine if we should hide status bar based on effective height
  // Hide when: not bottom sheet mode OR resized height >= 95% of screen
  const shouldHideStatusBar = !isBottomSheet || (resizedHeight !== null && resizedHeight >= dimensions.height * 0.95);

  // Hide status bar for full screen mode (imperative API works better on Android)
  useEffect(() => {
    if (shouldHideStatusBar) {
      StatusBar.setHidden(true, 'fade');
    } else {
      StatusBar.setHidden(false, 'fade');
    }
    return () => {
      // Restore status bar when component unmounts
      StatusBar.setHidden(false, 'fade');
    };
  }, [shouldHideStatusBar]);

  // Update animated value when containerHeight changes (initial load or reset)
  useEffect(() => {
    if (resizedHeight === null) {
      animatedHeight.setValue(containerHeight);
      currentHeightRef.current = containerHeight;
    }
  }, [containerHeight, resizedHeight, animatedHeight]);

  // Re-clamp resizedHeight if screen rotates and height exceeds new screen height
  useEffect(() => {
    if (resizedHeight !== null && resizedHeight > dimensions.height) {
      const clampedHeight = Math.min(resizedHeight, dimensions.height);
      setResizedHeight(clampedHeight);
      animatedHeight.setValue(clampedHeight);
    }
  }, [dimensions.height, resizedHeight, animatedHeight]);

  // Track the height used at drag start (separate from animatedHeight to avoid accessing private _value)
  const dragStartHeightRef = useRef<number>(0);

  // PanResponder for drag-to-resize (only active in bottom sheet mode)
  const resizePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        // Only respond to vertical gestures
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        // Store starting height when drag begins (use currentHeightRef which is kept in sync)
        dragStartHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        // Dragging up (negative dy) increases height
        // Dragging down (positive dy) decreases height
        const screenHeight = Dimensions.get('window').height;
        const newHeight = dragStartHeightRef.current - gestureState.dy;

        // Clamp between MIN_PLAYABLE_HEIGHT and screen height
        const clampedHeight = Math.max(
          MIN_PLAYABLE_HEIGHT,
          Math.min(newHeight, screenHeight)
        );

        animatedHeight.setValue(clampedHeight);
        currentHeightRef.current = clampedHeight;
      },
      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const screenHeight = Dimensions.get('window').height;
        const newHeight = dragStartHeightRef.current - gestureState.dy;
        const clampedHeight = Math.max(
          MIN_PLAYABLE_HEIGHT,
          Math.min(newHeight, screenHeight)
        );

        // If dragged close to full screen (>= 95%), snap to full screen
        if (clampedHeight >= screenHeight * 0.95) {
          Animated.spring(animatedHeight, {
            toValue: screenHeight,
            useNativeDriver: false,
            tension: 100,
            friction: 10,
          }).start(() => {
            currentHeightRef.current = screenHeight;
          });
          setResizedHeight(screenHeight);
        } else {
          currentHeightRef.current = clampedHeight;
          setResizedHeight(clampedHeight);
        }
      },
    })
  ).current;

  // Handle close with dimension callback
  const handleClose = useCallback(() => {
    onDimensionsOnClose?.(effectiveHeight, isBottomSheet);
    onClose();
  }, [effectiveHeight, isBottomSheet, onDimensionsOnClose, onClose]);

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
          menuId: menuId,
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
  }, [gameId, charID, charName, charImage, charDesc, messages, delegateChar, sessionId, menuId, dimensions.width, dimensions.height]);


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
      onRequestClose={handleClose}
      accessibilityViewIsModal={true}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <StatusBar
        hidden={shouldHideStatusBar}
        backgroundColor="transparent"
        barStyle="light-content"
        translucent={true}
      />
      <View
        style={[
          styles.overlay,
          isBottomSheet && styles.bottomSheetOverlay,
        ]}
      >
        {/* Use Animated.View for bottom sheet to enable smooth resize animation */}
        {isBottomSheet ? (
          <Animated.View
            style={[
              styles.container,
              styles.bottomSheetContainer,
              {
                height: animatedHeight,
                backgroundColor: playableBorderColor,
              },
            ]}
          >
            {/* Drag handle for resize - attach PanResponder */}
            <View
              style={[styles.dragHandleContainer, { backgroundColor: playableBorderColor }]}
              {...resizePanResponder.panHandlers}
            >
              <View style={styles.dragHandle} />
            </View>

            {/* Content area */}
            <View style={[styles.contentContainer, styles.bottomSheetContentContainer]}>
              {loading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#333333" />
                  <Text style={[styles.loadingText, styles.bottomSheetLoadingText]}>
                    Loading game...
                  </Text>
                </View>
              )}

              {error && (
                <View style={styles.errorContainer}>
                  <Text style={[styles.errorText, styles.bottomSheetErrorText]}>
                    {error}
                  </Text>
                </View>
              )}

              {!loading && !error && iframeUrl && webViewSource && (
                <WebView
                  source={webViewSource}
                  originWhitelist={buildOriginWhitelist()}
                  style={styles.webview}
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
                  <Text style={[styles.errorText, styles.bottomSheetErrorText]}>
                    No URL available.
                  </Text>
                </View>
              )}
            </View>

            <CloseButton
              onPress={handleClose}
              accessibilityLabel="Close game"
              accessibilityHint="Double tap to close the game and return to chat"
              style={styles.bottomSheetCloseButton}
            />
          </Animated.View>
        ) : (
          <View
            style={[styles.container, styles.fullScreenContainer]}
          >
            {/* Full screen mode content */}
            <View style={styles.contentContainer}>
              {loading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.loadingText}>
                    Loading game...
                  </Text>
                </View>
              )}

              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>
                    {error}
                  </Text>
                </View>
              )}

              {!loading && !error && iframeUrl && webViewSource && (
                <WebView
                  source={webViewSource}
                  originWhitelist={buildOriginWhitelist()}
                  style={styles.webview}
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
                  <Text style={styles.errorText}>
                    No URL available.
                  </Text>
                </View>
              )}
            </View>

            <CloseButton
              onPress={handleClose}
              accessibilityLabel="Close game"
              accessibilityHint="Double tap to close the game and return to chat"
            />
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'black',
  },
  bottomSheetOverlay: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  fullScreenContainer: {
    backgroundColor: 'black',
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
    backgroundColor: 'black',
  },
  bottomSheetContentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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

