import { Colors } from '@/constants/theme';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
  const translateY = useSharedValue(position === 'bottom' ? 40 : 0);
  const opacity = useSharedValue(0);

  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (visible) {
      // Avoid content fade-in (prevents transient visual blending on first frame)
      opacity.value = 1;
      setMounted(true);
      // animate in (scale/translate only, faster ~120ms)
      scale.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.exp) });
      translateY.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.exp) });
    } else {
      // animate out with a soft fast fade (~120ms)
      scale.value = withTiming(0.96, { duration: 100 });
      translateY.value = withTiming(position === 'bottom' ? 40 : 0, { duration: 100 });
      opacity.value = withTiming(0, { duration: 120 });
      // wait for the fade to finish before unmounting
      timeout = setTimeout(() => setMounted(false), 140);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [visible]);

  const contentAnim = useAnimatedStyle(() => ({ transform: position === 'bottom' ? [{ translateY: translateY.value }] : [{ scale: scale.value }], opacity: opacity.value }));
  const backdropAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const containerStyle = position === 'bottom' ? styles.backgroundBottom : styles.background;
  const defaultContentStyle = position === 'bottom' ? styles.modalViewBottom : styles.modalView;

  if (!mounted) return null;

  return (
    <Modal animationType="none" transparent visible={mounted} onRequestClose={onClose}>
      <Pressable style={containerStyle} onPress={onClose}>
        {/* Static base background matching app background to avoid flashes of default page color */}
        <View style={[styles.baseBackground, { backgroundColor: themeColors.background }]} />
        <Animated.View style={[styles.backdrop, backdropAnim, { backgroundColor: `rgba(0,0,0,${backdropOpacity})` }]} />
        <Animated.View style={[defaultContentStyle, { backgroundColor: themeColors.modalBackground }, contentAnim, contentStyle]}>{children}</Animated.View>
      </Pressable>
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
