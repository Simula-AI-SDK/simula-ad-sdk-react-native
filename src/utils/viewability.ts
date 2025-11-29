/**
 * MRC-compliant viewability tracking
 * Based on https://github.com/Simula-AI-SDK/simula-ad-sdk
 * 
 * MRC Standard: Ad is viewable when ≥50% of pixels are visible for ≥1 second
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { LayoutRectangle, Dimensions } from "react-native";

/**
 * Viewability configuration
 */
const VIEWABILITY_CONFIG = {
  /** Minimum visible percentage (50% per MRC standard) */
  minVisiblePercentage: 0.5,
  
  /** Minimum visible duration in milliseconds (1000ms per MRC standard) */
  minVisibleDuration: 1000,
  
  /** Check interval in milliseconds */
  checkInterval: 100,
} as const;

/**
 * Calculate visible percentage of an element
 */
function calculateVisiblePercentage(layout: LayoutRectangle): number {
  const screen = Dimensions.get("window");
  
  // Calculate visible bounds
  const visibleTop = Math.max(0, layout.y);
  const visibleBottom = Math.min(screen.height, layout.y + layout.height);
  const visibleLeft = Math.max(0, layout.x);
  const visibleRight = Math.min(screen.width, layout.x + layout.width);
  
  // Calculate visible area
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleArea = visibleHeight * visibleWidth;
  
  // Calculate total area
  const totalArea = layout.height * layout.width;
  
  // Return percentage
  return totalArea > 0 ? visibleArea / totalArea : 0;
}

/**
 * Check if element is viewable per MRC standards
 */
function isViewable(layout: LayoutRectangle): boolean {
  const visiblePercentage = calculateVisiblePercentage(layout);
  return visiblePercentage >= VIEWABILITY_CONFIG.minVisiblePercentage;
}

/**
 * Viewability hook
 * Returns viewable state and layout handler
 */
export function useViewability(
  onViewable: () => void,
  enabled: boolean = true
): {
  isViewable: boolean;
  onLayout: (event: { nativeEvent: { layout: LayoutRectangle } }) => void;
} {
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const [isCurrentlyViewable, setIsCurrentlyViewable] = useState(false);
  const viewableStartTime = useRef<number | null>(null);
  const hasTriggered = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle layout changes
   */
  const onLayout = useCallback(
    (event: { nativeEvent: { layout: LayoutRectangle } }) => {
      if (!enabled) return;
      setLayout(event.nativeEvent.layout);
    },
    [enabled]
  );

  /**
   * Check viewability periodically
   */
  useEffect(() => {
    if (!enabled || !layout || hasTriggered.current) {
      return;
    }

    const checkViewability = () => {
      const currentlyViewable = isViewable(layout);

      if (currentlyViewable) {
        // Start timer if not started
        if (viewableStartTime.current === null) {
          viewableStartTime.current = Date.now();
        }

        // Check if visible for required duration
        const visibleDuration = Date.now() - viewableStartTime.current;
        
        if (visibleDuration >= VIEWABILITY_CONFIG.minVisibleDuration) {
          // Trigger callback once
          if (!hasTriggered.current) {
            hasTriggered.current = true;
            setIsCurrentlyViewable(true);
            onViewable();
            
            // Clear interval after triggering
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current);
              checkIntervalRef.current = null;
            }
          }
        }
      } else {
        // Reset timer if not viewable
        viewableStartTime.current = null;
      }
    };

    // Start checking
    checkIntervalRef.current = setInterval(
      checkViewability,
      VIEWABILITY_CONFIG.checkInterval
    );

    // Initial check
    checkViewability();

    // Cleanup
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [enabled, layout, onViewable]);

  /**
   * Handle screen dimension changes
   */
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      // Recalculate viewability on dimension changes
      if (layout && !hasTriggered.current) {
        const currentlyViewable = isViewable(layout);
        if (!currentlyViewable) {
          viewableStartTime.current = null;
        }
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [layout]);

  return {
    isViewable: isCurrentlyViewable,
    onLayout,
  };
}

/**
 * Debounce utility
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}


