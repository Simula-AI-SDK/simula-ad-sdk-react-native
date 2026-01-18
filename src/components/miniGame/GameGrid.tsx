/**
 * GameGrid - Game grid layout component for React Native
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, PanResponder, GestureResponderEvent, PanResponderGestureState, Animated, useWindowDimensions } from 'react-native';
import { GameData, MiniGameTheme } from '../../types';
import { GameCard } from './GameCard';

const MAX_VISIBLE_DOTS = 5;
const DOT_SIZE_CURRENT = 8;
const DOT_SIZE_ADJACENT = 6;
const DOT_SIZE_EDGE = 4;
const SWIPE_THRESHOLD = 40;
const VELOCITY_THRESHOLD = 0.5;
const ANIMATION_DURATION = 250;

interface GameGridProps {
  games: GameData[];
  maxGamesToShow: 3 | 6 | 9;
  theme: MiniGameTheme;
  onGameSelect: (gameId: string, gameName: string) => void;
}

const calculateVisibleDots = (currentPage: number, totalPages: number) => {
  if (totalPages <= MAX_VISIBLE_DOTS) {
    return Array.from({ length: totalPages }, (_, i) => ({
      pageIndex: i,
      isVisible: true,
    }));
  }

  const halfWindow = Math.floor(MAX_VISIBLE_DOTS / 2);
  let startPage = currentPage - halfWindow;
  let endPage = currentPage + halfWindow;

  if (startPage < 0) {
    startPage = 0;
    endPage = MAX_VISIBLE_DOTS - 1;
  }

  if (endPage >= totalPages) {
    endPage = totalPages - 1;
    startPage = totalPages - MAX_VISIBLE_DOTS;
  }

  return Array.from({ length: MAX_VISIBLE_DOTS }, (_, i) => ({
    pageIndex: startPage + i,
    isVisible: true,
  }));
};

const getDotSize = (pageIndex: number, currentPage: number): number => {
  const distance = Math.abs(pageIndex - currentPage);
  if (distance === 0) return DOT_SIZE_CURRENT;
  if (distance === 1) return DOT_SIZE_ADJACENT;
  return DOT_SIZE_EDGE;
};

const getDotOpacity = (pageIndex: number, currentPage: number): number => {
  const distance = Math.abs(pageIndex - currentPage);
  if (distance === 0) return 1;
  if (distance === 1) return 0.5;
  return 0.3;
};

export const GameGrid: React.FC<GameGridProps> = ({
  games,
  maxGamesToShow,
  theme,
  onGameSelect,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const { width: screenWidth } = useWindowDimensions();

  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isAnimating = useRef(false);

  const totalPages = useMemo(() => {
    return Math.ceil(games.length / maxGamesToShow);
  }, [games.length, maxGamesToShow]);

  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, currentPage]);

  const currentGames = useMemo(() => {
    const start = currentPage * maxGamesToShow;
    const end = start + maxGamesToShow;
    return games.slice(start, end);
  }, [games, currentPage, maxGamesToShow]);

  const visibleDots = useMemo(() => {
    return calculateVisibleDots(currentPage, totalPages);
  }, [currentPage, totalPages]);

  // Animate page transition with crossfade to hide the position reset
  const animateToPage = useCallback((newPage: number, direction: 'left' | 'right') => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    const slideOut = direction === 'left' ? -screenWidth * 0.3 : screenWidth * 0.3;
    const slideIn = direction === 'left' ? screenWidth * 0.15 : -screenWidth * 0.15;

    // Phase 1: Slide out with fade
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: slideOut,
        duration: ANIMATION_DURATION / 2,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_DURATION / 2,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Update page while invisible
      setCurrentPage(newPage);
      translateX.setValue(slideIn);

      // Phase 2: Slide in with fade
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION / 2,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isAnimating.current = false;
      });
    });
  }, [screenWidth, translateX, opacity]);

  const handleDotPress = (pageIndex: number) => {
    if (pageIndex === currentPage || isAnimating.current) return;
    const direction = pageIndex > currentPage ? 'left' : 'right';
    animateToPage(pageIndex, direction);
  };

  // Use refs to access latest values in PanResponder callbacks
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  const animateToPageRef = useRef(animateToPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;
    animateToPageRef.current = animateToPage;
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        return (
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 10
        );
      },
      onPanResponderMove: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const page = currentPageRef.current;
        const total = totalPagesRef.current;

        let dx = gestureState.dx;
        if ((page === 0 && dx > 0) || (page === total - 1 && dx < 0)) {
          dx = dx * 0.3;
        }

        translateX.setValue(dx * 0.5);
      },
      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        const page = currentPageRef.current;
        const total = totalPagesRef.current;
        const { dx, vx } = gestureState;

        const shouldSwipeLeft =
          (dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) &&
          page < total - 1;
        const shouldSwipeRight =
          (dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && page > 0;

        if (shouldSwipeLeft) {
          animateToPageRef.current(page + 1, 'left');
        } else if (shouldSwipeRight) {
          animateToPageRef.current(page - 1, 'right');
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const showPagination = totalPages > 1;
  const accentColor = theme.accentColor || '#3B82F6';

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.grid,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
      >
        {currentGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            theme={theme}
            onGameSelect={(gameId) => onGameSelect(gameId, game.name)}
          />
        ))}
      </Animated.View>

      {showPagination && (
        <View style={styles.pagination}>
          {visibleDots.map((dot) => {
            const size = getDotSize(dot.pageIndex, currentPage);
            const dotOpacity = getDotOpacity(dot.pageIndex, currentPage);
            const isCurrent = dot.pageIndex === currentPage;

            return (
              <TouchableOpacity
                key={dot.pageIndex}
                onPress={() => handleDotPress(dot.pageIndex)}
                style={styles.dotTouchArea}
                accessibilityLabel={`Page ${dot.pageIndex + 1} of ${totalPages}`}
                accessibilityState={{ selected: isCurrent }}
                accessibilityRole="button"
              >
                <View
                  style={[
                    styles.dot,
                    {
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      backgroundColor: accentColor,
                      opacity: dotOpacity,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
    minHeight: 16,
  },
  dotTouchArea: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {},
});
