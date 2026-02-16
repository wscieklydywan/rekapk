
import ChatTabIcon from '@/components/ChatTabIcon'; // Nowy import
import FormTabIcon from '@/components/FormTabIcon'; // Nowy import
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';
import { Tabs } from 'expo-router';
import React from 'react';
import { PixelRatio, Platform, useColorScheme } from 'react-native';

export default function TabLayout() {
  const theme = useColorScheme() ?? 'light';

  const lightenHex = (hex: string, amount = 0.9) => {
    try {
      if (!hex || hex[0] !== '#') return hex;
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0,2), 16);
      const g = parseInt(h.substring(2,4), 16);
      const b = parseInt(h.substring(4,6), 16);
      const nr = Math.round(r + (255 - r) * amount);
      const ng = Math.round(g + (255 - g) * amount);
      const nb = Math.round(b + (255 - b) * amount);
      const toHex = (v: number) => v.toString(16).padStart(2, '0');
      return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    } catch (e) { return hex; }
  };

  return (
    <Tabs
      screenOptions={{
        lazy: false,
        tabBarActiveTintColor: Colors[theme].tint,
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: Colors[theme].background,
          // Use same lighten amount as filter separator (0.76) for exact match
          borderTopColor: lightenHex(Colors[theme].border, 0.76),
          // Use three physical pixels for a more visible, crisp line on all screens
          borderTopWidth: 3 / PixelRatio.get(),
          // Remove any platform shadow so it looks identical to the filter hairline
          elevation: 0,
          shadowColor: 'transparent',
          shadowOpacity: 0,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Aktywne czaty',
          tabBarIcon: (props) => <ChatTabIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="forms"
        options={{
          title: 'Formularze',
          tabBarIcon: (props) => <FormTabIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="ai-archive"
        options={{
          title: 'Archiwum AI',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? "archive" : "archive-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ustawienia',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// Ensure Android navigation bar is white with dark buttons app-wide
if (Platform.OS === 'android') {
  try {
    NavigationBar.setBackgroundColorAsync('#ffffff').catch(() => {});
    NavigationBar.setButtonStyleAsync('dark').catch(() => {});
  } catch (e) {}
}
