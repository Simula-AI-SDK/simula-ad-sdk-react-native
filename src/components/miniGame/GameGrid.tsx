/**
 * GameGrid - Game grid layout component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GameData, MiniGameTheme } from '../../types';
import { GameCard } from './GameCard';

interface GameGridProps {
  games: GameData[];
  maxGamesToShow: 3 | 6 | 9;
  theme: MiniGameTheme;
  onGameSelect: (gameId: string) => void;
}

export const GameGrid: React.FC<GameGridProps> = ({
  games,
  maxGamesToShow,
  theme,
  onGameSelect,
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = useMemo(() => {
    return Math.ceil(games.length / maxGamesToShow);
  }, [games.length, maxGamesToShow]);

  const currentGames = useMemo(() => {
    const start = currentPage * maxGamesToShow;
    const end = start + maxGamesToShow;
    return games.slice(start, end);
  }, [games, currentPage, maxGamesToShow]);

  const handlePrevious = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const showPagination = totalPages > 1;
  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  return (
    <View style={styles.container}>
      {/* Game Grid */}
      <View style={styles.grid}>
        {currentGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            theme={theme}
            onGameSelect={onGameSelect}
          />
        ))}
      </View>

      {/* Pagination */}
      {showPagination && (
        <View style={styles.pagination}>
          <TouchableOpacity
            onPress={handlePrevious}
            disabled={!canGoPrevious}
            style={[
              styles.paginationButton,
              {
                backgroundColor: canGoPrevious
                  ? (theme.backgroundColor || '#E5E7EB')
                  : '#E5E7EB',
                opacity: canGoPrevious ? 1 : 0.5,
              },
            ]}
            accessibilityLabel="Previous page"
            accessibilityState={{ disabled: !canGoPrevious }}
          >
            <Text
              style={[
                styles.paginationButtonText,
                {
                  color: canGoPrevious ? '#FFFFFF' : '#9CA3AF',
                },
              ]}
            >
              ←
            </Text>
          </TouchableOpacity>

          <Text
            style={[
              styles.paginationText,
              {
                color: theme.secondaryFontColor || '#6B7280',
                fontFamily: theme.secondaryFont,
              },
            ]}
          >
            {currentPage + 1} / {totalPages}
          </Text>

          <TouchableOpacity
            onPress={handleNext}
            disabled={!canGoNext}
            style={[
              styles.paginationButton,
              {
                backgroundColor: canGoNext
                  ? (theme.backgroundColor || '#E5E7EB')
                  : '#E5E7EB',
                opacity: canGoNext ? 1 : 0.5,
              },
            ]}
            accessibilityLabel="Next page"
            accessibilityState={{ disabled: !canGoNext }}
          >
            <Text
              style={[
                styles.paginationButtonText,
                {
                  color: canGoNext ? '#FFFFFF' : '#9CA3AF',
                },
              ]}
            >
              →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: 16,
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  paginationButton: {
    borderRadius: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationButtonText: {
    fontSize: 20,
  },
  paginationText: {
    fontSize: 14,
  },
});

