import { Colors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
// keyboard-controller may not ship types; ignore TS for import
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { KeyboardControllerView } from 'react-native-keyboard-controller';

interface AnimatedModalProps {
  visible: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  contentStyle?: any;
  backdropOpacity?: number; // 0..1
  position?: 'center' | 'bottom';
}

export const AnimatedModal = ({ visible, onClose, children, contentStyle, backdropOpacity = 0.6, position = 'center' }: AnimatedModalProps) => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];

  const scale = useSharedValue(0.96);
  const screenHeight = Dimensions.get('window').height;
  const translateY = useSharedValue(position === 'bottom' ? screenHeight : 0);
  const opacity = useSharedValue(0);

  const [mounted, setMounted] = useState(visible);
  const [NativeBlur, setNativeBlur] = useState<any | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (visible) {
      // mount and animate in: for bottom position slide up, for center use scale
      setMounted(true);
      if (position === 'bottom') {
        // backdrop fade
        opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      } else {
        opacity.value = withTiming(1, { duration: 180 });
        scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.exp) });
      }
    } else {
      if (position === 'bottom') {
        // slide down fully off-screen and fade backdrop
        translateY.value = withTiming(screenHeight, { duration: 320, easing: Easing.in(Easing.cubic) });
        opacity.value = withTiming(0, { duration: 260 });
        timeout = setTimeout(() => setMounted(false), 360);
      } else {
        scale.value = withTiming(0.96, { duration: 140 });
        opacity.value = withTiming(0, { duration: 140 });
        timeout = setTimeout(() => setMounted(false), 160);
      }
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [visible]);

  useEffect(() => {
    try {
      if (Platform.OS !== 'web') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('expo-blur');
        if (mod && mod.BlurView) setNativeBlur(() => mod.BlurView);
      }
    } catch (e) {
      // ignore — fallback will be used
    }
  }, []);

  const contentAnim = useAnimatedStyle(() => {
    if (position === 'bottom') return { transform: [{ translateY: translateY.value }] };
    return { transform: [{ scale: scale.value }], opacity: opacity.value };
  });
  const backdropAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const containerStyle = position === 'bottom' ? styles.backgroundBottom : styles.background;
  const defaultContentStyle = position === 'bottom' ? styles.modalViewBottom : styles.modalView;

  if (!mounted) return null;

  return (
    <Modal animationType="none" transparent visible={mounted} onRequestClose={onClose} presentationStyle="overFullScreen" statusBarTranslucent={Platform.OS === 'android'}>
      <View style={containerStyle}>
        {/* Backdrop: web uses CSS backdrop-filter; native will use BlurView when available, otherwise semi-transparent dim */}
        {Platform.OS === 'web' ? (
          <Animated.View pointerEvents="none" style={[styles.backdrop, backdropAnim, ({ backgroundColor: `rgba(0,0,0,${backdropOpacity})`, backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' } as any)]} />
        ) : (
          <Animated.View style={[styles.backdrop, backdropAnim]} pointerEvents="none">
            {NativeBlur ? (
              <>
                <NativeBlur intensity={150} tint={theme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${backdropOpacity})` }]} />
              </>
            ) : (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${backdropOpacity})` }]} />
            )}
          </Animated.View>
        )}
        {/* Fullscreen overlay that closes the modal when tapping outside the content. Rendered before content so content sits above it and receives taps. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[defaultContentStyle, { backgroundColor: themeColors.modalBackground }, contentAnim, contentStyle]}>
          {Platform.OS !== 'web' ? (
            // Wrap modal content in KeyboardControllerView so it follows the native keyboard
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            <KeyboardControllerView style={{ width: '100%' }}>{children}</KeyboardControllerView>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backgroundBottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalView: {
    margin: 20,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    width: '85%'
  },
  modalViewBottom: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    alignSelf: 'stretch'
  },
  baseBackground: { ...StyleSheet.absoluteFillObject },
});

export default AnimatedModal;
