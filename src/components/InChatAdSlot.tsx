/**
 * InChatAdSlot - Ad slot component for React Native
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
  
  const slotId = useRef(`slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`).current;

  const [ad, setAd] = useState<AdData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get("window").width);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const hasTrackedImpression = useRef(false);

  const originWhitelist = useMemo(() => {
    return buildOriginWhitelist(ad?.iframeUrl);
  }, [ad?.iframeUrl]);

  const webViewSource = useMemo(() => computeWebViewSource(ad?.iframeUrl), [ad?.iframeUrl]);

  const debouncedMessages = useDebounce(messages, debounceMs);

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setContainerWidth(window.width);
    });

    return () => subscription?.remove();
  }, []);

  const loadAd = useCallback(async () => {
    if (hasFetched.current) {
      return;
    }

    if (!hasPrivacyConsent) {
      return;
    }

    if (!debouncedMessages || debouncedMessages.length === 0) {
      return;
    }

    hasFetched.current = true;
    setLoading(true);
    setError(null);

    try {
      if (trigger) {
        await trigger;
      }

      const screenWidth = Dimensions.get("window").width;
      let adWidth = screenWidth;
      if (theme?.width) {
        if (typeof theme.width === "number") {
          adWidth = Math.max(theme.width, AD_DIMENSIONS.minWidth);
        } else if (typeof theme.width === "string" && theme.width.includes("%")) {
          const percentage = parseFloat(theme.width) / 100;
          adWidth = Math.max(screenWidth * percentage, AD_DIMENSIONS.minWidth);
        }
      }

      const themeWithWidth = theme ? {
        ...theme,
        width: Math.floor(adWidth)
      } : undefined;

      const result = await fetchAd(
        apiKey, 
        sessionId, 
        debouncedMessages, 
        themeWithWidth,
        slotId,
        charDesc
      );
      
      if (result.error) {
        setError(new Error(result.error));
        if (onError) {
          onError(new Error(result.error));
        }
      } else if (result.ad) {
        const validation = validateAdUrl(result.ad.iframeUrl);
        if (!validation.isValid) {
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
        setIframeLoaded(false);
      } else {
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

  const handleViewable = useCallback(() => {
    if (ad && !hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      trackImpression(ad.id, apiKey);
      if (onImpression) {
        onImpression(ad);
      }
    }
  }, [ad, apiKey, onImpression]);

  const { onLayout } = useViewability(
    handleViewable,
    ad !== null && !loading && !error
  );

  useEffect(() => {
    loadAd();
  }, [loadAd]);

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === "click" && ad) {
          if (onClick) {
            onClick(ad);
          }
        } else if (data.type === "linkClick" || data.type === "windowOpen") {
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

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
  }, []);

  const isSpecialUrl = useCallback((url: string): boolean => {
    if (!url) return true;
    for (const scheme of ALLOWED_SPECIAL_SCHEMES) {
      if (url.startsWith(scheme)) {
        return true;
      }
    }
    return false;
  }, []);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string; navigationType: string }) => {
      const url = request.url;

      if (ad?.iframeUrl && url === ad.iframeUrl) {
        return true;
      }

      if (isSpecialUrl(url)) {
        return true;
      }

      if (url.startsWith("javascript:")) {
        logSecurityEvent("navigation_blocked", {
          url,
          reason: "javascript: URLs are blocked for security",
        });
        return false;
      }

      if (isOriginAllowed(url, DEFAULT_ALLOWED_ORIGINS)) {
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      if (url && url !== ad?.iframeUrl) {
        logSecurityEvent("navigation_blocked", {
          url,
          reason: "Opening external URL in system browser",
        });
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      return true;
    },
    [ad, isSpecialUrl]
  );

  if (!hasPrivacyConsent) {
    return null;
  }

  if (error || securityError) {
    return null;
  }

  const displayWidth = (() => {
    if (!theme?.width || theme.width === "auto") {
      return "100%" as const;
    }
    if (typeof theme.width === "number") {
      return Math.max(theme.width, AD_DIMENSIONS.minWidth);
    }
    return theme.width as DimensionValue;
  })();

  const hasValidAd = ad && ad.id && ad.iframeUrl;
  const shouldExpand = hasValidAd && iframeLoaded;

  const containerStyle = {
    ...styles.container,
    height: shouldExpand ? AD_DIMENSIONS.height : 0,
    minWidth: shouldExpand ? AD_DIMENSIONS.minWidth : 0,
    width: displayWidth,
    overflow: "hidden" as const,
  };

  return (
    <View 
      style={containerStyle}
      onLayout={(event) => {
        if (shouldExpand) {
          onLayout(event);
        }
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
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={originWhitelist}
            mixedContentMode="never"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={true}
            javaScriptCanOpenWindowsAutomatically={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            injectedJavaScript={`
              (function() {
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
              true;
            `}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            overScrollMode="never"
            {...Platform.select({
              android: {
                setSafeBrowsingEnabled: true,
              },
              ios: {},
            })}
          />
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
    backgroundColor: "black",
  },
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

