import toast from '@/lib/toastController';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type ToastItem = { id: string; text: string; duration?: number; variant?: 'lock-locked' | 'lock-unlocked' | 'error' | 'info' | 'default' };

export const BottomToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const anim = useRef(new Animated.Value(0)).current;
  const lockAnim = useRef(new Animated.Value(0)).current; // main toast lock state

  useEffect(() => {
    const handle = (items: ToastItem[]) => {
      setToasts(items || []);
    };
    const unsubscribe = toast._subscribe(handle as any);
    return () => { try { unsubscribe(); } catch (e) { /* ignore */ } };
  }, []);

  // animate main toast on change
  useEffect(() => {
    const main = toasts.length ? toasts[toasts.length - 1] : null;
    if (main) {
      const isUnlocked = main.variant === 'lock-unlocked';
      Animated.timing(lockAnim, { toValue: isUnlocked ? 1 : 0, duration: 200, useNativeDriver: true }).start();
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }
  }, [toasts, anim, lockAnim]);

  if (!toasts.length) return null;

  const main = toasts[toasts.length - 1];
  const color = main.variant === 'lock-unlocked' ? '#2ecc71' : main.variant === 'lock-locked' ? '#e74c3c' : '#fff';
  const bgFor = (v?: string) => v === 'lock-unlocked' || v === 'info' ? '#1E2E22' : v === 'lock-locked' ? '#2A2A2A' : v === 'error' ? '#d3302e' : '#222';
  const scale = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.88, 1.06, 1] });

  return (
    <Animated.View pointerEvents="box-none" style={[styles.container, { opacity: anim }] }>
      <View style={styles.stack}>
        {toasts.map((t, idx) => {
          const isMain = idx === toasts.length - 1;
          if (isMain) {
            return (
              <Animated.View key={t.id} style={[styles.toast, { backgroundColor: bgFor(t.variant), transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [10,0] }) }, { scale }] }]}>
                <View style={styles.row}>
                  <View style={[styles.iconWrap]}>
                    <Feather name={t.variant === 'lock-unlocked' ? 'unlock' : t.variant === 'lock-locked' ? 'lock' : t.variant === 'info' ? 'check' : 'x'} size={14} color={t.variant === 'error' ? '#fff' : (t.variant === 'info' ? '#2ecc71' : color)} />
                  </View>
                  <Text style={styles.text}>{t.text}</Text>
                </View>
              </Animated.View>
            );
          }
          // older toasts: smaller, faded, positioned above
          return (
            <View key={t.id} style={[styles.toast, styles.stacked, { backgroundColor: bgFor(t.variant), opacity: 0.9 - (toasts.length - 1 - idx) * 0.12 }]}>
              <View style={styles.row}>
                <View style={[styles.iconWrap]}>
                  <Feather name={t.variant === 'lock-unlocked' ? 'unlock' : t.variant === 'lock-locked' ? 'lock' : t.variant === 'info' ? 'check' : 'x'} size={14} color={t.variant === 'error' ? '#fff' : t.variant === 'info' ? '#2ecc71' : t.variant === 'lock-unlocked' ? '#2ecc71' : t.variant === 'lock-locked' ? '#e74c3c' : '#fff'} />
                </View>
                <Text style={styles.text}>{t.text}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  },
  stack: { alignItems: 'center' },
  toast: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 128,
    maxWidth: '92%'
  },
  stacked: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 28, height: 24, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  shackle: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 14,
    borderWidth: 2.5,
    borderRadius: 12,
    backgroundColor: 'transparent'
  },
  body: {
    width: 20,
    height: 14,
    borderRadius: 3,
    marginTop: 14
  },
  text: { color: '#fff', fontSize: 14, flexShrink: 1 },
});

export default BottomToast;
