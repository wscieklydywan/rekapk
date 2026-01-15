import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  description?: string;
  onDismiss?: () => void;
  onPress?: () => void;
  hideOnPress?: boolean;
  duration?: number; // ms
  backgroundColor?: string;
  color?: string;
  variant?: 'floating' | 'flash';
  icon?: React.ReactNode;
  style?: any; // custom style overrides for the banner container
  titleStyle?: any;
  textStyle?: any;
};

const THRESHOLD = 80;

const DismissibleBanner = ({
  title,
  description,
  onDismiss,
  onPress,
  hideOnPress,
  duration = 5000,
  backgroundColor = '#fff',
  color = '#000',
  variant = 'floating',
  icon,
  style,
  titleStyle,
  textStyle,
}: Props) => {
  const insets = useSafeAreaInsets();
  // baseY handles the entrance/exit, gestureY handles live pan translation
  const baseY = useRef(new Animated.Value(-140)).current;
  const gestureY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);
  const hideTimerRef = useRef<any | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    // entrance animation: slide from top into place, quick and snappy
    Animated.timing(baseY, { toValue: 0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    if (duration && duration > 0) {
      hideTimerRef.current = setTimeout(() => {
        // trigger banner exit animation (banner will call onDismiss when done)
        animateOut();
      }, duration);
    }
    return () => {
      mountedRef.current = false;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const animateOut = (dir: 'left' | 'right' | 'up' = 'up') => {
    const anims: Animated.CompositeAnimation[] = [];

    const exitDuration = 100;

    if (dir === 'left' || dir === 'right') {
      const toX = dir === 'left' ? -500 : 500;
      anims.push(Animated.timing(translateX, { toValue: toX, duration: exitDuration, easing: Easing.in(Easing.cubic), useNativeDriver: true }));
      // also lift the banner slightly when swiping horizontally
      anims.push(Animated.timing(baseY, { toValue: -80, duration: exitDuration, easing: Easing.in(Easing.cubic), useNativeDriver: true }));
    } else {
      // slide up out of view
      anims.push(Animated.timing(baseY, { toValue: -160, duration: exitDuration, easing: Easing.in(Easing.cubic), useNativeDriver: true }));
    }

    // reset any gesture offset (fast)
    anims.push(Animated.timing(gestureY, { toValue: 0, duration: 80, easing: Easing.in(Easing.cubic), useNativeDriver: true }));

    Animated.parallel(anims).start(() => {
      onDismiss && onDismiss();
      // reset values for next show (make sure next mount animates from top again)
      translateX.setValue(0);
      baseY.setValue(-140);
      gestureY.setValue(0);
    });
  };

  // use any typing here to avoid strict gesture types mismatch with various RN versions
  const onGestureEvent = (event: any) => {
    const tX = event.nativeEvent.translationX ?? 0;
    const tY = event.nativeEvent.translationY ?? 0;
    translateX.setValue(tX);
    gestureY.setValue(tY);
  };

  const onHandlerStateChange = (event: any) => {
    const tX = event.nativeEvent.translationX ?? 0;
    const tY = event.nativeEvent.translationY ?? 0;
    if (Math.abs(tX) > THRESHOLD) {
      animateOut(tX < 0 ? 'left' : 'right');
    } else if (tY < -THRESHOLD) {
      animateOut('up');
    } else {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(gestureY, { toValue: 0, useNativeDriver: true }).start();
    }
  };

  const isFlash = variant === 'flash';
  const isFloating = variant === 'floating';
  // make the banner more translucent so the content behind is visible
  const resolvedBackground = isFlash
    ? (backgroundColor ?? 'rgba(34,34,34,0.5)')
    : isFloating
    ? (backgroundColor ?? 'rgba(255,255,255,0.45)')
    : (backgroundColor ?? 'rgba(255,255,255,0.45)');

  // Debug: log resolved background once on mount so we can verify on web/native
  React.useEffect(() => {
    // Use warn so it stands out in logs during development
    // eslint-disable-next-line no-console
    console.warn('DismissibleBanner resolvedBackground ->', resolvedBackground);
  }, [resolvedBackground]);

  const resolvedTitleColor = color ?? (isFlash ? '#fff' : '#111');
  const resolvedDescColor = color ?? (isFlash ? '#fff' : undefined);

  return (
    <PanGestureHandler onGestureEvent={onGestureEvent as any} onEnded={onHandlerStateChange as any} onHandlerStateChange={onHandlerStateChange as any}>
      <Animated.View
        style={[
          styles.container,
          // push the banner a bit lower so it doesn't overlap the front camera
          { top: Math.max(18, insets.top + 8) },
          // combine base entrance offset with live gesture offset; keep X translation for horizontal swipes
          { transform: [{ translateY: Animated.add(baseY, gestureY) }, { translateX }] },
        ]}
        pointerEvents="box-none"
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            if (onPress) {
              onPress();
              if (hideOnPress) {
                animateOut();
              }
            } else {
              animateOut();
            }
          }}
        >
          {/* Simple translucent surface (no expo-blur) — narrower and with larger internal padding */}
          <View
            style={[
              styles.banner,
              isFlash
                ? { borderRadius: 0, width: '100%', shadowOpacity: 0, elevation: 0, paddingTop: Math.max(18, insets.top + 8) }
                : { paddingVertical: 20, paddingHorizontal: 24 },
              { backgroundColor: resolvedBackground },
              style,
            ]}
          >
            <View style={styles.row}>
              {icon ? <View style={[styles.iconWrap, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>{icon}</View> : null}

              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: resolvedTitleColor }, (titleStyle as any) || {}]} numberOfLines={1}>
                  {title}
                </Text>
                {description ? (
                  <Text style={[styles.desc, resolvedDescColor ? { color: resolvedDescColor } : {}, (textStyle as any) || {}]} numberOfLines={2}>
                    {description}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>
    </PanGestureHandler>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  banner: {
    minWidth: '80%',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 12,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef4ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    marginLeft: 12,
  },
  textWrap: { flex: 1 },
  title: { fontWeight: '700', fontSize: 16, marginBottom: 2 },
  desc: { fontSize: 13, color: '#6b6b6b' },
});

export default DismissibleBanner;
