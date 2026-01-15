import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
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

  // Drive gesture values on the native thread to avoid hammering the JS thread
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: gestureY } }],
    { useNativeDriver: true }
  );

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
    // Only log in development and do it quietly to avoid spamming the console
    if ((global as any).__DEV__) {
      // eslint-disable-next-line no-console
      console.debug && console.debug('DismissibleBanner resolvedBackground ->', resolvedBackground);
    }
    // Intentionally run only once on mount to avoid repeated logs
  }, []);

  const resolvedTitleColor = color ?? (isFlash ? '#fff' : '#111');
  const resolvedDescColor = color ?? (isFlash ? '#fff' : undefined);

  // Responsive icon sizing: adapt the icon container and glyph to screen width
  const { width: screenWidth } = Dimensions.get('window');
  const { iconWrapSize, iconInnerSize, normalizedIcon } = React.useMemo(() => {
    const wrap = screenWidth < 360 ? 36 : screenWidth < 420 ? 44 : 52;
    const inner = Math.max(16, Math.round(wrap * 0.7));
    let norm: React.ReactNode = icon;
    if (icon && React.isValidElement(icon)) {
      const propsToAdd: any = { size: inner };
      if ((icon as any).props && typeof (icon as any).props.color === 'undefined') propsToAdd.color = resolvedTitleColor;
      // Ensure image/vector icons receive explicit sizing via style prop
      const existingStyle = (icon as any).props ? (icon as any).props.style : undefined;
      propsToAdd.style = [existingStyle, { width: inner, height: inner }];
      norm = React.cloneElement(icon as React.ReactElement, propsToAdd);
    }
    return { iconWrapSize: wrap, iconInnerSize: inner, normalizedIcon: norm };
  }, [screenWidth, icon, resolvedTitleColor]);

  // Slightly increase banner width by 1px over 92% to match visual request
  const bannerWidth = React.useMemo(() => Math.round(screenWidth * 0.92) + 1, [screenWidth]);

  return (
    <PanGestureHandler onGestureEvent={onGestureEvent as any} onHandlerStateChange={onHandlerStateChange as any}>
      <Animated.View
        style={[
          styles.container,
          // make banner slightly higher (closer to top) and allow for safe-area
          { top: Math.max(-1, insets.top - 5) },
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
                ? { borderRadius: 0, width: '100%', shadowOpacity: 0, elevation: 0, paddingTop: Math.max(62, insets.top + 52), paddingBottom: 62 }
                : { paddingVertical: 62, paddingHorizontal: 20, width: bannerWidth },
              { backgroundColor: resolvedBackground },
              style,
            ]}
          >
            <View style={styles.row}>
              {icon ? (
                <View style={[styles.iconWrap, { width: iconWrapSize, height: iconWrapSize, borderRadius: iconWrapSize / 2, backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                  <View style={{ width: iconInnerSize, height: iconInnerSize, alignItems: 'center', justifyContent: 'center' }}>{normalizedIcon}</View>
                </View>
              ) : null}

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
    // ensure banner centers with a bit more horizontal space on smaller screens
    paddingHorizontal: 8,
  },
  banner: {
    minWidth: '80%',
    borderRadius: 14,
    paddingVertical: 62,
    paddingHorizontal: 18,
    shadowColor: '#000',
    // lower shadow intensity to reduce compositing cost
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 4,
    alignSelf: 'center',
    overflow: 'visible',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginLeft: 12,
  },
  textWrap: { flex: 1 },
  title: { fontWeight: '700', fontSize: 16, marginBottom: 2 },
  desc: { fontSize: 13, color: '#6b6b6b' },
});

export default DismissibleBanner;
