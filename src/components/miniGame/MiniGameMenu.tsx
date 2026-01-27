/**
 * MiniGameMenu - Main menu component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Animated, StatusBar, Linking, TextInput, Platform, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { MiniGameMenuProps, MiniGameTheme, GameData } from '../../types';
import { GameGrid } from './GameGrid';
import { GameIframe } from './GameIframe';
import { fetchCatalog, fetchAdForMinigame, trackMenuGameClick } from '../../api/client';
import { GAMES_UNAVAILABLE_IMAGE_BASE64, PRIVACY_CONSENT_REQUIRED_IMAGE_BASE64 } from './assets';
import { computeWebViewSource, buildOriginWhitelist, isOriginAllowed, DEFAULT_ALLOWED_ORIGINS, ALLOWED_SPECIAL_SCHEMES } from '../../utils/webview-security';
import { CloseButton } from '../shared/CloseButton';
import { useSimulaContext } from '../../context/SimulaProvider';

const DEFAULT_CONSENT_MESSAGE = 'Mini games are unavailable. Please enable privacy consent to play sponsored games.';

const defaultTheme: Omit<Required<MiniGameTheme>, 'backgroundColor' | 'headerColor' | 'borderColor' | 'playableHeight' | 'playableBorderColor'> & { backgroundColor?: string; headerColor?: string; borderColor?: string; playableHeight?: number | string; playableBorderColor?: string } = {
  titleFont: 'Inter, system-ui, sans-serif',
  secondaryFont: 'Inter, system-ui, sans-serif',
  titleFontColor: '#1F2937',
  secondaryFontColor: '#6B7280',
  iconCornerRadius: 8,
  borderColor: 'rgba(0, 0, 0, 0.08)',
  accentColor: '#3B82F6',
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
  consentRequiredMessage,
}) => {
  const { hasPrivacyConsent, apiKey } = useSimulaContext();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [games, setGames] = useState<GameData[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [adFetched, setAdFetched] = useState(false);
  const [adIframeUrl, setAdIframeUrl] = useState<string | null>(null);
  const [currentAdId, setCurrentAdId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Track game frame dimensions for ad frame sizing
  const [lastGameFrameHeight, setLastGameFrameHeight] = useState<number | null>(null);
  const [lastGameWasBottomSheet, setLastGameWasBottomSheet] = useState<boolean>(false);

  // Merge theme with defaults
  const appliedTheme: Omit<Required<MiniGameTheme>, 'backgroundColor' | 'headerColor' | 'borderColor' | 'playableHeight' | 'playableBorderColor'> & { backgroundColor?: string; headerColor?: string; borderColor?: string; playableHeight?: number | string; playableBorderColor?: string } = {
    ...defaultTheme,
    ...theme,
  };

  // Filter games based on search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) {
      return games;
    }
    const query = searchQuery.toLowerCase().trim();
    return games.filter((game) => game.name.toLowerCase().includes(query));
  }, [games, searchQuery]);

  // Reset search when menu closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setIsSearchFocused(false);
    }
  }, [isOpen]);

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
        const catalogResponse = await fetchCatalog();
        setGames(catalogResponse.games);
        setMenuId(catalogResponse.menuId);
      } catch (error) {
        setCatalogError(true);
        setGames([]);
        setMenuId(null);
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

  const handleGameSelect = (gameId: string, gameName: string) => {
    // Track menu game click if menuId is available
    if (menuId && gameName) {
      trackMenuGameClick(menuId, gameName, apiKey).catch(() => {
        // Silently fail - tracking is best effort
      });
    }
    
    handleClose();
    setSelectedGameId(gameId);
    // Reset ad tracking when a new game is selected
    setAdFetched(false);
    setCurrentAdId(null);
  };

  const handleAdIdReceived = (adId: string) => {
    setCurrentAdId(adId);
  };

  const handleGameDimensionsOnClose = useCallback((height: number, wasBottomSheet: boolean) => {
    setLastGameFrameHeight(height);
    setLastGameWasBottomSheet(wasBottomSheet);
  }, []);

  // Track status bar stack entry for proper cleanup
  const adStatusBarEntryRef = useRef<any>(null);

  // Helper to push status bar entry
  const pushAdStatusBarHidden = useCallback(() => {
    // Pop any existing entry first to avoid stacking
    if (adStatusBarEntryRef.current) {
      StatusBar.popStackEntry(adStatusBarEntryRef.current);
    }
    // Push a new stack entry that hides the status bar
    adStatusBarEntryRef.current = StatusBar.pushStackEntry({
      hidden: true,
      animated: true,
      barStyle: 'light-content',
      translucent: true,
      backgroundColor: 'transparent',
    });
  }, []);

  // Hide status bar when ad modal becomes visible
  const handleAdModalShow = useCallback(() => {
    pushAdStatusBarHidden();
  }, [pushAdStatusBarHidden]);

  // Also hide on adIframeUrl change as a fallback, and restore when ad modal closes
  useEffect(() => {
    if (adIframeUrl) {
      pushAdStatusBarHidden();
    }

    return () => {
      // Pop the status bar entry
      if (adIframeUrl && adStatusBarEntryRef.current) {
        StatusBar.popStackEntry(adStatusBarEntryRef.current);
        adStatusBarEntryRef.current = null;
      }
    };
  }, [adIframeUrl, pushAdStatusBarHidden]);

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
   * Handle ad iframe navigation - open external URLs in system browser
   */
  const handleAdShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      const url = request.url;

      // Allow initial load of iframe URL
      if (adIframeUrl && url === adIframeUrl) {
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
      if (url && url !== adIframeUrl) {
        Linking.openURL(url).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return false;
      }

      return true;
    },
    [adIframeUrl, isSpecialUrl]
  );

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
          menuId={menuId ?? undefined}
          playableHeight={appliedTheme.playableHeight}
          playableBorderColor={appliedTheme.playableBorderColor}
          onDimensionsOnClose={handleGameDimensionsOnClose}
        />
      )}

      {/* Ad Iframe Modal */}
      {adIframeUrl && (
        <Modal
          visible={true}
          transparent={true}
          animationType={lastGameWasBottomSheet ? 'slide' : 'fade'}
          onRequestClose={handleAdIframeClose}
          onShow={handleAdModalShow}
          accessibilityViewIsModal={true}
          statusBarTranslucent={Platform.OS === 'android'}
        >
          <View
            style={[
              styles.adOverlay,
              lastGameWasBottomSheet && styles.adBottomSheetOverlay,
            ]}
          >
            <View
              style={[
                styles.adContainer,
                !lastGameWasBottomSheet && styles.adFullScreenContainer,
                lastGameWasBottomSheet && {
                  ...styles.adBottomSheetContainer,
                  height: lastGameFrameHeight ?? 500,
                  backgroundColor: appliedTheme.playableBorderColor || '#262626',
                },
              ]}
            >
              {/* Drag handle for bottom sheet only (visual only, not functional for ad) */}
              {lastGameWasBottomSheet && (
                <View style={[styles.adDragHandleContainer, { backgroundColor: appliedTheme.playableBorderColor || '#262626' }]}>
                  <View style={styles.adDragHandle} />
                </View>
              )}

              {/* WebView content */}
              <View
                style={[
                  styles.adContentContainer,
                  lastGameWasBottomSheet && styles.adBottomSheetContentContainer,
                ]}
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
                    mediaPlaybackRequiresUserAction={true}
                    mixedContentMode="never"
                    onShouldStartLoadWithRequest={handleAdShouldStartLoadWithRequest}
                  />
                )}
              </View>

              <CloseButton
                onPress={handleAdIframeClose}
                accessibilityLabel="Close ad"
                accessibilityHint="Double tap to close the ad"
                style={lastGameWasBottomSheet ? styles.adBottomSheetCloseButton : undefined}
              />
            </View>
          </View>
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
            <Pressable
              style={styles.backdrop}
              onPress={handleBackdropPress}
            >
              <Pressable
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

                {/* Search Bar */}
                {hasPrivacyConsent && !catalogLoading && !catalogError && games.length > 0 && (
                  <View style={styles.searchContainer}>
                    <View
                      style={[
                        styles.searchInputContainer,
                        {
                          borderColor: isSearchFocused
                            ? appliedTheme.accentColor
                            : appliedTheme.borderColor,
                          backgroundColor: appliedTheme.backgroundColor || '#FFFFFF',
                        },
                      ]}
                    >
                      <Text style={[styles.searchIcon, { color: appliedTheme.secondaryFontColor }]}>
                        🔍
                      </Text>
                      <TextInput
                        style={[
                          styles.searchInput,
                          {
                            color: appliedTheme.titleFontColor,
                            fontFamily: appliedTheme.secondaryFont,
                          },
                        ]}
                        placeholder="Search games..."
                        placeholderTextColor={appliedTheme.secondaryFontColor}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setSearchQuery('')}
                          style={styles.clearButton}
                          accessibilityLabel="Clear search"
                        >
                          <Text style={[styles.clearButtonText, { color: appliedTheme.secondaryFontColor }]}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Game Grid Content */}
                <View
                  style={[
                    styles.content,
                    (catalogError || catalogLoading || !hasPrivacyConsent || filteredGames.length === 0) && styles.contentCentered,
                  ]}
                >
                  {!hasPrivacyConsent ? (
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
                          source={{ uri: PRIVACY_CONSENT_REQUIRED_IMAGE_BASE64 }}
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
                        {consentRequiredMessage || DEFAULT_CONSENT_MESSAGE}
                      </Text>
                    </View>
                  ) : catalogLoading ? (
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
                  ) : filteredGames.length === 0 ? (
                    <View style={styles.noResultsContainer}>
                      <Text
                        style={[
                          styles.noResultsText,
                          {
                            color: appliedTheme.secondaryFontColor,
                            fontFamily: appliedTheme.secondaryFont,
                          },
                        ]}
                      >
                        No games found for "{searchQuery}"
                      </Text>
                    </View>
                  ) : (
                    <GameGrid
                      games={filteredGames}
                      maxGamesToShow={maxGamesToShow}
                      theme={appliedTheme}
                      onGameSelect={handleGameSelect}
                    />
                  )}
                </View>
              </Pressable>
            </Pressable>
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
    borderRadius: 14,
    width: '100%',
    maxWidth: 600,
    minWidth: 300,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  closeButtonText: {
    fontSize: 20,
    lineHeight: 20,
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 0,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 32,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 14,
  },
  noResultsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  noResultsText: {
    fontSize: 13,
    textAlign: 'center',
  },
  content: {
    padding: 14,
  },
  contentCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 250,
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
    backgroundColor: 'black',
  },
  adBottomSheetOverlay: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  adContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  adFullScreenContainer: {
    backgroundColor: 'black',
  },
  adBottomSheetContainer: {
    flex: 0,
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  adDragHandleContainer: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  adDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  adContentContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  adBottomSheetContentContainer: {
    backgroundColor: '#FFFFFF',
  },
  adWebView: {
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  adBottomSheetCloseButton: {
    top: 32,
  },
});

