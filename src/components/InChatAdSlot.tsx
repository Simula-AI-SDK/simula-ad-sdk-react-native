/**
 * InChatAdSlot - Ad slot component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform, Dimensions, DimensionValue, TouchableOpacity, Modal, Linking } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { InChatAdSlotProps, AdData } from "../types";
import { useSimulaContext } from "../context/SimulaProvider";
import { fetchAd, trackImpression } from "../api/client";
import { useViewability, useDebounce } from "../utils/viewability";
import { AD_DIMENSIONS } from "../types/theme";

/**
 * InChatAdSlot component
 * Renders contextual ads in chat/conversation interfaces
 */
export function InChatAdSlot({
  messages,
  theme,
  trigger,
  debounceMs = 0,
  charDesc,
  onImpression,
  onClick,
  onError,
}: InChatAdSlotProps): React.JSX.Element | null {
  const { apiKey, sessionId, hasUserConsent } = useSimulaContext();
  
  // Generate stable slot ID (matches original SDK)
  const slotId = useRef(`slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`).current;
  
  // State
  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get("window").width);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const hasFetched = useRef(false);
  const hasTrackedImpression = useRef(false);

  // Debounce messages if specified
  const debouncedMessages = useDebounce(messages, debounceMs);

  /**
   * Track screen dimension changes
   */
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setContainerWidth(window.width);
    });

    return () => subscription?.remove();
  }, []);

  /**
   * Fetch ad from API
   */
  const loadAd = useCallback(async () => {
    // Prevent multiple fetches (static behavior)
    if (hasFetched.current) {
      return;
    }

    // Check consent
    if (!hasUserConsent) {
      return;
    }

    // Validate messages
    if (!debouncedMessages || debouncedMessages.length === 0) {
      return;
    }

    hasFetched.current = true;
    setLoading(true);
    setError(null);

    try {
      // Wait for trigger if provided (e.g., LLM response)
      if (trigger) {
        await trigger;
      }

      // Calculate effective width for ad request
      const screenWidth = Dimensions.get("window").width;
      
      // Determine ad width based on theme or container
      let adWidth = screenWidth;
      if (theme?.width) {
        if (typeof theme.width === "number") {
          adWidth = Math.max(theme.width, AD_DIMENSIONS.minWidth);
        } else if (typeof theme.width === "string" && theme.width.includes("%")) {
          const percentage = parseFloat(theme.width) / 100;
          adWidth = Math.max(screenWidth * percentage, AD_DIMENSIONS.minWidth);
        }
      }

      // Update theme with calculated width (matches original SDK)
      const themeWithWidth = theme ? {
        ...theme,
        width: Math.floor(adWidth)
      } : undefined;

      // Fetch ad (matches original SDK signature)
      const result = await fetchAd(
        apiKey, 
        sessionId, 
        debouncedMessages, 
        themeWithWidth,
        slotId,
        charDesc
      );
      
      if (result.error) {
        console.warn("🚫 Ad fetch failed:", result.error);
        setError(new Error(result.error));
        if (onError) {
          onError(new Error(result.error));
        }
      } else if (result.ad) {
        setAd(result.ad);
        setIframeLoaded(false); // Reset when new ad is set
      } else {
        console.warn("🚫 No ad returned from API");
        setError(new Error("No ad available"));
        if (onError) {
          onError(new Error("No ad available"));
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to load ad");
      setError(error);
      
      if (onError) {
        onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey, sessionId, debouncedMessages, theme, trigger, hasUserConsent, onError]);

  /**
   * Handle viewability callback
   */
  const handleViewable = useCallback(() => {
    if (ad && !hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      
      // Track impression with API (matches original SDK)
      trackImpression(ad.id, apiKey);
      
      // Call user callback
      if (onImpression) {
        onImpression(ad);
      }
    }
  }, [ad, apiKey, onImpression]);

  /**
   * Viewability tracking
   */
  const { onLayout } = useViewability(
    handleViewable,
    ad !== null && !loading && !error
  );

  /**
   * Load ad when viewable
   */
  useEffect(() => {
    loadAd();
  }, [loadAd]);

  /**
   * Handle WebView messages (click tracking and external link clicks)
   */
  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === "click" && ad) {
          // Call user callback (click tracking handled by iframe)
          if (onClick) {
            onClick(ad);
          }
        } else if (data.type === "linkClick" || data.type === "windowOpen") {
          // Handle link clicks from injected JavaScript - open externally
          if (data.url) {
            Linking.openURL(data.url).catch((err) => {
              console.error("Failed to open URL:", err);
            });
          }
        }
      } catch (err) {
        console.error("Failed to parse WebView message:", err);
      }
    },
    [ad, onClick]
  );

  /**
   * Handle iframe loaded callback
   */
  const handleIframeLoad = useCallback(() => {
    // Iframe loaded - now we can expand dimensions
    setIframeLoaded(true);
  }, []);

  /**
   * Check if URL is a special/internal URL that should be allowed in WebView
   */
  const isSpecialUrl = useCallback((url: string): boolean => {
    if (!url) return true;
    
    // Allow special browser URLs
    if (url === 'about:blank' || 
        url === 'about:srcdoc' ||
        url.startsWith('data:') ||
        url.startsWith('javascript:') ||
        url.startsWith('blob:') ||
        url.startsWith('file:')) {
      return true;
    }
    
    return false;
  }, []);

  /**
   * Handle navigation - open URLs externally instead of in WebView
   */
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string; navigationType: string }) => {
      const url = request.url;
      
      // Allow initial load of iframe URL
      if (ad?.iframeUrl && url === ad.iframeUrl) {
        return true;
      }

      // Allow special/internal URLs (about:blank, about:srcdoc, data:, etc.)
      if (isSpecialUrl(url)) {
        return true;
      }

      // For any other navigation (clicks, redirects, etc.), open externally
      if (url && url !== ad?.iframeUrl) {
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false; // Prevent navigation in WebView
      }

      return true;
    },
    [ad, isSpecialUrl]
  );

  /**
   * Don't render if no consent
   */
  if (!hasUserConsent) {
    return null;
  }

  /**
   * Render error state (silently fail)
   */
  if (error) {
    // Silently fail - don't show error to end users
    return null;
  }

  // Calculate display width based on theme settings (matches original SDK)
  // Width is ALWAYS set, even before ad loads
  const displayWidth = (() => {
    if (!theme?.width || theme.width === "auto") {
      return "100%" as const;
    }
    if (typeof theme.width === "number") {
      return Math.max(theme.width, AD_DIMENSIONS.minWidth);
    }
    return theme.width as DimensionValue;
  })();

  // Match original SDK exactly:
  // - height: 0 before ad, 265px after iframe loads
  // - minWidth: 0 before ad, 320px after iframe loads
  // - width: always set (100% or theme width)
  // Only expand dimensions after iframe has loaded to prevent gray box flash
  const hasValidAd = ad && ad.id && ad.iframeUrl;
  const shouldExpand = hasValidAd && iframeLoaded;
  
  const containerStyle = {
    ...styles.container,
    height: shouldExpand ? AD_DIMENSIONS.height : 0,
    minWidth: shouldExpand ? AD_DIMENSIONS.minWidth : 0,
    width: displayWidth, // Always set, not conditional
    overflow: "hidden" as const,
  };

  /**
   * Render ad (matches original SDK approach)
   */
  return (
    <View 
      style={containerStyle}
      onLayout={(event) => {
        // Track viewability (only when ad and iframe are loaded)
        if (shouldExpand) {
          onLayout(event);
        }
        
        // Update container width for responsive behavior
        const { width } = event.nativeEvent.layout;
        if (width && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#999" />
          <Text style={styles.loadingText}>Loading ad...</Text>
        </View>
      )}
      
      {ad && ad.iframeUrl && (
        <>
          <WebView
            source={{ uri: ad.iframeUrl }}
            style={styles.webview}
            scrollEnabled={false}
            bounces={false}
            onMessage={handleWebViewMessage}
            onLoad={handleIframeLoad}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onNavigationStateChange={(navState) => {
              // Intercept navigation changes - open externally if not the initial iframe URL or special URL
              if (navState.url && 
                  navState.url !== ad.iframeUrl && 
                  !isSpecialUrl(navState.url)) {
                Linking.openURL(navState.url).catch((err) => {
                  console.error("Failed to open URL:", err);
                });
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={["*"]}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            // Inject JavaScript to intercept link clicks and open them externally
            injectedJavaScript={`
              (function() {
                // Intercept all link clicks
                document.addEventListener('click', function(e) {
                  var target = e.target;
                  while (target && target.tagName !== 'A') {
                    target = target.parentElement;
                  }
                  if (target && target.href) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'linkClick',
                      url: target.href
                    }));
                    return false;
                  }
                }, true);
                
                // Also intercept window.open calls
                var originalOpen = window.open;
                window.open = function(url, name, features) {
                  if (url && !url.startsWith('javascript:')) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'windowOpen',
                      url: url
                    }));
                    return null;
                  }
                  return originalOpen.apply(window, arguments);
                };
              })();
              true; // Required for injected JavaScript
            `}
            // iOS specific
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            // Android specific
            overScrollMode="never"
          />
          <TouchableOpacity
            style={styles.infoButton}
            onPress={(e) => {
              e.stopPropagation();
              setShowInfoModal(true);
            }}
            accessibilityLabel="Content information"
            accessibilityRole="button"
          >
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>i</Text>
            </View>
          </TouchableOpacity>
          
          <Modal
            visible={showInfoModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowInfoModal(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowInfoModal(false)}
            >
              <TouchableOpacity
                style={styles.modalContent}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <TouchableOpacity
                  style={styles.modalClose}
                  onPress={() => setShowInfoModal(false)}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </TouchableOpacity>
                <Text style={styles.modalText}>
                  Powered by{' '}
                  <Text
                    style={styles.modalLink}
                    onPress={() => {
                      Linking.openURL("https://simula.ad").catch((err) => {
                        console.error("Failed to open URL:", err);
                      });
                    }}
                  >
                    Simula
                  </Text>
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </>
      )}
    </View>
  );
}

/**
 * Styles
 */
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    overflow: "hidden",
    marginVertical: 8,
    minWidth: AD_DIMENSIONS.minWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: AD_DIMENSIONS.height,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#999",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  infoButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
  },
  infoIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "currentColor",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  infoIconText: {
    fontSize: 10,
    fontFamily: "serif",
    color: "rgba(0, 0, 0, 0.6)",
    lineHeight: 14,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 20,
    minWidth: 200,
    maxWidth: "80%",
    alignItems: "center",
  },
  modalClose: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 24,
    color: "#666",
    lineHeight: 24,
  },
  modalText: {
    fontSize: 14,
    color: "#333",
    textAlign: "center",
  },
  modalLink: {
    color: "#007AFF",
    textDecorationLine: "underline",
  },
});

