/**
 * MiniGameMenu - Main menu component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Animated, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { MiniGameMenuProps, MiniGameTheme, GameData } from '../../types';
import { GameGrid } from './GameGrid';
import { GameIframe } from './GameIframe';
import { fetchCatalog, fetchAdForMinigame } from '../../api/client';
import { GAMES_UNAVAILABLE_IMAGE_BASE64 } from './assets';
import { computeWebViewSource, buildOriginWhitelist } from '../../utils/webview-security';
import { CloseButton } from '../shared/CloseButton';

const defaultTheme: Omit<Required<MiniGameTheme>, 'backgroundColor' | 'headerColor' | 'borderColor'> & { backgroundColor?: string; headerColor?: string; borderColor?: string } = {
  titleFont: 'Inter, system-ui, sans-serif',
  secondaryFont: 'Inter, system-ui, sans-serif',
  titleFontColor: '#1F2937',
  secondaryFontColor: '#6B7280',
  iconCornerRadius: 8,
  borderColor: 'rgba(0, 0, 0, 0.08)',
};

export const MiniGameMenu: React.FC<MiniGameMenuProps> = ({
  isOpen,
  onClose,
  charName,
  charID,
  charImage,
  messages = [],
  charDesc,
  maxGamesToShow = 6,
  theme = {},
  delegateChar = true,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [games, setGames] = useState<GameData[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [adFetched, setAdFetched] = useState(false);
  const [adIframeUrl, setAdIframeUrl] = useState<string | null>(null);
  const [currentAdId, setCurrentAdId] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  // Merge theme with defaults
  const appliedTheme: Omit<Required<MiniGameTheme>, 'backgroundColor' | 'headerColor' | 'borderColor'> & { backgroundColor?: string; headerColor?: string; borderColor?: string } = {
    ...defaultTheme,
    ...theme,
  };

  // Get character initials for fallback
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Animate modal fade in
  useEffect(() => {
    if (isOpen) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isOpen, fadeAnim]);

  // Fetch catalog when menu opens
  useEffect(() => {
    if (!isOpen) return;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(false);
      try {
        const catalogData = await fetchCatalog();
        setGames(catalogData);
      } catch (error) {
        setCatalogError(true);
        setGames([]);
      } finally {
        setCatalogLoading(false);
      }
    };

    loadCatalog();
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleBackdropPress = () => {
    // In React Native, the TouchableOpacity structure ensures only backdrop clicks close
    // The inner View (modal content) will not trigger this handler
    handleClose();
  };

  const handleGameSelect = (gameId: string) => {
    handleClose();
    setSelectedGameId(gameId);
    // Reset ad tracking when a new game is selected
    setAdFetched(false);
    setCurrentAdId(null);
  };

  const handleAdIdReceived = (adId: string) => {
    setCurrentAdId(adId);
  };

  const handleIframeClose = async () => {
    if (!adFetched) {
      // Make API request and fetch / display ad.html here
      if (currentAdId) {
        try {
          const iframeUrl = await fetchAdForMinigame(currentAdId);
          if (iframeUrl) {
            setAdIframeUrl(iframeUrl);
            setAdFetched(true);
          }
        } catch (error) {
          // If ad fetch fails, just close without showing ad
        }
      }
      setSelectedGameId(null);
    } else {
      // If ad has already been already fetched, just close so we don't double count impressions
      setSelectedGameId(null);
    }
  };

  const handleAdIframeClose = () => {
    setAdIframeUrl(null);
    // Keep adFetched as true so we don't show another ad
  };

  const handleAdOverlayPress = () => {
    // Close when clicking the overlay (backdrop)
    handleAdIframeClose();
  };

  /**
   * Compute WebView source for ad iframe using shared utility
   */
  const adWebViewSource = useMemo(() => computeWebViewSource(adIframeUrl), [adIframeUrl]);

  if (!isOpen && !selectedGameId && !adIframeUrl) {
    return null;
  }

  return (
    <>
      {/* Game Iframe */}
      {selectedGameId && (
        <GameIframe 
          gameId={selectedGameId} 
          charID={charID}
          charName={charName}
          charImage={charImage}
          charDesc={charDesc}
          messages={messages}
          delegateChar={delegateChar}
          onClose={handleIframeClose}
          onAdIdReceived={handleAdIdReceived}
        />
      )}

      {/* Ad Iframe Modal */}
      {adIframeUrl && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={handleAdIframeClose}
          accessibilityViewIsModal={true}
        >
          <Pressable
            onPress={handleAdOverlayPress}
            style={styles.adOverlay}
          >
            <View style={styles.adContainer}>
              {/* WebView content */}
              <View
                style={styles.adContentContainer}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => false}
                onResponderTerminationRequest={() => true}
              >
                {adWebViewSource && (
                  <WebView
                    source={adWebViewSource}
                    originWhitelist={buildOriginWhitelist()}
                    style={styles.adWebView}
                    scrollEnabled={false}
                    bounces={false}
                    allowsFullscreen={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                  />
                )}
              </View>

              {/* Touch blocker area - prevents WebView from capturing touches in close button area */}
              <View
                style={styles.adTouchBlocker}
                pointerEvents="auto"
                onStartShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
              />

              <CloseButton
                onPress={handleAdIframeClose}
                accessibilityLabel="Close ad"
                accessibilityHint="Double tap to close the ad"
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Main Menu Modal */}
      {isOpen && (
        <Modal
          visible={isOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={handleClose}
          accessibilityViewIsModal={true}
        >
          <Animated.View
            style={[
              styles.modalOverlay,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleBackdropPress}
              style={styles.backdrop}
            >
              <View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: appliedTheme.backgroundColor || '#FFFFFF',
                  },
                ]}
              >
                {/* Header */}
                <View
                  style={[
                    styles.header,
                    {
                      borderBottomColor: appliedTheme.borderColor,
                      backgroundColor: appliedTheme.headerColor,
                    },
                  ]}
                >
                  {/* Character Avatar */}
                  <View
                    style={[
                      styles.avatarContainer,
                      {
                        backgroundColor: appliedTheme.backgroundColor || '#FFFFFF',
                      },
                    ]}
                  >
                    {!imageError && charImage ? (
                      <Image
                        source={{ uri: charImage }}
                        style={styles.avatarImage}
                        onError={() => setImageError(true)}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text
                        style={[
                          styles.avatarInitials,
                          {
                            color: appliedTheme.backgroundColor || '#1F2937',
                            fontFamily: appliedTheme.titleFont,
                          },
                        ]}
                      >
                        {getInitials(charName)}
                      </Text>
                    )}
                  </View>

                  {/* Header Text */}
                  <View style={styles.headerText}>
                    <Text
                      style={[
                        styles.headerTitle,
                        {
                          color: appliedTheme.titleFontColor,
                          fontFamily: appliedTheme.titleFont,
                        },
                      ]}
                    >
                      Play a Game with {charName}
                    </Text>
                  </View>

                  {/* Close Button */}
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                    accessibilityLabel="Close menu"
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.closeButtonText,
                        {
                          color: appliedTheme.secondaryFontColor,
                        },
                      ]}
                    >
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Game Grid Content */}
                <View style={[
                  styles.content,
                  (catalogError || catalogLoading) && styles.contentCentered,
                ]}>
                  {catalogLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator
                        size="large"
                        color={appliedTheme.titleFontColor || '#1F2937'}
                      />
                      <Text
                        style={[
                          styles.loadingText,
                          {
                            color: appliedTheme.secondaryFontColor,
                            fontFamily: appliedTheme.secondaryFont,
                          },
                        ]}
                      >
                        Loading games...
                      </Text>
                    </View>
                  ) : catalogError ? (
                    <View style={styles.errorContainer}>
                      <View
                        style={[
                          styles.errorImageContainer,
                          {
                            backgroundColor: appliedTheme.backgroundColor || '#F3F4F6',
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: GAMES_UNAVAILABLE_IMAGE_BASE64 }}
                          style={styles.errorImage}
                          resizeMode="cover"
                        />
                      </View>
                      <Text
                        style={[
                          styles.errorText,
                          {
                            color: appliedTheme.secondaryFontColor,
                            fontFamily: appliedTheme.secondaryFont,
                          },
                        ]}
                      >
                        No games are available to play right now. Please check back later!
                      </Text>
                    </View>
                  ) : (
                    <GameGrid
                      games={games}
                      maxGamesToShow={maxGamesToShow}
                      theme={appliedTheme}
                      onGameSelect={handleGameSelect}
                    />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    minWidth: 320,
    minHeight: 400,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 21.6,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  closeButtonText: {
    fontSize: 24,
    lineHeight: 24,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  contentCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  errorImageContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorImage: {
    width: '100%',
    height: '100%',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  adOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  adContentContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  adTouchBlocker: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 80,
    height: 80,
    zIndex: 9999,
    elevation: 9,
  },
  adWebView: {
    width: '100%',
    height: '100%',
  },
});

