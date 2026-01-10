
import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useChatContext } from '@/app/contexts/ChatProvider';

const Badge = () => {
  const theme = useColorScheme() ?? 'light';
  return (
    <View style={{
      backgroundColor: Colors[theme].danger,
      width: 10,
      height: 10,
      borderRadius: 5,
      position: 'absolute',
      top: 0,
      right: -2,
      borderWidth: 1.5,
      borderColor: Colors[theme].background,
    }} />
  );
};

const ChatTabIcon = ({ focused, color, size }: { focused: boolean, color: string, size: number }) => {
  const { totalUnreadCount } = useChatContext();

  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color} />
      {totalUnreadCount > 0 && <Badge />}
    </View>
  );
};

export default ChatTabIcon;
