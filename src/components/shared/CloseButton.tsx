/**
 * CloseButton - Shared close button component for modals
 * Standard AdTech-style close button used across the SDK
 */

import React from 'react';
import { Pressable, View, Text, StyleSheet, ViewStyle } from 'react-native';

interface CloseButtonProps {
  onPress: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const CloseButton: React.FC<CloseButtonProps> = ({
  onPress,
  style,
  accessibilityLabel = 'Close',
  accessibilityHint = 'Double tap to close',
}) => {
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
        <Text style={styles.text}>×</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
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
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    marginTop: -1,
  },
});
