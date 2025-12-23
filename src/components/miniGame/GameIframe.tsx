/**
 * GameIframe - Game iframe component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator, Dimensions, Pressable, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Message } from '../../types';
import { useSimulaContext } from '../../context/SimulaProvider';
import { getMinigame, InitMinigameRequest } from '../../api/client';
import { buildOriginWhitelist, computeWebViewSource } from '../../utils/webview-security';
import { CloseButton } from '../shared/CloseButton';

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

  const handleOverlayPress = () => {
    onClose();
  };

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      <StatusBar hidden={true} />
      <Pressable
        onPress={handleOverlayPress}
        style={styles.overlay}
      >
          <View 
            style={styles.container}
          >
            {/* Content area - captures touches to prevent backdrop from closing */}
            <View
              style={styles.contentContainer}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => false}
              onResponderTerminationRequest={() => true}
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

            {!loading && !error && iframeUrl && webViewSource && (
              <WebView
                source={webViewSource}
                originWhitelist={buildOriginWhitelist()}
                style={[styles.webview, { width: dimensions.width, height: dimensions.height }]}
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
                onShouldStartLoadWithRequest={() => {
                  return true;
                }}
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

          {/* Touch blocker area - prevents WebView from capturing touches in close button area */}
          <View
            style={styles.touchBlocker}
            pointerEvents="auto"
            onStartShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          />

          <CloseButton
            onPress={onClose}
            accessibilityLabel="Close game"
            accessibilityHint="Double tap to close the game and return to chat"
          />
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
  touchBlocker: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 80,
    height: 80,
    zIndex: 9999,
    elevation: 9,
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

