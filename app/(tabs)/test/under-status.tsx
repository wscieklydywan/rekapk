import { Colors } from '@/constants/theme';
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const UnderStatus = () => {
  const insets = useSafeAreaInsets();
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const headerHeight = insets.top + 56;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background, marginTop: -insets.top }] }>
      <StatusBar translucent backgroundColor="transparent" barStyle={theme === 'light' ? 'dark-content' : 'light-content'} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        style={{ flex: 1, backgroundColor: themeColors.background }}
      >
        <View style={[styles.header, { height: headerHeight, paddingTop: insets.top, backgroundColor: '#111' }]}>
          <Text style={styles.headerTitle}>Ciemny nagłówek</Text>
        </View>

        {Array.from({ length: 40 }).map((_, i) => (
          <View key={i} style={[styles.item, { backgroundColor: theme === 'light' ? '#fff' : themeColors.card }]}>
            <Text style={[styles.itemText, { color: themeColors.text }]}>Lista testowa — element {i + 1}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { width: '100%', alignItems: 'center', justifyContent: 'center', borderBottomColor: 'transparent' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  item: { padding: 14, borderRadius: 8, marginBottom: 10 },
  itemText: { fontSize: 16 },
});

export default UnderStatus;
