/**
 * GameCard - Individual game card component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { GameData, MiniGameTheme } from '../../types';

interface GameCardProps {
  game: GameData;
  theme: MiniGameTheme;
  onGameSelect: (gameId: string) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, theme, onGameSelect }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [scaleAnim] = useState(new Animated.Value(1));

  // Random fallback icon selection (5 game-related emojis)
  const fallbackIcons = ['🎲', '🎮', '🎰', '🧩', '🎯'];
  const [randomFallback] = useState(() => 
    fallbackIcons[Math.floor(Math.random() * fallbackIcons.length)]
  );

  const handlePress = () => {
    onGameSelect(game.id);
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 1.05,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const iconBorderRadius = theme.iconCornerRadius !== undefined 
    ? theme.iconCornerRadius
    : 8;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Play ${game.name}`}
    >
      <Animated.View
        style={[
          styles.cardContent,
          {
            backgroundColor: theme.backgroundColor || '#FFFFFF',
            borderColor: theme.borderColor || 'rgba(0, 0, 0, 0.08)',
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Game Icon */}
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: theme.backgroundColor || 'transparent',
              borderRadius: iconBorderRadius,
            },
          ]}
        >
          {imageError ? (
            <Text style={styles.fallbackIcon}>
              {game.iconFallback || randomFallback}
            </Text>
          ) : (
            <>
              <Image
                source={{ uri: game.iconUrl }}
                style={[
                  styles.iconImage,
                  {
                    borderRadius: iconBorderRadius,
                  },
                ]}
                onLoad={() => {
                  setImageLoading(false);
                }}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
                resizeMode="cover"
              />
              {imageLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator
                    size="small"
                    color={theme.titleFontColor || '#1F2937'}
                  />
                </View>
              )}
            </>
          )}
        </View>

        {/* Game Name */}
        <Text
          style={[
            styles.gameName,
            {
              color: theme.titleFontColor || '#1F2937',
              fontFamily: theme.titleFont,
            },
          ]}
          numberOfLines={2}
        >
          {game.name}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '30%',
    minHeight: 140,
    marginHorizontal: '1.5%',
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 140,
  },
  iconContainer: {
    width: 80,
    height: 80,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackIcon: {
    fontSize: 80,
    lineHeight: 80,
    textAlign: 'center',
  },
  loadingContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  gameName: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
    width: '100%',
  },
});

