/**
 * InChatAdSlot - Ad slot component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform, Dimensions, DimensionValue, TouchableOpacity, Modal, Linking } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { InChatAdSlotProps, AdData } from "../types";
import { useSimulaContext } from "../context/SimulaProvider";
import { fetchAd, trackImpression } from "../api/client";
import { useViewability, useDebounce } from "../utils/viewability";
import { AD_DIMENSIONS } from "../types/theme";
import {
  validateAdUrl,
  buildOriginWhitelist,
  isOriginAllowed,
  logSecurityEvent,
  DEFAULT_ALLOWED_ORIGINS,
  ALLOWED_SPECIAL_SCHEMES,
  computeWebViewSource
} from "../utils/webview-security";
import { CloseButton } from "./shared/CloseButton";

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
  const { apiKey, sessionId, hasPrivacyConsent } = useSimulaContext();
  
  // Generate stable slot ID (matches original SDK)
  const slotId = useRef(`slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`).current;
  
  // State
  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get("window").width);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const hasTrackedImpression = useRef(false);

  /**
   * Compute allowed origins for WebView
   * Memoized to avoid recalculation on every render
   */
  const originWhitelist = useMemo(() => {
    return buildOriginWhitelist(ad?.iframeUrl);
  }, [ad?.iframeUrl]);

  /**
   * Compute WebView source using shared utility
   */
  const webViewSource = useMemo(() => computeWebViewSource(ad?.iframeUrl), [ad?.iframeUrl]);

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
    if (!hasPrivacyConsent) {
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
        // Validate ad URL for security compliance before rendering
        const validation = validateAdUrl(result.ad.iframeUrl);
        if (!validation.isValid) {
          console.warn("🚫 Ad blocked for security:", validation.error);
          logSecurityEvent("origin_blocked", {
            iframeUrl: result.ad.iframeUrl,
            reason: validation.error,
          });
          setSecurityError(validation.error || "Ad URL failed security validation");
          setError(new Error("Ad blocked for security reasons"));
          if (onError) {
            onError(new Error("Ad blocked for security reasons"));
          }
          return;
        }
        
        logSecurityEvent("url_validated", {
          iframeUrl: result.ad.iframeUrl,
        });
        setSecurityError(null);
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
  }, [apiKey, sessionId, debouncedMessages, theme, trigger, hasPrivacyConsent, onError]);

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
          // Don't try to open data:, blob:, or about: URLs - they can't be opened externally
          const url = data.url;
          if (url && 
              !url.startsWith("data:") && 
              !url.startsWith("blob:") && 
              !url.startsWith("about:") &&
              !url.startsWith("javascript:")) {
            Linking.openURL(url).catch((err) => {
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
   * Uses security utilities for consistent validation
   */
  const isSpecialUrl = useCallback((url: string): boolean => {
    if (!url) return true;
    
    // Allow special browser URLs (about:blank, about:srcdoc, data:, blob:)
    for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
      if (url.startsWith(scheme)) {
        return true;
      }
    }
    
    // Note: javascript: and file: URLs are intentionally NOT allowed for security
    return false;
  }, []);

  /**
   * Handle navigation - validate origins and open external URLs in browser
   * Implements AdTech sandboxing by restricting allowed origins
   */
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string; navigationType: string }) => {
      const url = request.url;
      
      // Allow initial load of iframe URL (already validated)
      // For data URLs loaded via source.html, the initial URL will be about:blank or about:srcdoc
      if (ad?.iframeUrl && url === ad.iframeUrl) {
        return true;
      }

      // Allow special/internal URLs (about:blank, about:srcdoc, data:, blob:)
      // This is critical for data URLs loaded via source.html
      if (isSpecialUrl(url)) {
        return true;
      }

      // Block javascript: URLs for security (XSS prevention)
      if (url.startsWith("javascript:")) {
        logSecurityEvent("navigation_blocked", {
          url,
          reason: "javascript: URLs are blocked for security",
        });
        return false;
      }

      // Check if origin is allowed for in-WebView navigation
      if (isOriginAllowed(url, DEFAULT_ALLOWED_ORIGINS)) {
        // Allowed origin - but still open externally for user experience
        // (ads should not navigate away from the app within WebView)
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      // For any other navigation, log and open externally
      if (url && url !== ad?.iframeUrl) {
        logSecurityEvent("navigation_blocked", {
          url,
          reason: "Opening external URL in system browser",
        });
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
  if (!hasPrivacyConsent) {
    return null;
  }

  /**
   * Render error state (silently fail)
   * Includes both API errors and security validation errors
   */
  if (error || securityError) {
    // Silently fail - don't show error to end users
    // Security errors are logged for debugging
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
      
      {ad && ad.iframeUrl && webViewSource && (
        <>
          <WebView
            source={webViewSource}
            style={styles.webview}
            scrollEnabled={false}
            bounces={false}
            onMessage={handleWebViewMessage}
            onLoad={handleIframeLoad}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onNavigationStateChange={(navState) => {
              // Intercept navigation changes - open externally if not the initial iframe URL or special URL
              // isSpecialUrl covers data:, blob:, about: schemes which can't be opened externally
              const url = navState.url;
              if (url && url !== ad.iframeUrl && !isSpecialUrl(url)) {
                logSecurityEvent("navigation_blocked", {
                  url: url,
                  reason: "Navigation state change intercepted",
                });
                Linking.openURL(url).catch((err) => {
                  console.error("Failed to open URL:", err);
                });
              }
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              logSecurityEvent("security_error", {
                description: nativeEvent.description,
                code: nativeEvent.code,
              });
            }}
            // Core functionality
            javaScriptEnabled={true}
            domStorageEnabled={true}
            
            // SECURITY: Origin whitelist - restrict to HTTPS and special schemes
            // Actual origin validation happens in onShouldStartLoadWithRequest
            originWhitelist={originWhitelist}
            
            // SECURITY: Never allow mixed content (HTTP in HTTPS context)
            // Required for App Store and Google Play compliance
            mixedContentMode="never"
            
            // Media playback settings
            allowsInlineMediaPlayback={true}
            // SECURITY: Require user interaction for media playback
            // Required for App Store and Google Play compliance
            mediaPlaybackRequiresUserAction={true}
            
            // SECURITY: Disable potentially dangerous features
            javaScriptCanOpenWindowsAutomatically={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            
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
            // Android: Enable safe browsing
            {...Platform.select({
              android: {
                setSafeBrowsingEnabled: true,
              },
              ios: {},
            })}
          />
          {/* Ad disclosure label - required for App Store/Play Store compliance */}
          <View style={styles.adLabelContainer}>
            <Text 
              style={styles.adLabel}
              accessibilityLabel="This is an advertisement"
              accessibilityRole="text"
            >
              Ad
            </Text>
          </View>
          
          <TouchableOpacity
            style={styles.infoButton}
            onPress={(e) => {
              e.stopPropagation();
              setShowInfoModal(true);
            }}
            accessibilityLabel="Advertisement information. Tap for details about this ad."
            accessibilityRole="button"
            accessibilityHint="Opens dialog with advertisement details"
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
            accessibilityViewIsModal={true}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowInfoModal(false)}
              accessibilityLabel="Close advertisement information dialog"
            >
              <TouchableOpacity
                style={styles.modalContent}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                accessibilityRole="alert"
                accessibilityLabel="Advertisement information"
              >
                <CloseButton
                  onPress={() => setShowInfoModal(false)}
                  accessibilityLabel="Close dialog"
                  accessibilityHint="Double tap to close the advertisement information"
                />
                <Text style={styles.modalTitle}>Advertisement</Text>
                <Text style={styles.modalText}>
                  This is a contextual advertisement based on the conversation content.
                  No personal data is collected.
                </Text>
                <Text style={styles.modalText}>
                  Powered by{' '}
                  <Text
                    style={styles.modalLink}
                    onPress={() => {
                      Linking.openURL("https://simula.ad").catch((err) => {
                        console.error("Failed to open URL:", err);
                      });
                    }}
                    accessibilityRole="link"
                    accessibilityLabel="Visit Simula website"
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
  // Ad disclosure label - required for App Store/Play Store compliance
  adLabelContainer: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
  },
  infoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  infoIconText: {
    fontSize: 11,
    fontFamily: "serif",
    fontWeight: "600",
    color: "rgba(0, 0, 0, 0.6)",
    lineHeight: 16,
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
    borderRadius: 12,
    padding: 24,
    minWidth: 280,
    maxWidth: "85%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },
  modalLink: {
    color: "#007AFF",
    textDecorationLine: "underline",
  },
});


