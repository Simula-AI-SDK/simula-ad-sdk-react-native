/**
 * GameIframe - Game iframe component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { Message } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { getMinigame, InitMinigameRequest } from '../../api/client';

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
}

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
  // Optional props for API compatibility (not currently used in implementation)
  // turnsBtwnMsgs, usePubCharApi, exampleCharMsgs are defined in interface but not used
}) => {
  console.log('[GameIframe] Component rendered with props:', {
    gameId,
    charID,
    charName,
    hasCharImage: !!charImage,
    messagesCount: messages.length,
    delegateChar,
    hasCharDesc: !!charDesc,
  });

  const { sessionId } = useSimulaContext();
  console.log('[GameIframe] Session ID:', sessionId ? 'Present' : 'MISSING');
  
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  
  console.log('[GameIframe] Initial state:', {
    iframeUrl: iframeUrl ? 'Set' : 'null',
    loading,
    error,
    dimensions: { width: dimensions.width, height: dimensions.height },
  });

  // Log state changes
  useEffect(() => {
    console.log('[GameIframe] State changed - iframeUrl:', iframeUrl || 'null');
  }, [iframeUrl]);

  useEffect(() => {
    console.log('[GameIframe] State changed - loading:', loading);
  }, [loading]);

  useEffect(() => {
    console.log('[GameIframe] State changed - error:', error || 'none');
  }, [error]);

  // Track dimension changes
  useEffect(() => {
    console.log('[GameIframe] Setting up dimension listener');
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      console.log('[GameIframe] Dimensions changed:', { width: window.width, height: window.height });
      setDimensions(window);
    });

    return () => {
      console.log('[GameIframe] Cleaning up dimension listener');
      subscription?.remove();
    };
  }, []);

  // Fetch the minigame iframe URL
  useEffect(() => {
    console.log('[GameIframe] useEffect triggered for minigame fetch');
    
    // Block if sessionId is missing or invalid
    if (!sessionId) {
      console.error('[GameIframe] ❌ Session ID is missing or invalid');
      setError('Session invalid, cannot initialize minigame');
      setLoading(false);
      return;
    }

    const initMinigame = async () => {
      try {
        console.log('[GameIframe] Starting minigame initialization...');
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
        console.log('[GameIframe] API request params:', {
          gameType: params.gameType,
          sessionId: params.sessionId ? 'Present' : 'Missing',
          dimensions: { w: params.w, h: params.h },
          char_id: params.char_id,
          char_name: params.char_name,
          messagesCount: params.messages?.length || 0,
        });
        
        const response = await getMinigame(params);
        console.log('[GameIframe] ✅ API response received:', {
          hasAdResponse: !!response.adResponse,
          iframe_url: response.adResponse?.iframe_url || 'MISSING',
          ad_id: response.adResponse?.ad_id || 'MISSING',
        });
        
        if (response.adResponse?.iframe_url) {
          console.log('[GameIframe] Setting iframe URL:', response.adResponse.iframe_url);
          setIframeUrl(response.adResponse.iframe_url);
        } else {
          console.error('[GameIframe] ❌ No iframe_url in response:', response);
          setError('No game URL received from server.');
        }
        
        // Callback with the ad_id for tracking
        if (onAdIdReceived && response.adResponse?.ad_id) {
          console.log('[GameIframe] Calling onAdIdReceived with:', response.adResponse.ad_id);
          onAdIdReceived(response.adResponse.ad_id);
        }
      } catch (err) {
        console.error('[GameIframe] ❌ Error initializing minigame:', err);
        if (err instanceof Error) {
          console.error('[GameIframe] Error details:', {
            message: err.message,
            stack: err.stack,
          });
        }
        setError('Failed to load game. Please try again.');
      } finally {
        console.log('[GameIframe] Setting loading to false');
        setLoading(false);
      }
    };

    initMinigame();
  }, [gameId, charID, charName, charImage, charDesc, messages, delegateChar, sessionId, dimensions.width, dimensions.height]);

  const handleOverlayPress = () => {
    // Close when clicking the overlay (backdrop)
    onClose();
  };

  // Log render conditions
  console.log('[GameIframe] Render conditions:', {
    loading,
    error,
    hasIframeUrl: !!iframeUrl,
    iframeUrl: iframeUrl || 'null',
    shouldShowLoading: loading,
    shouldShowError: !!error,
    shouldShowWebView: !loading && !error && !!iframeUrl,
  });

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <Pressable
        onPress={handleOverlayPress}
        style={styles.overlay}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          console.log('[GameIframe] Overlay layout:', { width, height });
        }}
      >
        <View 
          style={styles.container}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            console.log('[GameIframe] Container layout:', { width, height });
          }}
        >
          {/* Content area - captures touches to prevent backdrop from closing */}
          <View
            style={styles.contentContainer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => false}
            onResponderTerminationRequest={() => true}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              console.log('[GameIframe] ContentContainer layout:', { width, height });
            }}
          >
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.loadingText}>Loading game...</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!loading && !error && iframeUrl && (
              <WebView
                source={{ uri: iframeUrl }}
                style={[styles.webview, { width: dimensions.width, height: dimensions.height }]}
                scrollEnabled={false}
                bounces={false}
                allowsFullscreen={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={true}
                mixedContentMode="never"
                onLoadStart={() => {
                  console.log('[GameIframe] 🚀 WebView load started for URL:', iframeUrl);
                }}
                onLoadEnd={() => {
                  console.log('[GameIframe] ✅ WebView load ended successfully');
                }}
                onLoad={() => {
                  console.log('[GameIframe] ✅ WebView onLoad event fired');
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('[GameIframe] ❌ WebView error:', {
                    code: nativeEvent.code,
                    description: nativeEvent.description,
                    domain: nativeEvent.domain,
                    url: nativeEvent.url,
                  });
                  setError(`Failed to load game content: ${nativeEvent.description || 'Unknown error'}`);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('[GameIframe] ❌ WebView HTTP error:', {
                    statusCode: nativeEvent.statusCode,
                    description: nativeEvent.description,
                    url: nativeEvent.url,
                  });
                }}
                onShouldStartLoadWithRequest={(request) => {
                  console.log('[GameIframe] WebView shouldStartLoadWithRequest:', {
                    url: request.url,
                    navigationType: request.navigationType,
                  });
                  return true;
                }}
                onNavigationStateChange={(navState) => {
                  console.log('[GameIframe] WebView navigation state changed:', {
                    url: navState.url,
                    title: navState.title,
                    loading: navState.loading,
                    canGoBack: navState.canGoBack,
                    canGoForward: navState.canGoForward,
                  });
                }}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  console.log('[GameIframe] WebView layout:', { width, height });
                }}
              />
            )}
            
            {!loading && !error && !iframeUrl && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  No URL available. Check console logs.
                </Text>
              </View>
            )}
          </View>

          {/* Close button - positioned absolutely above everything with proper touch handling */}
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButtonWrapper}
            accessibilityLabel="Close game"
            accessibilityRole="button"
            activeOpacity={0.8}
          >
            <View style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  contentContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  closeButtonWrapper: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 64,
    height: 64,
    zIndex: 10000,
    elevation: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingRight: 8,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 12,
  },
  errorContainer: {
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
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});

