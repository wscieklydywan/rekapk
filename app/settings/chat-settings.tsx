import { getAnimationsEnabled, setAnimationsEnabled } from '@/components/animationPreference';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

const ChatSettings = () => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const router = useRouter();
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean | null>(null);

  useEffect(() => { let mounted = true; getAnimationsEnabled().then(v => { if (mounted) setAnimationsEnabledState(v); }).catch(() => {}); return () => { mounted = false; } }, []);
  const toggle = async (v: boolean) => { try { await setAnimationsEnabled(v); setAnimationsEnabledState(v); } catch {} };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Text style={{ color: themeColors.tint }}>Wstecz</Text></TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Ustawienia czatu</Text>
        <View style={{ width: 64 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: themeColors.text }]}>Animacje interfejsu</Text>
          <Switch value={!!animationsEnabled} onValueChange={toggle} thumbColor={animationsEnabled ? themeColors.tint : undefined} trackColor={{ true: themeColors.tint + '66', false: undefined }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  back: { padding: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  label: { fontSize: 16 }
});

export default ChatSettings;
