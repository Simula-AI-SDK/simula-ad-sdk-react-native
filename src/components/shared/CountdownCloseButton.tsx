/**
 * CountdownCloseButton - Ad close button with 5-second countdown
 * Shows a countdown number (5, 4, 3, 2, 1) then transitions
 * to a standard close button after the timer completes.
 */

import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

interface CountdownCloseButtonProps {
  onPress: () => void;
  /** Total countdown duration in milliseconds (default: 5000) */
  duration?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Called when the countdown finishes and the close button becomes active */
  onCountdownComplete?: () => void;
}

const SIZE = 32;

export const CountdownCloseButton: React.FC<CountdownCloseButtonProps> = ({
  onPress,
  duration = 5000,
  style,
  accessibilityLabel = 'Close ad',
  accessibilityHint = 'Wait for countdown to finish, then double tap to close',
  onCountdownComplete,
}) => {
  const [isComplete, setIsComplete] = useState(false);
  const durationSec = duration / 1000;
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationSec));

  useEffect(() => {
    let remaining = Math.ceil(durationSec);
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setSecondsLeft(0);
        setIsComplete(true);
        onCountdownComplete?.();
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isComplete) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.wrapper,
          pressed && styles.pressed,
          style,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
      >
        <View style={styles.button}>
          <Text style={styles.closeText}>×</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.wrapper, style]}
      accessibilityLabel={`Ad closes in ${secondsLeft} seconds`}
      accessibilityRole="timer"
    >
      <View style={styles.button}>
        <Text style={styles.countdownText}>{secondsLeft}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: SIZE,
    height: SIZE,
    zIndex: 10000,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
  button: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: SIZE / 2,
    width: SIZE,
    height: SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  closeText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    marginTop: -1,
  },
});
