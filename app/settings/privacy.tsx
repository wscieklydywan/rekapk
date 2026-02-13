import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

const Privacy = () => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const router = useRouter();

  const open = async () => {
    try { await Linking.openURL('https://reklamour.pl'); } catch (e) {}
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}><Text style={{ color: themeColors.tint }}>Wstecz</Text></TouchableOpacity>
        <Text style={[styles.title, { color: themeColors.text }]}>Polityka prywatności</Text>
        <View style={{ width: 64 }} />
      </View>
      <View style={styles.content}>
        <Text style={{ color: themeColors.text, marginBottom: 12 }}>Zasady prywatności i informacje dostępne są na stronie.</Text>
        <TouchableOpacity style={[styles.linkButton, { borderColor: themeColors.tint }]} onPress={open}><Text style={{ color: themeColors.tint }}>Otwórz stronę</Text></TouchableOpacity>
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
  linkButton: { padding: 12, borderRadius: 10, borderWidth: 1 }
});

export default Privacy;
