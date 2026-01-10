
import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useFormContext } from '@/app/contexts/FormProvider';

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

const FormTabIcon = ({ focused, color, size }: { focused: boolean, color: string, size: number }) => {
  const { totalUnreadCount } = useFormContext();

  return (
    <View style={{ position: 'relative' }}>
      <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={size} color={color} />
      {totalUnreadCount > 0 && <Badge />}
    </View>
  );
};

export default FormTabIcon;
