import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';

export function useDarkBars(backgroundColor = '#000000') {
  useFocusEffect(
    useCallback(() => {
      try { RNStatusBar.setBarStyle('light-content', false); } catch (e) {}
      if (Platform.OS === 'android') {
        try { RNStatusBar.setBackgroundColor(backgroundColor, false); } catch (e) {}
        // navigation bar is intentionally not changed per-screen; global color managed in layout
      }
    }, [backgroundColor])
  )
}

export function useLightBars(backgroundColor = '#f6f6f6') {
  useFocusEffect(
    useCallback(() => {
      try { RNStatusBar.setBarStyle('dark-content', false); } catch (e) {}
      if (Platform.OS === 'android') {
        try { RNStatusBar.setBackgroundColor(backgroundColor, false); } catch (e) {}
        // navigation bar is intentionally not changed per-screen; global color managed in layout
      }
    }, [backgroundColor])
  )
}
