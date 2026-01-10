
import React from 'react';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import ChatTabIcon from '@/components/ChatTabIcon'; // Nowy import
import FormTabIcon from '@/components/FormTabIcon'; // Nowy import

export default function TabLayout() {
  const theme = useColorScheme() ?? 'light';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[theme].tint,
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: Colors[theme].background,
          borderTopColor: Colors[theme].border,
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
