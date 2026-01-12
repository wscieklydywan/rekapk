import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import { getLastTabIndex, setLastTabIndex } from './tabNavigationState';

interface TabTransitionProps {
  children?: React.ReactNode;
  style?: ViewStyle | any;
  tabIndex?: number;
  quick?: boolean; // ultra-fast (for chat)
}

export const TabTransition: React.FC<TabTransitionProps> = ({ children, style, tabIndex, quick }) => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduceMotion(v); }).catch(() => {});
    let sub: any = null;
    try {
      const listener: any = (v: boolean) => { if (mounted) setReduceMotion(v); };
      const maybe = (AccessibilityInfo as any).addEventListener?.('reduceMotionChanged', listener);
      if (maybe && (maybe.remove || maybe.removeEventListener)) sub = maybe;
    } catch (e) { /* ignore */ }
    return () => { mounted = false; try { sub?.remove?.(); } catch (e) {} };
  }, []);

  // Determine durations (faster for snappier feel)
  const baseEnter = quick ? 30 : 50;
  const baseExit = quick ? 24 : 40;
  const enterDuration = reduceMotion ? 0 : baseEnter;
  const exitDuration = reduceMotion ? 0 : baseExit;

  // Default small fade-only when quick
  if (quick) {
    // very fast fade
    return (
      <Animated.View entering={FadeIn.duration(enterDuration)} exiting={FadeOut.duration(exitDuration)} layout={Layout.duration(enterDuration)} style={style}>
        {children}
      </Animated.View>
    );
  }

  // Directional logic for tabs
  let enterAnim: any = FadeIn.duration(enterDuration);
  let exitAnim: any = FadeOut.duration(exitDuration);

  if (typeof tabIndex === 'number') {
    const prev = getLastTabIndex();
    // moving forward -> new screen enters from right, old exits to left
    if (tabIndex > prev) {
      enterAnim = SlideInRight.duration(enterDuration);
      exitAnim = SlideOutLeft.duration(exitDuration);
    } else if (tabIndex < prev) {
      enterAnim = SlideInLeft.duration(enterDuration);
      exitAnim = SlideOutRight.duration(exitDuration);
    } else {
      // same index (rare): small fade
      enterAnim = FadeIn.duration(enterDuration);
      exitAnim = FadeOut.duration(exitDuration);
    }

    // update last index immediately for next navigation
    setLastTabIndex(tabIndex);
  } else {
    // fallback subtle slide from right
    enterAnim = SlideInRight.duration(enterDuration);
    exitAnim = SlideOutLeft.duration(exitDuration);
  }

  return (
    <Animated.View entering={enterAnim} exiting={exitAnim} layout={Layout.duration(enterDuration)} style={style}>
      <Animated.View entering={FadeIn.duration(enterDuration)} exiting={FadeOut.duration(exitDuration)} style={{ flex: 1 }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
};

export default TabTransition;
